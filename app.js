const BOOKS = {
  Genesis: 50, Exodus: 40, Leviticus: 27, Numbers: 36, Deuteronomy: 34,
  Joshua: 24, Judges: 21, Ruth: 4, "1 Samuel": 31, "2 Samuel": 24,
  "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36,
  Ezra: 10, Nehemiah: 13, Esther: 10, Job: 42, Psalms: 150, Proverbs: 31,
  Ecclesiastes: 12, "Song of Solomon": 8, Isaiah: 66, Jeremiah: 52,
  Lamentations: 5, Ezekiel: 48, Daniel: 12, Hosea: 14, Joel: 3, Amos: 9,
  Obadiah: 1, Jonah: 4, Micah: 7, Nahum: 3, Habakkuk: 3, Zephaniah: 3,
  Haggai: 2, Zechariah: 14, Malachi: 4, Matthew: 28, Mark: 16, Luke: 24,
  John: 21, Acts: 28, Romans: 16, "1 Corinthians": 16, "2 Corinthians": 13,
  Galatians: 6, Ephesians: 6, Philippians: 4, Colossians: 4,
  "1 Thessalonians": 5, "2 Thessalonians": 3, "1 Timothy": 6, "2 Timothy": 4,
  Titus: 3, Philemon: 1, Hebrews: 13, James: 5, "1 Peter": 5, "2 Peter": 3,
  "1 John": 5, "2 John": 1, "3 John": 1, Jude: 1, Revelation: 22
};

