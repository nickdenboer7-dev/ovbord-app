const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");
const before = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, filename);
const {
  departedNoticeVisible, shouldVerifyDeparture, journeyConfirmsDeparture, DEPARTED_VISIBLE_MS,
  MAX_DEPARTURE_CHECKS, departureNoticeIdentity, recentDepartureCandidates, confirmDepartedNotices, visibleBoardDepartures
} = require("../lib/departedNotice.ts");
const { normalizeDeparture } = require("../lib/api.ts");
if (before) Module._extensions[".ts"] = before;
else delete Module._extensions[".ts"];
const now = Date.parse("2026-10-14T17:58:00Z");
const boarding = {
  id:"2993405",name:"Leeuwarden",city:"Leeuwarden",
  mode:"bus",lines:[],lat:53.1963868,lon:5.7910221
};
const row = {
  id:"20-19:58-Heerenveen",ritId:"QBUZZ_1027",line:"20",destination:"Heerenveen",
  plannedTime:"19:58",effectiveAt:"2026-10-14T19:58:00+02:00",
  mode:"bus",isLive:true,cancelled:false
};
const route = {
  live:true,estimatedPosition:false,gpsAgeSeconds:13,
  vehicle:{lat:53.197,lon:5.8},
  stops:[
    {id:"4174607",name:"Leeuwarden, Busstation (Perron B)",
      lat:53.196458,lon:5.791479,state:"passed"},
    {id:"4174653",name:"Leeuwarden, Klanderij",lat:53.1973,lon:5.8007,state:"current"}
  ]
};
test("one minute before departure eligible but still logged-in bus is not departed",()=>{
  assert.equal(shouldVerifyDeparture(row,now-30_000),true);
  assert.equal(journeyConfirmsDeparture({...route,stops:[{...route.stops[0],state:"current"},route.stops[1]]},boarding),false);
});
test("fresh GPS and passed boarding stop confirm departure",()=>{
  assert.equal(shouldVerifyDeparture(row,now),true);
  assert.equal(journeyConfirmsDeparture(route,boarding),true);
  assert.equal(journeyConfirmsDeparture({...route,gpsAgeSeconds:95},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,vehicle:{lat:53.196458,lon:5.791479}},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,stops:[{...route.stops[0],lat:undefined,lon:undefined}]},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,live:false},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,estimatedPosition:true},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,vehicle:undefined},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,gpsAgeSeconds:undefined},boarding),false);
  assert.equal(journeyConfirmsDeparture({...route,cancelled:true},boarding),false);
});
test("unrelated passed stop cannot declare a departure from the selected board",()=>{
  const wrong={...route,stops:[{...route.stops[0],lat:53.19,lon:5.9,name:"Andere halte",id:"zz"}]};
  assert.equal(journeyConfirmsDeparture(wrong,boarding),false);
  assert.equal(journeyConfirmsDeparture({
    ...route,stops:[route.stops[1],{...route.stops[0],id:"another",name:"Andere halte",state:"passed"}]
  },boarding),false);
});
test("no verification for departures long ahead, already expired, planned or cancelled",()=>{
  assert.equal(shouldVerifyDeparture(row,now-300_000),false);
  assert.equal(shouldVerifyDeparture(row,now+DEPARTED_VISIBLE_MS+120_000),false);
  assert.equal(shouldVerifyDeparture({...row,isLive:false},now),false);
  assert.equal(shouldVerifyDeparture({...row,cancelled:true},now),false);
  assert.equal(shouldVerifyDeparture({...row,departed:true},now),false);
  assert.equal(shouldVerifyDeparture({...row,mode:"train"},now),false);
  assert.equal(shouldVerifyDeparture({...row,liveDataStale:true},now),false);
  assert.equal(MAX_DEPARTURE_CHECKS,2);
});
test("departed notice expires without any backend refresh",()=>{
  const at=now;
  assert.equal(departedNoticeVisible(at,at),true);
  assert.equal(departedNoticeVisible(at,at+DEPARTED_VISIBLE_MS-1),true);
  assert.equal(departedNoticeVisible(at,at+DEPARTED_VISIBLE_MS),false);
  assert.equal(departedNoticeVisible(at,at-1),false);
});
test("feed cancellation wins and early driver login is not a departed flag",()=>{
  const dep=normalizeDeparture({
    line:"20",planned_time:"19:58",planned_at:"2026-10-14T19:58:00+02:00",
    effective_time:"2026-10-14T19:27:44+02:00",delay:-1816,live:true
  });
  assert.equal(dep.departed,false);
  assert.equal(dep.expectedTime,"19:58");
  const confirmed=normalizeDeparture({...dep,departed:true});
  assert.equal(confirmed.departed,true);
});

