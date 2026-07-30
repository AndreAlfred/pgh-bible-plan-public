# Scrubber / Audio Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the verse double-read/skip bug in the read-aloud queue and add a play button, clickable chapter markers, a closed-by-default player shell, and seamless verse-to-verse audio.

**Architecture:** Single-file browser app. All audio state lives in the `audio` object in `app.js`; the player re-renders by replacing `#audioDock`'s `outerHTML`. The bug fix introduces a generation counter (`audio.gen`) so stale `speechSynthesis` callbacks are ignored — the same pattern `renderToken` already uses for async chapter loads. Pure helpers (`buildChapterItems`, `chapterMarkers`) take no DOM reads so they stay testable later.

**Tech Stack:** Vanilla ES2020, Web Speech API (`speechSynthesis`), IndexedDB, minified CSS in `styles.css`. No build step, no package manager, no test runner.

---

## ⚠️ Deviation from standard TDD — read before starting

This repo has **no `package.json`, no test runner, and no importable modules**. `app.js` is a
browser global script that touches `window` and `document` at load, so it cannot be imported
into Node as-is. Standing up a test harness would require splitting the file into modules —
deliberately declared a **non-goal** in the spec and approved as such.

**Therefore every task below verifies in the browser with explicit, observable steps instead
of automated tests.** Do not skip verification; do not invent a test runner. If a step says
"listen for X", actually load the page and listen.

Serve the app locally (it needs `fetch` for `data/kjv/*.json`, so `file://` will not work):

```bash
cd ~/MinisHub/projects/repos/pgh-bible-plan-public && python3 -m http.server 8765
```

Then open http://localhost:8765 . Use the browser console to check for errors after each task.

**CSS warning:** `styles.css` is minified — 5 lines, ~9.9 KB, many rules per line. **Never
reformat it.** Add new rules by appending to the end of the file. Change existing rules only
by exact-string replacement of the snippets quoted in this plan.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app.js` | All app logic incl. audio queue and player markup | Modify (all 6 tasks) |
| `styles.css` | All styling, minified | Modify (Tasks 3, 5) — append only |
| `index.html` | 14-line shell, loads app.js | No change |

All audio functions live in `app.js` lines ~237–378. Keep them in that contiguous block; do
not scatter new functions elsewhere in the file.

---

## Task 1: Generation-token guard (the core bug fix)

Fixes verses being read twice then skipped. **Do this task first — every other task depends
on the queue behaving correctly.**

**Files:**
- Modify: `app.js:42-52` (audio state), `app.js:272-307` (`speakCurrent`, `audioProgress`), `app.js:333-339` (`stopAudio`)

- [ ] **Step 1: Reproduce the bug so you can confirm the fix**

Serve the app and open http://localhost:8765 . Click **"Play all 10"**. Listen to the first
6–8 segments with the chapter text visible on screen.

Expected (buggy) behavior: at least one verse is spoken twice and the following verse is
skipped. Note which verse numbers so you can re-check the same passage after the fix.

- [ ] **Step 2: Add the generation counter to audio state**

In `app.js`, find the `audio` state object (starts line 42):

```js
let audio = {
  items: [],
  index: 0,
  playing: false,
  paused: false,
  hidden: false,
  collapsed: false,
  title: "Ready",
  subtitle: "Choose Play all 10 or a chapter.",
  mode: "idle"
};
```

Add `gen: 0,` immediately after `index: 0,`:

```js
let audio = {
  items: [],
  index: 0,
  gen: 0,
  playing: false,
  paused: false,
  hidden: false,
  collapsed: false,
  title: "Ready",
  subtitle: "Choose Play all 10 or a chapter.",
  mode: "idle"
};
```

Leave `hidden` and `collapsed` alone — Task 3 removes them.

- [ ] **Step 3: Add a module-level utterance reference and a cancel helper**

Directly above `function speakCurrent()` (line 272), insert:

```js
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
```

Detaching the handlers **before** `cancel()` is the load-bearing part: `cancel()` fires
`onend` on whatever is currently speaking, and that stale handler is what advances the index
a second time.

- [ ] **Step 4: Rewrite speakCurrent with the guard**

Replace the whole of `function speakCurrent()` (lines 272–303) with:

```js
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
```

`cancelSpeech()` bumps `gen`, then `myGen` captures the new value — so any callback from a
previous utterance holds an older `myGen` and returns immediately.

- [ ] **Step 5: Fix the progress off-by-one**

Replace `function audioProgress()` (lines 304–307):

```js
function audioProgress() {
  if (audio.items.length < 2) return 0;
  return Math.min(100, Math.round((audio.index / (audio.items.length - 1)) * 100));
}
```

The old version added `+1` while playing, so the bar read one segment ahead. The denominator
is now `length - 1` to match the range input's `max`.

- [ ] **Step 6: Route stopAudio through cancelSpeech**

Replace `function stopAudio(update = true)` (lines 333–339):

```js
function stopAudio(update = true) {
  audio.playing = false;
  audio.paused = false;
  audio.index = 0;
  cancelSpeech();
  if (update) renderAudioPlayer();
}
```

- [ ] **Step 7: Verify the fix in the browser**

Reload http://localhost:8765 and click **"Play all 10"**.

Expected:
- Every verse spoken **exactly once**, in order, none skipped — check the same passage you
  noted in Step 1.
- Console shows no errors.
- The `N / M` counter in the player advances by exactly 1 per verse.

Then stress the scrubber: drag it rapidly left and right and release. Expected: playback
resumes at the released position and advances one verse at a time — no stuttering, no
double-speaking.

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "fix: stop stale speech callbacks double-advancing the audio queue

speechSynthesis.cancel() fires onend on the current utterance. That stale
handler still saw playing===true and advanced the index, so a verse was
spoken twice and the next one skipped. Guard callbacks with a generation
counter and detach handlers before cancelling. Also fix the audioProgress
off-by-one that made the bar read one segment ahead."
```

