const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename
);
const { nearbyAdviceStatus, nearbyLeaveAdvice } = require("../lib/buurtbord.ts");
const { timelineTimeDelta } = require("../lib/ritTimelineDesign.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const screen = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const option = (spareMinutes, withinHour = true) => ({
  stop: { id: "halte", name: "Bilderdijkstraat", walkMinutes: 5 },
  departure: { id: "rit", line: "N83", destination: "Centraal Station" },
  walkMinutes: 5, spareMinutes, withinHour,
  departureInMinutes: spareMinutes + 5, tight: spareMinutes < 3
});

test("groene haalbaarheid vereist werkelijk de ingestelde loopmarge", () => {
  assert.deepEqual(nearbyAdviceStatus(option(7), 5), { label: "Haalbaar", tone: "success" });
  assert.deepEqual(nearbyAdviceStatus(option(7), 10), { label: "Weinig marge", tone: "warning" });
  assert.deepEqual(nearbyAdviceStatus(option(2), 3), { label: "Krap", tone: "warning" });
  assert.deepEqual(nearbyAdviceStatus(option(30, false), 5), { label: "Later", tone: "neutral" });
  assert.equal(nearbyLeaveAdvice(option(7), 0, 5).leaveText, "Vertrek nu");
});

test("Vertrekadvies toont vertrekmoment, looptijd, halte en een alternatief", () => {
  const ui = screen("app/(tabs)/buurtbord.tsx");
  assert.match(ui, /bestOption\s*\?\s*\(/);
  assert.match(ui, /nearbyAdviceStatus\(bestOption, settings\.walkBufferMinutes\)/);
  assert.match(ui, />Vertrekadvies<\/Text>/);
  assert.match(ui, /style=\{\[styles\.adviceLeave/);
  assert.match(ui, /min lopen · \{advice\?\.marginText\}/);
  assert.match(ui, /options\[1\] \? <View style=\{styles\.adviceAlternative\}/);
  assert.match(ui, /bestemmingen kunnen verschillen/);
  assert.match(ui, /minimumFontScale=\{0\.75\}/);
});

test("Volgende halte kaart beweert alleen live te zijn bij bevestigde GPS", () => {
  const ui = screen("app/rit/[id].tsx");
  assert.match(ui, /const nextStopIndex = verifiedNextStopIndex\(verifiedLive/);
  assert.match(ui, /const scheduledPosition = journey \? expectedTimelineLocation\(journey\.stops, nowMs\)/);
  assert.match(ui, /const displayNextIndex = verifiedLive && !lastKnown \? nextStopIndex : scheduledNextIndex/);
  assert.doesNotMatch(ui, /journey\.stops\.find\(\(s\) => s\.state === "current"/);
  assert.match(ui, /const nextStopDelta = nextStop && nextStopIsLive && !lastKnown && journey\?\.live/);
  assert.match(ui, /journey && nextStop && !mapOpen && !choosingAlight && !ended && !cancelled/);
  assert.match(ui, /Volgende halte · GPS/);
  assert.match(ui, /Volgende volgens dienstregeling/);
  assert.match(ui, /Laatst bekende volgende halte/);
  assert.match(ui, /onPress=\{\(\) => openStopBoard\(nextStop\)\}/);
});

test("ritkop breekt lange teksten tussen haltes af naar volgende regel, zonder weglating", () => {
  const ui = screen("app/rit/[id].tsx");
  const statusText = ui.match(/<Text maxFontSizeMultiplier=\{1\.3\} style=\{styles\.headerStatusText\}([^>]*)>\{headerStatusText\}<\/Text>/);
  assert.ok(statusText, "status in de kopbalk ontbreekt");
  assert.doesNotMatch(statusText[1], /numberOfLines/);
  assert.match(ui, /headerStatusText: \{ flex: 1, minWidth: 0,/);
  assert.match(ui, /headerStatus: \{ flexDirection: "row", alignItems: "flex-start"/);
});

test("vertraging naast volgende halte heeft dezelfde grenzen als het haltebord", () => {
  assert.deepEqual(timelineTimeDelta(3), { text: "+3", tone: "orange" });
  assert.deepEqual(timelineTimeDelta(5), { text: "+5", tone: "red" });
  const ui = screen("app/rit/[id].tsx");
  assert.match(ui, /nextStopDelta\.tone === "orange" \? colors\.delayWarning/);
  assert.match(ui, /nextStopDelta\.tone === "red" \? colors\.danger/);
  assert.match(ui, /fontVariant: \["tabular-nums"\]/);
});
