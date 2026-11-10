const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(
  fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, file);
const { boardLiveLabel } = require("../lib/boardLiveLabel.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const now = Date.parse("2026-11-10T21:00:00+01:00");
const gps = { level: "good", label: "GPS", ageSeconds: 8, estimatedPosition: false,
  explanation: "KV6 livepositie", receivedAt: now - 4000 };

test("V1.0.7: a live departure estimate is not mislabelled as live GPS", () => {
  assert.equal(boardLiveLabel({ isLive: true }, now), "Live tijd");
  assert.equal(boardLiveLabel({ isLive: false }, now), "Gepland");
  assert.equal(boardLiveLabel({ isLive: true, reliabilityDetail: gps }, now), "Live · GPS");
  assert.equal(boardLiveLabel({ isLive: true, reliabilityDetail: { ...gps,
    estimatedPosition: true } }, now), "Live tijd");
  assert.equal(boardLiveLabel({ isLive: true, reliabilityDetail: { ...gps,
    ageSeconds: 49 } }, now), "Live tijd");
  assert.equal(boardLiveLabel({ isLive: true, reliabilityDetail: { ...gps,
    receivedAt: now - 60000 } }, now), "Live tijd");
  assert.equal(boardLiveLabel({ isLive: true, reliabilityDetail: { ...gps,
    level: "low" } }, now), "Live tijd");
  assert.equal(boardLiveLabel({ isLive: true, liveDataStale: true,
    reliabilityDetail: gps }, now), "Live-info oud");
  assert.equal(boardLiveLabel({ isLive: true }, now, true), "Laatst bekende tijd");
  assert.equal(boardLiveLabel({ cancelled: true }, now), "Rijdt niet");
});

test("V1.0.7: the board uses the same truthful source label in regular and grouped rows", () => {
  const file = read("components/StopBoardRow.tsx");
  assert.match(file, /const label=boardLiveLabel\(item,nowMs,stale\)/);
  assert.match(file, /row:\{minHeight:48,paddingVertical:5/);
  assert.match(file, /groupedRow:\{minHeight:60/);
  assert.match(file, /badge:\{width:42,minHeight:26/);
});

test("V1.0.7: departed stops stay accessible but use one compact row", () => {
  const file = read("app/rit/[id].tsx");
  assert.match(file, /passedRow: \{ minHeight: 38, paddingVertical: 0 \}/);
  assert.match(file, /railNodePassed: \{ width: 9/);
  assert.doesNotMatch(file, /style=\{styles\.passedSub\}>Vertrokken/);
  assert.match(file, /isBoarding && !passed/);
  assert.match(file, /isAlight \? <Text/);
  assert.match(file, /onPress=\{\(\) => \{ if \(!choosing\) onOpenStop\(stop\)/);
  assert.match(file, /Volgende halte/);
});

test("V1.0.7: reopened boards show a cached snapshot without marking it live", () => {
  const file = read("components/FlowBoard.tsx");
  assert.match(file, /const instantSnapshot = useRef\(peekBoard\(stop\.id\)\)\.current/);
  assert.match(file, /const initialVisibleBoard = initialBoard \|\| instantSnapshot\?\.board \|\| null/);
  assert.match(file, /initialStale \|\| \(!initialBoard && Boolean\(instantSnapshot\)\)/);
  assert.match(file, /const fetchPromise=load\(!initialVisibleBoard\)/);
});
