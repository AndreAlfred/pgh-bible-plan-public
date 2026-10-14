# Chapter-level audio: what's available, and who to ask

Research from 2026-08-01. Written down because the conclusion is non-obvious and the
reasoning is easy to re-litigate: the blocker is **file granularity**, not licensing.

## The problem

The app reads a chapter at a time. Browser speech synthesis (TTS) can read any
translation, including an imported one, but it is verse-by-verse, robotic, and dies when
the phone locks. Real recorded audio would fix all three — if it can be addressed one
chapter at a time.

## What was checked

| Source | Narrator | Granularity | License | Usable |
|---|---|---|---|---|
| [LibriVox KJV](https://archive.org/details/bible_kjv_complete_2001_librivox) | Michael Armenta | ~127 files of 30–58 MB | Public domain (US) | No |
| [AudioTreasure KJV](https://www.audiotreasure.com/indexKJV.htm) | Stephen Johnston | One file per chapter | "Personal use only" | No |
| [mp3bible.ca](https://www.mp3bible.ca/) | Dan Wagner, 1999 | Unknown | Claims "copyright free" | Unverified |

They are **not** the same recording, so "offer both" was never a real choice.

- **LibriVox** is genuinely public domain, and Archive.org serves it well
  (`access-control-allow-origin: *`, `accept-ranges: bytes`, so cross-origin seeking
  works). But it ships multi-chapter blobs — even the per-book John item is 5 files for
  21 chapters. Splitting those into 1,189 chapters needs forced alignment against the
  text. That is a research project, not a feature.
- **AudioTreasure** has exactly the granularity we want and explicitly forbids the use we
  want. Not hotlinkable, not bundleable.
- **mp3bible.ca** had no discoverable MP3 URL pattern when probed.

## Conclusion

A licensed API is the primary path, not the backup. The two worth asking:

- **Bible Brain**, from **FCBH — Faith Comes By Hearing**, the largest audio-Bible
  producer in the world: decades of recordings in ~2,700 languages, including dramatized
  versions. Free for non-commercial use.
  <https://www.faithcomesbyhearing.com/audio-bible-resources/bible-brain>
- **API.Bible**, from the American Bible Society. Worth a separate ask because they carry
  **NASB** — the one plausible licensed route to the translation actually used daily.
  <https://api.bible/>

> **Addresses not verified.** Both operate developer signup / contact forms rather than a
> published licensing inbox. Send through the contact route listed on the sites above
> rather than guessing an address.

---

## Email 1 — Bible Brain (FCBH)

**Subject:** Audio Bible API access for a non-commercial reading-plan web app

> Hello,
>
> I'm building a free, non-commercial web app that tracks the Professor Grant Horner
> Bible Reading Plan — ten chapters a day across ten rotating lists. It's a static site
> with no accounts, no ads, and no revenue. It currently ships public-domain KJV text and
> falls back to browser speech synthesis for read-aloud, which works but sounds poor and
> stops when the phone locks.
>
> I'd like to use real recorded audio, and Bible Brain looks like the right fit. A few
> questions before I build against it:
>
> 1. Which English translations have audio available, and is chapter-level access
>    supported? The plan is chapter-based, so per-chapter addressing matters more to me
>    than anything else.
> 2. What are the terms for non-commercial use, and does audio carry different terms than
>    text?
> 3. Volume is modest: roughly ten chapter requests per reader per day.
> 4. May audio be played directly in a browser `<audio>` element, and may files be cached
>    on the user's own device for offline listening?
> 5. What attribution do you require, and where should it appear? I'm glad to display it
>    prominently.
>
> Happy to share the repository or a live link if that's useful.
>
> Thanks for making this available,
> Andrew Trimble

## Email 2 — API.Bible (American Bible Society)

**Subject:** NASB audio and text access for a non-commercial reading-plan web app

> Hello,
>
> I'm building a free, non-commercial web app that tracks the Professor Grant Horner
> Bible Reading Plan — ten chapters a day across ten rotating lists. It's a static site
> with no accounts, no ads, and no revenue. It ships public-domain KJV text today.
>
> I'm interested in API.Bible specifically because you carry the NASB, which is the
> translation I read. Two questions on that, and then the general ones:
>
> 1. Is **NASB audio** available through API.Bible, and is chapter-level access
>    supported?
> 2. Is NASB **text** available for a non-commercial app of this kind, or does Lockman
>    licensing have to be arranged separately? I'd rather ask than assume — I've
>    deliberately shipped no copyrighted translations.
> 3. What are the terms for non-commercial use, and do audio and text differ?
> 4. Volume is modest: roughly ten chapter requests per reader per day.
> 5. May audio play in a browser `<audio>` element, and may it be cached on the user's
>    device for offline listening?
> 6. What attribution do you require, and where should it appear?
>
> I noticed your audio guide mentions verse-level timecodes. If those are available, they
> would let me keep verse-level navigation with recorded audio, which would be ideal.
>
> Happy to share the repository or a live link.
>
> Thanks,
> Andrew Trimble

---

## If a key is granted

Design agreed on 2026-08-01, unbuilt as of this writing:

One player, one queue, one progress model, with **two peer drivers** behind a shared
interface (`load`, `play`, `pause`, `seek`, `onProgress`, `onEnded`):

- `FileDriver` — wraps `<audio>`, for licensed chapter recordings
- `SpeechDriver` — wraps the current speech synthesis, for imported translations

Deliberately **not** "real audio with a TTS fallback." TTS is the only thing that can
ever read an imported translation, so it is a peer driver, not a fallback. Naming shapes
maintenance, and "fallback" invites letting it rot.

Two constraints to design around:

- **Verse-level seeking is not possible in file mode** unless the source exposes verse
  timecodes. The scrubber genuinely differs between drivers — continuous time within a
  chapter versus verse-index stepping. Don't hide that behind a shared widget that lies
  about position.
- **The real prize is `<audio>` + MediaSession**: playback that survives a screen lock,
  plus lock-screen and AirPods controls. That should be an explicit acceptance criterion,
  not a hoped-for side effect.

Suggested order: source spike (does a key arrive?) → extract the driver interface →
`FileDriver` + MediaSession → mode selection UI → verify, including the iPhone
lock-screen test.
