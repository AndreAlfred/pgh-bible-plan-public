# ESV recorded audio

Date: 2026-10-24. Status: approved by Andrew 2026-10-25.

## Why

Andrew listens to his ten daily chapters through earbuds while doing routine work. The
current read-aloud uses the browser's speech voice. On his iPhone it stops when the
screen locks, and he had to turn off battery saver to keep the screen on. Fixing that is
the point of this work. The ESV narration replacing the robot voice is the bonus.

A recorded MP3 played through an `<audio>` element is handled by iOS like a podcast. It
keeps playing with the screen locked and gets lock-screen and AirPods controls. Browser
speech cannot do this on iOS, so speech stays as it is.

## Who gets it

Anyone whose selected translation is an ESV they imported themselves. KJV and every other
imported translation keep the speech voice, because no recorded audio is licensed for
them. See `docs/audio-licensing.md` for that research.

## Goals

1. **Keeps playing with the phone locked**, through every remaining chapter of the day,
   with no taps between chapters. Lock-screen and AirPods play/pause/skip work.
2. **The ESV recording plays** for readers on an ESV translation.
3. **Resumes exactly where you left off**, across pauses, lost signal, closed tabs and
   phone restarts, starting 3 seconds back. The player shows clearly that it will resume.
4. **A chapter whose recording plays to the end is marked Done** automatically, the same
   as tapping the Done button at the end of the passage.

## Non-goals

- Verse highlighting or auto-scroll while a recording plays. The recordings have no
  verse timings, so the app can't know which verse is being read.
- Offline or downloaded audio. Crossway's terms cap caching at 500 verses, and it isn't
  clear whether that covers audio. This waits for Crossway's answer (Email 3 in
  `docs/audio-licensing.md`).
- Recorded audio for KJV or other translations.

## Anti-goals (failure even if it technically works)

- **Highlighting a verse that might be wrong.** Andrew judged an approximate highlight
  worse than none.
- **Switching to the robot voice on its own** when a recording fails.
- **Exposing the API key**: in client code, in the public repo, in logs, or in a
  response.
- **Committing ESV text or audio to the repo.** It is public.
- **Using up the shared daily quota** so the feature stops for everyone partway through a
  day.
- **Adding a `package.json` or a build step.** Vercel changes its build behaviour when it
  finds one (see `AGENTS.md`).

## Facts established on 2026-10-24

Tested against the live API with Andrew's key, which was read from the macOS Keychain
and never printed:

- `GET https://api.esv.org/v3/passage/audio/?q=Acts+28` with `Authorization: Token <key>`
  returns **302**. `Location` is `https://audio.esv.org/hw/Acts%2028.mp3`, a plain URL
  with no signature or key.
- That URL redirects (301) to `https://audio.esv.org/hw/mq/Acts%2028.mp3`, which is
  `audio/mpeg` at 128 kbps with `Accept-Ranges: bytes`. Acts 28 is 4 min 11 s and 4.0 MB.
  There are no CORS headers. That's fine for `<audio>` playback, but JavaScript cannot
  read the bytes or headers.
- Psalm 119 and Jude 1 work. `Acts 29` and `Acts 28:29` return **400**
  `{"errors": "Invalid passage"}`. A request without the key returns **403**.
- The MP3s can be fetched without a key. We still go through the API on purpose: that is
  the access the terms cover, and the URL pattern is not a promise.

Crossway's terms (<https://api.esv.org/>), as they constrain this design:

- The key may not be published, shared or sold.
- 5,000 queries/day, 1,000/hour and 60/minute per key, shared by every reader of the
  site.
- An ESV copyright notice and a link to www.esv.org must appear wherever ESV content is
  used.
- The site must stay non-commercial: no charges, ads, sponsorships or donation requests.
- Crossway can revoke access at any time.

Environment:

- Andrew has added `ESV_API_KEY` in Vercel (Production and Preview, marked Sensitive).
  Nothing has used it yet, so it is unverified there.
- For local testing, the key is in the macOS Keychain:
  `security find-generic-password -s esv-api-key -w`. Never echo it.

## Spike result (2026-10-25, Andrew's iPhone, live site `/spike`)

- **Both approaches pass.** With the screen locked from the start, chapters 2 and 3
  started by themselves. Mode A swaps `src` on one element; mode B alternates two
  preloaded elements.
- **Mode B shows the wrong lock-screen state.** The lock screen showed Play while audio
  was playing. Tapping it switched to Pause without interrupting playback. With two
  elements, iOS tracks the wrong one. **Decision: build mode A**, a single element.
  Background preloading was already best effort.
- **The lock screen shows ±10 s skip icons**, and a web page cannot change them. The
  spike's handler skipped 15 s under a 10 s icon. Proposed: skip 10 s everywhere,
  lock screen and in-page, so each button does what its icon says. This replaces the
  15 s decided earlier, pending Andrew's confirmation in the build plan.
