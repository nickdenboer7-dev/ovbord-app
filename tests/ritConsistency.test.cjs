const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/ritConsistency.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled.outputText, filename);
const { delayedClock, confirmedDwellStop, verifiedTimelineLocation, boardingPosition } = loaded.exports;

test("seconds-based predictions agree with minute precision on stop boards", () => {
  assert.equal(delayedClock("00:31", -60), "00:30");
  assert.equal(delayedClock("01:05", -133), "01:02");
  assert.equal(delayedClock("00:50", 52), "00:50");
  assert.equal(delayedClock("23:59", 120), "00:01");
  assert.equal(delayedClock("00:00", -120), "23:58");
  assert.equal(delayedClock("bad", 30), undefined);
  assert.equal(delayedClock("00:31", undefined), undefined);
});

const stops = [
  {id:"a",name:"Vorige halte",plannedTime:"00:27",lat:52.09,lon:5.12},
  {id:"b",name:"Neude",plannedTime:"00:31",lat:52.091,lon:5.122}
];
const near = (lat, t) => ({lat,lon:5.122,observedMs:t});

test("first GPS reading near Neude is NOT Nu hier", () => {
  assert.equal(confirmedDwellStop(null,near(52.091,10000),stops),null);
  assert.deepEqual(verifiedTimelineLocation({kind:"at",index:1,updated:new Date(10000)},null),
    {kind:"between",index:0,updated:new Date(10000)});
});

test("confirmed stable readings must be eight seconds apart", () => {
  assert.equal(confirmedDwellStop(near(52.091,10000),near(52.091,16000),stops),null);
  assert.equal(confirmedDwellStop(near(52.091,10000),near(52.091002,19000),stops),1);
  assert.equal(confirmedDwellStop(near(52.091,10000),near(52.0907,19000),stops),null);
});

test("boarding state comes only from verified location", () => {
  assert.equal(boardingPosition(1,{kind:"between",index:0,updated:new Date()}),"approaching");
  assert.equal(boardingPosition(1,{kind:"at",index:1,updated:new Date()}),"at");
  assert.equal(boardingPosition(1,{kind:"between",index:1,updated:new Date()}),"passed");
  assert.equal(boardingPosition(1,null),"unknown");
});