const PLAN = [
  { id: 1, name: "Gospels", books: ["Matthew", "Mark", "Luke", "John"] },
  { id: 2, name: "Pentateuch", books: ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"] },
  { id: 3, name: "Paul + Hebrews", books: ["Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "Hebrews"] },
  { id: 4, name: "Epistles + Revelation", books: ["1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"] },
  { id: 5, name: "Wisdom", books: ["Job", "Ecclesiastes", "Song of Solomon"] },
  { id: 6, name: "Psalms", books: ["Psalms"] },
  { id: 7, name: "Proverbs", books: ["Proverbs"] },
  { id: 8, name: "History", books: ["Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther"] },
  { id: 9, name: "Prophets", books: ["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi"] },
  { id: 10, name: "Acts", books: ["Acts"] }
].map(list => ({
  ...list,
  chapters: list.books.flatMap(book => Array.from({ length: BOOKS[book] }, (_, i) => ({ book, chapter: i + 1 })))
}));

const START = ["Matthew 1", "Genesis 1", "Romans 1", "1 Thessalonians 1", "Job 1", "Psalms 1", "Proverbs 1", "Joshua 1", "Isaiah 1", "Acts 1"];
const KEY = "pghBiblePlan.public.state.v1";
const DB_NAME = "pghBiblePlanBibleStore";
const DB_VERSION = 1;

let state = null;
let currentTranslation = "KJV";
let renderToken = 0;
let firstRender = true;
// Settles once the chapters drawn by the latest render have their text.
let chaptersReady = Promise.resolve();
let voices = [];
let audio = {
  items: [],
  index: 0,
  gen: 0,
  playing: false,
  paused: false,
  open: false,
  title: "Ready",
  subtitle: "Tap Listen, or pick a single chapter.",
  mode: "idle",
  driver: "speech"
};

const $ = sel => document.querySelector(sel);
const refText = ch => `${ch.book} ${ch.chapter}`;
const pct = (pos, total) => Math.round(((pos + 1) / total) * 100);
const esc = s => String(s).replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const slug = ch => `${ch.book.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${ch.chapter}`;

function parseRef(ref) {
  const i = ref.lastIndexOf(" ");
  return { book: ref.slice(0, i), chapter: Number(ref.slice(i + 1)) };
}
function indexOfRef(list, ref) {
  const r = typeof ref === "string" ? parseRef(ref) : ref;
  const i = list.chapters.findIndex(ch => ch.book === r.book && ch.chapter === r.chapter);
  if (i < 0) throw new Error(`Missing ${r.book} ${r.chapter}`);
  return i;
}
function positionsForDay(day) {
  const offset = Math.max(0, Number(day || 1) - 1);
  return PLAN.map((list, i) => (indexOfRef(list, START[i]) + offset) % list.chapters.length);
}
function initialState() {
  return { day: 1, positions: positionsForDay(1), done: {}, translation: "KJV", history: [], importedNames: [], voice: "", rate: 1, textLayout: "verses", verseNumbers: true, esvAudio: true, keepPlaying: true };
}
// A position past the end of its list makes render() throw, and because the bad
// state is already saved, the page would stay blank on every reload.
const validDay = day => Number.isInteger(day) && day >= 1;
const TEXT_LAYOUTS = ["verses", "flow"];
// Preferences are cosmetic, so a bad value falls back to the default rather than
// rejecting the saved state or backup it came in.
const boolOr = (v, fallback) => typeof v === "boolean" ? v : fallback;
const withValidPrefs = st => ({
  ...st,
  textLayout: TEXT_LAYOUTS.includes(st.textLayout) ? st.textLayout : "verses",
  verseNumbers: boolOr(st.verseNumbers, true),
  esvAudio: boolOr(st.esvAudio, true),
  keepPlaying: boolOr(st.keepPlaying, true)
});
const validPositions = positions => Array.isArray(positions) && positions.length === PLAN.length &&
  positions.every((p, i) => Number.isInteger(p) && p >= 0 && p < PLAN[i].chapters.length);
function loadState() {
  let saved;
  try { saved = { ...initialState(), ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return initialState(); }
  if (!validDay(saved.day)) return initialState();
  if (!validPositions(saved.positions)) saved.positions = positionsForDay(saved.day);
  return withValidPrefs(saved);
}
function persistState() {
  // Private tabs deny writes. Losing progress is survivable; throwing here is not,
  // because it aborts saveState() before render() and the page stops responding.
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { /* progress stays in memory for this session */ }
}
function saveState() { persistState(); render(); }
function currentReadings() {
  return PLAN.map((list, i) => ({ list, index: i, current: list.chapters[state.positions[i]], next: list.chapters[(state.positions[i] + 1) % list.chapters.length] }));
}
// A list is done while it still sits where it was marked. Next, Complete Day and
// Set day all move day or position, so the mark lapses with no cleanup. The day is
// part of the stamp because short lists (Proverbs) wrap back to the same position.
const doneStamp = (st, i) => `${st.day}:${st.positions[i]}`;
function isDone(st, i) { return st.done?.[i] === doneStamp(st, i); }
function withDone(st, i, done) {
  const marks = { ...st.done };
  if (done) marks[i] = doneStamp(st, i);
  else delete marks[i];
  return { ...st, done: marks };
}
// Recorded audio exists only for the ESV (see docs/audio-licensing.md). Any imported
// translation named "ESV", "ESV 2016", "ESV (2025)"… counts; "ESVX" does not.
const isEsvTranslation = name => /^esv(?![a-z])/i.test(String(name || "").trim());
// Today's unfinished chapters, starting at `start` and wrapping round, so starting
// from the sixth card still reaches the first five.
function listenQueue(st, start = 0) {
  const order = PLAN.map((_, i) => (start + i) % PLAN.length);
  return order.filter(i => !isDone(st, i));
}
// Where the reader is up to: the first unfinished chapter after the furthest card
// they've finished. A chapter skipped earlier comes round last rather than first.
function upToIndex(st) {
  const finished = PLAN.map((_, i) => i).filter(i => isDone(st, i));
  const queue = listenQueue(st, finished.length ? finished[finished.length - 1] + 1 : 0);
  return queue.length ? queue[0] : null;
}
// The next position in a listening queue after `pos` whose chapter isn't done, or -1.
function nextUnfinishedPos(st, queue, pos) {
  for (let p = pos + 1; p < queue.length; p++) if (!isDone(st, queue[p])) return p;
  return -1;
}
// A saved listening place is only good for the same day, translation and chapter,
// and only while that chapter is still unfinished.
function validResume(st, saved) {
  if (!saved || typeof saved !== "object" || saved.day !== st.day) return null;
  if (saved.translation !== st.translation || !isEsvTranslation(saved.translation)) return null;
  if (!Number.isFinite(saved.seconds) || saved.seconds < 0) return null;
  const index = PLAN.findIndex((list, i) => refText(list.chapters[st.positions[i]]) === saved.ref);
  return index === -1 || isDone(st, index) ? null : { ...saved, index };
}
// Offsets of each queued chapter on one continuous timeline. Lengths come from the
// server (file size) before anything plays; `complete` is false until all are known.
function queueTimeline(seconds) {
  const starts = [];
  let total = 0;
  for (const s of seconds) { starts.push(total); total += s > 0 ? s : 0; }
  return { starts, total, complete: seconds.length > 0 && seconds.every(s => s > 0) };
}
function formatClock(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
function timeLeftPhrase(seconds) {
  const t = Math.max(0, Math.round(seconds || 0));
  if (t < 60) return `${t} sec`;
  const m = Math.floor(t / 60), sec = t % 60;
  return sec ? `${m} min ${sec} sec` : `${m} min`;
}
// Theme follows the device unless the user picked one. Picking the device's own
// setting clears the override, so the toggle needs no third "auto" state. The
// <head> script in index.html applies the same rule before first paint.
const THEME_KEY = "pghBiblePlan.theme";
function nextThemeOverride(shown, systemIsDark) {
  const next = shown === "dark" ? "light" : "dark";
  return next === (systemIsDark ? "dark" : "light") ? null : next;
}
const systemDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
let themeOverride = null;
try { themeOverride = localStorage.getItem(THEME_KEY); } catch { /* storage denied: follow the device */ }
const shownTheme = () => themeOverride || (systemDark() ? "dark" : "light");
function applyTheme() {
  const theme = shownTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#1b140e" : "#8d321d");
}
function toggleTheme() {
  themeOverride = nextThemeOverride(shownTheme(), systemDark());
  try {
    if (themeOverride) localStorage.setItem(THEME_KEY, themeOverride);
    else localStorage.removeItem(THEME_KEY);
  } catch { /* the choice still holds for this visit */ }
  applyTheme();
  render();
}
function themeButtonHtml() {
  const dark = shownTheme() === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return `<button class="theme-btn" onclick="toggleTheme()" aria-label="${label}" title="${label}">${dark ? "☀\uFE0E" : "☾"}</button>`;
}

// Chapter files for today plus the coming days, for the service worker to save
// ahead of time so a trip without signal doesn't interrupt the plan.
function upcomingSlugs(st, days) {
  const slugs = new Set();
  for (let d = 0; d < days; d++) {
    PLAN.forEach((list, i) => slugs.add(slug(list.chapters[(st.positions[i] + d) % list.chapters.length])));
  }
  return [...slugs];
}
function prefetchUpcoming() {
  navigator.serviceWorker?.ready.then(reg => {
    reg.active?.postMessage({ type: "prefetch", urls: upcomingSlugs(state, 8).map(s => `/data/kjv/${s}.json`) });
  }).catch(() => { /* offline support is a bonus, never an error */ });
}

function setDone(i, done) {
  state = withDone(state, i, done);
  recFollowDone();
  saveState();
}
// Done at the end of a passage removes it, which would leave the reader partway into
// the next chapter. Jump to that chapter's start once its text (and the text above
// it) has loaded, since loading changes the heights.
function finishChapter(i) {
  const next = document.getElementById(`chapter-panel-${i}`)?.nextElementSibling?.id || "reader";
  setDone(i, true);
  chaptersReady.then(() => document.getElementById(next)?.scrollIntoView({ behavior: "instant", block: "start" }));
}

function move(i, delta) {
  const total = PLAN[i].chapters.length;
  state.positions[i] = (state.positions[i] + delta + total) % total;
  stopAudio();
  saveState();
}
// Returns a new state rather than editing this one: Undo restores the old object.
function advanceDay(st) {
  const readings = PLAN.map((list, i) => ({ list: list.id, name: list.name, ref: refText(list.chapters[st.positions[i]]) }));
  return {
    ...st,
    day: st.day + 1,
    positions: st.positions.map((p, i) => (p + 1) % PLAN[i].chapters.length),
    done: {},
    history: [{ day: st.day, date: new Date().toISOString(), readings }, ...st.history].slice(0, 90)
  };
}
// Undo is offered for a few seconds after a big jump. It only applies while nothing
// else has changed since, so it can never throw away a later Next or Done.
let undo = null;
function offerUndo(before, message) {
  undo = { before, after: JSON.stringify(state) };
  toast(message, { actionLabel: "Undo", action: undoLast, ms: 10000 });
}
function undoLast() {
  if (!undo) return;
  if (JSON.stringify(state) !== undo.after) { toast("Can't undo — your progress changed since then."); undo = null; return; }
  state = undo.before;
  undo = null;
  stopAudio();
  saveState();
  toast(`Back to Day ${state.day}.`);
}
function completeDay() {
  const before = state;
  state = advanceDay(state);
  stopAudio();
  saveState();
  offerUndo(before, `Day ${before.day} complete — on to Day ${state.day}.`);
  prefetchUpcoming();
}
function setReference(i, book, chapter) {
  state.positions[i] = indexOfRef(PLAN[i], { book, chapter: Number(chapter) });
  stopAudio();
  saveState();
}
function setDay() {
  const day = prompt("Set current day number", state.day);
  if (!day || Number(day) < 1) return;
  state.day = Number(day);
  state.positions = positionsForDay(state.day);
  stopAudio();
  saveState();
}
function resetPlan() {
  if (!confirm("Reset public plan progress to Day 1?")) return;
  const before = state;
  state = { ...initialState(), importedNames: state.importedNames || [], translation: state.translation || "KJV" };
  stopAudio();
  saveState();
  offerUndo(before, "Progress reset to Day 1.");
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pgh-bible-plan-progress.json";
  a.click();
}
async function importData(file) {
  if (!file) return;
  let result;
  try { result = parseProgressFile(await file.text()); }
  catch (err) { toast(`Could not read that file: ${err.message}`, { error: true }); return; }
  if (!result.ok) { toast(result.error, { error: true }); return; }
  const before = state;
  state = result.state;
  persistState();
  stopAudio();
  render();
  offerUndo(before, `Progress restored to Day ${state.day}.`);
}
// Notices live outside #app, because render() replaces everything inside it.
let toastTimer = 0;
function toast(message, { actionLabel = "", action = null, error = false, ms = error ? 9000 : 4000 } = {}) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.append(el);
  }
  el.className = `toast is-shown${error ? " is-error" : ""}`;
  el.setAttribute("role", error ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  el.replaceChildren(text);
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.onclick = () => { hideToast(); action(); };
    el.append(btn);
  }
  const close = document.createElement("button");
  close.className = "toast-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.onclick = hideToast;
  el.append(close);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { document.getElementById("toast")?.classList.remove("is-shown"); }
function copyReadings() {
  const text = [`PGH Bible Plan — Day ${state.day}`, ...currentReadings().map(r => `${r.list.id}. ${refText(r.current)}`)].join("\n");
  navigator.clipboard?.writeText(text).then(() => toast("Copied today’s readings."), () => prompt("Copy today’s readings", text));
}
function scrollToChapter(i) {
  document.getElementById(`chapter-panel-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function scrollToReader() {
  document.getElementById("reader")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// One connection for the page's lifetime; opening per read meant ten per render.
let dbPromise = null;
function db() {
  return dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("chapters")) d.createObjectStore("chapters");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
}
async function dbGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction("chapters", "readonly");
    const r = tx.objectStore("chapters").get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbSet(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction("chapters", "readwrite");
    tx.objectStore("chapters").put(val, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

// render() reloads all ten chapters on every state change, and Listen reads the same
// files again. The promise (not the result) is cached, so ten parallel callers asking
// for one chapter share a single request. Failures are evicted so they can be retried.
const chapterCache = new Map();
function loadKjvChapter(slugName) {
  if (!chapterCache.has(slugName)) {
    const pending = fetch(`data/kjv/${slugName}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Missing chapter file ${slugName}.json (${r.status})`);
        return r.json();
      })
      .catch(err => { chapterCache.delete(slugName); throw err; });
    chapterCache.set(slugName, pending);
  }
  return chapterCache.get(slugName);
}
async function getChapter(ch) {
  if (state.translation && state.translation !== "KJV") {
    const imported = await dbGet(`${state.translation}:${refText(ch)}`);
    // Bibles imported before blank verses were dropped still have them stored.
    if (imported) return { ...imported, verses: withoutBlankVerses(imported.verses) };
  }
  return loadKjvChapter(slug(ch));
}
// "flow" runs a chapter together like a printed Bible. Neither the bundled KJV nor the
// import format records paragraph breaks, so a flowing chapter is one paragraph.
function verseHtml(chapter, { layout = "verses", numbers = true } = {}) {
  if (layout === "flow") {
    const run = chapter.verses.map(v => `${numbers ? `<sup class="vnum">${v.v}</sup>` : ""}${esc(v.t)}`).join(" ");
    return `<p class="flow">${run}</p>`;
  }
  return chapter.verses.map(v => `<p class="verse">${numbers ? `<sup>${v.v}</sup>` : ""}<span>${esc(v.t)}</span></p>`).join("");
}
const textPrefs = st => ({ layout: st.textLayout, numbers: st.verseNumbers });
async function loadChapters(readings) {
  const token = ++renderToken;
  await Promise.all(readings.map(async r => {
    const el = document.getElementById(`chapter-body-${r.index}`);
    if (!el) return;
    try {
      const chapter = await getChapter(r.current);
      if (token === renderToken) el.innerHTML = verseHtml(chapter, textPrefs(state));
    } catch (err) {
      // fetch() rejects with a TypeError when the network is unreachable; a missing
      // file is our own Error. navigator.onLine alone misses dead Wi-Fi.
      if (token === renderToken) el.innerHTML = err instanceof TypeError || navigator.onLine === false
        ? `<p class="missing">${esc(refText(r.current))} isn't saved for offline reading yet. It will load once you're back online.</p>`
        : `<p class="missing">No text loaded for ${esc(refText(r.current))}. Use KJV or import a local Bible file.</p>`;
    }
  }));
}

function normalizeImportedChapter(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.ref && raw.verses) return raw;
  if (raw.book && raw.chapter && raw.verses) return { ...raw, ref: `${raw.book} ${raw.chapter}` };
  return null;
}
function normalizeVerses(val) {
  const list = Array.isArray(val) ? val : val?.verses;
  if (!Array.isArray(list)) return null;
  return withoutBlankVerses(list.map((x, i) => (typeof x === "string" ? { v: i + 1, t: x } : x)));
}
// Modern translations omit verses the oldest manuscripts lack (Acts 28:29, John 5:4…),
// and some exported files keep them as empty entries. Printed Bibles skip the number,
// and an empty utterance can stall speech, so drop them. Numbering happens first, so a
// plain string list keeps its gap.
function withoutBlankVerses(verses) {
  return verses.filter(x => x && typeof x.t === "string" && x.t.trim());
}

// Both import paths used to parse inline, so a bad file threw into a FileReader
// callback or an async onchange handler and vanished. Parsing is separated from
// I/O here so failures come back as values the caller can show the user.
function parseProgressFile(text) {
  let raw;
  try { raw = JSON.parse(text); }
  catch { return { ok: false, error: "That file isn't valid JSON. Pick the file you got from Export." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "That doesn't look like a progress backup." };
  }
  if (!Array.isArray(raw.positions) || raw.positions.length !== PLAN.length) {
    return { ok: false, error: `That doesn't look like a progress backup — it has no reading position for all ${PLAN.length} lists. To load a Bible translation, use “Bring your own Bible JSON” instead.` };
  }
  if (!validPositions(raw.positions) || !validDay(raw.day ?? 1)) {
    return { ok: false, error: "That progress backup is damaged — its day or reading positions are out of range. Nothing was changed." };
  }
  return { ok: true, state: withValidPrefs({ ...initialState(), ...raw }) };
}
function parseBibleFile(raw, fallbackName) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("That file isn't a Bible JSON object. See the (i) button for the expected shape.");
  }
  const name = raw.translation || raw.name || fallbackName || "Imported";
  const source = raw.chapters || raw;
  const chapters = [];
  let skipped = 0;
  if (Array.isArray(source)) {
    for (const item of source) {
      const ch = normalizeImportedChapter(item);
      const verses = ch && normalizeVerses(ch);
      if (ch?.ref && verses) chapters.push({ ref: ch.ref, chapter: { ...ch, verses, translation: name } });
      else skipped++;
    }
  } else {
    for (const [ref, val] of Object.entries(source)) {
      const verses = normalizeVerses(val);
      if (!verses || !ref.includes(" ")) { skipped++; continue; }
      const { book, chapter } = parseRef(ref);
      chapters.push({ ref, chapter: { translation: name, ref, book, chapter, verses } });
    }
  }
  return { name, chapters, skipped };
}
let importHelpOpen = false;
function toggleImportHelp() {
  importHelpOpen = !importHelpOpen;
  render();
}
function importHelpHtml() {
  if (!importHelpOpen) return "";
  const example = `{
  "translation": "NASB",
  "chapters": {
    "Genesis 1": [
      { "v": 1, "t": "In the beginning God created the heavens and the earth." },
      { "v": 2, "t": "The earth was formless and void." }
    ],
    "Psalms 23": [
      { "v": 1, "t": "The Lord is my shepherd, I shall not want." }
    ]
  }
}`;
  return `<div class="import-help" id="importHelp">
    <div class="import-help-head"><h3>Bible JSON format</h3><button onclick="toggleImportHelp()" aria-label="Close format help">Close</button></div>
    <p>Your file never leaves this browser. It is stored locally and used in place of the KJV text once you select it in the Translation dropdown.</p>
    <h4>The shape</h4>
    <p><code>translation</code> is the name shown in the dropdown. If you leave it out, the file name is used instead. <code>chapters</code> maps a reference to its list of verses:</p>
    <pre>${esc(example)}</pre>
    <h4>Two rules that matter</h4>
    <ol>
      <li><strong>Reference keys must be <code>Book Chapter</code></strong>, spelled exactly as this app spells them — <code>Genesis 1</code>, <code>Psalms 23</code> (not "Psalm"), <code>Song of Solomon 2</code>, <code>1 Kings 5</code>, <code>Revelation 22</code>. A reference the app doesn't recognise is skipped silently.</li>
      <li><strong>Include the verse numbers</strong> as <code>v</code>. You may instead pass a plain list of strings (<code>["first verse", "second verse"]</code>) and they'll be numbered from 1 — but that mislabels every verse after any gap, so <code>{ "v", "t" }</code> is safer.</li>
    </ol>
    <h4>Also accepted</h4>
    <p>An array instead of an object, where each entry carries its own reference:</p>
    <pre>${esc(`{ "translation": "NASB", "chapters": [
  { "ref": "Genesis 1", "verses": [ { "v": 1, "t": "..." } ] },
  { "book": "Psalms", "chapter": 23, "verses": [ { "v": 1, "t": "..." } ] }
] }`)}</pre>
    <p>You don't need the whole Bible. Import a single chapter or one book — anything missing falls back to the KJV text.</p>
    <p class="import-help-note">Only import text you have the right to use. Imported files stay on this device and are never uploaded.</p>
  </div>`;
}
async function importBibleJson(file) {
  if (!file) return;
  let raw;
  try { raw = JSON.parse(await file.text()); }
  catch { toast("That file isn't valid JSON. Check it in a text editor, or see the (i) button for the expected shape.", { error: true }); return; }

  let parsed;
  try { parsed = parseBibleFile(raw, file.name.replace(/\.json$/i, "")); }
  catch (err) { toast(err.message, { error: true }); return; }

  const { name, chapters, skipped } = parsed;
  if (!chapters.length) {
    toast(`No chapters could be read from that file. References must look like “Genesis 1” and each verse needs its text — see the (i) button.`, { error: true });
    return;
  }

  try {
    for (const { ref, chapter } of chapters) await dbSet(`${name}:${ref}`, chapter);
  } catch (err) {
    toast(`Saved ${name} only partly — this browser refused to store it: ${err.message}`, { error: true });
    return;
  }

  state.importedNames = [...new Set([...(state.importedNames || []), name])];
  state.translation = name;
  const note = skipped ? ` ${skipped} entr${skipped === 1 ? "y was" : "ies were"} skipped.` : "";
  const count = `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`;
  saveState();
  toast(`Imported ${count} as ${name}.${note} Files stayed in this browser.`);
}

function refreshVoices() { voices = speechSynthesis?.getVoices?.() || []; }
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = () => { refreshVoices(); renderVoiceSelectOnly(); };
}
// Voice and speed live in state, not in the DOM. render() rewrites all of #app, so
// anything read back off a control is lost the next time any button is pressed.
// Match on the language prefix: a looser /us/ test also matched es-US (Spanish).
const isEnglish = v => /^en([-_]|$)/i.test(v.lang || "");
// Apple ships joke voices (Bubbles, Cellos…) and robotic 1980s MacInTalk voices
// tagged en-US alongside the real ones, plus the robotic Eloquence voices listed as
// "Eddy (English (United States))". Matched by name, since their voiceURIs differ
// between macOS and iOS. A voice someone already chose is never hidden.
const NOVELTY_VOICES = new Set(["Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos",
  "Deranged", "Fred", "Good News", "Hysterical", "Jester", "Junior", "Kathy", "Organ", "Pipe Organ",
  "Princess", "Ralph", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox",
  "Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley"]);
const isNovelty = v => NOVELTY_VOICES.has(v.name.replace(/ \(.*\)$/, ""));
// iOS lists a downloaded voice twice under one name (compact and enhanced Samantha).
// Safari's voiceURI is Apple's identifier, e.g. com.apple.voice.enhanced.en-US.Samantha,
// which is the only non-audible way to tell them apart. Chrome reports just the name.
const TIERS = ["", "Compact", "Enhanced", "Premium"];
const voiceTier = v => {
  const m = /\.(compact|enhanced|premium)\./i.exec(v.voiceURI || "");
  return m ? TIERS.findIndex(t => t.toLowerCase() === m[1].toLowerCase()) : 0;
};
// One entry per name+language, keeping the best tier; the picker stores only the
// name, so that is also the copy speech uses.
function usableVoices(list, savedName) {
  const best = new Map();
  for (const v of list) {
    if (v.name !== savedName && isNovelty(v)) continue;
    const key = `${v.name}|${v.lang}`;
    if (!best.has(key) || voiceTier(v) > voiceTier(best.get(key))) best.set(key, v);
  }
  // Best tier first; sort is stable, so the device's own order holds within a tier.
  return [...best.values()].sort((a, b) => voiceTier(b) - voiceTier(a));
}
// iOS Safari hides Enhanced and Premium voices from getVoices() (an iPhone with
// Samantha Enhanced and Ava Premium installed listed only compact Samantha). An
// utterance with no voice set uses the device's default English voice instead, which
// may be one of those, so "Device default" leaves the voice unset.
const DEVICE_VOICE = "__device__";
function pickVoice(list, savedName) {
  if (savedName === DEVICE_VOICE) return null;
  const usable = usableVoices(list, savedName);
  return usable.find(v => v.name === savedName) || usable.find(isEnglish) || list[0];
}
// The readings are English, so offer English voices plus the device's own language
// (for someone reading an imported Bible in it). Apple ships 100+ voices otherwise.
const deviceLanguages = () => typeof navigator !== "undefined" ? [...(navigator.languages || [navigator.language])] : [];
const langPrefix = lang => String(lang || "").toLowerCase().split(/[-_]/)[0];
function selectedVoice() { return pickVoice(voices, state?.voice); }
function clampRate(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1.5, Math.max(0.75, n)) : 1;
}
function rate() { return clampRate(state?.rate); }
const rateLabel = v => `${Number(v).toFixed(2).replace(/0$/, "")}×`;
function setVoice(name) {
  const wasRecording = useRecording();
  if (name === ESV_VOICE) state.esvAudio = true;
  else {
    state.voice = name;
    if (isEsvTranslation(state.translation)) state.esvAudio = false;
  }
  if (wasRecording !== useRecording()) clearAudio();
  persistState();
  refreshListenUi();
}
function setRate(v) {
  state.rate = clampRate(v);
  if (rec.el) { rec.el.defaultPlaybackRate = rate(); rec.el.playbackRate = rate(); }
  persistState();
}
function setKeepPlaying(on) { state.keepPlaying = !!on; persistState(); }
// A queue built for one translation or driver mustn't linger in the dock for another.
function clearAudio() {
  stopAudio(false);
  audio.items = [];
  audio.title = "Ready";
  renderAudioPlayer();
}
function setTranslation(name) {
  clearAudio();
  state.translation = name;
  saveState();
}
function setTextLayout(layout) { if (TEXT_LAYOUTS.includes(layout)) { state.textLayout = layout; saveState(); } }
function setVerseNumbers(on) { state.verseNumbers = !!on; saveState(); }
function buildChapterItems(chapter, label, { announce = false, chapterIndex = 0 } = {}) {
  const items = [];
  if (announce) {
    items.push({ kind: "chapter", label, text: `${label}.`, ref: label, chapterIndex });
  }
  for (const v of chapter.verses) {
    items.push({ kind: "verse", v: v.v, label: `${label}:${v.v}`, text: v.t, ref: label, chapterIndex });
  }
  return items;
}
// iOS Safari only honours speechSynthesis.speak() when it is called synchronously
// inside the tap handler. Both entry points below await chapter loads before they
// reach speakCurrent(), and after that await WebKit silently drops the utterance --
// no error, no events, just silence. Speaking one near-silent utterance during the
// gesture unlocks synthesis for the rest of the page session.
let speechPrimed = false;
function primeSpeech() {
  if (speechPrimed || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
    speechPrimed = true;
  } catch {
    /* older engines may reject an empty utterance; the real speak() still follows */
  }
}
async function speakChapter(i) {
  if (useRecording()) return state.keepPlaying ? listenFrom(i) : listenToOne(i);
  if (state.keepPlaying) return speakAll(i);
  primeSpeech();
  const r = currentReadings()[i];
  const ch = await getChapter(r.current);
  const label = refText(r.current);
  setAudioQueue(buildChapterItems(ch, label, { announce: false, chapterIndex: 0 }), label, r.list.name, "chapter");
}
async function speakAll(start = null) {
  if (useRecording()) return start === null ? listenToday() : listenFrom(start);
  primeSpeech();
  // Skip chapters already marked done; once everything is done, Listen replays the day.
  const all = currentReadings();
  const queued = listenQueue(state, start ?? 0);
  const readings = queued.length ? queued.map(i => all[i]) : all;
  const chapters = await Promise.all(readings.map(r => getChapter(r.current)));
  const items = chapters.flatMap((ch, i) =>
    buildChapterItems(ch, refText(readings[i].current), { announce: true, chapterIndex: i })
  );
  const what = readings.length === all.length ? "all ten chapters" : `${readings.length} chapter${readings.length === 1 ? "" : "s"} left`;
  setAudioQueue(items, `Day ${state.day}: ${what}`, `${items.length} passage segments`, "all");
}
function setAudioQueue(items, title, subtitle, mode) {
  stopAudio(false);
  audio = { ...audio, items, index: 0, playing: true, paused: false, open: true, title, subtitle, mode };
  speakCurrent();
  renderAudioPlayer();
}
let currentUtterance = null;
function cancelSpeech() {
  audio.gen += 1;
  // Only cancel when an utterance of ours is actually in flight. Cancelling when
  // nothing of ours is queued kills the priming utterance mid-flight, which wedges
  // the engine: speechSynthesis.speaking stays true and the next speak() never runs.
  if (!currentUtterance) return;
  currentUtterance.onend = null;
  currentUtterance.onerror = null;
  currentUtterance = null;
  speechSynthesis?.cancel?.();
}
function speakCurrent() {
  if (!audio.playing || !audio.items.length || audio.index >= audio.items.length) {
    audio.playing = false;
    audio.paused = false;
    cancelSpeech();
    renderAudioPlayer();
    return;
  }
  if (!("speechSynthesis" in window)) {
    toast("Read-aloud isn't available in this browser.", { error: true });
    audio.playing = false;
    renderAudioPlayer();
    return;
  }
  cancelSpeech();
  const myGen = audio.gen;
  const item = audio.items[audio.index];
  const u = new SpeechSynthesisUtterance(item.text);
  const v = selectedVoice();
  if (v) u.voice = v;
  else u.lang = deviceLanguages().find(l => /^en([-_]|$)/i.test(l)) || "en-US";
  u.rate = rate();
  u.onend = () => {
    if (myGen !== audio.gen) return;
    if (!audio.playing || audio.paused) return;
    audio.index += 1;
    speakCurrent();
  };
  u.onerror = () => {
    if (myGen !== audio.gen) return;
    if (!audio.playing) return;
    audio.index += 1;
    speakCurrent();
  };
  currentUtterance = u;
  speechSynthesis.speak(u);
  renderAudioPlayer();
}
function audioProgress(index = audio.index) {
  if (audio.items.length < 2) return 0;
  return Math.min(100, Math.round((index / (audio.items.length - 1)) * 100));
}
function clampIndex(value) {
  return Math.max(0, Math.min(Number(value) || 0, audio.items.length - 1));
}

