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

test("EBS lijn 65: GPS 39m van De Vlinder markeert halte niet als vertrokken", () => {
  const currentStops = [
    {id:"3183838",name:"Zaandam, De Vlinder",state:"current",lat:52.429726,lon:4.856271},
    {id:"3183775",name:"Zaandam, Zuidervaart",state:"upcoming",lat:52.432076,lon:4.851303}
  ];
  const stationary = {lat:52.42949,lon:4.85669,observedMs:10000};
  const routeMatch = {kind:"between",index:0,updated:new Date(10000)};
  assert.equal(loaded.exports.safeTimelineLocation(routeMatch,null,stationary,currentStops),null);
  const next = {lat:52.429491,lon:4.85669,observedMs:25000};
  const confirmed = confirmedDwellStop(stationary,next,currentStops);
  assert.equal(confirmed,0);
  const loc = loaded.exports.safeTimelineLocation(routeMatch,confirmed,next,currentStops);
  assert.deepEqual(loc,{kind:"at",index:0,updated:new Date(10000)});
  assert.equal(boardingPosition(0,loc),"at");
});

test("Na werkelijk verlaten van halte mag onderweg getoond worden", () => {
  const currentStops = [
    {id:"a",name:"De Vlinder",state:"current",lat:52.429726,lon:4.856271},
    {id:"b",name:"Zuidervaart",state:"upcoming",lat:52.432076,lon:4.851303}
  ];
  const moved = {lat:52.4304,lon:4.8553,observedMs:40000};
  const match = {kind:"between",index:0,updated:new Date(40000)};
  assert.deepEqual(loaded.exports.safeTimelineLocation(match,null,moved,currentStops),match);
});
