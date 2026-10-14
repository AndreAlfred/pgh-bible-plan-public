const test = require("node:test");
const assert = require("node:assert");

const { loadKjvChapter } = require("../app.js");

// Each test uses its own slug: the cache is module-level and deliberately has no
// reset hook, so sharing a slug across tests would leak state between them.
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return handler(url, calls.length);
  };
  return calls;
}
const ok = body => ({ ok: true, status: 200, json: async () => body });

test("a chapter is fetched from the bundled KJV files and parsed", async () => {
  stubFetch(() => ok({ ref: "Genesis 1", verses: [{ v: 1, t: "In the beginning" }] }));
  const chapter = await loadKjvChapter("genesis-1");
  assert.strictEqual(chapter.ref, "Genesis 1");
});

test("the same chapter is only fetched over the network once", async () => {
  const calls = stubFetch(() => ok({ ref: "John 3" }));
  await loadKjvChapter("john-3");
  await loadKjvChapter("john-3");
  await loadKjvChapter("john-3");
  assert.strictEqual(calls.length, 1);
});

test("ten chapters requested at once produce ten requests, not twenty", async () => {
  const calls = stubFetch(url => ok({ ref: url }));
  const slugs = ["a-1", "b-1", "c-1", "d-1", "e-1"];
  await Promise.all([...slugs, ...slugs].map(loadKjvChapter));
  assert.strictEqual(calls.length, 5);
});

test("a missing chapter file rejects instead of resolving to parsed 404 markup", async () => {
  stubFetch(() => ({ ok: false, status: 404, json: async () => ({}) }));
  await assert.rejects(() => loadKjvChapter("nowhere-9"), /nowhere-9/);
});

test("a failed fetch is not cached, so a later attempt can still succeed", async () => {
  const calls = stubFetch((url, n) => (n === 1 ? { ok: false, status: 500, json: async () => ({}) } : ok({ ref: "Acts 1" })));
  await assert.rejects(() => loadKjvChapter("acts-1"));
  const chapter = await loadKjvChapter("acts-1");
  assert.strictEqual(chapter.ref, "Acts 1");
  assert.strictEqual(calls.length, 2);
});
