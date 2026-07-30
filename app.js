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

let state = loadState();
let currentTranslation = "KJV";
let renderToken = 0;
let voices = [];
let audio = {
  items: [],
  index: 0,
  gen: 0,
  playing: false,
  paused: false,
  open: false,
  title: "Ready",
  subtitle: "Choose Play all 10 or a chapter.",
  mode: "idle"
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
  return { day: 1, positions: positionsForDay(1), translation: "KJV", history: [], importedNames: [] };
}
function loadState() {
  try { return { ...initialState(), ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return initialState(); }
}
function persistState() { localStorage.setItem(KEY, JSON.stringify(state)); }
function saveState() { persistState(); render(); }
function currentReadings() {
  return PLAN.map((list, i) => ({ list, index: i, current: list.chapters[state.positions[i]], next: list.chapters[(state.positions[i] + 1) % list.chapters.length] }));
}

function move(i, delta) {
  const total = PLAN[i].chapters.length;
  state.positions[i] = (state.positions[i] + delta + total) % total;
  stopAudio();
  saveState();
}
function completeDay() {
  const readings = currentReadings().map(r => ({ list: r.list.id, name: r.list.name, ref: refText(r.current) }));
  state.history.unshift({ day: state.day, date: new Date().toISOString(), readings });
  state.history = state.history.slice(0, 90);
  state.positions = state.positions.map((p, i) => (p + 1) % PLAN[i].chapters.length);
  state.day += 1;
  stopAudio();
  saveState();
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
  state = { ...initialState(), importedNames: state.importedNames || [], translation: state.translation || "KJV" };
  stopAudio();
  saveState();
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pgh-bible-plan-progress.json";
  a.click();
}
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state = { ...initialState(), ...JSON.parse(reader.result) };
    persistState();
    stopAudio();
    render();
  };
  reader.readAsText(file);
}
function copyReadings() {
  const text = [`PGH Bible Plan — Day ${state.day}`, ...currentReadings().map(r => `${r.list.id}. ${refText(r.current)}`)].join("\n");
  navigator.clipboard?.writeText(text).then(() => alert("Copied today’s readings."), () => prompt("Copy today’s readings", text));
}
function scrollToChapter(i) {
  document.getElementById(`chapter-panel-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("chapters")) d.createObjectStore("chapters");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

async function getChapter(ch) {
  if (state.translation && state.translation !== "KJV") {
    const imported = await dbGet(`${state.translation}:${refText(ch)}`);
    if (imported) return imported;
  }
  const r = await fetch(`data/kjv/${slug(ch)}.json`);
  return await r.json();
}
function verseHtml(chapter) {
  return chapter.verses.map(v => `<p class="verse"><sup>${v.v}</sup><span>${esc(v.t)}</span></p>`).join("");
}
async function loadChapters(readings) {
  const token = ++renderToken;
  await Promise.all(readings.map(async r => {
    const el = document.getElementById(`chapter-body-${r.index}`);
    if (!el) return;
    try {
      const chapter = await getChapter(r.current);
      if (token === renderToken) el.innerHTML = verseHtml(chapter);
    } catch {
      if (token === renderToken) el.innerHTML = `<p class="missing">No text loaded for ${esc(refText(r.current))}. Use KJV or import a local Bible file.</p>`;
    }
  }));
}

function normalizeImportedChapter(raw) {
  if (raw.ref && raw.verses) return raw;
  if (raw.book && raw.chapter && raw.verses) return { ...raw, ref: `${raw.book} ${raw.chapter}` };
  return null;
}
async function importBibleJson(file) {
  if (!file) return;
  const raw = JSON.parse(await file.text());
  const name = raw.translation || raw.name || file.name.replace(/\.json$/i, "") || "Imported";
  const chapters = raw.chapters || raw;
  let count = 0;
  if (Array.isArray(chapters)) {
    for (const item of chapters) {
      const ch = normalizeImportedChapter(item);
      if (ch?.ref && ch?.verses) {
        await dbSet(`${name}:${ch.ref}`, { ...ch, translation: name });
        count++;
      }
    }
  } else {
    for (const [ref, val] of Object.entries(chapters)) {
      const parsed = parseRef(ref);
      const verses = Array.isArray(val) ? val.map((x, i) => typeof x === "string" ? { v: i + 1, t: x } : x) : val.verses;
      if (verses) {
        await dbSet(`${name}:${ref}`, { translation: name, ref, book: parsed.book, chapter: parsed.chapter, verses });
        count++;
      }
    }
  }
  state.importedNames = [...new Set([...(state.importedNames || []), name])];
  state.translation = name;
  alert(`Imported ${count} chapters as ${name}. Files stayed in this browser.`);
  saveState();
}

function refreshVoices() { voices = speechSynthesis?.getVoices?.() || []; }
if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = () => { refreshVoices(); renderVoiceSelectOnly(); };
}
function selectedVoice() {
  const name = document.getElementById("voiceSelect")?.value;
  return voices.find(v => v.name === name) || voices.find(v => /english|us|uk/i.test(v.lang)) || voices[0];
}
function rate() { return Number(document.getElementById("rateRange")?.value || 1); }
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
async function speakChapter(i) {
  const r = currentReadings()[i];
  const ch = await getChapter(r.current);
  const label = refText(r.current);
  setAudioQueue(buildChapterItems(ch, label, { announce: false, chapterIndex: 0 }), label, r.list.name, "chapter");
}
async function speakAll() {
  const items = [];
  const readings = currentReadings();
  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const ch = await getChapter(r.current);
    items.push(...buildChapterItems(ch, refText(r.current), { announce: true, chapterIndex: i }));
  }
  setAudioQueue(items, `Day ${state.day}: all ten chapters`, `${items.length} passage segments`, "all");
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
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }
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
    alert("Browser speech is not available here.");
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
function audioProgress() {
  if (audio.items.length < 2) return 0;
  return Math.min(100, Math.round((audio.index / (audio.items.length - 1)) * 100));
}
function seekAudio(index) {
  if (!audio.items.length) return;
  audio.index = Math.max(0, Math.min(Number(index), audio.items.length - 1));
  audio.paused = false;
  audio.playing = true;
  speakCurrent();
}
function stepAudio(delta) {
  if (!audio.items.length) return;
  seekAudio(audio.index + delta);
}
function pauseAudio() {
  if (!("speechSynthesis" in window)) return;
  audio.paused = true;
  speechSynthesis.pause();
  renderAudioPlayer();
}
function resumeAudio() {
  if (!("speechSynthesis" in window)) return;
  if (!audio.items.length) return;
  audio.playing = true;
  audio.paused = false;
  speechSynthesis.resume();
  renderAudioPlayer();
}
function stopAudio(update = true) {
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
function voiceOptions() {
  return voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} · ${esc(v.lang)}</option>`).join("") || "<option>No voices found yet</option>";
}
function renderAudioPlayer() {
  const el = document.getElementById("audioDock");
  if (el) el.outerHTML = audioPlayerHtml();
}
function primaryLabel() {
  if (audio.playing && !audio.paused) return "Pause";
  if (audio.items.length) return "Play";
  return "Play all 10";
}
function primaryAction() {
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
        <div><p class="eyebrow">Browser audio</p><h3>${esc(audio.title)}</h3><span>${esc(current?.label || audio.subtitle || "Ready")}</span></div>
      </div>
      <div class="audio-body">
        <div class="scrubber-wrap"><input class="scrubber" type="range" min="0" max="${max}" value="${audio.index}" ${audio.items.length ? "" : "disabled"} oninput="seekAudio(this.value)" style="--played:${audioProgress()}%"><div class="audio-marks">${markersHtml()}</div></div>
        <div class="audio-meta"><span>${audio.items.length ? `${audio.index + 1} / ${audio.items.length}` : "No audio queued"}</span><span>${audio.paused ? "Paused" : audio.playing ? "Playing" : "Stopped"}</span></div>
        <div class="audio-controls"><button onclick="stepAudio(-10)">-10</button><button onclick="stepAudio(-1)">Back</button><button class="audio-primary" onclick="primaryAction()">${primaryLabel()}</button><button onclick="stepAudio(1)">Next</button><button onclick="stepAudio(10)">+10</button><button onclick="stopAudio()">Stop</button></div>
      </div>
    </div>
  </section>`;
}

function render() {
  currentTranslation = state.translation || "KJV";
  const readings = currentReadings();
  const imported = state.importedNames || [];
  $("#app").innerHTML = `
    <section class="hero"><div class="seal">PGH</div><div><p class="eyebrow">Unofficial reading-plan tool</p><h1>Professor Grant Horner Bible Reading Plan</h1><p class="sub">Ten rotating chapter lists, local progress, KJV text, optional bring-your-own Bible import, and browser read-aloud.</p></div><div class="dayplate" onclick="setDay()"><span>Current day</span><strong>${state.day}</strong><em>tap to edit</em></div></section>
    <section class="notice"><strong>Unofficial.</strong> Not affiliated with or endorsed by Professor Grant Horner, The Lockman Foundation, or any Bible publisher. Included text is KJV; imported Bible files stay in your browser.</section>
    <section class="actions"><button class="primary" onclick="completeDay()">Complete Day ${state.day}</button><button onclick="copyReadings()">Copy readings</button><button onclick="speakAll()">Play all 10</button><button onclick="exportData()">Export</button><label class="button">Import progress <input type="file" accept="application/json" onchange="importData(this.files[0])"></label><button onclick="resetPlan()">Reset</button></section>
    <section class="settings"><div><label>Translation <select onchange="state.translation=this.value; saveState()"><option ${currentTranslation === "KJV" ? "selected" : ""}>KJV</option>${imported.map(n => `<option ${n === currentTranslation ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label><label class="button">Bring your own Bible JSON <input type="file" accept="application/json" onchange="importBibleJson(this.files[0])"></label></div><div><label>Voice <select id="voiceSelect">${voiceOptions()}</select></label><label>Speed <input id="rateRange" type="range" min="0.75" max="1.5" step="0.05" value="1"></label></div></section>
    <section class="grid">${readings.map(r => card(r.list, r.index)).join("")}</section>
    <section class="reader"><div class="reader-head"><p class="eyebrow">${esc(currentTranslation)} chapter text</p><h2>Today’s ten chapters</h2></div>${readings.map(chapterPanel).join("")}</section>
    <section class="history"><h2>Recent completed days</h2>${state.history.length ? state.history.slice(0, 12).map(h => `<details><summary>Day ${h.day} · ${new Date(h.date).toLocaleDateString()}</summary><ol>${h.readings.map(r => `<li>${esc(r.ref)}</li>`).join("")}</ol></details>`).join("") : `<p>No completed days logged yet.</p>`}</section>
    ${audioPlayerHtml()}`;
  loadChapters(readings);
}
function card(list, i) {
  const current = list.chapters[state.positions[i]];
  const next = list.chapters[(state.positions[i] + 1) % list.chapters.length];
  const books = [...new Set(list.chapters.map(ch => ch.book))];
  return `<article class="card" style="--delay:${i * 45}ms"><div class="num">List ${list.id}</div><div class="meter" style="--p:${pct(state.positions[i], list.chapters.length)}"><span>${pct(state.positions[i], list.chapters.length)}%</span></div><h2>${esc(refText(current))}</h2><p>${esc(list.name)} · ${list.chapters.length} days · next: ${esc(refText(next))}</p><div class="tools"><button onclick="move(${i},-1)">← Previous</button><button onclick="move(${i},1)">Next →</button><button onclick="scrollToChapter(${i})">Read</button><button onclick="speakChapter(${i})">Audio</button></div><details><summary>Manual set</summary><div class="editrow"><select onchange="this.nextElementSibling.max=BOOKS[this.value]">${books.map(b => `<option ${b === current.book ? "selected" : ""}>${esc(b)}</option>`).join("")}</select><input type="number" min="1" max="${BOOKS[current.book]}" value="${current.chapter}"><button onclick="setReference(${i}, this.parentElement.children[0].value, this.parentElement.children[1].value)">Set</button></div></details></article>`;
}
function chapterPanel(r) {
  return `<article class="chapter-panel" id="chapter-panel-${r.index}"><header><span>List ${r.list.id}</span><h3>${esc(refText(r.current))}</h3><em>${esc(r.list.name)}</em><button onclick="speakChapter(${r.index})">Play chapter</button></header><div class="chapter-body" id="chapter-body-${r.index}"><p class="loading">Loading ${esc(refText(r.current))}…</p></div></article>`;
}

render();
