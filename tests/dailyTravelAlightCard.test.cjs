const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const previousTs = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename
);
const daily = require(path.resolve(__dirname, "../lib/dailyTravel.ts"));
const alight = require(path.resolve(__dirname, "../lib/alightCard.ts"));
if (previousTs) Module._extensions[".ts"] = previousTs;
else delete Module._extensions[".ts"];

test("dagelijkse reis begint leeg en herstelt bewaarde heen- en terugritten veilig", () => {
  assert.deepEqual(daily.parseDailyTravel(null), { morning: null, evening: null });
  assert.deepEqual(daily.parseDailyTravel("{invalid"), { morning: null, evening: null });
  assert.deepEqual(daily.parseDailyTravel(JSON.stringify({ morning: "rit-heen", evening: "rit-terug" })),
    { morning: "rit-heen", evening: "rit-terug" });
  assert.deepEqual(daily.parseDailyTravel(JSON.stringify({ morning: {}, evening: " " })),
    { morning: null, evening: null });
  assert.equal(daily.availableDailyJourney([{ key: "rit-heen", line: "17" }], "rit-heen").line, "17");
  assert.equal(daily.availableDailyJourney([], "gewist"), null);
  assert.equal(daily.dailyTravelLabel("morning"), "Thuis → Werk");
  assert.equal(daily.dailyTravelLabel("evening"), "Werk → Thuis");
});

test("uitstapkaart telt geen ongeverifieerde haltes en houdt aankomst bij", () => {
  const now = Date.parse("2026-10-27T11:00:00Z"); // 12:00 Amsterdam
  const trip = {
    alighting: { id: "s4", name: "Westkolkdijk", index: 3 }, alightName: "Westkolkdijk",
    alightClock: "12:07"
  };
  assert.equal(alight.alightTimeLabel(trip, now), "over 7 min");
  const stops = [
    { id: "s1", name: "Start", state: "passed" },
    { id: "s2", name: "Tussen", state: "current" },
    { id: "s3", name: "Volgende", state: "upcoming" },
    { id: "s4", name: "Westkolkdijk", state: "upcoming" }
  ];
  assert.equal(alight.alightRemainingStops(stops, trip), 2);
  assert.equal(alight.alightRemainingStops(stops.map(s => ({ ...s, state: "upcoming" })), trip), null);
  assert.equal(alight.alightRemainingStops(stops, { ...trip, alighting: null }), null);
  assert.equal(alight.alightRemainingStops(stops.map(s => ({ ...s, state: s.id === "s4" ? "current" : "passed" })), trip), 0);
  assert.equal(alight.alightTimeLabel(trip, now + 9 * 60_000), "Geplande aankomst voorbij");
});
