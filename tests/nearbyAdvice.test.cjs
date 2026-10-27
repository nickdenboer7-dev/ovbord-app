const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const old = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename
);
const { compareNearbyDepartures, nearbyLeaveAdvice, firstNearbyDeparture, compactNearbyStopName } = require("../lib/buurtbord.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-25T22:00:00Z");
const stop = (id, walkMinutes) => ({ id, name: id, city: "Leeuwarden", walkMinutes, lines: [], mode: "bus" });
const dep = (id, minutes, extra = {}) => ({
  id, line: "25", destination: "Busstation", carrier: "Qbuzz",
  plannedTime: "23:00", expectedTime: "23:00", isLive: true,
  effectiveAt: new Date(now + minutes * 60000).toISOString(), ...extra
});

test("compact Buurtbord omits the redundant city prefix but preserves unusual stop names", () => {
  assert.equal(compactNearbyStopName({ name: "Leeuwarden, Bordineweg", city: "Leeuwarden" }), "Bordineweg");
  assert.equal(compactNearbyStopName({ name: "Bordineweg", city: "Leeuwarden" }), "Bordineweg");
  assert.equal(compactNearbyStopName({ name: "Amsterdam Zuid", city: "Amsterdam" }), "Amsterdam Zuid");
});

test("compact Buurtbord selects the chronologically earliest upcoming trip, ignoring old and cancelled rows", () => {
  const trips = [
    dep("later", 12, { isLive: false }),
    dep("cancelled", 1, { cancelled: true }),
    dep("departed", 2, { departed: true }),
    dep("past", -2),
    dep("soon", 5, { expectedTime: "23:05", isLive: true }),
    dep("unknown", 0, { effectiveAt: undefined, plannedTime: "--:--", expectedTime: undefined })
  ];
  assert.equal(firstNearbyDeparture(trips, now).id, "soon");
  assert.deepEqual(trips.map(t => t.id), ["later", "cancelled", "departed", "past", "soon", "unknown"]);
  assert.equal(firstNearbyDeparture(trips.filter(t => t.id !== "soon" && t.id !== "later"), now), null);
});

test("smart Buurtbord prefers a comfortable walk over an earlier but tight departure", () => {
  const items = [stop("Uiterdijksterweg", 7), stop("Bordineweg", 4)];
  const rows = { Uiterdijksterweg: [dep("tight", 8)], Bordineweg: [dep("safe", 11)] };
  const options = compareNearbyDepartures(items, rows, now);
  assert.deepEqual(options.map((o) => o.stop.id), ["Bordineweg", "Uiterdijksterweg"]);
  assert.deepEqual(options.map((o) => [o.departureInMinutes, o.walkMinutes, o.spareMinutes, o.tight]),
    [[11, 4, 7, false], [8, 7, 1, true]]);
});

test("advice skips cancelled, departed, stale and unreachable departures", () => {
  const items = [stop("Bordineweg", 4), stop("Uiterdijksterweg", 7), stop("Far", 20)];
  const rows = {
    Bordineweg: [dep("cancelled", 6, { cancelled: true }), dep("stale", 7, { liveDataStale: true }), dep("ok", 9)],
    Uiterdijksterweg: [dep("departed", 8, { departed: true }), dep("ok2", 11)],
    Far: [dep("too-early", 3)]
  };
  const options = compareNearbyDepartures(items, rows, now, new Set(["Uiterdijksterweg"]));
  assert.deepEqual(options.map((o) => o.stop.id), ["Bordineweg"]);
  assert.equal(options[0].departure.id, "ok");
});

test("reachable departures within an hour outrank a safe but hours-later journey", () => {
  const options = compareNearbyDepartures(
    [stop("SafeTomorrow", 10), stop("TightNow", 7), stop("SafeSoon", 4)],
    { SafeTomorrow: [dep("far", 321)], TightNow: [dep("tight", 8)], SafeSoon: [dep("soon", 25)] }, now);
  assert.deepEqual(options.map((o) => o.stop.id), ["SafeSoon", "TightNow", "SafeTomorrow"]);
  assert.deepEqual(options.map((o) => o.withinHour), [true, true, false]);
});

