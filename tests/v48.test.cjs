const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, file
);
const offline = require("../lib/offline.ts");
const { departureCountdown } = require("../lib/format.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

// Telefoontest 15-10: drie restpunten offline
test("'Onderweg' becomes a last-known status, other statuses stay as they are", () => {
  assert.equal(offline.lastKnownStatus("Onderweg", true), "Laatst: onderweg");
  assert.equal(offline.lastKnownStatus("Bij halte", true), "Laatst: bij halte");
  assert.equal(offline.lastKnownStatus("Onderweg", false), "Onderweg");
  for (const s of ["Verwacht", "Gepland", "Gepasseerd", "Rijdt niet"]) assert.equal(offline.lastKnownStatus(s, true), s);
});

test("next stop is presented as last known once refreshing fails", () => {
  assert.equal(offline.nextStopSummary({ lastKnown: false, isBoarding: false, name: "Weesperplein" }), "Volgende halte · Weesperplein");
  assert.equal(offline.nextStopSummary({ lastKnown: true, isBoarding: false, name: "Weesperplein" }), "Laatst bekend: volgende halte Weesperplein");
  assert.equal(offline.nextStopSummary({ lastKnown: false, isBoarding: true, name: "X" }), "Jouw halte is de volgende");
  assert.equal(offline.nextStopSummary({ lastKnown: true, isBoarding: true, name: "X" }), "Laatst bekend: jouw halte was de volgende");
});

test("a countdown from last known data reads as an estimate", () => {
  assert.equal(offline.staleCountdown("over 3 min"), "± 3 min");
  assert.equal(offline.staleCountdown("over 12 min"), "± 12 min");
  assert.equal(offline.staleCountdown("nu"), "± nu");
  assert.equal(offline.staleCountdown(""), "");
  assert.equal(offline.staleCountdown("tijd onbekend"), "tijd onbekend");
  // Real output of the board countdown, so the two never drift apart.
  const now = Date.parse("2026-10-15T23:00:00+02:00");
  const row = (min) => ({ plannedTime: "", effectiveAt: new Date(now + min * 60000).toISOString() });
  assert.equal(offline.staleCountdown(departureCountdown(row(3), now)), "± 3 min");
  assert.equal(offline.staleCountdown(departureCountdown(row(0), now)), "± nu");
});
