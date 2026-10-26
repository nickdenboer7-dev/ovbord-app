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
const { isStopRelocationNotice, noticeStopTargets } = require("../lib/ritProgress.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const stops = [
  { id: "a", name: "Centraal Station", lat: 52.37, lon: 4.90 },
  { id: "b", name: "Dijkgraafplein", lat: 52.35, lon: 4.78 },
  { id: "b", name: "Dijkgraafplein", lat: 52.35, lon: 4.78 }
];

test("halteverplaatsing herkent getroffen haltes op ID zonder andere zijde te verzinnen", () => {
  const notice = { title: "Tram 17 stopt aan de andere kant.", badge: "Haltewijziging", stopIds: ["b"] };
  assert.equal(isStopRelocationNotice(notice), true);
  assert.deepEqual(noticeStopTargets(notice, stops), [stops[1]]);
  assert.deepEqual(noticeStopTargets({ ...notice, stopIds: ["onbekend"] }, stops), []);
});

test("algemene vertraging geeft geen misleidende opstapkaart", () => {
  assert.deepEqual(noticeStopTargets({ title: "Vertraging", description: "Tram rijdt later", stopIds: ["a", "b"] }, stops), []);
  assert.deepEqual(noticeStopTargets({ title: "Halte verplaatst" }, stops), []);
  assert.equal(isStopRelocationNotice({ title: "Tijdelijke halte" }), true);
});

test("ritscherm focust uitsluitend een bestaande halte en vermeldt onzekere opstapzijde", () => {
  const ui = fs.readFileSync(path.join(__dirname, "../app/rit/[id].tsx"), "utf8");
  assert.match(ui, /noticeStopTargets\(notice, journey\.stops\)/);
  assert.match(ui, /onPress=\{\(\) => showAffectedStop\(stop\)\}/);
  assert.match(ui, /focusStopId=\{alertMapStopId\}/);
  assert.match(ui, /De nieuwe opstapzijde is niet bevestigd/);
  assert.match(ui, /if \(!validPosition\(coordFromStop\(stop\)\)\) \{ openStopBoard\(stop\); return; \}/);
});