test("five-hour-later departure gets a leaving clock, not a leave-now instruction", () => {
  const [option] = compareNearbyDepartures([stop("SnekerTrekweg", 10)],
    { SnekerTrekweg: [dep("far", 321)] }, now);
  const advice = nearbyLeaveAdvice(option, now);
  assert.equal(advice.later, true);
  assert.equal(advice.leaveInMinutes, 306);
  assert.equal(advice.leaveText, "Vertrek rond 04:06");
  assert.equal(advice.marginText, "circa 5 min extra marge");
});

test("nearby advice says leave in ten minutes or now only when needed", () => {
  const options = compareNearbyDepartures([stop("A", 10), stop("B", 10), stop("C", 10)],
    { A: [dep("normal", 25)], B: [dep("quick", 14)], C: [dep("tight", 11)] }, now);
  const byStop = Object.fromEntries(options.map((option) => [option.stop.id, nearbyLeaveAdvice(option, now)]));
  assert.equal(byStop.A.leaveText, "Vertrek over 10 min");
  assert.equal(byStop.B.leaveText, "Vertrek nu");
  assert.equal(byStop.B.marginText, "slechts 4 min speling");
  assert.equal(byStop.C.leaveText, "Vertrek nu");
  assert.equal(byStop.C.marginText, "slechts 1 min speling");
});

test("same stop prefers a comfortable departure within the hour to an earlier tight one", () => {
  const [option] = compareNearbyDepartures([stop("Local", 7)],
    { Local: [dep("early-tight", 8), dep("later-safe", 20), dep("tomorrow", 321)] }, now);
  assert.equal(option.departure.id, "later-safe");
  assert.equal(option.withinHour, true);
  assert.equal(nearbyLeaveAdvice(option, now).leaveText, "Vertrek over 8 min");
});

test("same N85 journey prefers Dam one minute away over Rokin five minutes away", () => {
  const options = compareNearbyDepartures(
    [stop("Rokin", 5), stop("Dam", 1)],
    {
      Rokin: [dep("rokin", 12, { line: "N85", destination: "Centraal Station" })],
      Dam: [dep("dam", 14, { line: "N85", destination: "Centraal Station" })]
    }, now);
  assert.deepEqual(options.map((option) => option.stop.id), ["Dam", "Rokin"]);
  assert.equal(options[0].spareMinutes, 13);
  assert.equal(nearbyLeaveAdvice(options[0], now).leaveText, "Vertrek over 8 min");
});

test("a different line, destination or much later trip never steals the best-stop advice", () => {
  const rokin = stop("Rokin", 5);
  for (const alternative of [
    dep("another-line", 14, { line: "N87", destination: "Centraal Station" }),
    dep("another-destination", 14, { line: "N85", destination: "Bijlmer ArenA" }),
    dep("too-late", 20, { line: "N85", destination: "Centraal Station" })
  ]) {
    const options = compareNearbyDepartures([rokin, stop("Dam", 1)],
      { Rokin: [dep("rokin", 12, { line: "N85", destination: "Centraal Station" })], Dam: [alternative] }, now);
    assert.equal(options[0].stop.id, "Rokin");
  }
});

test("same service does not favor a later stop when the walk is no shorter", () => {
  const options = compareNearbyDepartures([stop("Rokin", 5), stop("Dam", 5)],
    { Rokin: [dep("rokin", 12)], Dam: [dep("dam", 14)] }, now);
  assert.equal(options[0].stop.id, "Rokin");
});

test("unknown walking time is not silently guessed; caller must have current GPS", () => {
  const items = [stop("Unknown", undefined), stop("Negative", -1)];
  assert.deepEqual(compareNearbyDepartures(items, { Unknown: [dep("a", 10)], Negative: [dep("b", 10)] }, now), []);
  const ui = fs.readFileSync(require("node:path").join(__dirname, "../app/(tabs)/buurtbord.tsx"), "utf8");
  assert.match(ui, /hasCurrentGps = !manualCity/);
  assert.match(ui, /liveBron === "gps"/);
  assert.match(ui, /DICHTBIJ JOU/);
});
