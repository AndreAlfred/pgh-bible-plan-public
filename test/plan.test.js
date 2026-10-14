const test = require("node:test");
const assert = require("node:assert");

const { positionsForDay, indexOfRef, parseRef, PLAN, START } = require("../app.js");

test("day 1 positions point at the plan's ten starting chapters", () => {
  const positions = positionsForDay(1);
  const refs = PLAN.map((list, i) => {
    const ch = list.chapters[positions[i]];
    return `${ch.book} ${ch.chapter}`;
  });
  assert.deepStrictEqual(refs, START);
});

test("each day advances every list by exactly one chapter", () => {
  const day1 = positionsForDay(1);
  const day2 = positionsForDay(2);
  day2.forEach((p, i) => {
    const total = PLAN[i].chapters.length;
    assert.strictEqual(p, (day1[i] + 1) % total, `list ${i + 1} did not advance by one`);
  });
});

test("a list wraps back to its first chapter the day after it finishes", () => {
  const proverbs = PLAN.findIndex(list => list.name === "Proverbs");
  const total = PLAN[proverbs].chapters.length;
  assert.strictEqual(total, 31);
  const wrapDay = total + 1;
  const ch = PLAN[proverbs].chapters[positionsForDay(wrapDay)[proverbs]];
  assert.strictEqual(`${ch.book} ${ch.chapter}`, "Proverbs 1");
});

test("day 0 and missing days are treated as day 1", () => {
  assert.deepStrictEqual(positionsForDay(0), positionsForDay(1));
  assert.deepStrictEqual(positionsForDay(undefined), positionsForDay(1));
});

test("parseRef splits multi-word book names on the last space", () => {
  assert.deepStrictEqual(parseRef("Song of Solomon 2"), { book: "Song of Solomon", chapter: 2 });
  assert.deepStrictEqual(parseRef("1 Kings 5"), { book: "1 Kings", chapter: 5 });
  assert.deepStrictEqual(parseRef("Genesis 1"), { book: "Genesis", chapter: 1 });
});

test("indexOfRef throws for a chapter that is not in the list", () => {
  const gospels = PLAN[0];
  assert.throws(() => indexOfRef(gospels, "Genesis 1"), /Missing Genesis 1/);
});
