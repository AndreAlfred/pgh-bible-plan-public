const test = require("node:test");
const assert = require("node:assert");

const { advanceDay, withDone, initialState, positionsForDay } = require("../app.js");

test("completing a day moves every list on and logs the day", () => {
  const next = advanceDay(initialState());
  assert.strictEqual(next.day, 2);
  assert.deepStrictEqual(next.positions, positionsForDay(2));
  assert.strictEqual(next.history[0].day, 1);
  assert.strictEqual(next.history[0].readings.length, 10);
  assert.strictEqual(next.history[0].readings[0].ref, "Matthew 1");
});

test("completing a day clears the done marks", () => {
  const next = advanceDay(withDone(initialState(), 4, true));
  assert.deepStrictEqual(next.done, {});
});

// Undo restores the state object from before Complete Day, so that object must
// come through untouched -- a mutated snapshot would "undo" to the new day.
test("completing a day leaves the previous state untouched for undo", () => {
  const before = withDone(initialState(), 2, true);
  const frozen = JSON.stringify(before);
  advanceDay(before);
  assert.strictEqual(JSON.stringify(before), frozen);
});

test("history keeps the most recent 90 days", () => {
  let st = initialState();
  for (let i = 0; i < 95; i++) st = advanceDay(st);
  assert.strictEqual(st.history.length, 90);
  assert.strictEqual(st.history[0].day, 95);
});
