const test = require("node:test");
const assert = require("node:assert");

const { loadState, persistState } = require("../app.js");

// iOS Safari private tabs throw on localStorage writes rather than failing quietly.
// An unguarded throw here kills saveState() before it reaches render(), so the page
// freezes on the tap instead of just forgetting progress.
function withHostileStorage(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() { throw new Error("SecurityError: storage denied"); },
      setItem() { throw new Error("QuotaExceededError"); }
    }
  });
  try { run(); }
  finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

test("saving progress does not throw when storage writes are denied", () => {
  withHostileStorage(() => {
    assert.doesNotThrow(() => persistState());
  });
});

test("loading progress falls back to a fresh day-1 plan when storage reads are denied", () => {
  withHostileStorage(() => {
    const state = loadState();
    assert.strictEqual(state.day, 1);
    assert.strictEqual(state.positions.length, 10);
    assert.strictEqual(state.translation, "KJV");
  });
});
