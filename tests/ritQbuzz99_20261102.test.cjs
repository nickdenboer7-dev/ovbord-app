const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const before = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText,file);
const { parseDisruptions } = require("../lib/haltebordV4.ts");
const { upcomingJourneyNotices } = require("../lib/upcomingJourneyNotices.ts");
const { skippedStopIds, isSkipNotice } = require("../lib/ritProgress.ts");
const { normalizeRit } = require("../lib/api.ts");
if(before)Module._extensions[".ts"]=before;else delete Module._extensions[".ts"];

const at=Date.parse("2026-11-02T17:33:00+01:00");
const rawNotices=[
 {title:"Lijnen 99 en 190 stoppen niet bij deze halte tot 14 november 02:00 uur i.v.m. werkzaamheden. Maak gebruik van Station Harlingen.",
  description:"Oorzaak: Wegwerkzaamheden. Effect: Haltes Kimswerderweg, Grettingalaan, De Batting, Groot Ropens en Carpe Diem vervallen.",
  badge:"Reisinformatie",stop_ids:["3963748","3963750","3963752"],
  active_periods:[[Date.parse("2026-10-26T05:00:00+01:00")/1000,Date.parse("2026-11-14T02:00:00+01:00")/1000]]},
 {title:"Lijnen 99 en 190 stoppen niet bij deze halte. Maak gebruik van halte Carpe Diem.",
  description:"Haltes Kimswerderweg, Grettingalaan, De Batting, Groot Ropens en Carpe Diem vervallen.",
  stop_ids:["3964423"],active_periods:[[Date.parse("2026-10-26T05:00:00+01:00")/1000,Date.parse("2026-11-14T02:00:00+01:00")/1000]]}
];
const stops=[
 {id:"3964423",name:"Kimswerd, Carpe Diem",state:"upcoming"},
 {id:"3963748",name:"Harlingen, Groot Ropens",state:"upcoming"},
 {id:"3963752",name:"Harlingen, De Batting",state:"upcoming"},
 {id:"3963750",name:"Harlingen, Kimswerderweg",state:"upcoming"},
 {id:"3963737",name:"Harlingen, Station",state:"upcoming"}
];
test("Qbuzz 99 notifications mark the four affected stop IDs, not Station",()=>{
 const notices=parseDisruptions(rawNotices);
 assert.equal(notices.length,2);
 assert.equal(isSkipNotice(notices[0]),true);
 const active=upcomingJourneyNotices(notices,stops,null,at,false);
 const skipped=skippedStopIds(active,stops);
 assert.deepEqual([...skipped].sort(),["3963748","3963750","3963752","3964423"].sort());
 assert.equal(skipped.has("3963737"),false);
});
test("expired and passed stop notices cannot make a future stop disappear",()=>{
 const notices=parseDisruptions(rawNotices);
 assert.equal(upcomingJourneyNotices(notices,stops,null,Date.parse("2026-11-16T12:00:00+01:00")).length,0);
 const filtered=upcomingJourneyNotices(notices,stops,{kind:"between",index:1},at);
 const skipped=skippedStopIds(filtered,stops);
 assert.equal(skipped.has("3964423"),false);
 assert.equal(skipped.has("3963748"),false);
 assert.equal(skipped.has("3963752"),true);
});
test("general diversion and affirmative stops remain untouched",()=>{
 assert.equal(isSkipNotice({badge:"Omleiding",title:"Lijn 99 rijdt om"}),false);
 assert.equal(isSkipNotice({title:"Halte X blijft bereikbaar"}),false);
 assert.equal(isSkipNotice({title:"Haltes Carpe Diem en De Batting vervallen"}),true);
 assert.equal(isSkipNotice({title:"Lijnen 99 en 190 stoppen niet bij deze halte"}),true);
 assert.equal(isSkipNotice({title:"Halte X vervalt"}),true);
 const other=parseDisruptions([{title:"Lijn 99 rijdt via andere route",stop_ids:["3963748"]}]);
 assert.deepEqual([...skippedStopIds(other,stops)],[]);
});
function trip(overrides={}){
 const stop=(id,planned,extra={})=>({id,name:id,planned_arrival_time:planned,planned_departure_time:planned,
  arrival_time:planned,departure_time:planned,
  arrival_timing_live:true,departure_timing_live:true,timing_live:true,delay_seconds:0,state:"future",...extra});
 return {live:true,delay:-240,gps_age_seconds:9,line:"99",destination:"Harlingen",
  stops:[stop("start","17:34"),stop("3964423","18:33"),stop("3963748","18:35"),
    stop("3963737","18:38")],...overrides};
}
test("fresh GPS + KV6 trip delay yields labeled ETA, not a confirmed stop observation",()=>{
 const tripData=normalizeRit("QBUZZ_1442",trip());
 const target=tripData.stops[1];
 assert.equal(target.expectedTime,"18:29");
 assert.equal(target.delayMinutes,-4);
 assert.equal(target.timingSource,"journey_estimate");
 assert.equal(target.actualKnown,false);
});
test("stale GPS must not turn trip delay into per-stop realtime",()=>{
 const data=normalizeRit("QBUZZ_1442",trip({gps_age_seconds:450}));
 assert.equal(data.stops[1].expectedTime,"18:33");
 assert.equal(data.stops[1].timingSource,"schedule");
 assert.equal(data.stops[1].delayMinutes,undefined);
});
test("distinct stop-level timing takes precedence over global KV6 delay",()=>{
 const t=trip();t.stops[1].arrival_time="18:36";t.stops[1].departure_time="18:36";
 t.stops[1].arrival_timing_live=true;t.stops[1].departure_timing_live=true;t.stops[1].delay_seconds=180;
 const data=normalizeRit("QBUZZ_1442",t);
 assert.equal(data.stops[1].expectedTime,"18:36");
 assert.equal(data.stops[1].delayMinutes,3);
 assert.equal(data.stops[1].timingSource,"stop");
});
test("unconfirmed projected time at a passed stop is not a measured actual",()=>{
 const t=trip({gps_age_seconds:450});t.stops[1].state="passed";t.stops[1].arrival_time="18:36";t.stops[1].delay_seconds=180;
 const data=normalizeRit("QBUZZ_1442",t);
 assert.equal(data.stops[1].actualKnown,false);
 assert.equal(data.stops[1].actualTime,undefined);
});
const ui=fs.readFileSync(path.join(__dirname,"../app/rit/[id].tsx"),"utf8");
test("skipped stops cross out the time and do not show a delay badge",()=>{
 assert.match(ui,/skip && styles\.skippedTime/);
 assert.match(ui,/delta && !passed && !skip/);
 assert.match(ui,/skip && isTime\(stop\.plannedTime\)/);
});
