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
