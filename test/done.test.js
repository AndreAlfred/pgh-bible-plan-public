const test = require("node:test");
const assert = require("node:assert");

const { isDone, withDone, initialState, PLAN } = require("../app.js");

test("a fresh plan has nothing marked done", () => {
  const st = initialState();
  PLAN.forEach((_, i) => assert.strictEqual(isDone(st, i), false));
});

test("marking a chapter done only affects that list", () => {
  const st = withDone(initialState(), 3, true);
  assert.strictEqual(isDone(st, 3), true);
  assert.strictEqual(isDone(st, 4), false);
});

test("a done chapter can be brought back", () => {
  const st = withDone(withDone(initialState(), 2, true), 2, false);
  assert.strictEqual(isDone(st, 2), false);
});

test("moving the list on clears the done mark", () => {
  const st = withDone(initialState(), 0, true);
  st.positions = st.positions.map(p => p + 1);
  assert.strictEqual(isDone(st, 0), false);
});

test("a list that wraps back to the same chapter on a later day is not still done", () => {
  const proverbs = PLAN.findIndex(list => list.name === "Proverbs");
  const st = withDone(initialState(), proverbs, true);
  st.day = 32; // Proverbs has 31 chapters, so it is back on position 0
  assert.strictEqual(isDone(st, proverbs), false);
});
