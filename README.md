# Professor Grant Horner Bible Reading Plan

Unofficial public-facing reading-plan tracker for the Professor Grant Horner Bible Reading Plan.

## Features

- Day 1 default for public users
- Ten independent rotating chapter lists
- Progress saved in browser `localStorage`
- KJV chapter text bundled as static JSON
- Bring-your-own Bible JSON import stored locally in browser IndexedDB
- Browser read-aloud controls for one chapter or all ten readings
- ESV readers hear Crossway's recorded audio, which keeps playing with the phone locked, resumes where you left off, and marks each finished chapter Done
- Export/import progress backup
- Mark chapters done to hide them; Undo after Complete Day, Reset or import
- Dark mode that follows the device, with a sun/moon override
- Text shown verse by verse or flowing as one paragraph per chapter, with verse numbers on or off
- Works offline: chapters you open, plus the coming week's, are saved on the device

## Copyright posture

This project intentionally does **not** include NASB95, ESV, NIV, or other copyrighted modern Bible translations. ESV audio is streamed from Crossway's API (key held server-side) and never stored or cached by the app. Imported Bible files remain in the user's browser and are not uploaded by this static app.

This site is unofficial and is not affiliated with or endorsed by Professor Grant Horner, The Lockman Foundation, or any Bible publisher.

## BYO Bible JSON format

Preferred shape:

```json
{
  "translation": "My Translation",
  "chapters": {
    "Genesis 1": [
      { "v": 1, "t": "In the beginning..." }
    ]
  }
}
```

Also accepted: `chapters` as an array of chapter objects with `book`, `chapter`, and `verses`.

## Development

Static files, no build step and no dependencies. Open `index.html` through any local
server (`python3 -m http.server`) — opening it as a `file://` URL will not work, because
chapter text is loaded with `fetch`.

### Tests

`app.js` loads two ways: as a browser `<script>`, where it renders on load, and as a
CommonJS module, where only the pure helpers are exported. That makes the plan maths and
the file parsers testable with Node's built-in runner — no `package.json`, no install.

```bash
node --test test/*.test.js
```

Note the glob. `node --test test/` (the directory form) fails on Node 25.

There is deliberately no `package.json`: Vercel changes its build behaviour when it finds
one, and this project wants to stay a plain static deploy.

Covered: the ten-list rotation and day maths, progress-file and Bible-file parsing,
saved-state repair, voice/speed persistence, the chapter fetch cache, done marks,
Complete Day and its undo snapshot, the theme toggle rule, and the offline prefetch list.
Not covered: anything touching the DOM, which is still verified by hand in a browser.

### Offline (`sw.js`)

The service worker is network-first for the app itself (page, `app.js`, `styles.css`),
so a deploy reaches phones on their next online load — the cache is only the offline
fallback. KJV chapter files never change, so they are cache-first. `vercel.json` serves
`sw.js` with `no-cache` so browsers always see a new version of it.

Bump `VERSION` in `sw.js` only if the cache layout changes (names or strategy); it is
not needed for ordinary releases. To test offline locally, load the site twice (the
second load is the first one the worker controls), then stop the server and reload.

