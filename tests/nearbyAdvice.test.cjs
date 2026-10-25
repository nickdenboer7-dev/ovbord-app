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
const { compareNearbyDepartures } = require("../lib/buurtbord.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-25T22:00:00Z");
const stop = (id, walkMinutes) => ({ id, name: id, city: "Leeuwarden", walkMinutes, lines: [], mode: "bus" });
const dep = (id, minutes, extra = {}) => ({
  id, line: "25", destination: "Busstation", carrier: "Qbuzz",
  plannedTime: "23:00", expectedTime: "23:00", isLive: true,
  effectiveAt: new Date(now + minutes * 60000).toISOString(), ...extra
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

test("unknown walking time is not silently guessed; caller must have current GPS", () => {
  const items = [stop("Unknown", undefined), stop("Negative", -1)];
  assert.deepEqual(compareNearbyDepartures(items, { Unknown: [dep("a", 10)], Negative: [dep("b", 10)] }, now), []);
  const ui = fs.readFileSync(require("node:path").join(__dirname, "../app/(tabs)/buurtbord.tsx"), "utf8");
  assert.match(ui, /hasCurrentGps = !manualCity/);
  assert.match(ui, /liveBron === "gps"/);
  assert.match(ui, /Vergelijk /);
});
