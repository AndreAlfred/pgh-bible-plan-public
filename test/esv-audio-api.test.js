const test = require("node:test");
const assert = require("node:assert");

const handler = require("../api/esv-audio.js");
const { parseChapterRef, esvQuery, cleanKey } = handler;

const KEY = "0123456789abcdef0123456789abcdef01234567";

// Minimal stand-in for Vercel's response helpers.
function call(query) {
  return new Promise(resolve => {
    const out = { status: 200, headers: {} };
    const res = {
      setHeader(k, v) { out.headers[k] = v; },
      status(s) { out.status = s; return res; },
      send(body) { out.body = body; resolve(out); },
      json(body) { out.json = body; resolve(out); },
      end() { resolve(out); }
    };
    handler({ query }, res);
  });
}
// Stubs fetch: the API call and the HEAD for the MP3's size.
function withUpstream({ status = 302, location = "https://audio.esv.org/hw/Acts%2028.mp3", bytes = 4021786, throws = false } = {}, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (throws) throw Object.assign(new Error("boom"), { name: "TimeoutError" });
    if (opts.method === "HEAD") return new Response(null, { status: 200, headers: { "content-length": String(bytes) } });
    return new Response(null, { status, headers: location ? { location } : {} });
  };
  process.env.ESV_API_KEY = KEY;
  return run(calls).finally(() => { globalThis.fetch = original; delete process.env.ESV_API_KEY; });
}

test("only whole chapters of the plan's books are accepted", () => {
  assert.deepStrictEqual(parseChapterRef("Acts 28"), { book: "Acts", chapter: 28 });
  assert.deepStrictEqual(parseChapterRef("Song of Solomon 2"), { book: "Song of Solomon", chapter: 2 });
  assert.strictEqual(parseChapterRef("Acts 29"), null);
  assert.strictEqual(parseChapterRef("Acts 0"), null);
  assert.strictEqual(parseChapterRef("Acts 28:29"), null);
  assert.strictEqual(parseChapterRef("Psalm 23"), null, "the plan spells it Psalms");
  assert.strictEqual(parseChapterRef("constructor 1"), null);
  assert.strictEqual(parseChapterRef(""), null);
});

test("single-chapter books are asked for by name, because 'Jude 1' means verse 1", () => {
  assert.strictEqual(esvQuery({ book: "Jude", chapter: 1 }), "Jude");
  assert.strictEqual(esvQuery({ book: "3 John", chapter: 1 }), "3 John");
  assert.strictEqual(esvQuery({ book: "Acts", chapter: 28 }), "Acts 28");
});

test("pasted-key damage is cleaned up", () => {
  assert.strictEqual(cleanKey(`  Token ${KEY} \n`), KEY);
  assert.strictEqual(cleanKey(`"${KEY}"`), KEY);
  assert.strictEqual(cleanKey(undefined), "");
});

test("a bad reference is refused without calling Crossway", () => withUpstream({}, async calls => {
  const r = await call({ ref: "Acts 29", format: "json" });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.headers["Cache-Control"], "no-store");
  assert.strictEqual(calls.length, 0);
}));

test("the JSON form returns the MP3 address and its length, cached at the CDN", () => withUpstream({}, async calls => {
  const r = await call({ ref: "Acts 28", format: "json" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.json, { url: "https://audio.esv.org/hw/Acts%2028.mp3", seconds: 251.4 });
  assert.match(r.headers["Cache-Control"], /s-maxage=2592000/);
  assert.strictEqual(calls[0].opts.redirect, "manual");
  assert.strictEqual(calls[0].opts.headers.Authorization, `Token ${KEY}`);
  assert.match(calls[0].url, /q=Acts%2028$/);
}));

test("the plain form redirects straight to the MP3", () => withUpstream({}, async () => {
  const r = await call({ ref: "Jude 1" });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(r.headers.Location, "https://audio.esv.org/hw/Acts%2028.mp3");
}));

test("Crossway refusing the key becomes a 502 that never contains the key", () => withUpstream({ status: 403, location: null }, async () => {
  const r = await call({ ref: "Acts 28", format: "json" });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.headers["Cache-Control"], "no-store");
  assert.ok(!JSON.stringify(r).includes(KEY));
}));

test("a network failure becomes a 502", () => withUpstream({ throws: true }, async () => {
  const r = await call({ ref: "Acts 28" });
  assert.strictEqual(r.status, 502);
}));

test("a missing key is reported as not configured", async () => {
  delete process.env.ESV_API_KEY;
  const r = await call({ ref: "Acts 28", format: "json" });
  assert.strictEqual(r.status, 503);
});
