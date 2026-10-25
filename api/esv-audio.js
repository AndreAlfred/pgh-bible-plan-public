// SPIKE (throwaway): turns "Acts 28" into the ESV MP3's address without exposing the
// API key. The real version validates against the plan's book table; this one only
// checks the shape, which is enough for a Preview-only test.
const REF = /^(?:[1-3] )?[A-Za-z]+(?: [A-Za-z]+)* \d{1,3}$/;

// ?format=json answers {"url": …} instead of redirecting. iOS loads <audio> through its
// media stack, which may not carry the page's cookies (Vercel's Preview login), so the
// page can resolve the address itself and hand the MP3 URL straight to the player.
function fail(res, status, message, json) {
  res.setHeader("Cache-Control", "no-store");
  return json ? res.status(status).json({ error: message }) : res.status(status).send(message);
}

module.exports = async (req, res) => {
  const json = req.query.format === "json";
  const ref = String(req.query.ref || "").trim();
  if (!REF.test(ref)) return fail(res, 400, "Expected one whole chapter, like \"Acts 28\".", json);
  const key = process.env.ESV_API_KEY;
  if (!key) {
    console.error("esv-audio: ESV_API_KEY is not set");
    return fail(res, 503, "Recorded audio isn't configured (no ESV_API_KEY on this deployment).", json);
  }
  try {
    const upstream = await fetch(`https://api.esv.org/v3/passage/audio/?q=${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Token ${key}` },
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
    const location = upstream.headers.get("location");
    if (upstream.status === 302 && location) {
      res.setHeader("Cache-Control", "public, s-maxage=2592000");
      if (json) return res.status(200).json({ url: location });
      res.setHeader("Location", location);
      return res.status(302).end();
    }
    console.error(`esv-audio: upstream ${upstream.status} for ${ref}`);
    return fail(res, 502, `The ESV service answered ${upstream.status}.`, json);
  } catch (err) {
    console.error(`esv-audio: ${err.name} for ${ref}`);
    return fail(res, 502, "Couldn't reach the ESV audio service.", json);
  }
};
