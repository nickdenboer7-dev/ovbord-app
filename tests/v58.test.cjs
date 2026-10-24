const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, file
);
const { sortBoardDepartures } = require("../lib/boardSmartness.ts");
const format = require("../lib/format.ts");
const line = require("../lib/departureLine.ts");
const favoriteLines = require("../lib/favoriteLines.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// No default effectiveAt here (unlike other test files' dep() helpers): lets each test control
// exactly which fields the real expected time is derived from.
const depRow = (clock, extra = {}) => ({
  id: "d", line: "14", carrier: "GVB", destination: "Centraal Station",
  plannedTime: clock, relativeText: "", reliability: "planned", ...extra
});

// OVbord V5.8 "Haltebord": vertrekvolgorde, compact wit-groen ontwerp, bestemmingen en aftellers.

test("departures sort ascending by real expected time, stable on ties, unknown times last", () => {
  const now = Date.parse("2026-10-17T14:00:00+02:00");
  const a = depRow("14:34", { id: "a" });
  const b = depRow("14:22", { id: "b" });
  const c = depRow("14:22", { id: "c" }); // tie with b: original order (b before c) must be kept
  const u1 = depRow("--:--", { id: "u1" });
  const u2 = depRow("--:--", { id: "u2" });
  const input = [a, u1, b, c, u2];
  const original = input.slice();
  const sorted = sortBoardDepartures(input, now);
  // Example from the brief: 14:22 vóór 14:34.
  assert.deepEqual(sorted.map((x) => x.id), ["b", "c", "a", "u1", "u2"]);
  // The original API array is never mutated or reordered.
  assert.deepEqual(input, original);
  assert.notStrictEqual(sorted, input);
});

test("sorting handles midnight: a departure just after midnight sorts after one just before it", () => {
  const now = Date.parse("2026-10-17T23:58:00+02:00");
  const before = depRow("23:59", { id: "before" });
  const after = depRow("00:03", { id: "after" });
  assert.deepEqual(sortBoardDepartures([after, before], now).map((x) => x.id), ["before", "after"]);
});

test("a delayed early departure sorts after an on-time later one, by real expected time", () => {
  const now = Date.parse("2026-10-17T14:00:00+02:00");
  // Planned 14:05 but 30 minutes late: really leaves at 14:35.
  const delayed = depRow("14:05", { id: "delayed", delayMinutes: 30 });
  const onTime = depRow("14:20", { id: "onTime" });
  assert.deepEqual(sortBoardDepartures([delayed, onTime], now).map((x) => x.id), ["onTime", "delayed"]);
});

test('favourite-line rows ("Jouw lijnen") stay chronological regardless of feed order', () => {
  const now = Date.parse("2026-10-17T14:00:00+02:00");
  const rows = [
    depRow("14:40", { id: "late", line: "14", carrier: "GVB", destination: "Zuid" }),
    depRow("14:10", { id: "early", line: "14", carrier: "GVB", destination: "Zuid" })
  ];
  const pinned = favoriteLines.pinnedDepartures(rows, [favoriteLines.favoriteLineKey("14", "GVB")], now, 3);
  // Only the next departure per line + direction is pinned; it must be the soonest one.
  assert.deepEqual(pinned.map((x) => x.id), ["early"]);
});

test("the clock and the countdown use the same real expected departure time", () => {
  // A later, more precise effectiveAt from the feed must win over a stale expectedTime string.
  const now = Date.parse("2026-10-17T14:08:00+02:00");
  const item = {
    id: "s", line: "14", carrier: "GVB", destination: "Centraal Station", plannedTime: "14:07",
    expectedTime: "14:10", effectiveAt: "2026-10-17T14:13:00+02:00", relativeText: "", reliability: "planned"
  };
  assert.equal(format.effectiveDepartureClock(item), "14:13");
  assert.equal(line.departureSubParts(item, now).clock, "14:13");
  assert.equal(line.departureRightText(item, now).text, "5 min");
});

test("example: 14:10 +3 at phone time 14:08 shows a clock and countdown that agree", () => {
  const now = Date.parse("2026-10-17T14:08:00+02:00");
  // Planned 14:07, +3 min delay: the effective clock is 14:10 (no expectedTime/effectiveAt override).
  const item = depRow("14:07", { delayMinutes: 3 });
  const sub = line.departureSubParts(item, now);
  assert.equal(sub.clock, "14:10");
  assert.equal(sub.delay, "+3");
  assert.equal(line.departureRightText(item, now).text, "2 min");
});

test("long destinations keep one primary row and their full accessible name", () => {
  // User-approved shared layout: one primary row, with the unabridged destination spoken.
  assert.match(read("components/DepartureLine.tsx"), /numberOfLines=\{1\} ellipsizeMode="tail">\s*\{item\.destination\}/);
  assert.match(read("lib/departureLine.ts"), /"Lijn " \+ item\.line \+ " naar " \+ item\.destination/);
});

test("the stop board sorts its departures and lijnen feed by real expected time", () => {
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /sortBoardDepartures\(visibleDepartures, nowMs\)/);
  assert.match(board, /departures=\{sortBoardDepartures\(visibleDepartures, nowMs\)\.map\(row => withBoardFreshness\(row, timingCurrent\)\)\}/);
});

test("the stop board has a compact white-green header, like Start and the trip page", () => {
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /backgroundColor: colors\.surface,\s*\n\s*borderBottomWidth: StyleSheet\.hairlineWidth, borderBottomColor: colors\.border/);
  assert.match(board, /<Ionicons name="arrow-back" size=\{22\} color=\{colors\.text\} \/>/);
  assert.match(board, /color=\{isFavoriteStop\(board\?\.stop\.id \|\| stop\.id\) \? "#FFD86B" : colors\.textSoft\}/);
  assert.match(board, /<MenuButton onPress=\{\(\) => setMenuOpen\(true\)\} color=\{colors\.text\}/);
  // Active tab is the OVbord green accent; inactive tabs stay calm and light.
  assert.match(board, /borderBottomColor: active \? colors\.accent : "transparent"/);
  assert.match(board, /color: active \? colors\.heading : colors\.textSoft/);
  assert.doesNotMatch(board, /#175FAD|#123C64|#FFFFFF22|#14518B/);
});