test("a row disappearing from a refreshed board is checked, never assumed departed",()=>{
  const candidates=recentDepartureCandidates([row,row],[],now+15_000);
  assert.deepEqual(candidates,[row]);
  assert.deepEqual(visibleBoardDepartures([],{},now+15_000),[]);
  assert.deepEqual(recentDepartureCandidates([row],[],now+121_000),[]);
  assert.deepEqual(recentDepartureCandidates([{...row,isLive:false}],[],now),[]);
  assert.deepEqual(recentDepartureCandidates([row],[{...row,cancelled:true}],now),[]);
  assert.deepEqual(recentDepartureCandidates([row],[{...row,isLive:false}],now),[]);
});

test("confirmed departure survives refresh, keeps its clock/delay, expires once, never resurrects",()=>{
  const confirmed={...row,departed:true,delayMinutes:3};
  const notices=confirmDepartedNotices({},[confirmed],now);
  assert.deepEqual(visibleBoardDepartures([],notices,now+30_000),[confirmed]);
  assert.equal(visibleBoardDepartures([row],notices,now+30_000).length,1);
  assert.equal(visibleBoardDepartures([row],notices,now+30_000)[0].departed,true);
  assert.equal(confirmDepartedNotices(notices,[{...confirmed}],now+45_000),notices);
  assert.deepEqual(visibleBoardDepartures([],notices,now+DEPARTED_VISIBLE_MS),[]);
  assert.deepEqual(visibleBoardDepartures([confirmed],notices,now+DEPARTED_VISIBLE_MS),[]);
  assert.equal(confirmDepartedNotices(notices,[confirmed],now+90_000),notices);
  assert.deepEqual(visibleBoardDepartures([],notices,now-1),[]);
});

test("cancellation supersedes confirmation even after it leaves the feed",()=>{
  const confirmed={...row,departed:true};
  const cancelled={...row,cancelled:true,departed:false};
  const notices=confirmDepartedNotices(confirmDepartedNotices({},[confirmed],now),[cancelled],now+10_000);
  assert.deepEqual(visibleBoardDepartures([cancelled],notices,now+20_000),[cancelled]);
  assert.deepEqual(visibleBoardDepartures([],notices,now+20_000),[]);
  assert.deepEqual(visibleBoardDepartures([row],notices,now+20_000),[]);
  assert.equal(confirmDepartedNotices(notices,[confirmed],now+30_000),notices);
});

test("notice storage never interprets unconfirmed rows as departed or mutates input",()=>{
  const empty={};
  assert.equal(confirmDepartedNotices(empty,[row,{...row,cancelled:true}],now),empty);
  const confirmed={...row,departed:true};
  const notices=confirmDepartedNotices(empty,[confirmed],now);
  assert.deepEqual(empty,{});
  assert.equal(confirmed.departed,true);
  assert.equal(visibleBoardDepartures([row],notices,now)[0].departed,true);
  assert.equal(row.departed,undefined);
});

test("reused vehicle IDs do not hide a later departure, while an ETA change keeps the confirmation",()=>{
  const current={...row,serviceDate:'2026-10-14'};
  const next={...current,plannedTime:'20:58',effectiveAt:'2026-10-14T20:58:00+02:00'};
  const tomorrow={...current,serviceDate:'2026-10-15'};
  assert.notEqual(departureNoticeIdentity(current),departureNoticeIdentity(next));
  assert.notEqual(departureNoticeIdentity(current),departureNoticeIdentity(tomorrow));
  const shifted={...current,effectiveAt:'2026-10-14T19:59:00+02:00',delayMinutes:1};
  assert.equal(departureNoticeIdentity(current),departureNoticeIdentity(shifted));
  const notices=confirmDepartedNotices({},[{...current,departed:true}],now);
  assert.deepEqual(visibleBoardDepartures([next],notices,now+90_000),[next]);
  assert.equal(visibleBoardDepartures([shifted],notices,now+30_000)[0].departed,true);
  assert.equal(normalizeDeparture({...row,service_date:'2026-10-14'}).serviceDate,'2026-10-14');
});
