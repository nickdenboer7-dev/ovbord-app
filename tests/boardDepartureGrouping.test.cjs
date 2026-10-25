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
const { groupBoardDepartures, DEPARTURE_DAY_GAP_MS, MAX_GROUPED_EXTRA_TIMES } = require("../lib/boardDepartureGrouping.ts");
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

test("the night gap gets a centered divider and four adjacent planned departures form one row", () => {
  const rows = [
    departure("old-live", "01:56", { isLive: true }),
    departure("first", "07:07"), departure("second", "07:36"),
    departure("third", "08:05"), departure("fourth", "08:34"),
    departure("later-live", "09:12", { isLive: true })
  ];
  const grouped = groupBoardDepartures(sortBoardDepartures(rows.slice().reverse(), now), now);
  assert.deepEqual(grouped.map(row => row.id), ["old-live", "first", "later-live"]);
  assert.equal(grouped[0].gapStartClock, undefined);
  assert.equal(grouped[1].gapStartClock, "07:07");
  assert.deepEqual(grouped[1].groupedTimes, ["07:36", "08:05", "08:34"]);
  assert.equal(grouped[0].groupedTimes, undefined);
  assert.equal(grouped[2].groupedTimes, undefined);
  assert.deepEqual(rows.map(row => row.id), ["old-live", "first", "second", "third", "fourth", "later-live"]);
});

test("planned siblings merge even across 61 minutes; the next separate live row receives the divider", () => {
  assert.equal(DEPARTURE_DAY_GAP_MS, 3600000);
  const sameHour = groupBoardDepartures([departure("a", "10:00"), departure("b", "11:00")], now);
  assert.equal(sameHour.length, 1);
  assert.deepEqual(sameHour[0].groupedTimes, ["11:00"]);
  const afterHour = groupBoardDepartures([
    departure("a", "10:00"), departure("b", "11:01"), departure("live", "13:00", { isLive: true })
  ], now);
  assert.deepEqual(afterHour.map(row => row.id), ["a", "live"]);
  assert.deepEqual(afterHour[0].groupedTimes, ["11:01"]);
  assert.equal(afterHour[0].gapStartClock, undefined);
  assert.equal(afterHour[1].gapStartClock, "13:00");
});

test("only the first three following clocks appear; all later planned siblings remain collapsed", () => {
  const clocks = ["07:00","07:10","07:20","07:30","07:40","07:50"];
  const display = groupBoardDepartures(clocks.map((clock, index) => departure(String(index), clock)), now);
  assert.equal(MAX_GROUPED_EXTRA_TIMES, 3);
  assert.equal(display.length, 1);
  assert.deepEqual(display[0].groupedTimes, ["07:10", "07:20", "07:30"]);
});

test("live, stale-live, cancelled and departed trips are never folded into planned rows", () => {
  const flags = [{ isLive: true }, { liveDataStale: true }, { cancelled: true }, { departed: true }];
  for (const flag of flags) {
    const rows = groupBoardDepartures([
      departure("before", "07:00"), departure("special", "07:10", flag), departure("after", "07:20")
    ], now);
    assert.deepEqual(rows.map(row => row.id), ["before", "special", "after"]);
  }
});

test("planned grouping depends on line and destination, not carrier or platform metadata", () => {
  for (const change of [{ line: "N84" }, { destination: "Sloterdijk" }]) {
    const rows = groupBoardDepartures([departure("first", "07:00"), departure("other", "07:10", change)], now);
    assert.equal(rows.length, 2);
  }
  for (const change of [{ carrier: "RET" }, { mode: "tram" }, { platform: "B" }]) {
    const rows = groupBoardDepartures([departure("first", "07:00"), departure("other", "07:10", change)], now);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].groupedTimes, ["07:10"]);
  }
});

test("planned siblings across midnight stay grouped; the divider appears after the group", () => {
  const display = groupBoardDepartures([
    departure("before", "23:45"), departure("after", "00:15", { day: "2026-10-27" }),
    departure("morning", "02:00", { day: "2026-10-27" }),
    departure("later-live", "03:30", { day: "2026-10-27", isLive: true })
  ], now);
  assert.deepEqual(display.map(row => row.id), ["before", "later-live"]);
  assert.deepEqual(display[0].groupedTimes, ["00:15", "02:00"]);
  assert.equal(display[0].gapStartClock, undefined);
  assert.equal(display[1].gapStartClock, "03:30");
});

test("variant B: autumn DST gap does not split N83; separator follows the 02:54 group", () => {
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
  assert.deepEqual(result.map(row => row.id), ["live-0225", "planned-0254", "live-0706"]);
  assert.equal(result[1].gapStartClock, undefined);
  assert.deepEqual(result[1].groupedTimes, ["03:23", "03:52", "04:23"]);
  assert.equal(result[2].gapStartClock, "07:06");
  assert.equal(result[0].groupedTimes, undefined);
  assert.equal(result[2].groupedTimes, undefined);
});

test("the board renders the separator, blue grouping and next-times without touching the arrival view", () => {
  const board = fs.readFileSync(path.join(__dirname, "../components/FlowBoard.tsx"), "utf8");
  const row = fs.readFileSync(path.join(__dirname, "../components/StopBoardRow.tsx"), "utf8");
  assert.match(board, /groupBoardDepartures\(remaining, nowMs\)/);
  assert.match(board, /tab === "departures" && item\.gapStartClock/);
  assert.match(board, /Volgende vertrekken vanaf \{clock\}/);
  assert.match(board, /laterTimes=\{tab==="departures"\?item\.groupedTimes:undefined\}/);
  assert.match(row, /#EEF4FF/);
  assert.match(row, /"daarna "\+laterTimes\.slice\(0,3\)\.join\(" · "\)/);
  assert.match(row, /fontVariant:\["tabular-nums"\]/);
});
