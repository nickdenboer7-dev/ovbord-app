const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const repo = path.join(__dirname, "..");

Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  }}).outputText, file);

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "./boardCache" && parent?.filename.endsWith("api.ts")) return { rememberBoard: () => {} };
  if (request === "@react-native-async-storage/async-storage") return { default: {
    getItem: async () => null, setItem: async () => {}
  }};
  return originalLoad.call(this, request, parent, isMain);
};
global.__DEV__ = true;

const { normalizeRit } = require("../lib/api.ts");
const { journeyExtras } = require("../lib/flowLiveDetails.ts");
const { firstPlannedDepartureMs, tripNotYetStarted, firstDepartureClock } = require("../lib/ritStartGuard.ts");
const qaDir = path.join(__dirname, "fixtures");

function loadJourney(id) {
  const raw = JSON.parse(fs.readFileSync(path.join(qaDir, id + "-api-rit.json"), "utf8"));
  return normalizeRit(id, raw);
}

test("N85 real API snapshot: first stop is backend-current, but journey has not begun", () => {
  const j = loadJourney("GVB_1413");
  const at = Date.parse("2026-11-11T01:18:00+01:00");
  assert.equal(j.stops[0].state, "current");
  assert.equal(j.stops[0].plannedDepartureTime, "01:42");
  assert.equal(j.stops[0].plannedDepartureAt, "2026-11-11T01:42:00+01:00");
  assert.equal(firstDepartureClock(j), "01:42");
  assert.equal(tripNotYetStarted(j, at), true);

  const diagnostic = [];
  const original = console.debug;
  console.debug = line => diagnostic.push(String(line));
  try {
    const info = journeyExtras(j, j.stops, at);
    assert.equal(info.liveLocation, null, "GPS from another service cannot prove this future journey is underway");
    assert.equal(info.liveReason, "before-trip-start");
    assert.match(diagnostic.join("\n"), /rit GVB_1413: geen positie: before-trip-start, vertrek over 24 min/);
  } finally {
    console.debug = original;
  }
});

test("EBS 394 real API snapshot: a journey already past its scheduled start is not blocked", () => {
  const j = loadJourney("EBS_4227");
  const at = Date.parse("2026-11-11T01:19:21+01:00");
  assert.ok(firstPlannedDepartureMs(j) < at);
  assert.equal(tripNotYetStarted(j, at), false);
  assert.notEqual(journeyExtras(j, j.stops, at).liveReason, "before-trip-start");
});

test("strict boundary: one second before planned departure is not underway, exactly at start is eligible", () => {
  const j = loadJourney("GVB_1413");
  const start = firstPlannedDepartureMs(j);
  assert.ok(start);
  assert.equal(tripNotYetStarted(j, start - 1), true);
  assert.equal(tripNotYetStarted(j, start), false);
  assert.equal(tripNotYetStarted(j, start + 1), false);
});

test("absolute dates prevent a false midnight crossover", () => {
  const fake = {stops: [{
    plannedDepartureAt: "2026-11-12T00:02:00+01:00",
    plannedDepartureTime: "00:02"
  }]};
  assert.equal(tripNotYetStarted(fake, Date.parse("2026-11-11T23:55:00+01:00")), true);
  assert.equal(tripNotYetStarted(fake, Date.parse("2026-11-12T00:02:00+01:00")), false);
});

test("missing or ambiguous date cannot invent a pre-start status", () => {
  assert.equal(tripNotYetStarted(null, Date.now()), false);
  assert.equal(tripNotYetStarted({stops: [{plannedDepartureTime:"01:42"}]}, Date.now()), false);
  assert.equal(tripNotYetStarted({stops: [{plannedDepartureAt:"2026-11-11T01:42:00"}]}, Date.now()), false);
  assert.equal(tripNotYetStarted({stops: [{plannedDepartureAt:"garbled"}]}, Date.now()), false);
});

test("timeline and map both suppress GPS claiming a future journey has begun", () => {
  const page = fs.readFileSync(path.join(repo, "app/rit/[id].tsx"), "utf8");
  assert.match(page, /const beforeTripStart = tripNotYetStarted\(journey, nowMs\)/);
  assert.match(page, /beforeTripStart \? "Rit nog niet begonnen/);
  assert.match(page, /<TripMap journey=\{journey\} live=\{gpsFresh && !beforeTripStart\} preStart=\{beforeTripStart\}/);
  assert.match(page, /const busPoint=live&&!preStart&&!journey\.estimatedPosition/);
  assert.match(page, /const gpsLabel=preStart \? \{text:"Rit nog niet begonnen",tone:"muted" as const\}/);
});


test("N94 actual API response: minus 3600 seconds must not shift a future trip by one hour", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(qaDir,"EBS_4418-api-rit.json"),"utf8"));
  assert.equal(raw.delay,-3600);
  const at = Date.parse("2026-11-11T02:08:00+01:00");
  const j = normalizeRit("EBS_4418",raw,at);
  assert.equal(j.stops[0].plannedTime,"03:25");
  assert.equal(j.stops[0].expectedTime,"03:25");
  assert.equal(j.stops[0].timingSource,"schedule");
  assert.equal(j.stops[1].expectedTime,"03:27");
  assert.equal(tripNotYetStarted(j,at),true);
  assert.equal(journeyExtras(j,j.stops,at).liveReason,"before-trip-start");
});

test("one-hour trip-wide delay is not applied even after scheduled start", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(qaDir,"EBS_4418-api-rit.json"),"utf8"));
  const at = Date.parse("2026-11-11T03:26:00+01:00");
  const j = normalizeRit("EBS_4418",raw,at);
  assert.equal(j.stops[0].expectedTime,"03:25");
  assert.equal(j.stops[1].expectedTime,"03:27");
});

test("reasonable trip estimate remains usable after journey begins", () => {
  const raw = JSON.parse(fs.readFileSync(path.join(qaDir,"EBS_4418-api-rit.json"),"utf8"));
  raw.delay = 120;
  raw.gps_age_seconds = 8;
  const at = Date.parse("2026-11-11T03:26:00+01:00");
  const j = normalizeRit("EBS_4418",raw,at);
  assert.equal(j.stops[0].expectedTime,"03:27");
  assert.equal(j.stops[1].expectedTime,"03:29");
  assert.equal(j.stops[0].timingSource,"journey_estimate");
});
