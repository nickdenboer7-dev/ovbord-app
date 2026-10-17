const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Load the actual TypeScript source and its local dependencies without a test bundler.
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => {
  const src = fs.readFileSync(filename, "utf8");
  mod._compile(ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
};
const {
  keepBoardDeparture, departureTimeRemainingMs, boardDepartureIdentity,
  refreshDepartureTimeChanges, departureTimeChangeLabel
} = require(path.resolve(__dirname, "../lib/boardSmartness.ts"));
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const t = Date.parse("2026-10-14T10:00:00Z"); // 12:00 Netherlands
const row = (time, rest = {}) => ({
  id: "row-id", ritId: "trip-123", line: "N94", destination: "Amsterdam Centraal",
  plannedTime: time, relativeText: "", reliability: "planned", ...rest
});

test("departure expires after two-minute grace from absolute time", () => {
  const trip = row("11:57", { effectiveAt: new Date(t - 120000).toISOString() });
  assert.equal(keepBoardDeparture(trip, t), true);
  assert.equal(keepBoardDeparture(trip, t + 1), false);
  assert.equal(keepBoardDeparture(row("12:03", {effectiveAt:new Date(t+180000).toISOString()}), t), true);
});
test("clock-only trips expire, but remain until two minutes after expected time", () => {
  assert.equal(keepBoardDeparture(row("12:00"), t), true);
  assert.equal(keepBoardDeparture(row("11:58"), t), true);
  assert.equal(keepBoardDeparture(row("11:57"), t), false);
  assert.equal(keepBoardDeparture(row("13:00"), t), true);
});
test("midnight rollover remains possible without discarding a genuine next service", () => {
  const now = Date.parse("2026-10-14T21:58:00Z"); // 23:58 Amsterdam
  assert.equal(keepBoardDeparture(row("00:03"), now), true);
  assert.equal(Math.round(departureTimeRemainingMs(row("00:03"), now)/60000), 5);
  assert.equal(keepBoardDeparture(row("--:--"), now), true);
  const afterMidnight = Date.parse("2026-10-14T22:05:00Z"); // 00:05 Amsterdam
  assert.equal(keepBoardDeparture(row("23:55"), afterMidnight), false);
  assert.equal(keepBoardDeparture(row("00:07"), afterMidnight), true);
});
test("realtime effective time takes precedence over stale planned clock", () => {
  const item = row("11:57", { expectedTime: "12:06", effectiveAt: new Date(t+360000).toISOString() });
  assert.equal(keepBoardDeparture(item, t), true);
  assert.equal(departureTimeRemainingMs(item, t), 360000);
});
test("no false change notice on initial load, new trips or reorder", () => {
  const initial = row("12:30");
  assert.deepEqual(refreshDepartureTimeChanges(null, [initial], {}, t), {});
  assert.deepEqual(refreshDepartureTimeChanges([initial], [row("12:30"), row("12:33", {ritId:"new"})], {}, t), {});
  assert.equal(boardDepartureIdentity(row("12:30", {expectedTime:"12:31"})), boardDepartureIdentity(initial));
});
test("real time change shows previous time for 60 seconds with no extra badge", () => {
  const before = row("12:30", { expectedTime:"12:30" });
  const after = row("12:30", { expectedTime:"12:31", delayMinutes:1 });
  const changes = refreshDepartureTimeChanges([before], [after], {}, t);
  assert.equal(departureTimeChangeLabel(after, changes, t), "was 12:30");
  assert.equal(departureTimeChangeLabel(after, changes, t+59999), "was 12:30");
  assert.equal(departureTimeChangeLabel(after, changes, t+60000), "");
  const same = refreshDepartureTimeChanges([after], [after], changes, t+30000);
  assert.equal(departureTimeChangeLabel(after, same, t+50000), "was 12:30");
  assert.equal(departureTimeChangeLabel(after, same, t+61000), "");
});
test("one cancelled/removed departure cannot carry a phantom change notice", () => {
  const old = row("12:30", {expectedTime:"12:30"});
  const changed = row("12:30", {expectedTime:"12:33"});
  const first = refreshDepartureTimeChanges([old], [changed], {}, t);
  assert.deepEqual(refreshDepartureTimeChanges([changed], [], first, t+30000), {});
  assert.deepEqual(refreshDepartureTimeChanges([old], [row("12:30", {ritId:"new"})], first, t+30000), {});
});
