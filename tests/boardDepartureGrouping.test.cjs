const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const old = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename
);
const { groupBoardDepartures, DEPARTURE_DAY_GAP_MS } = require("../lib/boardDepartureGrouping.ts");
const { sortBoardDepartures } = require("../lib/boardSmartness.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-26T00:00:00+01:00");
function departure(id, clock, options = {}) {
  const { day = "2026-10-26", ...extra } = options;
  return { id, line: "N83", carrier: "GVB", destination: "Centraal Station",
    plannedTime: clock, expectedTime: clock, effectiveAt: day + "T" + clock + ":00+01:00",
    mode: "bus", reliability: "unknown", relativeText: "", isLive: false, ...extra };
}

test("planned departures remain individual rows while the night divider stays visible", () => {
  const rows = [
    departure("old-live", "01:56", { isLive: true }),
    departure("first", "07:07"), departure("second", "07:36"),
    departure("third", "08:05"), departure("fourth", "08:34"),
    departure("later-live", "09:12", { isLive: true })
  ];
  const display = groupBoardDepartures(sortBoardDepartures(rows.slice().reverse(), now), now);
  assert.deepEqual(display.map(row => row.id), rows.map(row => row.id));
  assert.equal(display[1].gapStartClock, "07:07");
  assert.deepEqual(display.map(row => row.gapStartClock).filter(Boolean), ["07:07"]);
  assert.ok(display.every(row => row.groupedTimes === undefined));
  assert.ok(rows.every(row => row.gapStartClock === undefined && row.groupedTimes === undefined));
});

test("exactly 60 minutes has no divider; more than 60 minutes does", () => {
  assert.equal(DEPARTURE_DAY_GAP_MS, 3600000);
  const sameHour = groupBoardDepartures([departure("a", "10:00"), departure("b", "11:00")], now);
  assert.deepEqual(sameHour.map(row => row.id), ["a", "b"]);
  assert.equal(sameHour[1].gapStartClock, undefined);
  const next = groupBoardDepartures([
    departure("a", "10:00"), departure("b", "11:01"), departure("live", "13:00", { isLive: true })
  ], now);
  assert.deepEqual(next.map(row => row.gapStartClock), [undefined, "11:01", "13:00"]);
});

test("all planned trips stay separate irrespective of line, destination and metadata", () => {
  const changes = [{}, { line: "N84" }, { destination: "Sloterdijk" },
    { carrier: "RET" }, { mode: "tram" }, { platform: "B" }, { liveDataStale: true },
    { cancelled: true }, { departed: true }, { isLive: true }];
  for (const change of changes) {
    const display = groupBoardDepartures([
      departure("first", "07:00"), departure("second", "07:10", change), departure("third", "07:20")
    ], now);
    assert.deepEqual(display.map(row => row.id), ["first", "second", "third"]);
    assert.ok(display.every(row => row.groupedTimes === undefined));
  }
});

test("midnight keeps chronological rows and marks a separate gap afterward", () => {
  const display = groupBoardDepartures([
    departure("before", "23:45"), departure("after", "00:15", { day: "2026-10-27" }),
    departure("morning", "02:00", { day: "2026-10-27" }),
    departure("later-live", "03:30", { day: "2026-10-27", isLive: true })
  ], now);
  assert.deepEqual(display.map(row => row.id), ["before", "after", "morning", "later-live"]);
  assert.deepEqual(display.map(row => row.gapStartClock), [undefined, undefined, "02:00", "03:30"]);
});

test("autumn clock change: N83 planned 02:54 remains separate, divider before 03:23", () => {
  const referenceNow = Date.parse("2026-10-25T01:00:00+02:00");
  const rows = [
    departure("live-0225", "02:25", { isLive: true, effectiveAt: "2026-10-25T02:25:00+02:00" }),
    departure("planned-0254", "02:54", { effectiveAt: "2026-10-25T02:54:00+02:00" }),
    departure("planned-0323", "03:23", { effectiveAt: "2026-10-25T03:23:00+01:00" }),
    departure("planned-0352", "03:52", { effectiveAt: "2026-10-25T03:52:00+01:00" }),
    departure("planned-0423", "04:23", { effectiveAt: "2026-10-25T04:23:00+01:00" }),
    departure("live-0706", "07:06", { isLive: true, effectiveAt: "2026-10-25T07:06:00+01:00" })
  ];
  const result = groupBoardDepartures(sortBoardDepartures(rows, referenceNow), referenceNow);
  assert.deepEqual(result.map(row => row.id), rows.map(row => row.id));
  assert.deepEqual(result.map(row => row.gapStartClock), [undefined, undefined, "03:23", undefined, undefined, "07:06"]);
  assert.ok(result.every(row => row.groupedTimes === undefined));
});

test("Bilderdijkstraat fixture preserves every departure and both separators", () => {
  const fixture = require("./fixtures/bilderdijkstraat-clock-change.json");
  const referenceNow = Date.parse(fixture.generated_at);
  const rows = fixture.departures.map((item, index) => Object.freeze(departure(String(index), item.planned_time, {
    line: item.line, destination: item.destination, isLive: item.live, effectiveAt: item.effective_time
  })));
  const result = groupBoardDepartures(sortBoardDepartures(Object.freeze(rows), referenceNow), referenceNow);
  assert.deepEqual(result.map(row => row.id), rows.map(row => row.id));
  assert.deepEqual(result.map(row => row.gapStartClock).filter(Boolean), ["03:23", "07:06"]);
  assert.ok(result.every(row => row.groupedTimes === undefined));
});

test("spring clock change also keeps every physical trip", () => {
  const referenceNow = Date.parse("2026-03-29T01:00:00+01:00");
  const times = ["2026-03-29T01:54:00+01:00", "2026-03-29T03:23:00+02:00",
    "2026-03-29T03:52:00+02:00", "2026-03-29T04:23:00+02:00", "2026-03-29T04:51:00+02:00"];
  const rows = times.map((effectiveAt, index) => departure(String(index), effectiveAt.slice(11, 16), { effectiveAt }));
  const result = groupBoardDepartures(sortBoardDepartures(rows.reverse(), referenceNow), referenceNow);
  assert.deepEqual(result.map(row => row.id), ["0", "1", "2", "3", "4"]);
  assert.ok(result.every(row => row.groupedTimes === undefined));
});

test("FlowBoard still renders the divider for departures, independently of arrivals", () => {
  const board = fs.readFileSync(path.join(__dirname, "../components/FlowBoard.tsx"), "utf8");
  assert.match(board, /groupBoardDepartures\(remaining, nowMs\)/);
  assert.match(board, /tab === "departures" && item\.gapStartClock/);
  assert.match(board, /Volgende vertrekken vanaf \{clock\}/);
});
