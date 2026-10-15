# AGENTS.md

Notes for coding agents working on this repo. The README covers features and the BYO
Bible format; this file covers the traps, the reasons behind decisions, and how to verify.

## Shape of the app

- Plain static site: `index.html`, `app.js`, `styles.css`, `sw.js`, `data/kjv/*.json`
  (1,189 chapter files). No build step and deliberately **no `package.json`** — Vercel
  changes its build behaviour when it finds one.
- All state is one object, `state`, saved to localStorage under
  `pghBiblePlan.public.state.v1`. Theme choice is separate: `pghBiblePlan.theme`.
- `render()` rewrites all of `#app` with `innerHTML` on every change. Consequences:
  - Anything with live state (animations, a dragged slider, an open notice) is reset by
    a render. The audio scrubber guards against this (`scrubbing`), the card entrance
    animation only plays on the first render (`firstRender`), and the toast lives
    **outside** `#app` so `render()` can't delete it.
  - Never read settings back off DOM controls; keep them in `state`.

## Tests and verification

- Run `node --test test/*.test.js` — the glob matters; the directory form fails on Node 25.
- `app.js` exports its pure helpers under CommonJS. Write logic as pure functions taking
  `st` (e.g. `advanceDay`, `withDone`, `pickVoice`, `upcomingSlugs`) so it can be tested.
- For anything visual, drive real headless Chrome over CDP against
  `python3 -m http.server`: screenshot at 1280px and 390px, and capture console errors.
  The T3 preview pane failed to automate in this repo. Test dark mode by emulating
  `prefers-color-scheme`.
- Offline: load the site **twice** (the second load is the first the service worker
  controls), then **kill the server** and reload. CDP network emulation does not cover the
  worker's own fetches, so stopping the server is the honest test.

## Decisions worth knowing

- **Done marks** are stamped `"day:position"` per list. They lapse automatically when
  the list moves or the day changes. The day is in the stamp because short lists wrap
  (Proverbs is back on chapter 1 at day 32).
- **Undo** (Complete Day, Reset, Import progress) restores a snapshot of the previous
  state object. `advanceDay` must therefore return a new object and never mutate its
  input (tested). Undo is refused if `state` changed since, so it can't discard a later edit.
- **Saved state is validated** in `loadState` and `parseProgressFile`. An out-of-range
  position used to be saved and then crash every render, blanking the page on every
  reload. Damaged saved state is repaired from its day; a damaged import is rejected.
- **Dark mode** sets `data-theme` on `<html>`. An inline `<head>` script mirrors
  `applyTheme()` so there is no light flash; keep the two in sync. In dark mode `--ink`
  and `--vellum` swap roles. Gotcha: `[data-theme=dark] button` outranks single-class
  rules, so any `<button>` styled as an ink plate (`.dayplate`, `.audio-tab`) must restate
  its background. The same specificity issue caused a light-mode hover bug on `.primary`.
- **Offline** (`sw.js`): network-first for the page, `app.js` and `styles.css`, so a
  deploy always lands; cache-first for KJV chapters and fonts. Bump `VERSION` only if the
  cache layout changes. `vercel.json` serves `sw.js` with `no-cache`. Chapter errors
  decide "offline" by `err instanceof TypeError`, because `navigator.onLine` misses dead Wi-Fi.

## Speech (iOS Safari is the hard target)

- Read the comments around `primeSpeech` and `cancelSpeech` before touching audio. iOS
  drops `speak()` calls made after an `await`, and cancelling while nothing of ours is
  queued wedges the engine. Both workarounds were found on a real phone.
- The voice picker stores the **name**. Voices are filtered by name (Apple novelty voices
  like Bubbles and Cellos, and old MacInTalk voices like Fred and Albert, are all tagged
  `en-US`). Match English with `/^en/` — a looser `/us/` matched `es-US`.
- iOS lists downloaded voices twice under one name (e.g. compact and enhanced Samantha).
  We keep the best tier, read from `voiceURI` (`com.apple.voice.{compact|enhanced|premium}.…`)
  and show it in the menu, best tier first. **Confirmed on an iPhone** (Oct 2026): Safari
  exposes these identifiers ("Samantha · en-US · Compact" showed). Some voices (Daniel,
  Karen…) showed no tier, so not every iOS voiceURI follows that pattern. Chrome on
  macOS reports only the bare name.
- The menu offers English voices plus the device's own language (`navigator.languages`),
  so someone reading an imported non-English Bible still gets a voice. Apple's
  Eloquence voices ("Eddy (English (United States))") are hidden with the novelty ones.
- **iOS Safari hides Enhanced and Premium voices** from `getVoices()`. Andrew's iPhone had
  Samantha Enhanced and Ava Premium installed, but only compact Samantha was listed.
  Siri voices are never exposed either. The "Device default" option (`DEVICE_VOICE`)
  leaves `utterance.voice` unset, so the phone uses its default English voice from
  Settings, which may be one of the hidden ones. Not yet confirmed that it is.

## Copyright and deploys

- The GitHub repo is **public**. Never commit modern translations (ESV, NASB, NIV…).
  `esv.json` is a local copy and is gitignored; imported Bibles stay in the browser's IndexedDB.
- Pushing `main` deploys to production on Vercel automatically
  (https://pgh-bible-plan-public.vercel.app). Check it with
  `gh api repos/AndreAlfred/pgh-bible-plan-public/commits/<sha>/statuses`, then `curl` the
  live files and headers. There is no Vercel CLI installed.
- Andrew approves commits and pushes separately from the work. Ask before either unless
  he has said to go ahead.

## Tooling gotcha

The local `dcg` safety hook blocks inline `python3 - <<EOF` scripts that contain `>`
characters (HTML strings look like redirects to it). Write the script to a file under
`/tmp` and run it with `python3 -I <file> <repo path>` instead.