// Dragging the scrubber used to seek on every oninput, and seeking re-rendered the
// dock -- replacing the very input the finger was on, which aborts the drag. Now the
// drag only paints a preview, and the seek is committed once on release.
let scrubbing = false;
function beginScrub() { scrubbing = true; }
function previewSeek(value) {
  const i = clampIndex(value);
  const position = document.getElementById("audioPosition");
  if (position) position.textContent = `${i + 1} / ${audio.items.length}`;
  const label = document.getElementById("audioNowPlaying");
  if (label) label.textContent = audio.items[i]?.label || "";
  const bar = document.querySelector(".scrubber");
  if (bar) bar.style.setProperty("--played", `${audioProgress(i)}%`);
}
function commitSeek(value) {
  scrubbing = false;
  if (audio.driver === "file") return recSeekQueue(Number(value));
  seekAudio(value);
}
function cancelScrub() {
  scrubbing = false;
  renderAudioPlayer();
}
function seekAudio(index) {
  if (!audio.items.length) return;
  audio.index = clampIndex(index);
  audio.paused = false;
  audio.playing = true;
  speakCurrent();
}
function stepAudio(delta) {
  if (audio.driver === "file") return recStepChapter(delta);
  if (!audio.items.length) return;
  seekAudio(audio.index + delta);
}
function pauseAudio() {
  if (audio.driver === "file") return rec.el?.pause();
  if (!audio.items.length) return;
  audio.playing = true;
  audio.paused = true;
  cancelSpeech();
  renderAudioPlayer();
}
function resumeAudio() {
  if (audio.driver === "file") return recResume();
  if (!audio.items.length) return;
  audio.playing = true;
  audio.paused = false;
  speakCurrent();
}
function stopAudio(update = true) {
  recStop();
  audio.playing = false;
  audio.paused = false;
  audio.index = 0;
  cancelSpeech();
  if (update) renderAudioPlayer();
}
function toggleAudioOpen() {
  audio.open = !audio.open;
  renderAudioPlayer();
}
function renderVoiceSelectOnly() {
  const el = document.getElementById("voiceSelect");
  if (el) el.innerHTML = voiceOptions();
}
// For ESV readers the recording is offered first; `esv` is null when it isn't offered,
// otherwise whether it is the current choice.
const ESV_VOICE = "__esv__";
function voiceOptionsHtml(list, selectedName, langs = deviceLanguages(), { esv = null } = {}) {
  const recording = esv === null ? "" : `<option value="${ESV_VOICE}"${esv ? " selected" : ""}>ESV recording (Crossway)</option>`;
  if (esv) selectedName = null;
  if (!list.length) return recording || `<option value="">No voices found yet</option>`;
  const own = new Set(langs.map(langPrefix));
  const usable = usableVoices(list, selectedName);
  const others = usable.filter(v => !isEnglish(v) && (own.has(langPrefix(v.lang)) || v.name === selectedName));
  const filtered = [...usable.filter(isEnglish), ...others];
  const ordered = filtered.length ? filtered : usable;
  const device = `<option value="${DEVICE_VOICE}"${selectedName === DEVICE_VOICE ? " selected" : ""}>Device default (set in Settings)</option>`;
  return recording + device + ordered.map(v =>
    `<option value="${esc(v.name)}"${v.name === selectedName ? " selected" : ""}>${esc(v.name)} · ${esc(v.lang)}${voiceTier(v) ? ` · ${TIERS[voiceTier(v)]}` : ""}</option>`
  ).join("");
}
function voiceOptions() {
  const offered = isEsvTranslation(state?.translation);
  return voiceOptionsHtml(voices, state?.voice, deviceLanguages(), { esv: offered ? state.esvAudio : null });
}
function renderAudioPlayer() {
  // A verse ending mid-drag would otherwise replace the input under the finger.
  if (scrubbing) return;
  const el = document.getElementById("audioDock");
  if (el) el.outerHTML = audioPlayerHtml();
}
function refreshListenUi() {
  const hero = document.getElementById("heroListen");
  if (hero) hero.outerHTML = heroListenHtml();
  renderVoiceSelectOnly();
  renderAudioPlayer();
}
function primaryLabel() {
  if (audio.driver === "file") return rec.el && !rec.el.paused ? "Pause" : "Play";
  if (audio.playing && !audio.paused) return "Pause";
  if (audio.items.length) return "Play";
  return "Listen to all ten";
}
function primaryAction() {
  if (audio.driver === "file") return rec.el && !rec.el.paused ? pauseAudio() : resumeAudio();
  if (audio.playing && !audio.paused) return pauseAudio();
  if (audio.items.length) return resumeAudio();
  return speakAll();
}
function chapterMarkers() {
  const marks = [];
  let last = null;
  audio.items.forEach((item, i) => {
    if (item.chapterIndex !== last) {
      marks.push({ index: i, ref: item.ref });
      last = item.chapterIndex;
    }
  });
  return marks.length > 1 ? marks : [];
}
function markersHtml() {
  const max = Math.max(1, audio.items.length - 1);
  return chapterMarkers().map(m =>
    `<button class="audio-mark" style="left:${(m.index / max) * 100}%" title="${esc(m.ref)}" aria-label="Jump to ${esc(m.ref)}" onclick="seekAudio(${m.index})"></button>`
  ).join("");
}
function audioPlayerHtml() {
  if (audio.open && (audio.driver === "file" || (useRecording() && !audio.items.length))) return recDockHtml();
  if (!audio.open) {
    return `<section id="audioDock" class="audio-dock is-closed" aria-label="Audio player">
      <button class="audio-tab" onclick="toggleAudioOpen()">Audio Player</button>
    </section>`;
  }
  const current = audio.items[audio.index];
  const max = Math.max(0, audio.items.length - 1);
  return `<section id="audioDock" class="audio-dock" aria-label="Audio player">
    <button class="audio-tab" onclick="toggleAudioOpen()">Hide</button>
    <div class="audio-shell">
      <div class="audio-topline">
        <div><p class="eyebrow">Browser audio</p><h3>${esc(audio.title)}</h3><span id="audioNowPlaying">${esc(current?.label || audio.subtitle || "Ready")}</span></div>
      </div>
      <div class="audio-body">
        <div class="scrubber-wrap"><input class="scrubber" type="range" min="0" max="${max}" value="${audio.index}" ${audio.items.length ? "" : "disabled"} aria-label="Playback position" onpointerdown="beginScrub()" oninput="previewSeek(this.value)" onchange="commitSeek(this.value)" onpointercancel="cancelScrub()" style="--played:${audioProgress()}%"><div class="audio-marks">${markersHtml()}</div></div>
        <div class="audio-meta"><span id="audioPosition">${audio.items.length ? `${audio.index + 1} / ${audio.items.length}` : "No audio queued"}</span><span>${audio.paused ? "Paused" : audio.playing ? "Playing" : "Stopped"}</span></div>
        <div class="audio-controls"><button onclick="stepAudio(-10)">-10</button><button onclick="stepAudio(-1)">Back</button><button class="audio-primary" onclick="primaryAction()">${primaryLabel()}</button><button onclick="stepAudio(1)">Next</button><button onclick="stepAudio(10)">+10</button><button onclick="stopAudio()">Stop</button></div>
      </div>
    </div>
  </section>`;
}