---

## Task 2: Drop spoken verse numbers, announce chapters only in Play all

**Files:**
- Modify: `app.js:247-265` (`buildChapterItems`, `speakChapter`, `speakAll`)

- [ ] **Step 1: Rewrite buildChapterItems**

Replace lines 247–252:

```js
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
```

Two changes that matter: `text` is now `v.t` verbatim (the `Verse ${v.v}. ` prefix is gone),
and every item carries `ref` and `chapterIndex` for Task 5's markers.

This function must stay pure — no `document`, no globals.

- [ ] **Step 2: Update speakChapter to not announce**

Replace `async function speakChapter(i)` (lines 253–257):

```js
async function speakChapter(i) {
  const r = currentReadings()[i];
  const ch = await getChapter(r.current);
  const label = refText(r.current);
  setAudioQueue(buildChapterItems(ch, label, { announce: false, chapterIndex: 0 }), label, r.list.name, "chapter");
}
```

- [ ] **Step 3: Update speakAll to announce and number chapters**

Replace `async function speakAll()` (lines 258–265):

```js
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
```

- [ ] **Step 4: Verify in the browser**

Reload. Click a single chapter's **Audio** button.

Expected: playback begins with the **first verse's text** — no "Verse 1", no chapter name
spoken.

Now click **"Play all 10"**. Expected: it speaks the chapter name (e.g. "Genesis 1.") then
the verses with no verse numbers, and announces the next chapter name when it crosses a
boundary.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: read verses without announcing verse numbers

Verse text is now spoken verbatim. Chapter names are announced only in
Play all, where they are the sole audible cue for a chapter change; a
single tapped chapter stays silent. Items now carry ref and chapterIndex
for timeline markers."
```

---

## Task 3: Closed-by-default player, labeled "Audio Player"

**Files:**
- Modify: `app.js:42-52` (state), `app.js:340-347` (toggles), `app.js:359-378` (`audioPlayerHtml`), `app.js:266-271` (`setAudioQueue`)
- Modify: `styles.css` (append only)

- [ ] **Step 1: Replace the two visibility flags with one**

In the `audio` state object, delete these two lines:

```js
  hidden: false,
  collapsed: false,
```

and add in their place:

```js
  open: false,
```

- [ ] **Step 2: Replace both toggle functions with one**

Replace `function toggleAudioHidden()` and `function toggleAudioCollapsed()` (lines 340–347)
with:

```js
function toggleAudioOpen() {
  audio.open = !audio.open;
  renderAudioPlayer();
}
```

- [ ] **Step 3: Open the player automatically when playback starts**

In `setAudioQueue` (line 266), the object spread currently sets `hidden: false`. Replace the
whole function:

```js
function setAudioQueue(items, title, subtitle, mode) {
  stopAudio(false);
  audio = { ...audio, items, index: 0, playing: true, paused: false, open: true, title, subtitle, mode };
  speakCurrent();
  renderAudioPlayer();
}
```

- [ ] **Step 4: Rewrite audioPlayerHtml with a closed state**

Replace all of `function audioPlayerHtml()` (lines 359–378):

```js
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
        <input class="scrubber" type="range" min="0" max="${max}" value="${audio.index}" ${audio.items.length ? "" : "disabled"} oninput="seekAudio(this.value)" style="--played:${audioProgress()}%">
        <div class="audio-meta"><span>${audio.items.length ? `${audio.index + 1} / ${audio.items.length}` : "No audio queued"}</span><span>${audio.paused ? "Paused" : audio.playing ? "Playing" : "Stopped"}</span></div>
        <div class="audio-controls"><button onclick="stepAudio(-10)">-10</button><button onclick="stepAudio(-1)">Back</button><button onclick="stepAudio(1)">Next</button><button onclick="stepAudio(10)">+10</button><button onclick="stopAudio()">Stop</button></div>
      </div>
    </div>
  </section>`;
}
```

