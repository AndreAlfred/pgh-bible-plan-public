# Professor Grant Horner Bible Reading Plan

Unofficial public-facing reading-plan tracker for the Professor Grant Horner Bible Reading Plan.

## Features

- Day 1 default for public users
- Ten independent rotating chapter lists
- Progress saved in browser `localStorage`
- KJV chapter text bundled as static JSON
- Bring-your-own Bible JSON import stored locally in browser IndexedDB
- Browser read-aloud controls for one chapter or all ten readings
- Export/import progress backup

## Copyright posture

This project intentionally does **not** include NASB95, ESV, NIV, or other copyrighted modern Bible translations. Imported Bible files remain in the user's browser and are not uploaded by this static app.

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
voice/speed persistence, and the chapter fetch cache. Not covered: anything touching the
DOM, which is still verified by hand in a browser.