// ---- ESV recorded audio ---------------------------------------------------------
// One <audio> element, created here and never placed in #app, because render()
// rewrites #app on every change. iOS keeps a single element playing through the lock
// screen and lets it start the next chapter by itself (tested on an iPhone,
// 2026-10-25); two alternating elements showed the wrong play/pause state there.
const LISTEN_KEY = "pghBiblePlan.listen";
const ESV_AUDIO_KEY = "pghBiblePlan.esvAudio";
const SKIP_SECONDS = 10; // iOS draws ±10 on the lock screen and pages can't change it
const RESUME_REWIND = 3;
// `heard` is the last position that actually played: a failed load can reset the
// element's clock to 0 before the error arrives.
const rec = { el: null, queue: [], pos: 0, single: false, pendingSeek: null, heard: 0, error: "", buffering: false, lastSave: 0, lastPaint: 0 };
function useRecording(st = state) { return !!st && isEsvTranslation(st.translation) && st.esvAudio !== false; }

// The resume place lives outside `state`: Undo compares JSON.stringify(state), and
// saving every few seconds would make every Undo look stale. Export skips it too.
function readResume() { try { return JSON.parse(localStorage.getItem(LISTEN_KEY)); } catch { return null; } }
function writeResume(place) { try { localStorage.setItem(LISTEN_KEY, JSON.stringify(place)); } catch { /* private tab */ } }
function savedPlace() { return validResume(state, readResume()); }

