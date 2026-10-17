const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, file
);
const offline = require("../lib/offline.ts");
const {usableOfflineRitCache,usableRitReturnCache,RIT_OFFLINE_CACHE_MAX_AGE_MS,RIT_RETURN_CACHE_MAX_AGE_MS} = require("../lib/ritReturnCache.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const at = (hhmm) => Date.parse("2026-10-15T" + hhmm + ":00+02:00");

// Offline-test 15-10: wat is "offline" en wat is een serverfout
test("only a request that never reached the server counts as offline", () => {
  const networkFailure = Object.assign(new Error("Network request failed"), { name: "RequestFailure", network: true });
  const timeout = Object.assign(new Error("OVbord timeout: /api/rit/1"), { name: "RequestFailure", timedOut: true });
  const http = Object.assign(new Error("OVbord API 503: /api/rit/1"), { name: "RequestFailure", status: 503 });
  assert.equal(offline.failureKind(networkFailure), "offline");
  assert.equal(offline.failureKind(timeout), "server");
  assert.equal(offline.failureKind(http), "server");
  assert.equal(offline.failureKind(new TypeError("x")), "server");
  assert.equal(offline.failureKind(null), "server");
});

// Ritverloop zonder cache (screenshot 1)
test("trip page without data explains offline instead of a generic error", () => {
  assert.equal(offline.ritUnavailableMessage("offline"), "Je bent offline. Dit ritverloop is nog niet op dit toestel geladen.");
  assert.equal(offline.ritUnavailableMessage("server"), "Ritgegevens tijdelijk niet beschikbaar.");
  assert.equal(offline.ritUnavailableMessage(null), "Geen gegevens beschikbaar");
});

// Eerder geopende rit opnieuw openen terwijl offline
test("an earlier opened trip is a fallback for 30 minutes, but never skips a request after 14 s", () => {
  const now = at("21:30");
  const entry = (ageMs, extra = {}) => ({ data: { id: "391344404", line: "394", stops: [], ...extra }, fetchedAt: now - ageMs });
  assert.equal(RIT_OFFLINE_CACHE_MAX_AGE_MS, 30 * 60000);
  assert.equal(usableOfflineRitCache(entry(20 * 60000), "391344404", "394", now), true);
  assert.equal(usableRitReturnCache(entry(20 * 60000), "391344404", "394", now), false);
  assert.equal(usableOfflineRitCache(entry(RIT_RETURN_CACHE_MAX_AGE_MS - 1), "391344404", "394", now), true);
  assert.equal(usableOfflineRitCache(entry(RIT_OFFLINE_CACHE_MAX_AGE_MS), "391344404", "394", now), false);
  assert.equal(usableOfflineRitCache(entry(1000), "391344404", "395", now), false, "wrong line");
  assert.equal(usableOfflineRitCache(entry(1000), "other", "394", now), false, "other trip");
  assert.equal(usableOfflineRitCache(entry(-1000), "391344404", "394", now), false, "future");
  assert.equal(usableOfflineRitCache(undefined, "391344404", "394", now), false);
});

// Live-informatie te overtuigend (screenshots 2 en 3)
test("a fresh GPS fix becomes 'last known' once refreshing fails", () => {
  const base = { ended: false, gpsFresh: true, gpsAgeSeconds: 16, lastKnown: false };
  assert.equal(offline.ritPositionText(base), "Live GPS · 16 sec geleden");
  assert.equal(offline.ritPositionText({ ...base, lastKnown: true }), "Laatst bekende GPS · 16 sec geleden");
  assert.equal(offline.ritPositionText({ ...base, lastKnown: true, gpsAgeSeconds: 130 }), "Laatst bekende GPS · 2 min geleden");
  assert.equal(offline.ritPositionText({ ...base, gpsFresh: false, gpsAgeSeconds: 80, lastKnown: true }), "GPS niet actueel · positie niet bevestigd");
  assert.equal(offline.ritPositionText({ ...base, ended: true, lastKnown: true }), "Rit beëindigd");
  assert.equal(offline.ritPositionText({ ended: false, gpsFresh: false, estimated: true, lastKnown: false }), "Geschatte positie · geen live GPS");
  assert.equal(offline.ritPositionText({ ended: false, gpsFresh: false, lastKnown: false }), "GPS-positie niet bevestigd");
});

test("notices name the time of the data still on screen", () => {
  const t = at("21:14");
  assert.equal(offline.clockLabel(t), "21:14");
  assert.equal(offline.clockLabel(undefined), "");
  assert.equal(offline.boardRefreshNotice("offline", t), "Geen internet · tijden van 21:14 worden niet meer gecontroleerd");
  assert.equal(offline.boardRefreshNotice("server", t), "Verversen mislukt · laatst geladen tijden (21:14) blijven zichtbaar");
  assert.equal(offline.boardRefreshNotice("offline", null), "Geen internet · tijden worden niet meer gecontroleerd");
  assert.equal(offline.ritRefreshNotice("offline", t),
    "Geen internet · ritgegevens van 21:14. OVbord ververst automatisch zodra er weer verbinding is.");
  assert.equal(offline.ritRefreshNotice("server", t), "Ritgegevens tijdelijk niet beschikbaar · laatst opgehaald om 21:14.");
});
