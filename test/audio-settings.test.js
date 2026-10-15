const test = require("node:test");
const assert = require("node:assert");

const { voiceOptionsHtml, clampRate, initialState } = require("../app.js");

const VOICES = [
  { name: "Samantha", lang: "en-US" },
  { name: "Daniel", lang: "en-GB" },
  { name: "American Voice 5", lang: "en-US" }
];

test("the saved voice is the one marked selected", () => {
  const html = voiceOptionsHtml(VOICES, "American Voice 5");
  assert.match(html, /<option value="American Voice 5" selected>/);
  assert.strictEqual(html.match(/selected/g).length, 1);
});

test("no option is preselected when the saved voice is not installed on this device", () => {
  const html = voiceOptionsHtml(VOICES, "Voice From Another Phone");
  assert.doesNotMatch(html, /selected/);
});

test("an empty voice list still renders a placeholder option", () => {
  const html = voiceOptionsHtml([], "Samantha");
  assert.match(html, /<option/);
  assert.doesNotMatch(html, /selected/);
});

test("voice names with quotes cannot break out of the value attribute", () => {
  const html = voiceOptionsHtml([{ name: 'Ro"bot', lang: "en-US" }], 'Ro"bot');
  assert.doesNotMatch(html, /value="Ro"bot"/);
  assert.match(html, /&quot;/);
});

test("speed is clamped to the range the slider offers", () => {
  assert.strictEqual(clampRate(1.25), 1.25);
  assert.strictEqual(clampRate(0.1), 0.75);
  assert.strictEqual(clampRate(9), 1.5);
  assert.strictEqual(clampRate("abc"), 1);
  assert.strictEqual(clampRate(undefined), 1);
});

test("a fresh plan starts with no chosen voice and normal speed", () => {
  const state = initialState();
  assert.strictEqual(state.voice, "");
  assert.strictEqual(state.rate, 1);
});

const { pickVoice } = require("../app.js");

test("the default voice is English, not a Spanish voice that happens to say US", () => {
  const list = [{ name: "Paulina", lang: "es-US" }, { name: "Samantha", lang: "en-US" }];
  assert.strictEqual(pickVoice(list, "").name, "Samantha");
});

test("a saved voice wins over the English default", () => {
  const list = [{ name: "Samantha", lang: "en-US" }, { name: "Thomas", lang: "fr-FR" }];
  assert.strictEqual(pickVoice(list, "Thomas").name, "Thomas");
});

const WORLD = [
  { name: "Thomas", lang: "fr-FR" },
  { name: "Daniel", lang: "en-GB" },
  { name: "Anna", lang: "de-DE" },
  { name: "Samantha", lang: "en_US" }
];

test("only English voices are offered on an English-language device", () => {
  const names = [...voiceOptionsHtml(WORLD, "", ["en-US"]).matchAll(/value="([^"]+)"/g)].map(m => m[1]).filter(n => n !== "__device__");
  assert.deepStrictEqual(names.sort(), ["Daniel", "Samantha"]);
});

test("the device's own language is offered too, after English", () => {
  const names = [...voiceOptionsHtml(WORLD, "", ["fr-FR", "en-US"]).matchAll(/value="([^"]+)"/g)].map(m => m[1]).filter(n => n !== "__device__");
  assert.deepStrictEqual(names, ["Daniel", "Samantha", "Thomas"]);
});

test("a saved voice in another language stays selectable", () => {
  assert.match(voiceOptionsHtml(WORLD, "Anna", ["en-US"]), /<option value="Anna" selected>/);
});

// Real iOS list: Apple ships joke and 1980s MacInTalk voices tagged en-US.
const IOS = [
  { name: "Samantha", lang: "en-US" }, { name: "Samantha", lang: "en-US" },
  { name: "Albert", lang: "en-US" }, { name: "Bubbles", lang: "en-US" },
  { name: "Cellos", lang: "en-US" }, { name: "Fred", lang: "en-US" },
  { name: "Daniel", lang: "en-GB" }
];
const optionNames = html => [...html.matchAll(/value="([^"]+)"/g)].map(m => m[1]).filter(n => n !== "__device__");

test("novelty voices are left out of the picker", () => {
  const names = optionNames(voiceOptionsHtml(IOS, ""));
  for (const joke of ["Albert", "Bubbles", "Cellos", "Fred"]) assert.ok(!names.includes(joke), `${joke} listed`);
});

test("a voice listed twice by the device appears once", () => {
  assert.deepStrictEqual(optionNames(voiceOptionsHtml(IOS, "")), ["Samantha", "Daniel"]);
});

test("a novelty voice someone already chose stays selectable", () => {
  assert.match(voiceOptionsHtml(IOS, "Bubbles"), /<option value="Bubbles" selected>/);
});

test("the default voice is never a novelty voice", () => {
  const list = [{ name: "Albert", lang: "en-US" }, { name: "Samantha", lang: "en-US" }];
  assert.strictEqual(pickVoice(list, "").name, "Samantha");
});

// iOS Safari reports Apple's identifier as voiceURI, which names the quality tier.
const COMPACT = { name: "Samantha", lang: "en-US", voiceURI: "com.apple.voice.compact.en-US.Samantha" };
const ENHANCED = { name: "Samantha", lang: "en-US", voiceURI: "com.apple.voice.enhanced.en-US.Samantha" };
const PREMIUM = { name: "Ava", lang: "en-US", voiceURI: "com.apple.voice.premium.en-US.Ava" };

test("when a voice is listed twice, the higher-quality copy is the one used", () => {
  assert.strictEqual(pickVoice([COMPACT, ENHANCED], "Samantha").voiceURI, ENHANCED.voiceURI);
  assert.strictEqual(pickVoice([COMPACT, ENHANCED], "").voiceURI, ENHANCED.voiceURI);
});

test("the picker labels each voice's quality tier when the device reports it", () => {
  const html = voiceOptionsHtml([COMPACT, ENHANCED, PREMIUM, { name: "Daniel", lang: "en-GB", voiceURI: "Daniel" }], "");
  assert.match(html, />Samantha · en-US · Enhanced</);
  assert.doesNotMatch(html, /Compact/);
  assert.match(html, />Ava · en-US · Premium</);
  assert.match(html, />Daniel · en-GB</);
});

test("a compact voice with no better copy is labelled compact", () => {
  assert.match(voiceOptionsHtml([COMPACT], ""), />Samantha · en-US · Compact</);
});

test("the best-quality voices are listed first", () => {
  const html = voiceOptionsHtml([{ name: "Daniel", lang: "en-GB", voiceURI: "Daniel" }, COMPACT, PREMIUM], "", ["en-US"]);
  assert.deepStrictEqual(optionNames(html), ["Ava", "Samantha", "Daniel"]);
});

test("with no saved voice, the best-quality English voice is the default", () => {
  assert.strictEqual(pickVoice([COMPACT, PREMIUM], "").name, "Ava");
});

test("Apple's robotic Eloquence voices are left out, in either naming", () => {
  const names = optionNames(voiceOptionsHtml([
    { name: "Eddy (English (United States))", lang: "en-US" }, { name: "Grandma", lang: "en-GB" },
    { name: "Samantha", lang: "en-US" }
  ], "", ["en-US"]));
  assert.deepStrictEqual(names, ["Samantha"]);
});

// iOS Safari hides Premium voices from the list, so "Device default" leaves the
// utterance's voice unset and lets the phone use its own default English voice.
test("choosing the device default sets no voice", () => {
  assert.strictEqual(pickVoice([COMPACT, PREMIUM], "__device__"), null);
});

test("the device default is offered first and stays selected", () => {
  const html = voiceOptionsHtml([COMPACT], "__device__", ["en-US"]);
  assert.match(html, /^<option value="__device__" selected>Device default/);
  assert.doesNotMatch(html, /value="Samantha" selected/);
});
