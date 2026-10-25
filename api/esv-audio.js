// SPIKE (throwaway): turns "Acts 28" into the ESV MP3's address without exposing the
// API key. The real version validates against the plan's book table; this one only
// checks the shape, which is enough for a Preview-only test.
const REF = /^(?:[1-3] )?[A-Za-z]+(?: [A-Za-z]+)* \d{1,3}$/;

module.exports = async (req, res) => {
  const ref = String(req.query.ref || "").trim();
  if (!REF.test(ref)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).send("Expected one whole chapter, like \"Acts 28\".");
  }
  const key = process.env.ESV_API_KEY;
  if (!key) {
    console.error("esv-audio: ESV_API_KEY is not set");
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("Recorded audio isn't configured.");
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
      res.setHeader("Location", location);
      return res.status(302).end();
    }
    console.error(`esv-audio: upstream ${upstream.status} for ${ref}`);
  } catch (err) {
    console.error(`esv-audio: ${err.name} for ${ref}`);
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(502).send("Couldn't reach the ESV audio service.");
};
