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
const { STOP_BOARD_BLUE, stopBoardBadge, stopBoardLineBadge } = require("../lib/stopBoardDesign.ts");
const { boardingCountdown, timelineTimeDelta } = require("../lib/ritTimelineDesign.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];
const screen = fs.readFileSync(path.join(__dirname, "..", "app/rit/[id].tsx"), "utf8");

test("trip and stop board derive identical badges for the same line data", () => {
  const sample = { line: "13", carrier: "GVB", mode: "tram" };
  assert.deepEqual(stopBoardLineBadge(sample), stopBoardBadge(sample));
  assert.equal(STOP_BOARD_BLUE, "#185c98");
  assert.deepEqual(stopBoardLineBadge({ ...sample, routeColor: "#123456", routeTextColor: "#ffffff" }),
    { bg: "#123456", text: "#ffffff" });
});

test("delays use orange for +1..+4 and red from +5, below the expected time", () => {
  for (const min of [1, 2, 3, 4]) assert.deepEqual(timelineTimeDelta(min), { text: "+" + min, tone: "orange" });
  for (const min of [5, 8]) assert.deepEqual(timelineTimeDelta(min), { text: "+" + min, tone: "red" });
  assert.deepEqual(timelineTimeDelta(-2), { text: "−2", tone: "early" });
  assert.equal(timelineTimeDelta(0), null);
  assert.match(screen, /timelineActualLine: \{ flexDirection: "column"/);
  assert.match(screen, /colors\.delayWarning/);
  assert.match(screen, /colors\.danger/);
});

test("boarding countdown remains clear and never becomes negative", () => {
  const now = new Date(); now.setSeconds(0, 0);
  const after = new Date(now.getTime() + 5 * 60000);
  const clock = String(after.getHours()).padStart(2, "0") + ":" + String(after.getMinutes()).padStart(2, "0");
  assert.equal(boardingCountdown(clock, now.getTime(), false), "over 5 min");
  assert.equal(boardingCountdown(clock, now.getTime(), true), "");
  assert.equal(boardingCountdown("nvt", now.getTime(), false), "");
});

test("compact trip list keeps the line rail, vehicle, departed stops and capped text", () => {
  assert.match(screen, /backgroundColor: STOP_BOARD_BLUE/);
  assert.match(screen, /lineColor=\{lineBadge\.bg\}/);
  assert.match(screen, /railBelow.*lineColor/);
  assert.match(screen, /backgroundColor: lineColor/);
  assert.match(screen, /minHeight: 48/);
  assert.match(screen, /Jouw halte/);
  assert.match(screen, /Volgende halte/);
  assert.match(screen, /style=\{styles\.passedSub\}>Vertrokken/);
  assert.match(screen, /maxFontSizeMultiplier=\{1\.3\}/);
});
