const test = require("node:test");
const assert = require("node:assert");

const { parseProgressFile, loadState, positionsForDay, PLAN } = require("../app.js");

// A bad position used to be saved and then crash every render, so the page stayed
// blank on every reload until the user cleared site data by hand.
const good = () => ({ day: 4, positions: positionsForDay(4), history: [] });

function withStored(value, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => JSON.stringify(value), setItem() {} }
  });
  try { return run(); }
  finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

test("a backup with a position past the end of its list is rejected", () => {
  const backup = good();
  backup.positions[0] = PLAN[0].chapters.length;
  assert.strictEqual(parseProgressFile(JSON.stringify(backup)).ok, false);
});

test("a backup with a negative, fractional or non-numeric position is rejected", () => {
  for (const bad of [-1, 1.5, "3", null]) {
    const backup = good();
    backup.positions[2] = bad;
    assert.strictEqual(parseProgressFile(JSON.stringify(backup)).ok, false, `accepted ${JSON.stringify(bad)}`);
  }
});

test("a backup with an impossible day is rejected", () => {
  for (const day of [0, -3, 2.5, "x"]) {
    assert.strictEqual(parseProgressFile(JSON.stringify({ ...good(), day })).ok, false, `accepted day ${day}`);
  }
});

test("a valid backup at the last chapter of every list is still accepted", () => {
  const backup = { day: 9, positions: PLAN.map(l => l.chapters.length - 1) };
  assert.strictEqual(parseProgressFile(JSON.stringify(backup)).ok, true);
});

test("stored progress with broken positions is repaired from its day, keeping history", () => {
  const stored = { ...good(), positions: [999, 0, 0, 0, 0, 0, 0, 0, 0, 0], history: [{ day: 3 }] };
  const state = withStored(stored, loadState);
  assert.deepStrictEqual(state.positions, positionsForDay(4));
  assert.strictEqual(state.day, 4);
  assert.strictEqual(state.history.length, 1);
});

test("stored progress with a broken day starts over at day 1", () => {
  const state = withStored({ day: "soon", positions: [1, 2] }, loadState);
  assert.strictEqual(state.day, 1);
  assert.deepStrictEqual(state.positions, positionsForDay(1));
});
