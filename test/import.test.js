const test = require("node:test");
const assert = require("node:assert");

const { parseProgressFile, parseBibleFile } = require("../app.js");

test("a real progress backup is accepted and restored", () => {
  const backup = { day: 42, positions: new Array(10).fill(3), translation: "KJV", history: [], importedNames: [] };
  const result = parseProgressFile(JSON.stringify(backup));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.day, 42);
  assert.strictEqual(result.state.positions.length, 10);
});

test("a malformed progress file reports an error instead of failing silently", () => {
  const result = parseProgressFile("{ not json");
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /JSON/i);
});

test("importing a Bible file into the progress slot is rejected with an explanation", () => {
  const result = parseProgressFile(JSON.stringify({ translation: "NASB", chapters: {} }));
  assert.strictEqual(result.ok, false);
  assert.match(result.error, /progress/i);
});

test("a backup whose positions do not cover all ten lists is rejected", () => {
  const result = parseProgressFile(JSON.stringify({ day: 5, positions: [1, 2, 3] }));
  assert.strictEqual(result.ok, false);
});

test("the documented object form is read, verse numbers preserved", () => {
  const { name, chapters, skipped } = parseBibleFile({
    translation: "NASB",
    chapters: { "Genesis 1": [{ v: 1, t: "In the beginning" }, { v: 2, t: "The earth was formless" }] }
  }, "ignored.json");
  assert.strictEqual(name, "NASB");
  assert.strictEqual(skipped, 0);
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(chapters[0].ref, "Genesis 1");
  assert.deepStrictEqual(chapters[0].chapter.book, "Genesis");
  assert.deepStrictEqual(chapters[0].chapter.chapter, 1);
  assert.deepStrictEqual(chapters[0].chapter.verses, [{ v: 1, t: "In the beginning" }, { v: 2, t: "The earth was formless" }]);
});

test("a plain list of strings is numbered from one", () => {
  const { chapters } = parseBibleFile({ chapters: { "Psalms 23": ["The Lord is my shepherd", "He maketh me"] } }, "psalms.json");
  assert.deepStrictEqual(chapters[0].chapter.verses, [
    { v: 1, t: "The Lord is my shepherd" },
    { v: 2, t: "He maketh me" }
  ]);
});

test("the array form is read, whether entries carry ref or book plus chapter", () => {
  const { chapters } = parseBibleFile({
    translation: "Mine",
    chapters: [
      { ref: "Genesis 1", verses: [{ v: 1, t: "a" }] },
      { book: "Psalms", chapter: 23, verses: [{ v: 1, t: "b" }] }
    ]
  }, "x.json");
  assert.deepStrictEqual(chapters.map(c => c.ref), ["Genesis 1", "Psalms 23"]);
});

test("the file name supplies the translation name when the file omits one", () => {
  const { name } = parseBibleFile({ chapters: { "Genesis 1": [{ v: 1, t: "a" }] } }, "my-nasb");
  assert.strictEqual(name, "my-nasb");
});

test("unreadable entries are counted as skipped rather than aborting the import", () => {
  const { chapters, skipped } = parseBibleFile({
    chapters: { "Genesis 1": [{ v: 1, t: "a" }], "Genesis 2": null, "Genesis 3": { nope: true } }
  }, "x");
  assert.strictEqual(chapters.length, 1);
  assert.strictEqual(skipped, 2);
});

test("a file that is not a Bible object is rejected with a readable message", () => {
  assert.throws(() => parseBibleFile("just a string", "x"), /Bible/i);
  assert.throws(() => parseBibleFile(null, "x"), /Bible/i);
});

test("every imported chapter is tagged with the translation it came from", () => {
  const { chapters } = parseBibleFile({ translation: "NASB", chapters: { "Genesis 1": [{ v: 1, t: "a" }] } }, "x");
  assert.strictEqual(chapters[0].chapter.translation, "NASB");
});

test("blank verses a translation omits are dropped, keeping the other numbers", () => {
  const { chapters } = parseBibleFile({
    translation: "ESV",
    chapters: { "Acts 28": [{ v: 28, t: "they will listen." }, { v: 39, t: "" }, { v: 30, t: "He lived there" }] }
  }, "esv.json");
  assert.deepStrictEqual(chapters[0].chapter.verses.map(v => v.v), [28, 30]);
});

test("a plain string list keeps its numbering gap when a blank verse is dropped", () => {
  const { chapters } = parseBibleFile({ chapters: { "John 5": ["one", "two", "three", " ", "five"] } }, "x.json");
  assert.deepStrictEqual(chapters[0].chapter.verses.map(v => v.v), [1, 2, 3, 5]);
});
