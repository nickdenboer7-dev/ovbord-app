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
const {journeyEnded,minutesSinceClock,ritShareText,JOURNEY_END_GRACE_MINUTES} = require("../lib/ritLifecycle.ts");
const {reachableOnFoot} = require("../lib/buurtbord.ts");
const {shouldRetryRequest} = require("../lib/api.ts");
const {boardLineFilterKey} = require("../lib/boardLineFilters.ts");
const {themes} = require("../constants/colors.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

// 10:00 in Amsterdam (CEST)
const at = (hhmm) => Date.parse("2026-10-15T" + hhmm + ":00+02:00");
const trip = (lastClock, extra = {}) => ({ id:"r", line:"12", destination:"X", mode:"bus", polyline:[],
  stops:[{id:"a",name:"A",plannedTime:"09:00",state:"passed"},{id:"b",name:"B",plannedTime:lastClock,expectedTime:lastClock,state:"end"}], ...extra });

// Ritverloop: einde van de rit
test("trip counts as ended only after the grace period past the final stop", () => {
  assert.equal(JOURNEY_END_GRACE_MINUTES, 10);
  assert.equal(journeyEnded(trip("09:55"), at("10:00")), false);
  assert.equal(journeyEnded(trip("09:50"), at("10:00")), true);
  assert.equal(journeyEnded(trip("10:30"), at("10:00")), false);
});
test("feed-confirmed passing of the final stop ends the trip immediately", () => {
  const t = trip("10:30"); t.stops[1].state = "passed";
  assert.equal(journeyEnded(t, at("10:00")), true);
});
test("midnight and cancellations are handled conservatively", () => {
  assert.equal(minutesSinceClock("23:55", at("00:10")), 15);
  assert.equal(minutesSinceClock("00:20", at("23:50")), -30);
  assert.equal(journeyEnded(trip("23:58"), Date.parse("2026-10-16T00:05:00+02:00")), false);
  assert.equal(journeyEnded(trip("23:40"), Date.parse("2026-10-16T00:05:00+02:00")), true);
  assert.equal(journeyEnded(trip("09:00", { cancelled: true }), at("10:00")), false);
  assert.equal(journeyEnded(null, at("10:00")), false);
  assert.equal(journeyEnded(trip("--:--"), at("10:00")), false);
});

// Ritverloop: delen
test("share text is short, correct and honest about cancellation", () => {
  assert.equal(ritShareText({ line:"N85", destination:"Centraal Station", boardingName:"Weesperplein", boardingClock:"02:12", delayMinutes:2 }),
    "Lijn N85 naar Centraal Station: Weesperplein om 02:12 (+2 min).");
  assert.equal(ritShareText({ line:"Intercity", destination:"Rotterdam Centraal", boardingName:"Utrecht Centraal", boardingClock:"04:10", delayMinutes:0, platform:"Spoor 5" }),
    "Lijn Intercity naar Rotterdam Centraal: Utrecht Centraal om 04:10, spoor 5.");
  assert.equal(ritShareText({ line:"12", destination:"X", boardingName:"Y", boardingClock:"10:00", delayMinutes:-1 }),
    "Lijn 12 naar X: Y om 10:00 (−1 min).");
  assert.equal(ritShareText({ line:"355", destination:"Bolsward", cancelled:true, boardingName:"Sneek" }), "Lijn 355 naar Bolsward rijdt niet. (Sneek)");
  assert.equal(ritShareText({ line:"4", destination:"Zuid" }), "Lijn 4 naar Zuid.");
});

// Buurtbord: lopend haalbaar
test("departures you cannot walk to in time are flagged", () => {
  const now = at("10:00");
  const dep = (min) => ({ id:"d", line:"1", destination:"X", plannedTime:"", relativeText:"", reliability:"planned",
    effectiveAt: new Date(now + min * 60000).toISOString() });
  assert.equal(reachableOnFoot(dep(2), 4, now), false);
  assert.equal(reachableOnFoot(dep(4), 4, now), true);
  assert.equal(reachableOnFoot(dep(1), undefined, now), true);
  assert.equal(reachableOnFoot({ ...dep(1), effectiveAt: undefined, plannedTime: "??" }, 3, now), null);
});

// Netwerk: één herhaling bij een korte storing
test("only transient failures are retried", () => {
  assert.equal(shouldRetryRequest({ network: true }), true);
  for (const status of [502, 503, 504]) assert.equal(shouldRetryRequest({ status }), true, String(status));
  for (const status of [400, 404, 429, 500]) assert.equal(shouldRetryRequest({ status }), false, String(status));
  assert.equal(shouldRetryRequest({ timedOut: true, network: true }), false);
});

// Favoriete rit opent met lijnfilter
test("favourite trip line becomes the board's own filter key", () => {
  assert.equal(boardLineFilterKey("N85", "GVB"), "N85");
  assert.equal(typeof boardLineFilterKey("Intercity", "NS"), "string");
});

// Donkere modus: groene tekst leesbaar
test("accentText equals accent in light mode and is readable in dark mode", () => {
  assert.equal(themes.light.accentText, themes.light.accent);
  const L = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255)
    .map(v => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4)
    .reduce((s,v,i) => s + v*[0.2126,0.7152,0.0722][i], 0);
  const contrast = (a,b) => (Math.max(L(a),L(b))+0.05)/(Math.min(L(a),L(b))+0.05);
  for (const bg of [themes.dark.background, themes.dark.surface, themes.dark.accentSoft, themes.dark.successSoft])
    assert.ok(contrast(themes.dark.accentText, bg) >= 4.5, bg);
  assert.ok(contrast(themes.dark.accent, themes.dark.background) < 4.5, "old accent was too dark");
});
