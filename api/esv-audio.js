// Turns a chapter reference ("Acts 28") into the ESV recording's address, holding the
// Crossway API key server-side: their terms forbid publishing it, and this repo is
// public. Only whole chapters of the plan's books get through, because this endpoint is
// necessarily public and every call to Crossway spends the site's shared daily quota.
//
//   GET /api/esv-audio?ref=Acts%2028              -> 302 to the MP3
//   GET /api/esv-audio?ref=Acts%2028&format=json  -> { url, seconds }
//
// The page uses the JSON form before the tap, because iOS only starts audio
// synchronously inside a gesture. The 302 form is its fallback for <audio src>.
const { BOOKS } = require("../app.js");

// Crossway's MP3s are constant 128 kbps, so size gives length to within a second.
const BYTES_PER_SECOND = 128000 / 8;
const CDN_CACHE = "public, s-maxage=2592000";

function parseChapterRef(ref) {
  const m = /^(.+) (\d{1,3})$/.exec(String(ref || "").trim());
  if (!m || !Object.hasOwn(BOOKS, m[1])) return null;
  const chapter = Number(m[2]);
  return chapter >= 1 && chapter <= BOOKS[m[1]] ? { book: m[1], chapter } : null;
}
// "Jude 1" means verse 1 to the ESV API (an 8-second file); single-chapter books have
// to be asked for by name to get the whole chapter.
function esvQuery({ book, chapter }) {
  return BOOKS[book] === 1 ? book : `${book} ${chapter}`;
}
// Forgive the usual paste damage: whitespace, quotes, or a copied "Token " prefix.
function cleanKey(raw) {
  return String(raw || "").trim().replace(/^["']|["']$/g, "").replace(/^Token\s+/i, "").trim();
}

async function durationSeconds(url) {
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    const bytes = Number(head.headers.get("content-length"));
    return head.ok && bytes > 0 ? Math.round((bytes / BYTES_PER_SECOND) * 10) / 10 : null;
  } catch {
    return null;
  }
}

function fail(res, status, message, json) {
  res.setHeader("Cache-Control", "no-store");
  return json ? res.status(status).json({ error: message }) : res.status(status).send(message);
}

async function handler(req, res) {
  const json = req.query.format === "json";
  const parsed = parseChapterRef(req.query.ref);
  if (!parsed) return fail(res, 400, "Expected one whole chapter of the plan, like \"Acts 28\".", json);
  const key = cleanKey(process.env.ESV_API_KEY);
  if (!key) {
    console.error("esv-audio: ESV_API_KEY is not set");
    return fail(res, 503, "Recorded audio isn't configured.", json);
  }
  const ref = `${parsed.book} ${parsed.chapter}`;
  let upstream;
  try {
    upstream = await fetch(`https://api.esv.org/v3/passage/audio/?q=${encodeURIComponent(esvQuery(parsed))}`, {
      headers: { Authorization: `Token ${key}` },
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    console.error(`esv-audio: ${err.name} for ${ref}`);
    return fail(res, 502, "Couldn't reach the ESV audio service.", json);
  }
  const url = upstream.headers.get("location");
  if (upstream.status !== 302 || !url) {
    console.error(`esv-audio: upstream ${upstream.status} for ${ref}`);
    return fail(res, 502, `The ESV audio service answered ${upstream.status}.`, json);
  }
  res.setHeader("Cache-Control", CDN_CACHE);
  if (json) return res.status(200).json({ url, seconds: await durationSeconds(url) });
  res.setHeader("Location", url);
  return res.status(302).end();
}

module.exports = handler;
module.exports.parseChapterRef = parseChapterRef;
module.exports.esvQuery = esvQuery;
module.exports.cleanKey = cleanKey;
