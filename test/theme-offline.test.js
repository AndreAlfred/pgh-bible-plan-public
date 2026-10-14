const test = require("node:test");
const assert = require("node:assert");

const { nextThemeOverride, upcomingSlugs, initialState, PLAN } = require("../app.js");

// The toggle flips the visible theme. Landing back on the device's own setting
// stores nothing, so the page follows the device again with no third "auto" state.
test("on a light device, the toggle stores dark", () => {
  assert.strictEqual(nextThemeOverride("light", false), "dark");
});

test("toggling back to the device's own theme clears the override", () => {
  assert.strictEqual(nextThemeOverride("dark", false), null);
  assert.strictEqual(nextThemeOverride("light", true), null);
});

test("on a dark device, the toggle stores light", () => {
  assert.strictEqual(nextThemeOverride("dark", true), "light");
});

test("upcoming chapters cover today plus the next week for all ten lists", () => {
  const slugs = upcomingSlugs(initialState(), 8);
  assert.strictEqual(slugs.length, 80);
  assert.ok(slugs.includes("matthew-1"));
  assert.ok(slugs.includes("matthew-8"));
  assert.ok(!slugs.includes("matthew-9"));
  assert.ok(slugs.includes("1-thessalonians-1"));
});

test("upcoming chapters wrap at the end of a list without duplicates", () => {
  const st = initialState();
  const proverbs = PLAN.findIndex(list => list.name === "Proverbs");
  st.positions[proverbs] = 29; // Proverbs 30
  const slugs = upcomingSlugs(st, 8);
  assert.ok(slugs.includes("proverbs-31"));
  assert.ok(slugs.includes("proverbs-1"));
  assert.strictEqual(new Set(slugs).size, slugs.length);
});
