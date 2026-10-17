const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const src = fs.readFileSync(path.join(__dirname, "../lib/trainLineLabel.ts"), "utf8");
const result = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const mod = new Module("trainLineLabel", module);
mod._compile(result.outputText, "trainLineLabel.js");
const { compactTrainLineLabel: short } = mod.exports;

test("preserve regional codes already supplied by the feed", () => {
  assert.equal(short("Sneltrein RE1", "Arriva"), "RE1");
  assert.equal(short("Stoptrein RS1", "Arriva"), "RS1");
  assert.equal(short("Sneltrein RE20", "Blauwnet"), "RE20");
  assert.equal(short("Sprinter RS22", "Keolis"), "RS22");
});
test("RS refers to regional stopping train and RE to regional express", () => {
  assert.equal(short("Stoptrein", "Arriva"), "RS");
  assert.equal(short("Sneltrein", "Arriva"), "RE");
  assert.equal(short("Stoptrein", "RRReis"), "RS");
});
test("never invent a regional identity or route number for an unknown carrier", () => {
  assert.equal(short("Stoptrein"), "ST");
  assert.equal(short("Sneltrein"), "SN");
  assert.equal(short("Sprinter"), "SPR");
  assert.equal(short("Intercity"), "IC");
  assert.equal(short("Sneltrein 2", "Arriva"), "RE 2");
});
test("leave other line badges untouched, including existing abbreviated services", () => {
  for (const value of ["355", "RS1", "RE1", "IC23", "S", "ST", "SPR"]) {
    assert.equal(short(value, "Arriva"), value);
  }
});
