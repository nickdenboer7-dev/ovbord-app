const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const old = Module._extensions[".ts"];
Module._extensions[".ts"] = (m, filename) => {
  m._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename);
};
global.__DEV__ = true;
const { journeyExtras, isRouteMatchFailure } = require("../lib/flowLiveDetails.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

const ZERO_LAT = 52.10000;
const ZERO_LON = 4.90000;
const pos = m => ({lat: ZERO_LAT + m / 111320, lon: ZERO_LON});
function journey(gpsM, shapeDistances = [0,50,100,150,200,250], sidewaysM = 0) {
  const stops = [0, 100, 250].map((m, i) => ({
    id: "S" + i, name: "Stop " + i, ...pos(m), state: "future"
  }));
  const vehicle = pos(gpsM);
  vehicle.lon += sidewaysM / (111320 * Math.cos(vehicle.lat * Math.PI/180));
  return {
    id: "GVB_2059", mode: "bus", live: true, vehicle,
    gpsAgeSeconds: 4, estimatedPosition:false,
    stops, shape: shapeDistances.map(m => [pos(m).lat, pos(m).lon])
  };
}

test("before first stop is not classified as at or between when shape begins at first stop", () => {
  const j = journey(-25);
  const lines = [];
  const oldDebug = console.debug;
  console.debug = line => lines.push(String(line));
  try {
    const result = journeyExtras(j, j.stops, Date.now());
    assert.equal(result.liveLocation, null);
    assert.equal(result.liveReason, "before-first-stop");
    assert.equal(isRouteMatchFailure(result.liveReason), true);
    assert.match(lines.join("\n"), /rit GVB_2059: geen positie: before-first-stop, 25 m vóór eerste halte/);
  } finally { console.debug = oldDebug; }
});

test("beyond final stop is not classified as a stop when shape ends at last stop", () => {
  const j = journey(280);
  const result = journeyExtras(j, j.stops, Date.now());
  assert.equal(result.liveLocation, null);
  assert.equal(result.liveReason, "after-last-stop");
});

test("positions past stops on an extended shape are still rejected", () => {
  for (const [metres, expected] of [[-25, "before-first-stop"],[275,"after-last-stop"]]) {
    const j = journey(metres,[-60,-40,0,50,100,150,200,250,300]);
    const result = journeyExtras(j, j.stops, Date.now());
    assert.equal(result.liveLocation, null);
    assert.equal(result.liveReason, expected);
  }
});

test("positions on first, middle or last stop remain permitted", () => {
  for (const m of [0,100,250]) {
    const j = journey(m);
    const result = journeyExtras(j, j.stops, Date.now());
    assert.equal(result.liveReason, undefined, "valid GPS at " + m + "m");
    assert.equal(result.liveLocation?.source, "shape");
  }
});

test("65m route tolerance unchanged; rejected GPS reports its distance", () => {
  const j = journey(150, [0,50,100,150,200,250], 82);
  const lines = [];
  const oldDebug = console.debug;
  console.debug = line => lines.push(String(line));
  try {
    const result = journeyExtras(j, j.stops, Date.now());
    assert.equal(result.liveLocation, null);
    assert.equal(result.liveReason, "off-route");
    assert.match(lines.join("\n"), /rit GVB_2059: geen positie: off-route, 82 m van route/);
  } finally { console.debug = oldDebug; }
});

test("backend nextStopId cannot rescue GPS beyond a terminus", () => {
  for (const m of [-25,280]) {
    const j = journey(m);
    j.vehicle.nextStopId = "S1";
    const result = journeyExtras(j,j.stops,Date.now());
    assert.equal(result.liveLocation,null);
    assert.ok(["before-first-stop","after-last-stop"].includes(result.liveReason));
  }
});

test("without a shape, chord fallback cannot certify a bus before first stop", () => {
  const j = journey(-25);
  delete j.shape;
  const result = journeyExtras(j,j.stops,Date.now());
  assert.equal(result.liveLocation,null);
  assert.equal(result.liveReason,"before-first-stop");
});
test("without a shape, chord fallback cannot certify a bus after last stop", () => {
  const j = journey(280);
  delete j.shape;
  const result = journeyExtras(j,j.stops,Date.now());
  assert.equal(result.liveLocation,null);
  assert.equal(result.liveReason,"after-last-stop");
});
test("without a shape, interior chord location remains available", () => {
  const j = journey(150);
  delete j.shape;
  const result = journeyExtras(j,j.stops,Date.now());
  assert.equal(result.liveLocation?.source,"chord");
  assert.equal(result.liveLocation?.kind,"between");
});
