const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
};
const { favoriteWidgetModel } = require(path.resolve(__dirname, "../lib/androidWidgetData.ts"));
const { plannedAlightReminder } = require(path.resolve(__dirname, "../lib/journeyReminderPlan.ts"));
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-26T11:00:00Z"); // 12:00 Amsterdam
const item = (line, at, rest={}) => ({
  id: line + at, line, destination: "Centraal Station", plannedTime: at,
  relativeText: "", reliability: "planned", mode: "tram", ...rest
});
const board = (departures) => ({
  stop: { id: "stop-1", name: "Bilderdijkstraat", city: "Amsterdam", mode: "tram", lines: [] },
  departures, arrivals: [], disruptions: []
});

test("Android widget shows nearest three non-cancelled, non-departed trips", () => {
  const model = favoriteWidgetModel("Bilderdijkstraat", board([
    item("13", "12:11"), item("17", "12:06"), item("1", "12:03"),
    item("3", "12:04", { cancelled: true }),
    item("6", "12:01", { departed: true }), item("27", "12:16")
  ]), now, now);
  assert.deepEqual(model.rows.map(row => row.line), ["1", "17", "13"]);
  assert.deepEqual(model.rows.map(row => row.minutes), [3, 6, 11]);
  assert.equal(model.stale, false);
});
test("Widget never presents old departures as verified live", () => {
  const model = favoriteWidgetModel("Bilderdijkstraat", board([item("N83", "12:21")]), now - 12 * 60_000, now);
  assert.equal(model.stale, true);
  assert.match(model.hint, /verouderd/);
});
test("Widget without favorites or a valid board has useful empty state", () => {
  const model = favoriteWidgetModel("", null, null, now);
  assert.equal(model.stopName, "Mijn halte");
  assert.equal(model.rows.length, 0);
  assert.match(model.hint, /Open OVbord/);
});
const active = {
  tripId: "rit-1", line: "17", destination: "Centraal Station", alightName: "Leidseplein",
  alighting: { id: "halte-2", name: "Leidseplein", index: 7 },
  alightClock: "12:20", savedAt: now
};
test("Reminder fires about five minutes before selected exit", () => {
  const plan = plannedAlightReminder(active, now);
  assert.equal(plan.at, Date.parse("2026-10-26T11:15:00Z"));
  assert.match(plan.body, /Controleer de actuele ritinformatie/);
});
test("Reminder is not scheduled without exit or when exit is too close", () => {
  assert.equal(plannedAlightReminder({ ...active, alighting: null }, now), null);
  assert.equal(plannedAlightReminder({ ...active, alightClock: "12:05" }, now), null);
  assert.equal(plannedAlightReminder({ ...active, alightClock: "16:20" }, now), null);
});
test("Update 3 has its own native runtime version and config plugins", () => {
  const config = require("../app.json").expo;
  assert.equal(config.version, "1.0.5");
  assert.ok(config.plugins.some(p => Array.isArray(p) && p[0] === "react-native-android-widget"));
  assert.ok(config.plugins.some(p => Array.isArray(p) && p[0] === "expo-notifications"));
});
