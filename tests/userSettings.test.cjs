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
const { DEFAULT_USER_SETTINGS, parseUserSettings } = require("../lib/userSettings.ts");
const { nearbyLeaveAdvice, compareNearbyDepartures } = require("../lib/buurtbord.ts");
const { stopBoardTiming } = require("../lib/stopBoardDesign.ts");
const { orderBoardDepartures } = require("../lib/boardSmartness.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-25T22:00:00Z");
const stop = (id, walkMinutes) => ({ id, name: id, city: "Leeuwarden", walkMinutes, lines: [], mode: "bus" });
const trip = (id, minutes, isLive = true) => ({
  id, line: "25", destination: "Station", carrier: "Qbuzz", mode: "bus",
  plannedTime: "23:00", expectedTime: "23:00", isLive,
  effectiveAt: new Date(now + minutes * 60000).toISOString()
});

test("settings load with safe defaults and reject invalid stored choices", () => {
  assert.deepEqual(parseUserSettings(null), DEFAULT_USER_SETTINGS);
  assert.deepEqual(parseUserSettings("{broken"), DEFAULT_USER_SETTINGS);
  assert.deepEqual(parseUserSettings(JSON.stringify({ walkBufferMinutes: 10, liveFirst: true, buurtbordMap: false })), {
    ...DEFAULT_USER_SETTINGS, walkBufferMinutes: 10, liveFirst: true, buurtbordMap: false
  });
  assert.deepEqual(parseUserSettings(JSON.stringify({ walkBufferMinutes: 2, maxWalkMinutes: 100, liveFirst: "true" })), DEFAULT_USER_SETTINGS);
});

test("walking settings bound the advice and change the leaving time", () => {
  const stops = [stop("Near", 4), stop("Far", 12)];
  const rows = { Near: [trip("n", 25)], Far: [trip("f", 15)] };
  const options = compareNearbyDepartures(stops, rows, now, new Set(), { maxWalkMinutes: 5 });
  assert.deepEqual(options.map(option => option.stop.id), ["Near"]);
  assert.equal(nearbyLeaveAdvice(options[0], now, 3).leaveInMinutes, 18);
  assert.equal(nearbyLeaveAdvice(options[0], now, 10).leaveInMinutes, 11);
  assert.equal(nearbyLeaveAdvice(options[0], now, 10).marginText, "circa 10 min extra marge");
});

test("turning smart stop preference off preserves chronological ranking", () => {
  const stops = [stop("Rokin", 5), stop("Dam", 1)];
  const rows = { Rokin: [trip("a", 12)], Dam: [trip("b", 14)] };
  assert.equal(compareNearbyDepartures(stops, rows, now)[0].stop.id, "Dam");
  assert.equal(compareNearbyDepartures(stops, rows, now, new Set(), { smartStopChoice: false })[0].stop.id, "Rokin");
});

test("departure clock options and live-first ordering are functional", () => {
  const live = trip("live", 10), planned = trip("planned", 3, false);
  assert.equal(stopBoardTiming(live, now, false, "both").primary, "10 min");
  assert.equal(stopBoardTiming(live, now, false, "clock").secondary, "");
  assert.equal(stopBoardTiming(live, now, false, "minutes").primary, "10 min");
  assert.equal(stopBoardTiming(live, now, false, "minutes").secondary, "");
  assert.equal(stopBoardTiming(trip("later", 65), now, false, "minutes").primary, "65 min");
  assert.notEqual(stopBoardTiming(trip("later", 65), now, false, "both").primary, "65 min");
  assert.deepEqual(orderBoardDepartures([live, planned], now, false).map(t => t.id), ["planned", "live"]);
  assert.deepEqual(orderBoardDepartures([live, planned], now, true).map(t => t.id), ["live", "planned"]);
});

test("settings screen has navigable location and no fake native notification controls", () => {
  const ui = fs.readFileSync(require("node:path").join(__dirname, "../app/(tabs)/meer.tsx"), "utf8");
  assert.match(ui, /setManualCity\(city\.key\)/);
  assert.match(ui, /setSetting\("walkBufferMinutes"/);
  assert.doesNotMatch(ui, /setSetting\("buurtbordMap"/);
  assert.doesNotMatch(ui, /setNotificationsEnabled/);
});