The Minimize button is gone (the closed state replaces it) and the Pause button is
intentionally omitted here — Task 4 adds the Play/Pause toggle.

- [ ] **Step 5: Append CSS for the closed state**

Append to the **end** of `styles.css` (do not edit existing lines):

```css
.audio-dock.is-closed{transform:translate(-50%,0);background:transparent;border:0;box-shadow:none;padding:0}
.audio-dock.is-closed .audio-tab{position:static;right:auto;top:auto}
```

- [ ] **Step 6: Verify in the browser**

Reload. Expected on first load: **only** a button reading **"Audio Player"** — no scrubber,
no controls, no "Show audio" text anywhere.

Click it. Expected: the player expands with the scrubber and controls. Click **"Hide"** →
back to the single button. Click a chapter's **Audio** button while closed → the player opens
by itself and plays.

- [ ] **Step 7: Commit**

```bash
git add app.js styles.css
git commit -m "feat: player closed by default behind an Audio Player button

Collapse the overlapping hidden/collapsed flags into one open flag,
defaulting to closed. The resting state is a single button labelled
Audio Player. Starting playback opens the player automatically."
```

---

## Task 4: Play/Pause toggle with a Play-all fallback

**Files:**
- Modify: `app.js` (add two helpers near `audioPlayerHtml`, edit the controls row from Task 3)

**Depends on Task 3** — it edits the markup Task 3 writes.

- [ ] **Step 1: Add the primary-action helpers**

Directly above `function audioPlayerHtml()`, insert:

```js
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
```

The third branch closes the current dead end: after **Stop**, `items` is retained but
`playing` is false, and there was no control that could restart playback.

- [ ] **Step 2: Put the toggle in the controls row**

In `audioPlayerHtml`, replace the controls `<div>` from Task 3 Step 4 with:

```js
        <div class="audio-controls"><button onclick="stepAudio(-10)">-10</button><button onclick="stepAudio(-1)">Back</button><button class="audio-primary" onclick="primaryAction()">${primaryLabel()}</button><button onclick="stepAudio(1)">Next</button><button onclick="stepAudio(10)">+10</button><button onclick="stopAudio()">Stop</button></div>
```

- [ ] **Step 3: Append CSS to emphasise the primary button**

Append to the end of `styles.css`:

```css
.audio-controls .audio-primary{background:var(--gold);color:var(--ink);font-weight:600;min-width:96px}
```

- [ ] **Step 4: Verify in the browser**

Reload and open the player. With nothing queued, expected: the middle button reads
**"Play all 10"**; clicking it starts all ten chapters.

While playing it reads **"Pause"**. Click → audio stops, label becomes **"Play"**, status
shows **Paused**. Click **"Play"** → playback continues from the same verse.

Click **"Stop"**, then **"Play"**. Expected: playback restarts rather than doing nothing.

- [ ] **Step 5: Commit**

```bash
git add app.js styles.css
git commit -m "feat: add Play/Pause toggle with Play-all fallback

One primary control: Pause while playing, Play when paused or stopped
with a queue, and Play all 10 when the queue is empty. Previously Stop
left no way to restart playback from the player."
```

---

## Task 5: Clickable chapter markers on the timeline

**Files:**
- Modify: `app.js` (two new pure-ish helpers + scrubber markup)
- Modify: `styles.css` (append only)

**Depends on Task 2** (needs `chapterIndex` on items) **and Task 3** (edits its markup).

- [ ] **Step 1: Add the marker helpers**

Directly above `function audioPlayerHtml()`, insert:

```js
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
```

`chapterMarkers` returns `[]` when there is only one chapter — a single marker at position 0
is noise. Keep it free of DOM reads.

- [ ] **Step 2: Wrap the scrubber in an overlay container**

In `audioPlayerHtml`, replace the single `<input class="scrubber" ...>` line with:

```js
        <div class="scrubber-wrap"><input class="scrubber" type="range" min="0" max="${max}" value="${audio.index}" ${audio.items.length ? "" : "disabled"} oninput="seekAudio(this.value)" style="--played:${audioProgress()}%"><div class="audio-marks">${markersHtml()}</div></div>
```

The marks are a **sibling** overlay, not children of the input — children of a range input
would swallow drag events.

