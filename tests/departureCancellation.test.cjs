const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const before = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
};
const { normalizeDeparture } = require("../lib/api.ts");
const { departurePresentation } = require("../lib/departurePresentation.ts");
if (before) Module._extensions[".ts"] = before;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-14T13:37:00Z");
const apiRow = (fields = {}) => ({
  gtfs_trip_id: "385974931",
  line: "355", destination: "Bolsward", carrier: "QBUZZ",
  mode: "bus", planned_time: "15:42",
  effective_time: "2026-10-14T15:42:00+02:00",
  cancelled: true, live: false, platform: "M",
  ...fields
});

test("real OVbord API cancellation field survives normalization", () => {
  const dep = normalizeDeparture(apiRow());
  assert.equal(dep.cancelled, true);
  assert.equal(dep.plannedTime, "15:42");
  assert.equal(dep.line, "355");
  assert.equal(dep.destination, "Bolsward");
  assert.deepEqual(departurePresentation(dep, now), {
    cancelled: true, clock: "15:42", countdown: ""
  });
});

test("cancelled services keep the expected clock but never present a countdown", () => {
  const dep = normalizeDeparture(apiRow({
    effective_time:"2026-10-14T15:47:00+02:00", delay: 300, live: true
  }));
  assert.equal(dep.cancelled, true);
  assert.equal(departurePresentation(dep, now).clock, "15:47");
  assert.equal(departurePresentation(dep, now).countdown, "");
});

test("live or planned non-cancelled services retain normal countdown", () => {
  const planned = normalizeDeparture(apiRow({
    line:"60", destination:"Holwert", planned_time:"15:49",
    effective_time:"2026-10-14T15:49:00+02:00", cancelled:false
  }));
  assert.equal(planned.cancelled, false);
  assert.equal(departurePresentation(planned, now).clock, "15:49");
  assert.equal(departurePresentation(planned, now).countdown, "over 12 min");
  const noFlag = normalizeDeparture(apiRow({ cancelled:undefined, line:"60" }));
  assert.equal(noFlag.cancelled, false);
});

test("disruption notice is never interpreted as trip cancellation", () => {
  assert.equal(normalizeDeparture(apiRow({
    cancelled: undefined, disruption:"Vakbondsstaking: houd rekening met uitval"
  })).cancelled, false);
  assert.equal(normalizeDeparture(apiRow({ cancelled:"true" })).cancelled, false);
});
