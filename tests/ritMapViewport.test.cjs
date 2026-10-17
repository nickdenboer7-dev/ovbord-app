const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/ritMapViewport.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled.outputText, filename);
const { routeMapCenter, routeOverviewZoom, routeFollowZoom, panMapCenter, mapGpsLabel } = loaded.exports;

const vehicle = { lat: 52.3761, lon: 4.9028 };
const boarding = { lat: 52.364, lon: 4.883 };
const selected = { lat: 52.372, lon: 4.891 };

test("overview keeps both the GPS vehicle and user's stop in the central view", () => {
  assert.deepEqual(routeMapCenter("overview", vehicle, boarding, null, null), {
    lat: (vehicle.lat + boarding.lat) / 2, lon: (vehicle.lon + boarding.lon) / 2
  });
  const zoom = routeOverviewZoom(vehicle, boarding, 360, 415);
  assert.ok(zoom >= 11 && zoom <= 16);
});
test("follow mode tracks latest verified vehicle coordinate", () => {
  assert.deepEqual(routeMapCenter("follow", vehicle, boarding, null, selected), vehicle);
  const moved = { lat: 52.38, lon: 4.91 };
  assert.deepEqual(routeMapCenter("follow", moved, boarding, null, selected), moved);
});
test("tapping a stop keeps stop selected even when vehicle moves", () => {
  assert.deepEqual(routeMapCenter("stop", vehicle, boarding, null, selected), selected);
  assert.deepEqual(routeMapCenter("stop", { lat: 52.381, lon: 4.92 }, boarding, null, selected), selected);
});
test("never follow missing, stale or invalid GPS coordinates", () => {
  assert.deepEqual(routeMapCenter("follow", null, boarding, null, null), boarding);
  assert.deepEqual(routeMapCenter("follow", { lat: 0, lon: 0 }, boarding, null, null), boarding);
  assert.deepEqual(routeMapCenter("follow", { lat: 999, lon: 100 }, boarding, null, null), boarding);
  assert.deepEqual(routeMapCenter("overview", null, null, selected, null), selected);
  assert.equal(routeMapCenter("overview", null, null, null, null), null);
});
test("overview zoom handles far and missing points without throwing", () => {
  assert.equal(routeOverviewZoom(vehicle, vehicle, 360, 415), 16);
  assert.equal(routeOverviewZoom(null, boarding, 360, 415), 14);
  assert.equal(routeOverviewZoom(vehicle, boarding, 100, 415), 14);
  assert.equal(routeOverviewZoom({ lat: 52.1, lon: 4.1 }, { lat: 52.9, lon: 5.9 }, 360, 415), 11);
});

test("follow camera zoom includes verified next stop without losing vehicle center", () => {
  const nearStop = { lat: 52.3766, lon: 4.9031 };
  const farStop = { lat: 52.4, lon: 4.93 };
  assert.equal(routeFollowZoom(vehicle, nearStop, 360, 415), 16);
  assert.ok(routeFollowZoom(vehicle, farStop, 360, 415) < 16);
  assert.equal(routeFollowZoom(vehicle, null, 360, 415), 16);
});

test("drag moves camera opposite touch motion and remains in manual mode", () => {
  const moved = panMapCenter(vehicle, 15, 100, -50);
  assert.ok(moved);
  assert.ok(moved.lon < vehicle.lon);
  assert.ok(moved.lat < vehicle.lat);
  assert.deepEqual(routeMapCenter("manual", {lat:52.8,lon:5.2}, boarding, null, moved), moved);
  assert.equal(panMapCenter(null, 15, 100, 20), null);
  assert.equal(panMapCenter(vehicle, 15, Infinity, 20), null);
});

test("GPS status warns about old fixes and never labels estimates live", () => {
  assert.equal(mapGpsLabel(12, true, false).tone, "green");
  assert.equal(mapGpsLabel(35, true, false).tone, "amber");
  assert.match(mapGpsLabel(65, false, false).text, /niet live/);
  assert.equal(mapGpsLabel(150, false, false).tone, "red");
  assert.equal(mapGpsLabel(undefined, false, false).tone, "muted");
  assert.equal(mapGpsLabel(10, true, true).tone, "muted");
});

test("on lost GPS follow remains at last safe center, with no false vehicle fix", () => {
  assert.deepEqual(routeMapCenter("follow", null, boarding, null, vehicle), vehicle);
});
