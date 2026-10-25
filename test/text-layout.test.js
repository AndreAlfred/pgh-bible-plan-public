const test = require("node:test");
const assert = require("node:assert");

const { verseHtml, loadState, initialState, parseProgressFile } = require("../app.js");

const chapter = { verses: [{ v: 1, t: "In the beginning" }, { v: 2, t: "The earth <was> formless" }] };

test("verse-by-verse with numbers is the unchanged default", () => {
  const html = verseHtml(chapter);
  assert.strictEqual((html.match(/<p class="verse">/g) || []).length, 2);
  assert.match(html, /<sup>1<\/sup>/);
});

test("verse numbers can be turned off in verse-by-verse layout", () => {
  const html = verseHtml(chapter, { layout: "verses", numbers: false });
  assert.doesNotMatch(html, /<sup/);
  assert.strictEqual((html.match(/<p class="verse">/g) || []).length, 2);
});

test("flowing layout runs the chapter together as one paragraph", () => {
  const html = verseHtml(chapter, { layout: "flow", numbers: true });
  assert.strictEqual((html.match(/<p/g) || []).length, 1);
  assert.match(html, /<sup class="vnum">1<\/sup>In the beginning <sup class="vnum">2<\/sup>/);
});

test("flowing layout without numbers is plain text, still escaped", () => {
  const html = verseHtml(chapter, { layout: "flow", numbers: false });
  assert.strictEqual(html, '<p class="flow">In the beginning The earth &lt;was&gt; formless</p>');
});

function withStored(value, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => JSON.stringify(value), setItem() {} }
  });
  try { run(); }
  finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

test("older saved state without reading preferences gets the defaults", () => {
  const { textLayout, verseNumbers, ...old } = initialState();
  withStored(old, () => {
    const st = loadState();
    assert.strictEqual(st.textLayout, "verses");
    assert.strictEqual(st.verseNumbers, true);
  });
});

test("saved reading preferences survive a reload, and junk values fall back", () => {
  withStored({ ...initialState(), textLayout: "flow", verseNumbers: false }, () => {
    const st = loadState();
    assert.strictEqual(st.textLayout, "flow");
    assert.strictEqual(st.verseNumbers, false);
  });
  withStored({ ...initialState(), textLayout: "interlinear", verseNumbers: "no" }, () => {
    const st = loadState();
    assert.strictEqual(st.textLayout, "verses");
    assert.strictEqual(st.verseNumbers, true);
  });
});

test("a progress backup with bad reading preferences is still restored, with defaults", () => {
  const backup = { ...initialState(), day: 3, textLayout: 7, verseNumbers: "false" };
  const result = parseProgressFile(JSON.stringify(backup));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.textLayout, "verses");
  assert.strictEqual(result.state.verseNumbers, true);
});
