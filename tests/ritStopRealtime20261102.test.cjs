const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),Module=require("node:module"),ts=require("typescript");
const prev=Module._extensions[".ts"];
Module._extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {normalizeRit}=require("../lib/api.ts");
if(prev)Module._extensions[".ts"]=prev;else delete Module._extensions[".ts"];
function trip(stopOverride={},top={}){
  const stop=(id,planned,other={})=>({id,name:id,state:"future",planned_arrival_time:planned,
    planned_departure_time:planned,arrival_time:planned,departure_time:planned,
    arrival_timing_live:false,departure_timing_live:false,timing_live:false,...other});
  return {live:true,delay:180,gps_age_seconds:6,line:"99",destination:"Harlingen",
    stops:[stop("Kimswerd","20:28"),stop("Station","20:35",stopOverride),
      stop("Havenplein","20:38")],...top};
}
test("fresh exact RT stop overrides trip-wide +3 min even when predicted on schedule",()=>{
  const d=normalizeRit("QBUZZ_1401",trip({rt_source:"gtfs_rt_stop",rt_feed_age_seconds:45,
    rt_arrival_at:"2026-11-02T20:35:00+01:00",rt_arrival_delay_seconds:0}));
  assert.equal(d.stops[1].expectedTime,"20:35");
  assert.equal(d.stops[1].delayMinutes,0);
  assert.equal(d.stops[1].timingSource,"stop");
  assert.equal(d.stops[1].actualKnown,false);
  assert.equal(d.stops[2].expectedTime,"20:41");
  assert.equal(d.stops[2].timingSource,"journey_estimate");
});
test("stop prediction +4 min takes priority and never becomes a measured arrival",()=>{
  const d=normalizeRit("QBUZZ_1401",trip({rt_source:"gtfs_rt_stop",rt_feed_age_seconds:30,
    rt_arrival_at:"2026-11-02T20:39:00+01:00",rt_departure_at:"2026-11-02T20:40:00+01:00",
    rt_arrival_delay_seconds:240,rt_departure_delay_seconds:300}));
  assert.equal(d.stops[1].expectedTime,"20:39");
  assert.equal(d.stops[1].expectedDepartureTime,"20:40");
  assert.equal(d.stops[1].delayMinutes,4);
  assert.equal(d.stops[1].actualTime,undefined);
});
test("RT data older than ninety seconds does not override current GPS fallback",()=>{
  const d=normalizeRit("QBUZZ_1401",trip({rt_source:"gtfs_rt_stop",rt_feed_age_seconds:99,
    rt_arrival_at:"2026-11-02T20:35:00+01:00",rt_arrival_delay_seconds:0}));
  assert.equal(d.stops[1].expectedTime,"20:38");
  assert.equal(d.stops[1].timingSource,"journey_estimate");
});
test("RT fields with wrong source or missing timestamp never override",()=>{
  const a=normalizeRit("QBUZZ_1401",trip({rt_source:"other",rt_feed_age_seconds:10,
    rt_arrival_at:"2026-11-02T20:35:00+01:00"}));
  assert.equal(a.stops[1].expectedTime,"20:38");
  const b=normalizeRit("QBUZZ_1401",trip({rt_source:"gtfs_rt_stop",rt_feed_age_seconds:10}));
  assert.equal(b.stops[1].expectedTime,"20:38");
});
test("RT future prediction must not invent past stop actual time",()=>{
  const d=normalizeRit("QBUZZ_1401",trip({state:"passed",rt_source:"gtfs_rt_stop",
    rt_feed_age_seconds:5,rt_arrival_at:"2026-11-02T20:36:00+01:00",rt_arrival_delay_seconds:60}));
  assert.equal(d.stops[1].actualKnown,false);
  assert.equal(d.stops[1].actualTime,undefined);
  assert.notEqual(d.stops[1].timingSource,"stop");
});