// Chapter ref -> { url, seconds }, fetched before any tap: iOS only starts audio
// synchronously inside the tap, so there is no time to ask the server then. These
// are addresses and lengths, not ESV text or audio, so keeping them is fine.
const esvAudioInfo = new Map(Object.entries((() => {
  try { return JSON.parse(localStorage.getItem(ESV_AUDIO_KEY)) || {}; } catch { return {}; }
})()));
const esvResolving = new Set();
function resolveEsvAudio(refs) {
  const missing = refs.filter(r => !esvAudioInfo.has(r) && !esvResolving.has(r));
  if (!missing.length) return;
  missing.forEach(r => esvResolving.add(r));
  Promise.all(missing.map(ref =>
    fetch(`/api/esv-audio?ref=${encodeURIComponent(ref)}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(info => { if (info?.url) esvAudioInfo.set(ref, { url: info.url, seconds: info.seconds || null }); })
      .catch(() => { /* offline or refused: the tap falls back to the redirect */ })
      .finally(() => esvResolving.delete(ref))
  )).then(() => {
    try { localStorage.setItem(ESV_AUDIO_KEY, JSON.stringify(Object.fromEntries(esvAudioInfo))); } catch { /* private tab */ }
    refreshListenUi();
  });
}
const refAt = i => refText(currentReadings()[i].current);
const recSrc = ref => esvAudioInfo.get(ref)?.url || `/api/esv-audio?ref=${encodeURIComponent(ref)}`;
const recLength = ref => esvAudioInfo.get(ref)?.seconds || null;

function recElement() {
  if (rec.el) return rec.el;
  const el = new Audio();
  el.preload = "auto";
  el.addEventListener("loadedmetadata", () => {
    if (rec.pendingSeek !== null) { el.currentTime = Math.min(rec.pendingSeek, el.duration || rec.pendingSeek); rec.pendingSeek = null; }
    const ref = refAt(rec.queue[rec.pos]);
    if (!recLength(ref) && Number.isFinite(el.duration)) esvAudioInfo.set(ref, { url: recSrc(ref), seconds: el.duration });
  });
  el.addEventListener("playing", () => { rec.error = ""; rec.buffering = false; recSessionState("playing"); refreshListenUi(); });
  el.addEventListener("pause", () => { recSave(true); recSessionState("paused"); refreshListenUi(); });
  el.addEventListener("waiting", () => { rec.buffering = true; recPaint(true); });
  el.addEventListener("timeupdate", () => {
    if (rec.pendingSeek === null && el.currentTime > 0) rec.heard = el.currentTime;
    recSave(false); recPaint(false); recPositionState();
  });
  el.addEventListener("ended", recChapterEnded);
  el.addEventListener("error", () => {
    if (!el.getAttribute("src")) return;
    // A cached address may have gone stale, so the next try goes through the server's
    // redirect instead. The length is still right.
    const ref = refAt(rec.queue[rec.pos]);
    const info = esvAudioInfo.get(ref);
    if (info) esvAudioInfo.set(ref, { ...info, url: null });
    recLost();
  });
  rec.el = el;
  return el;
}
function recLost() {
  rec.error = "lost";
  rec.buffering = false;
  rec.pendingSeek = Math.max(0, Math.max(rec.heard, recCurrentSeconds()) - RESUME_REWIND);
  if (rec.el && !rec.el.paused) rec.el.pause();
  recSave(true);
  recSessionState("paused");
  refreshListenUi();
}
function recCurrentSeconds() {
  if (rec.pendingSeek !== null) return rec.pendingSeek;
  return rec.el && Number.isFinite(rec.el.currentTime) ? rec.el.currentTime : 0;
}
function recLoad(pos, seconds = 0) {
  const el = recElement();
  rec.pos = pos;
  const ref = refAt(rec.queue[pos]);
  rec.pendingSeek = seconds > 0 ? seconds : null;
  rec.heard = seconds > 0 ? seconds : 0;
  el.src = recSrc(ref);
  el.defaultPlaybackRate = rate();
  el.playbackRate = rate();
  recMetadata(ref);
}
function recPlay() {
  const el = recElement();
  el.playbackRate = rate();
  // Runs inside the tap for the first chapter; iOS allows the later ones by itself.
  el.play().catch(err => { if (err.name !== "AbortError") recLost(); });
}
// Starts a listening session. `single` plays one chapter and leaves the saved place.
function recStart(queue, pos = 0, seconds = 0, { single = false } = {}) {
  if (!queue.length) { toast("All ten chapters are done for today."); return; }
  if (audio.items.length) { cancelSpeech(); audio.items = []; }
  audio.driver = "file";
  audio.open = true;
  audio.playing = true;
  audio.paused = false;
  rec.queue = queue;
  rec.single = single;
  rec.error = "";
  recLoad(pos, seconds);
  recPlay();
  recWireSession();
  refreshListenUi();
}
function listenToday() {
  const place = savedPlace();
  if (place) return listenResume(place);
  recStart(listenQueue(state, upToIndex(state) ?? 0));
}
// The dock's "Jump to" button: start listening from where the reader is up to.
function listenUpTo() {
  const target = upToIndex(state);
  if (target !== null) recStart(listenQueue(state, target));
}
function listenResume(place = savedPlace()) {
  if (!place) return listenToday();
  recStart(listenQueue(state, place.index), 0, Math.max(0, place.seconds - RESUME_REWIND));
}
function listenFrom(i) { recStart(listenQueue(state, i)); }
function listenToOne(i) { recStart([i], 0, 0, { single: true }); }
function recResume() {
  const el = recElement();
  if (!rec.queue.length) return listenToday();
  if (rec.error || !el.getAttribute("src")) {
    const seconds = rec.pendingSeek ?? recCurrentSeconds();
    rec.error = "";
    recLoad(rec.pos, seconds);
  }
  recPlay();
}
// "Start over" restarts this chapter, never the day: earlier chapters were marked
// Done as they finished, and undoing that would discard real progress.
function listenStartOver() {
  const before = readResume();
  const place = savedPlace();
  const index = rec.queue.length ? rec.queue[rec.pos] : place?.index;
  if (index === undefined) return listenToday();
  if (rec.queue.length && rec.el) { rec.pendingSeek = null; rec.el.currentTime = 0; recPlay(); }
  else recStart(listenQueue(state, index), 0, 0);
  toast(`Starting ${refAt(index)} over.`, { actionLabel: "Undo", ms: 8000, action: () => {
    if (!before) return;
    writeResume(before);
    const back = Math.max(0, before.seconds - RESUME_REWIND);
    if (rec.el && rec.queue.length && refAt(rec.queue[rec.pos]) === before.ref) rec.el.currentTime = back;
  } });
}
function recStop() {
  if (!rec.el) { if (audio.driver === "file") audio.driver = "speech"; return; }
  if (!rec.el.paused) rec.el.pause();
  recSave(true);
  rec.el.removeAttribute("src");
  rec.el.load();
  rec.queue = [];
  rec.error = "";
  audio.driver = "speech";
  recSessionState("none");
}
function recSave(force) {
  if (rec.single || !rec.queue.length || !rec.el) return;
  const now = Date.now();
  if (!force && now - rec.lastSave < 5000) return;
  rec.lastSave = now;
  writeResume({ day: state.day, translation: state.translation, ref: refAt(rec.queue[rec.pos]), seconds: Math.round(recCurrentSeconds() * 10) / 10 });
}
function recChapterEnded() {
  const finished = rec.queue[rec.pos];
  // A recording that plays to the end marks its chapter Done, like the Done button.
  state = withDone(state, finished, true);
  persistState();
  const next = nextUnfinishedPos(state, rec.queue, rec.pos);
  if (rec.single || next === -1) {
    recEndSession();
    render();
    toast(listenQueue(state).length ? `Finished ${refAt(finished)}.` : "That's all ten chapters for today.");
    return;
  }
  recLoad(next);
  recPlay();
  recSave(true);
  render();
}
function recEndSession() {
  rec.queue = [];
  rec.error = "";
  audio.driver = "speech";
  audio.playing = false;
  try { localStorage.removeItem(LISTEN_KEY); } catch { /* ignore */ }
  recSessionState("none");
}
// A paused chapter that gets marked Done by reading it moves the player on, so
// Play picks up at the next unfinished chapter instead of one already read. While
// playing, the chapter carries on and the finished ones are skipped when it ends.
function recFollowDone() {
  if (!rec.queue.length || !rec.el || !rec.el.paused || !isDone(state, rec.queue[rec.pos])) return;
  const next = nextUnfinishedPos(state, rec.queue, rec.pos);
  if (rec.single || next === -1) {
    rec.el.removeAttribute("src");
    rec.el.load();
    return recEndSession();
  }
  rec.error = "";
  recLoad(next);
  recSave(true);
}
// Back from the first chapter restarts it; forward from the last does nothing.
function recStepChapter(delta) {
  const pos = Math.max(0, Math.min(rec.queue.length - 1, rec.pos + delta));
  if (pos === rec.pos && delta > 0) return;
  recLoad(pos);
  recPlay();
}
function recSkip(seconds) {
  const el = recElement();
  if (!rec.queue.length) return;
  const to = recCurrentSeconds() + seconds;
  el.currentTime = Math.max(0, Math.min(Number.isFinite(el.duration) ? el.duration - 0.5 : to, to));
  recPaint(true);
}
function recQueueLengths() { return rec.queue.map(i => recLength(refAt(i))); }
function recSeekQueue(value) {
  const line = queueTimeline(recQueueLengths());
  if (!line.complete) { recElement().currentTime = value; return; }
  let pos = line.starts.findLastIndex(start => value >= start);
  pos = Math.max(0, pos);
  const into = value - line.starts[pos];
  if (pos === rec.pos) recElement().currentTime = into;
  else { recLoad(pos, into); recPlay(); }
}

// Lock screen and AirPods. No previous/next track, so iOS shows the ±10 buttons.
function recWireSession() {
  const ms = typeof navigator !== "undefined" && navigator.mediaSession;
  if (!ms || rec.wired) return;
  rec.wired = true;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported */ } };
  set("play", () => recResume());
  set("pause", () => rec.el?.pause());
  set("seekbackward", d => recSkip(-(d?.seekOffset || SKIP_SECONDS)));
  set("seekforward", d => recSkip(d?.seekOffset || SKIP_SECONDS));
  set("seekto", d => { if (rec.el && Number.isFinite(d?.seekTime)) rec.el.currentTime = d.seekTime; });
  set("previoustrack", null);
  set("nexttrack", null);
}
function recMetadata(ref) {
  if (typeof MediaMetadata === "undefined" || !navigator.mediaSession) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ref, artist: `ESV · Day ${state.day}`, album: "Grant Horner reading plan",
    artwork: [{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  });
}
function recSessionState(value) { try { navigator.mediaSession.playbackState = value; } catch { /* unsupported */ } }
function recPositionState() {
  const el = rec.el;
  if (!el || !Number.isFinite(el.duration) || !navigator.mediaSession?.setPositionState) return;
  try { navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: el.playbackRate }); }
  catch { /* ignore */ }
}

// What the dock and the hero show, whether or not anything is playing yet.
function recView() {
  const active = rec.queue.length > 0;
  const place = active ? null : savedPlace();
  const queue = active ? rec.queue : listenQueue(state, place?.index ?? upToIndex(state) ?? 0);
  if (!queue.length) return null;
  const pos = active ? rec.pos : 0;
  const index = queue[pos];
  const ref = refAt(index);
  const into = active ? recCurrentSeconds() : Math.max(0, (place?.seconds || 0) - RESUME_REWIND);
  const lengths = queue.map(i => recLength(refAt(i)));
  const line = queueTimeline(lengths);
  const length = (active && Number.isFinite(rec.el?.duration) ? rec.el.duration : null) || lengths[pos];
  const doneCount = PLAN.filter((_, i) => isDone(state, i)).length;
  return {
    active, place, queue, pos, index, ref, into, line, length, upTo: upToIndex(state),
    playing: active && rec.el && !rec.el.paused && !rec.error,
    reading: doneCount + 1,
    elapsed: line.complete ? line.starts[pos] + into : into,
    total: line.complete ? line.total : length,
    leftToday: line.complete ? line.total - (line.starts[pos] + into) : null
  };
}
function heroListenHtml() {
  const v = useRecording() ? recView() : null;
  if (!v || (!v.active && !v.place)) return `<button id="heroListen" class="hero-btn listen" onclick="speakAll()">Listen</button>`;
  const filled = v.total ? Math.min(100, (v.elapsed / v.total) * 100) : 0;
  const sub = `${esc(v.ref)}${v.leftToday !== null ? `<span class="hero-left"> · ${Math.ceil(v.leftToday / 60)} min left</span>` : ""}`;
  const label = v.playing ? "Playing" : "Resume";
  const action = v.playing ? "openAudioDock()" : "listenResumeOrContinue()";
  return `<button id="heroListen" class="hero-btn listen has-sub" onclick="${action}">${label}<small>${sub}</small><span class="hero-bar"><i style="width:${filled.toFixed(1)}%"></i></span></button>`;
}
function openAudioDock() { audio.open = true; renderAudioPlayer(); }
function listenResumeOrContinue() { return rec.queue.length ? recResume() : listenResume(); }
function recDockHtml() {
  const v = recView();
  const credit = `<p class="audio-credit">ESV® audio © Crossway · <a href="https://www.esv.org" target="_blank" rel="noopener">esv.org</a></p>`;
  const head = (title, line) => `<button class="audio-tab" onclick="toggleAudioOpen()">Hide</button><div class="audio-shell"><div class="audio-topline"><div><p class="eyebrow">ESV recording${v?.playing ? "" : v?.active || v?.place ? " · paused" : ""}</p><h3>${esc(title)}</h3><span id="audioNowPlaying">${line}</span></div></div>`;
  if (!v) return `<section id="audioDock" class="audio-dock" aria-label="Audio player">${head("All done", "Every chapter for today is marked done.")}<div class="audio-body">${credit}</div></div></section>`;
  const chapterLeft = v.length ? `${timeLeftPhrase(v.length - v.into)} left in this chapter` : "Loading length…";
  const notice = rec.error === "lost"
    ? `<p class="audio-notice" role="alert">Lost the connection. Your place is saved. Press Play when you have signal.</p>`
    : rec.buffering && v.playing ? `<p class="audio-notice is-soft">Buffering…</p>` : "";
  const max = Math.max(1, Math.floor(v.total || 0));
  const marks = v.line.complete && v.queue.length > 1
    ? v.line.starts.map((start, p) => `<button class="audio-mark" style="left:${(start / max) * 100}%" title="${esc(refAt(v.queue[p]))}" aria-label="Jump to ${esc(refAt(v.queue[p]))}" onclick="recJumpTo(${p})"></button>`).join("")
    : "";
  const scrubber = `<div class="scrubber-wrap"><input class="scrubber" id="recScrubber" type="range" min="0" max="${max}" step="1" value="${Math.floor(v.elapsed)}" ${v.active && v.total ? "" : "disabled"} aria-label="Playback position" onpointerdown="beginScrub()" oninput="previewRecSeek(this.value)" onchange="commitSeek(this.value)" onpointercancel="cancelScrub()" style="--played:${v.total ? ((v.elapsed / v.total) * 100).toFixed(2) : 0}%"><div class="audio-marks">${marks}</div></div>`;
  const meta = `<div class="audio-meta"><span id="recElapsed">${formatClock(v.elapsed)}${v.total ? ` of ${formatClock(v.total)}` : ""}</span><span id="recLeft">${v.leftToday !== null ? `${Math.ceil(v.leftToday / 60)} min left today` : ""}</span></div>`;
  const controls = v.playing
    ? `<div class="audio-controls"><button onclick="recSkip(-${SKIP_SECONDS})" aria-label="Back ${SKIP_SECONDS} seconds">−${SKIP_SECONDS}s</button><button onclick="stepAudio(-1)" aria-label="Previous chapter">◀ Chapter</button><button class="audio-primary" onclick="pauseAudio()">Pause</button><button onclick="stepAudio(1)" aria-label="Next chapter">Chapter ▶</button><button onclick="recSkip(${SKIP_SECONDS})" aria-label="Forward ${SKIP_SECONDS} seconds">+${SKIP_SECONDS}s</button></div>`
    : v.active || v.place
      ? `<div class="audio-controls"><button class="audio-ghost" onclick="listenStartOver()">Start ${esc(v.ref)} over</button><button class="audio-primary" onclick="listenResumeOrContinue()">Resume from ${formatClock(v.into)}</button></div>`
      : `<div class="audio-controls"><button class="audio-primary" onclick="listenToday()">${v.queue.length === PLAN.length ? "Listen to all ten" : `Listen to the ${v.queue.length} left`}</button></div>`;
  const jump = v.upTo !== null && v.upTo !== v.index
    ? `<div class="audio-controls audio-jump"><button class="audio-ghost" onclick="listenUpTo()" title="The next chapter after the last one you finished">Jump to ${esc(refAt(v.upTo))} →</button></div>`
    : "";
  return `<section id="audioDock" class="audio-dock" aria-label="Audio player">${head(v.ref, `Reading ${v.reading} of ${PLAN.length} · <span id="recChapterLeft">${chapterLeft}</span>`)}<div class="audio-body">${notice}${scrubber}${meta}${controls}${jump}${credit}</div></div></section>`;
}
function recJumpTo(pos) { if (pos === rec.pos) { rec.el.currentTime = 0; return; } recLoad(pos); recPlay(); }
function previewRecSeek(value) {
  const v = recView();
  if (!v?.total) return;
  const bar = document.getElementById("recScrubber");
  if (bar) bar.style.setProperty("--played", `${((value / v.total) * 100).toFixed(2)}%`);
  const elapsed = document.getElementById("recElapsed");
  if (elapsed) elapsed.textContent = `${formatClock(value)} of ${formatClock(v.total)}`;
}
// Progress is painted in place, at most once a second; rebuilding the dock that
// often would fight a finger on the scrubber.
function recPaint(force) {
  const now = Date.now();
  if (!force && now - rec.lastPaint < 1000) return;
  rec.lastPaint = now;
  if (scrubbing) return;
  const v = recView();
  if (!v || !document.getElementById("recScrubber")) return renderAudioPlayer();
  const bar = document.getElementById("recScrubber");
  bar.value = Math.floor(v.elapsed);
  bar.style.setProperty("--played", `${v.total ? ((v.elapsed / v.total) * 100).toFixed(2) : 0}%`);
  const elapsed = document.getElementById("recElapsed");
  if (elapsed) elapsed.textContent = `${formatClock(v.elapsed)}${v.total ? ` of ${formatClock(v.total)}` : ""}`;
  const left = document.getElementById("recLeft");
  if (left) left.textContent = v.leftToday !== null ? `${Math.ceil(v.leftToday / 60)} min left today` : "";
  const chapterLeft = document.getElementById("recChapterLeft");
  if (chapterLeft && v.length) chapterLeft.textContent = `${timeLeftPhrase(v.length - v.into)} left in this chapter`;
}
if (typeof window !== "undefined") {
  addEventListener("pagehide", () => recSave(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") recSave(true); });
}

function render() {
  currentTranslation = state.translation || "KJV";
  const readings = currentReadings();
  const open = readings.filter(r => !isDone(state, r.index));
  const done = readings.filter(r => isDone(state, r.index));
  const imported = state.importedNames || [];
  $("#app").innerHTML = `
    <section class="hero"><div class="seal">PGH</div><div><p class="eyebrow">Unofficial reading-plan tool</p><h1>Professor Grant Horner Bible Reading Plan</h1><p class="sub">Ten rotating chapter lists, local progress, KJV text, optional bring-your-own Bible import, and browser read-aloud.</p></div><div class="hero-side"><button class="dayplate" onclick="setDay()" aria-label="Current day ${state.day}. Change day"><span>Current day</span><strong>${state.day}</strong><em>tap to edit</em></button><div class="hero-buttons"><button class="hero-btn read" onclick="scrollToReader()">Read</button>${heroListenHtml()}</div></div></section>
    <section class="notice"><strong>Unofficial.</strong> Not affiliated with or endorsed by Professor Grant Horner, The Lockman Foundation, or any Bible publisher. Included text is KJV; imported Bible files stay in your browser.</section>
    <section class="actions"><button class="primary" onclick="completeDay()">Complete Day ${state.day}</button><button onclick="copyReadings()">Copy readings</button><button onclick="exportData()">Export</button><label class="button">Import progress <input type="file" accept="application/json" onchange="importData(this.files[0])"></label><button onclick="resetPlan()">Reset</button>${themeButtonHtml()}</section>
    <section class="settings"><div><label>Translation <select onchange="setTranslation(this.value)"><option ${currentTranslation === "KJV" ? "selected" : ""}>KJV</option>${imported.map(n => `<option ${n === currentTranslation ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label><label class="button">Bring your own Bible JSON <input type="file" accept="application/json" onchange="importBibleJson(this.files[0])"></label><button class="info-btn" onclick="toggleImportHelp()" aria-expanded="${importHelpOpen}" aria-controls="importHelp" aria-label="Bible JSON format help" title="Bible JSON format help">i</button></div>${importHelpHtml()}<div><label>Text <select onchange="setTextLayout(this.value)"><option value="verses" ${state.textLayout === "flow" ? "" : "selected"}>Verse by verse</option><option value="flow" ${state.textLayout === "flow" ? "selected" : ""}>Flowing</option></select></label><label class="check"><input type="checkbox" ${state.verseNumbers ? "checked" : ""} onchange="setVerseNumbers(this.checked)"> Verse numbers</label></div><div><label>Voice <select id="voiceSelect" onchange="setVoice(this.value)">${voiceOptions()}</select></label><label>Speed <input id="rateRange" type="range" min="0.75" max="1.5" step="0.05" value="${rate()}" oninput="this.nextElementSibling.textContent=rateLabel(this.value)" onchange="setRate(this.value)"><output class="rate-value">${rateLabel(rate())}</output></label><label class="check"><input type="checkbox" ${state.keepPlaying ? "checked" : ""} onchange="setKeepPlaying(this.checked)"> Keep playing into the next chapter</label></div></section>
    ${doneStripHtml(done)}
    <section class="grid${firstRender ? " intro" : ""}">${open.map(r => card(r.list, r.index)).join("")}</section>
    <section class="reader" id="reader"><div class="reader-head"><p class="eyebrow">${esc(currentTranslation)} chapter text</p><h2>${open.length === readings.length ? "Today’s ten chapters" : `${open.length} of ten left`}</h2></div>${open.length ? open.map(chapterPanel).join("") : `<div class="all-done"><p>All ten chapters read.</p><button class="primary" onclick="completeDay()">Complete Day ${state.day}</button></div>`}</section>
    <section class="history"><h2>Recent completed days</h2>${state.history.length ? state.history.slice(0, 12).map(h => `<details><summary>Day ${h.day} · ${new Date(h.date).toLocaleDateString()}</summary><ol>${h.readings.map(r => `<li>${esc(r.ref)}</li>`).join("")}</ol></details>`).join("") : `<p>No completed days logged yet.</p>`}</section>
    ${audioPlayerHtml()}`;
  firstRender = false;
  chaptersReady = loadChapters(open);
  if (useRecording()) resolveEsvAudio(readings.map(r => refText(r.current)));
}
function doneStripHtml(done) {
  if (!done.length) return "";
  return `<section class="done-strip"><span>Done today</span>${done.map(r => `<button onclick="setDone(${r.index}, false)" title="Show ${esc(refText(r.current))} again" aria-label="Undo done: ${esc(refText(r.current))}"><s>${esc(refText(r.current))}</s> <i>↺</i></button>`).join("")}</section>`;
}
function card(list, i) {
  const current = list.chapters[state.positions[i]];
  const next = list.chapters[(state.positions[i] + 1) % list.chapters.length];
  const books = [...new Set(list.chapters.map(ch => ch.book))];
  return `<article class="card" style="--delay:${i * 45}ms"><div class="num">List ${list.id}</div><div class="meter" style="--p:${pct(state.positions[i], list.chapters.length)}"><span>${pct(state.positions[i], list.chapters.length)}%</span></div><h2>${esc(refText(current))}</h2><p>${esc(list.name)} · ${list.chapters.length} days · next: ${esc(refText(next))}</p><div class="tools"><button onclick="scrollToChapter(${i})">Read</button><button onclick="speakChapter(${i})">Audio</button><button class="done-btn" onclick="setDone(${i}, true)">✓ Done</button></div><details><summary>Adjust</summary><div class="tools nudge"><button onclick="move(${i},-1)">← Previous</button><button onclick="move(${i},1)">Next →</button></div><div class="editrow"><select onchange="this.nextElementSibling.max=BOOKS[this.value]">${books.map(b => `<option ${b === current.book ? "selected" : ""}>${esc(b)}</option>`).join("")}</select><input type="number" min="1" max="${BOOKS[current.book]}" value="${current.chapter}"><button onclick="setReference(${i}, this.parentElement.children[0].value, this.parentElement.children[1].value)">Set</button></div></details></article>`;
}
function chapterPanel(r) {
  return `<article class="chapter-panel" id="chapter-panel-${r.index}"><header><span>List ${r.list.id}</span><h3>${esc(refText(r.current))}</h3><em>${esc(r.list.name)}</em><button onclick="speakChapter(${r.index})">Play chapter</button></header><div class="chapter-main"><div class="chapter-body" id="chapter-body-${r.index}"><p class="loading">Loading ${esc(refText(r.current))}…</p></div><footer class="chapter-end"><button class="done-btn" onclick="finishChapter(${r.index})">✓ Done with ${esc(refText(r.current))}</button></footer></div></article>`;
}

// Loaded two ways: as a browser <script>, where it renders on load, and as a
// CommonJS module under `node --test`, which only pulls out the pure helpers.
if (typeof document !== "undefined") {
  state = loadState();
  applyTheme();
  render();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (themeOverride) return;
    applyTheme();
    render();
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then(prefetchUpcoming, () => { /* unsupported here */ });
  }
  addEventListener("offline", () => toast("You're offline. Chapters you've opened, plus the next week's, are still here."));
  addEventListener("online", () => toast("Back online."));
}
if (typeof module !== "undefined") {
  module.exports = {
    BOOKS, PLAN, START, positionsForDay, indexOfRef, parseRef,
    initialState, loadState, persistState, isDone, withDone, advanceDay,
    nextThemeOverride, upcomingSlugs,
    voiceOptionsHtml, clampRate, pickVoice,
    normalizeImportedChapter, normalizeVerses, withoutBlankVerses, verseHtml, parseProgressFile, parseBibleFile,
    isEsvTranslation, listenQueue, upToIndex, nextUnfinishedPos, validResume, queueTimeline, formatClock, timeLeftPhrase, ESV_VOICE,
    loadKjvChapter
  };
}