- [ ] **Step 3: Append the marker CSS**

Append to the end of `styles.css`:

```css
.scrubber-wrap{position:relative}
.audio-marks{position:absolute;left:0;right:0;top:0;height:8px;pointer-events:none}
.audio-mark{position:absolute;top:-3px;width:14px;height:14px;margin-left:-7px;padding:0;border:0;border-radius:50%;background:rgba(255,248,234,.9);box-shadow:0 0 0 2px var(--ink);cursor:pointer;pointer-events:auto}
.audio-mark:hover{background:var(--gold)}
```

`pointer-events:none` on the container with `auto` on each mark means only the 14px dots are
clickable; drags elsewhere still reach the scrubber.

- [ ] **Step 4: Verify in the browser**

Reload, open the player, click **"Play all 10"**.

Expected: **ten** dots on the timeline at uneven spacing (chapters differ in length).
Clicking a dot jumps playback to that chapter — it should speak that chapter's name first.
Dragging the scrubber between dots still works normally.

Now play a **single** chapter. Expected: **no** dots.

Check accessibility: inspect a dot and confirm `aria-label="Jump to Genesis 1"` (or similar).

- [ ] **Step 5: Commit**

```bash
git add app.js styles.css
git commit -m "feat: clickable chapter markers on the audio timeline

Ten dots in Play all, positioned at each chapter's first segment and
clickable to jump there. Hidden in single-chapter mode. Rendered as a
sibling overlay so they don't swallow scrubber drags."
```

---

## Task 6: iOS-safe pause

`speechSynthesis.pause()` is unreliable on iOS Safari — frequently ignored, or it restarts
the utterance on resume. Replace it with cancel-and-remember.

**Files:**
- Modify: `app.js:319-332` (`pauseAudio`, `resumeAudio`)

**Depends on Task 1** (uses `cancelSpeech`).

- [ ] **Step 1: Rewrite pauseAudio and resumeAudio**

Replace both functions (lines 319–332):

```js
function pauseAudio() {
  if (!audio.items.length) return;
  audio.playing = true;
  audio.paused = true;
  cancelSpeech();
  renderAudioPlayer();
}
function resumeAudio() {
  if (!audio.items.length) return;
  audio.playing = true;
  audio.paused = false;
  speakCurrent();
}
```

`playing` stays `true` while paused so the status line and `primaryLabel()` can distinguish
paused-with-a-queue from stopped. `cancelSpeech()` bumps `gen`, so the in-flight utterance's
`onend` cannot advance the index while paused.

Accepted tradeoff: resume restarts the **current verse** from its start rather than resuming
mid-sentence. Approved in the spec.

- [ ] **Step 2: Verify on desktop**

Reload, play all, and click **Pause** mid-verse. Expected: audio stops immediately, status
reads **Paused**, the `N / M` counter does **not** advance. Click **Play** → the same verse
restarts and playback continues in order.

Pause and resume five times in a row. Expected: no verse is skipped and none is spoken twice.

- [ ] **Step 3: Verify on the iPhone**

This is the device where the original bug appeared, so it is the one that matters. Find the
Mac's LAN address:

```bash
ipconfig getifaddr en0
```

Open `http://<that-address>:8765` on the iPhone (same Wi-Fi). Run **Play all 10** through at
least one chapter boundary, then pause/resume twice.

Expected: no repeated verses, no skips, pause actually stops audio, resume continues.

If iOS refuses to start audio at all, note it in the commit message and report back — iOS
requires speech to begin from a user gesture, which may need a separate fix. Do not silently
paper over it.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "fix: make pause work reliably on iOS Safari

speechSynthesis.pause() is commonly ignored on iOS and can restart the
utterance on resume. Pause now cancels and retains the index; resume
re-speaks the current verse. Resume is no longer mid-verse precise,
which is the accepted tradeoff for pause that works on the target device."
```

---

## Final verification (all tasks complete)

Run the spec's full checklist against the served app:

- [ ] Play all 10 across a chapter boundary — every verse once, in order, none skipped
- [ ] Rapid scrub then release — resumes cleanly, advances one verse at a time
- [ ] No "Verse N" spoken anywhere
- [ ] Chapter name announced in Play all; silent for a single tapped chapter
- [ ] On load, only an "Audio Player" button is visible
- [ ] Stop then Play restarts playback
- [ ] Ten clickable markers in Play all; none for a single chapter
- [ ] Progress bar tracks the verse actually being spoken
- [ ] Repeat items 1, 2 and 6 on the iPhone
- [ ] Browser console clean, no errors

**Do not push.** `git push` on this repo is wired to deploy. Report completion and let Andrew
decide when it goes out.
