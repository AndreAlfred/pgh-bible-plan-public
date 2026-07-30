# Scrubber / audio player redesign

**Date:** 2026-07-29
**Status:** Approved
**Scope:** `app.js` audio queue and floating player. No changes to the reading-plan logic,
IndexedDB cache, chapter text rendering, or import/export.

---

## Problem

Five issues, one of them a real bug.

1. **Verses are read twice, then one is skipped.** The core defect.
2. No **Play** button — after Stop, the player cannot restart playback at all.
3. No **chapter markers** on the timeline; in "Play all 10" the scrubber is ~300
   indistinguishable positions.
4. The player is **visible by default** and its toggle reads "Show audio".
5. Every verse is announced as **"Verse 3. ..."**, which breaks the listening flow.

---

## Root cause of the double-read/skip

`speakCurrent()` (app.js:272) calls `speechSynthesis.cancel()` at line 285 before creating
each new utterance. Per the Web Speech spec, `cancel()` fires `onend` (or `onerror`) on the
utterance currently being spoken.

That handler belongs to the **previous** utterance and still sees `audio.playing === true`
and `audio.paused === false`, so it executes:

```js
audio.index += 1;
speakCurrent();
```

Re-entrant call. The net effect: one verse is spoken twice (once by the original call, once
by the re-entrant one) and `audio.index` advances twice, so the following verse is skipped.

`seekAudio()` (app.js:308) reaches `speakCurrent()` the same way, so rapid scrubbing
compounds it. iOS Safari fires these stale callbacks more aggressively than desktop
browsers, which is why it reproduces reliably on iPhone.

**This is a re-entrancy bug, not a queue-ordering bug.** Reordering the queue or debouncing
the scrubber would mask it, not fix it.

A second, unrelated defect: `audioProgress()` (app.js:306) adds
`(audio.playing ? 1 : 0)` to the index, so the progress bar reads one segment ahead of the
verse actually being spoken.

---

## Design

### 1. Generation-token guard (the fix)

Mirror the `renderToken` pattern already used for async chapter loads (app.js:40, 193).

- Add `gen: 0` to the `audio` state object.
- `speakCurrent()` opens with `const myGen = ++audio.gen`.
- `onend` and `onerror` both begin `if (myGen !== audio.gen) return;`.
- Before `cancel()`, detach handlers from the outgoing utterance
  (`u.onend = u.onerror = null`) so they cannot fire at all. Keep a module-level reference
  to the current utterance for this.
- Index advancement happens in exactly **one** place: the guarded `onend`.

Any state change that invalidates in-flight speech (`seekAudio`, `stopAudio`, `setAudioQueue`,
`pauseAudio`) bumps `audio.gen`, orphaning stale callbacks.

**Also:** drop the `+ (audio.playing ? 1 : 0)` from `audioProgress()`.

### 2. Segmentation and spoken text

```js
buildChapterItems(chapter, label, { announce })
```

Returns items shaped:

```js
{ kind: 'chapter' | 'verse', label, text, ref, chapterIndex, v? }
```

- Verse items: `text` is `v.t` **verbatim**. The `Verse ${v.v}.` prefix is removed.
- Chapter item: emitted **only when `announce` is true**; `text` is `${label}.`
- `speakAll()` passes `announce: true` — the spoken chapter name is the only audible cue
  that playback crossed into a new chapter.
- `speakChapter(i)` passes `announce: false` — the user just tapped that specific chapter,
  so announcing it is redundant.
- `chapterIndex` is a 0-based counter over chapters in the queue, used to derive markers.

One utterance per verse is retained deliberately. Merging a chapter into a single utterance
would make playback gapless but collapse the scrubber to ~10 positions and risks silent
truncation in TTS engines with input-length limits.

### 3. Player shell: closed by default

Replace the two overlapping flags (`hidden`, `collapsed`) with a single `open`, default
**`false`**.

- **Closed:** one button, labeled exactly **"Audio Player"**. Not "Show audio".
- **Open:** title/subtitle, scrubber with markers, controls, and a prominent
  **"Play all 10"**.
- Starting playback from a chapter card or panel sets `open = true` so the user can see what
  is playing.

### 4. Play/Pause control

A single toggle replacing the current Pause-only button:

| State | Button | Action |
|---|---|---|
| Playing | Pause | pause (see §6) |
| Paused | Play | resume at `audio.index` |
| Stopped, queue non-empty | Play | resume at `audio.index` |
| Stopped, queue empty | Play all 10 | `speakAll()` |

The last row closes the current dead end: after Stop, `audio.index` resets to 0 and
`playing` is false, leaving no way to restart from the player.

### 5. Chapter markers

- Derived from item `chapterIndex` boundaries — the index of each chapter's first item.
- Rendered as ticks absolutely positioned over the range input at
  `startIndex / (items.length - 1) * 100%`.
- Each tick is a `<button>` calling `seekAudio(startIndex)`, with
  `aria-label="Jump to <ref>"`.
- Ten ticks in "Play all 10"; none in single-chapter mode (one chapter = one boundary at 0,
  which is not worth drawing).
- Ticks must not intercept drags on the scrubber itself: they sit in a sibling overlay
  layer, not as children of the input.

### 6. iOS-safe pause (approved addition)

`speechSynthesis.pause()` is unreliable on iOS Safari — commonly ignored, or resumes by
restarting the utterance. Replace with:

- **Pause:** bump `gen`, `cancel()`, set `paused = true`, retain `index`.
- **Resume:** re-speak the current item from its start.

Tradeoff accepted: pause is no longer mid-verse precise (resume restarts the current verse),
but it works on the target device. Andrew approved this explicitly.

---

## Non-goals

- No test infrastructure. The repo has no `package.json` or runner, and standing one up would
  require splitting `app.js` into importable modules — worthwhile, but separate work.
- No change to reading-plan logic, IndexedDB caching, chapter rendering, or import/export.
- No visual redesign beyond what these five items require.
- No gapless/boundary-event audio (considered and rejected; see §2).

---

## Verification

Manual checklist, run in the browser:

1. **No double-read or skip:** "Play all 10", listen across at least one chapter boundary.
   Every verse spoken exactly once, in order, none skipped.
2. **Scrub stress:** drag the scrubber rapidly back and forth, then release. Playback
   resumes at the released position and advances by one verse at a time.
3. **No verse numbers:** no "Verse 3" anywhere in playback.
4. **Chapter announced only in Play all:** "Play all 10" says "Genesis 1."; tapping a single
   chapter's Audio button does not.
5. **Closed by default:** on load, only an "Audio Player" button is visible.
6. **Play restarts after Stop:** Stop, then Play → playback resumes.
7. **Markers:** ten ticks in Play all; clicking one jumps to that chapter's first verse.
8. **iOS:** repeat 1, 2, and 6 on the iPhone, where the original bug was most visible.

Progress-bar position should track the verse actually being spoken (regression check on the
`audioProgress()` off-by-one).

---

## Implementation notes

Keep `buildChapterItems` and the marker-boundary computation **pure** — no DOM reads, no
reliance on globals. They become directly testable if a runner is added later, at no extra
cost now.

Group the audio code into one cohesive section of `app.js` rather than leaving it interleaved
with rendering and storage concerns. This is tidying, not a rewrite: no behavior changes
beyond those specified above.
