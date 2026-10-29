const test = require("node:test");
const assert = require("node:assert");

const {
  PLAN, initialState, withDone, positionsForDay, parseProgressFile, voiceOptionsHtml,
  isEsvTranslation, listenQueue, upToIndex, nextUnfinishedPos, validResume, queueTimeline, formatClock, timeLeftPhrase, atSpeed, ESV_VOICE
} = require("../app.js");

const day = n => ({ ...initialState(), day: n, positions: positionsForDay(n), translation: "ESV" });
const refOf = (st, i) => { const ch = PLAN[i].chapters[st.positions[i]]; return `${ch.book} ${ch.chapter}`; };

test("ESV translations are recognised by name, loosely but not too loosely", () => {
  for (const name of ["ESV", " esv ", "ESV 2016", "ESV (2025)", "ESV-Text"]) assert.ok(isEsvTranslation(name), name);
  for (const name of ["KJV", "NASB", "ESVX", "My ESV", "", null]) assert.ok(!isEsvTranslation(name), String(name));
});

test("the listening queue skips done chapters and wraps round from a starting card", () => {
  let st = day(1);
  assert.deepStrictEqual(listenQueue(st), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  st = withDone(withDone(st, 1, true), 7, true);
  assert.deepStrictEqual(listenQueue(st, 5), [5, 6, 8, 9, 0, 2, 3, 4]);
});

test("'up to' is the first unfinished chapter after the furthest one finished", () => {
  let st = day(1);
  assert.strictEqual(upToIndex(st), 0);
  // Listened to the Gospels and Numbers, then read Paul through Wisdom: Psalms is next.
  for (const i of [0, 1, 2, 3, 4]) st = withDone(st, i, true);
  assert.strictEqual(upToIndex(st), 5);
  // A card skipped earlier doesn't pull you back; it comes round after Acts.
  st = withDone(withDone(day(1), 1, true), 4, true);
  assert.strictEqual(upToIndex(st), 5);
  st = withDone(st, 9, true);
  assert.strictEqual(upToIndex(st), 0);
  for (let i = 0; i < 10; i++) st = withDone(st, i, true);
  assert.strictEqual(upToIndex(st), null);
});

test("the next unfinished position in a queue skips chapters read in the meantime", () => {
  let st = day(1);
  const queue = listenQueue(st, 1); // paused on Numbers, the second card
  for (const i of [1, 2, 3, 4]) st = withDone(st, i, true);
  assert.strictEqual(queue[nextUnfinishedPos(st, queue, 0)], 5);
  for (let i = 0; i < 10; i++) st = withDone(st, i, true);
  assert.strictEqual(nextUnfinishedPos(st, queue, 0), -1);
});

test("a saved place is used only for the same day, translation and unfinished chapter", () => {
  const st = day(12);
  const place = { day: 12, translation: "ESV", ref: refOf(st, 3), seconds: 91 };
  assert.strictEqual(validResume(st, place).index, 3);
  assert.strictEqual(validResume(st, { ...place, day: 11 }), null);
  assert.strictEqual(validResume({ ...st, translation: "KJV" }, place), null);
  assert.strictEqual(validResume(withDone(st, 3, true), place), null);
  assert.strictEqual(validResume(st, { ...place, ref: "Acts 99" }), null);
  assert.strictEqual(validResume(st, { ...place, seconds: -1 }), null);
  assert.strictEqual(validResume(st, null), null);
  assert.strictEqual(validResume(st, "junk"), null);
});

test("the queue timeline lays chapters end to end and says when lengths are missing", () => {
  assert.deepStrictEqual(queueTimeline([251.4, 288.3, 60]), { starts: [0, 251.4, 539.7], total: 599.7, complete: true });
  const partial = queueTimeline([251.4, null]);
  assert.strictEqual(partial.complete, false);
  assert.strictEqual(queueTimeline([]).complete, false);
});

test("times read naturally", () => {
  assert.strictEqual(formatClock(91.7), "1:31");
  assert.strictEqual(formatClock(3725), "1:02:05");
  assert.strictEqual(formatClock(-4), "0:00");
  assert.strictEqual(timeLeftPhrase(160), "2 min 40 sec");
  assert.strictEqual(timeLeftPhrase(120), "2 min");
  assert.strictEqual(timeLeftPhrase(41.2), "41 sec");
});

test("time left is real listening time at the chosen speed", () => {
  assert.strictEqual(atSpeed(600, 1), 600);
  assert.strictEqual(atSpeed(600, 1.5), 400);
  assert.strictEqual(atSpeed(600, 0.75), 800);
  assert.strictEqual(atSpeed(600, "junk"), 600);
  assert.strictEqual(atSpeed(600, 9), 400); // clamped to the slider's 1.5× top
});

test("ESV readers are offered the recording first in the voice menu", () => {
  const voices = [{ name: "Samantha", lang: "en-US" }];
  const on = voiceOptionsHtml(voices, "Samantha", ["en-US"], { esv: true });
  assert.match(on, new RegExp(`^<option value="${ESV_VOICE}" selected>ESV recording \\(Crossway\\)</option>`));
  assert.doesNotMatch(on, /Samantha[^<]*" selected|value="Samantha" selected/);
  const off = voiceOptionsHtml(voices, "Samantha", ["en-US"], { esv: false });
  assert.match(off, /value="Samantha" selected/);
  assert.doesNotMatch(voiceOptionsHtml(voices, "Samantha", ["en-US"]), /ESV recording/);
  assert.match(voiceOptionsHtml([], "", ["en-US"], { esv: true }), /ESV recording/);
});

test("listening settings default on, survive a backup, and junk falls back", () => {
  const st = initialState();
  assert.strictEqual(st.esvAudio, true);
  assert.strictEqual(st.keepPlaying, true);
  const kept = parseProgressFile(JSON.stringify({ ...st, esvAudio: false, keepPlaying: false }));
  assert.strictEqual(kept.state.esvAudio, false);
  assert.strictEqual(kept.state.keepPlaying, false);
  const junk = parseProgressFile(JSON.stringify({ ...st, esvAudio: "no", keepPlaying: 0 }));
  assert.strictEqual(junk.state.esvAudio, true);
  assert.strictEqual(junk.state.keepPlaying, true);
});
