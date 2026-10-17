const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/ritLivePresentation.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled.outputText, filename);
const { verifiedNextStopIndex, arrivalTimingDescription } = loaded.exports;
const at = (index) => ({ kind: "at", index, updated: new Date() });
const between = (index) => ({ kind: "between", index, updated: new Date() });

test("next-stop claim is withheld without fresh verified GPS", () => {
  assert.equal(verifiedNextStopIndex(null, 24), null);
  assert.equal(verifiedNextStopIndex(undefined, 24), null);
  assert.equal(verifiedNextStopIndex(null, 0), null);
});
test("position on route shows correct next stop without inventing one beyond terminus", () => {
  assert.equal(verifiedNextStopIndex(at(3), 8), 4);
  assert.equal(verifiedNextStopIndex(between(3), 8), 4);
  assert.equal(verifiedNextStopIndex(between(6), 8), 7);
  assert.equal(verifiedNextStopIndex(at(7), 8), null);
  assert.equal(verifiedNextStopIndex(between(7), 8), null);
});
test("out-of-range GPS index is rejected", () => {
  assert.equal(verifiedNextStopIndex(at(-1), 8), null);
  assert.equal(verifiedNextStopIndex(at(8), 8), null);
  assert.equal(verifiedNextStopIndex(between(2.4), 8), null);
});
test("live ETA never claims on time without a measured zero delay", () => {
  assert.equal(arrivalTimingDescription(true, undefined, false, false), "Vertraging niet bekend");
  assert.equal(arrivalTimingDescription(true, 0, false, false), "Op tijd");
  assert.equal(arrivalTimingDescription(true, 2, false, false), "2 min vertraging");
  assert.equal(arrivalTimingDescription(true, -1, false, false), "1 min eerder dan gepland");
  assert.equal(arrivalTimingDescription(false, 0, false, false), "Volgens dienstregeling");
});
test("passed stops distinguish actual arrival time from schedule", () => {
  assert.equal(arrivalTimingDescription(true, 0, true, false), "Passeertijd niet bevestigd");
  assert.equal(arrivalTimingDescription(true, 0, true, true), "Werkelijke aankomsttijd");
});