- **The Preview login blocked the test**, and the first Vercel key was the literal text
  `ESV_API_KEY`. Testing now happens on the live site (Andrew is the only user). The
  function trims whitespace, quotes and a "Token " prefix from the key.
- **iOS media requests may not carry page cookies.** The page asks the function for JSON
  (`?format=json` → `{url}`) before the tap and gives `<audio>` the audio.esv.org URL
  directly. Keep this in the real build: it also avoids depending on the redirect
  through Vercel.

## What Andrew decided

- **Who gets it:** readers whose selected translation is an imported ESV.
- **No verse highlight and no auto-scroll** while a recording plays. The speech voice
  keeps its current behaviour.
- **On failure** (a chapter won't load, or the signal drops mid-chapter): stop, keep the
  place, and say so. Never fall back to speech.
- **Resume** at the same chapter and moment, a few seconds back, including after closing
  the tab or a phone restart.
- **Load the next chapter in the background** while the current one plays, so short
  signal drops between chapters don't stop playback and there is no gap. *This is best
  effort (my call, from Andrew's priority).* Playing on with the screen locked matters
  more than having no gap. If real preloading would need a second audio element that iOS
  won't start while locked, keep the single element and accept a short pause between
  chapters.
- **Lock-screen and AirPods skip = 15 seconds**, not next/previous chapter.
- **Single-chapter buttons carry on** (the card's Audio button and the passage's play
  button). In ESV mode they start the day's listening from that chapter and continue
  through the rest, and that becomes the saved place. A setting controls this: **"Keep
  playing into the next chapter"**, on by default. With it off, they play that one chapter
  and stop, and don't touch the saved place. The setting applies to the speech voice too,
  so the two modes don't behave differently. *(My call: Andrew asked for the toggle; the
  default and the name are mine.)*
- **Resume display, layout A** from the mockup: when there is a saved place, the
  player's main button reads **"Resume from 1:31"** and a smaller **Start over** sits
  beside it. Start over can be undone. The page-top Listen button becomes **Resume**, with
  the chapter, minutes left today, and a thin progress bar.
- **Auto-Done:** when a recording plays to the end of a chapter, that chapter is marked
  Done.

## How it works

### The server piece: `api/esv-audio.js`

A Vercel serverless function. It is the only server-side code in the project and has one
job: turn a chapter reference into the MP3's address without exposing the key.

`GET /api/esv-audio?ref=Acts%2028`:

1. Validate `ref` against the plan's real book names and chapter counts: one whole
   chapter, nothing else. Respond **400** to anything else without calling Crossway. This
   is the main quota protection, because the endpoint is necessarily public.
2. Call `https://api.esv.org/v3/passage/audio/?q=<ref>` with the key from
   `process.env.ESV_API_KEY`, without following the redirect.
3. On 302, respond **302** with the same `Location` and
   `Cache-Control: public, s-maxage=2592000` (30 days). Vercel's CDN then answers repeat
   requests for that chapter without calling Crossway, so the quota is spent at most about
   once per chapter per month across all readers. *(My call: caching a URL is not caching
   ESV text or audio. The CDN TTL is the builder's to tune.)*
4. On anything else (a missing key, a 4xx or 5xx from Crossway, a timeout), respond
   **502 or 503** with `Cache-Control: no-store` and a short, key-free message. Log the
   status but never the key or the request headers.

The browser points `<audio src>` straight at `/api/esv-audio?ref=…`. The redirect is
followed natively and the MP3 streams from audio.esv.org, not through Vercel.

No `package.json`: a CommonJS function in `api/` deploys without one. *(My call.)* The
book and chapter table may be shared with `app.js`, which already exports it under
CommonJS, or duplicated. Builder's choice.

### Two peer drivers behind one player

This follows the design agreed on 2026-08-01 in `docs/audio-licensing.md`: one player,
one queue, one progress model, and two drivers behind a shared interface (`load`,
`play`, `pause`, `seek`, `onProgress`, `onEnded`).

- **`FileDriver`** wraps a single, persistent `HTMLAudioElement`, used for ESV.
- **`SpeechDriver`** wraps today's speech code unchanged. It is a peer, not a fallback.

Units differ and the UI must not hide that. The file driver positions by seconds within
a chapter, while the speech driver positions by verse index. The scrubber shows time for
files and verses for speech.

**Trap:** `render()` rewrites all of `#app` on every state change. The audio element
must live outside `#app` (like the toast), or exist only in JS, or every render will cut
playback off.

**Chapter-to-chapter on a locked iPhone** is the riskiest part of the build. The intended
approach is one audio element whose `src` is swapped on `ended`, with the next chapter
preloaded so the swap is instant. Whether iOS Safari allows the swap and `play()` while
the screen is locked must be **proven on Andrew's iPhone before the rest is built** (see
Build order). If it doesn't work, stop and bring the finding back. Don't quietly fall
back to "one chapter per tap", which would fail goal 1.

### Choosing the driver

- Treat the selected translation as ESV when its name, trimmed and case-insensitive, is
  `ESV` or starts with `ESV` followed by a non-letter (`ESV 2016`, `ESV (2025)`). *(My
  call.)*
- For ESV readers, the Voice menu gains a first option, **"ESV recording (Crossway)"**,
  which is the default. Choosing any speech voice switches to speech. *(My call.)* The
  choice is saved like today's voice setting.
- The Speed control applies to recordings too (`playbackRate`, keeping pitch). *(My
  call.)*

### The player in recording mode

This matches layout A in the mockup, in the existing dock's styling.

- **Eyebrow:** "ESV recording", replacing "Browser audio". **Title:** the current
  chapter. **Line under it:** "Reading 6 of 10 · 2 min 40 sec left in this chapter".
- **Timeline:** spans today's chapters in minutes, with a marker at each chapter start
  (tap to jump). It reads "17:52 of 38:30" and "20 min left today". Chapters already
  marked Done show as played and are skipped. Total length comes from each MP3's
  metadata, so until it is known, show what is known without inventing numbers. How to
  get durations up front (for example `preload="metadata"` on the queued chapters) is the
  builder's call.
- **Controls while playing:** −15 s, previous chapter, Pause, next chapter, +15 s. *(15
  s is my call.)*
- **With a saved place and not playing:** the main button reads "Resume from m:ss", with
  Start over beside it.
- **Credit line, always visible in recording mode:** "ESV® audio © Crossway · esv.org",
  where esv.org links to <https://www.esv.org>.
- **Lost connection:** pause, keep the place, and show a short notice inside the player:
  "Lost the connection. Your place is saved. Press Play when you have signal."

### Lock screen (MediaSession)

Set `navigator.mediaSession.metadata` per chapter (title: "Acts 28"; artist: "ESV ·
Day 214"; album: "Grant Horner reading plan"; artwork: the app icon). Handle `play`,
`pause`, `seekbackward` and `seekforward` (15 s), and `seekto`. **Do not register
`previoustrack`/`nexttrack`**: Andrew wants the lock screen and AirPods to skip 15 s, and
iOS shows only one pair. The spike confirms what iOS actually shows. Chapter skipping
stays in the in-page player. Keep `setPositionState` current so the lock-screen scrubber
is right.

### Resume

- Save `{ day, translation, ref, seconds }` in `state` while playing (every few seconds),
  on pause, and on `pagehide`/`visibilitychange`.
- The place is valid only if `day` equals `state.day`, `translation` still selects ESV,
  and `ref` is still one of today's readings and not Done. Otherwise ignore it. Validate
  it in `loadState` like the rest of saved state (see `AGENTS.md`). Complete Day clears
  it.
- Resuming seeks to `max(0, seconds − 3)`.
- **Start over:** undoable through the existing Undo toast, which restores the previous
  place.

### Auto-Done

When the file driver reaches `ended` on a chapter, call the same code the Done button
uses (`setDone`), without its scroll jump, then continue to the next chapter. Since
playback never auto-scrolls, a card disappearing from view is expected.

### Service worker

`sw.js` already ignores `/api/*` and cross-origin audio, so nothing is cached. Keep it
that way, and add a comment there saying why (the caching terms).

## Build order and acceptance

1. **Spike, on Andrew's iPhone:** a throwaway page on a Preview deploy plays two
   chapters back to back through the function, with the screen locked from the start of
   chapter one. It passes only if chapter two starts by itself while locked and the lock
   screen shows the right title. Report the result before continuing.
2. The function with tests: ref validation, redirect pass-through, cache headers, the
   key missing from responses, and error mapping, with `fetch` stubbed.
3. Extract the driver interface, then build `FileDriver` and MediaSession.
4. Driver choice, the player UI (layout A), resume, and auto-Done. Write the logic as
   pure functions taking `st` with tests (`AGENTS.md`). Run
   `node --test test/*.test.js`.
5. Check visuals over CDP at 1280 px and 390 px, light and dark.
6. **Acceptance on the iPhone** (Preview deploy first, then production):
   - Lock the screen in chapter one. Every remaining chapter plays to the end with no
     taps.
   - Lock-screen and AirPods play/pause work, and skip jumps 15 s.
   - Turn on airplane mode mid-chapter. It stops with the notice, and Play after
     reconnecting resumes about 3 s before the drop.
   - Close the tab mid-chapter and reopen. The top button says Resume with the right
     chapter, and the player says "Resume from m:ss".
   - A chapter that finishes is marked Done.
   - KJV and the speech voices behave exactly as before.

Branch, not `main`. Pushing `main` deploys production. Andrew approves commits and pushes
separately.

## Left to the builder

The CDN TTL, how durations are fetched, the driver code structure, whether the book table
is shared or duplicated, exact copy beyond what is quoted above, and the visual details
within the existing dock style.
