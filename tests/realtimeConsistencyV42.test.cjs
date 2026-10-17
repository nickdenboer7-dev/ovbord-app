const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename
);
const { withBoardFreshness, boardingDepartureNote } = require("../lib/realtimeConsistency.ts");
const { normalizeDeparture, getHalte, getRit } = require("../lib/api.ts");
const { feedFreshness } = require("../lib/haltebordV4.ts");
const { arrivalTimingDescription } = require("../lib/ritLivePresentation.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const sample = {
  line: "N85", destination: "Gein", carrier: "GVB", mode: "bus",
  planned_time: "01:53", planned_at: "2026-10-15T01:53:00+02:00",
  effective_time: "2026-10-15T01:53:00+02:00",
  journey_id: "GVB_1603", gtfs_trip_id: "390567140", delay: 0, live: true
};

test("old feed keeps exact N85 trip ID but never calls the 01:53 departure live", () => {
  const dep = normalizeDeparture(sample);
  const aged = withBoardFreshness(dep, false);
  assert.equal(aged.ritId, "GVB_1603");
  assert.equal(aged.plannedTime, "01:53");
  assert.equal(aged.isLive, false);
  assert.equal(aged.liveDataStale, true);
  assert.equal(dep.isLive, true);
  assert.equal(withBoardFreshness(dep, true).liveDataStale, undefined);
  assert.equal(withBoardFreshness(dep, false).reliabilityDetail, undefined);
  assert.equal(withBoardFreshness({...dep, trend:"up", trendDeltaMinutes:2}, false).trend, undefined);
  assert.equal(withBoardFreshness({...dep, trend:"up", trendDeltaMinutes:2}, true).trend, "up");
});
test("planned, cancelled, departed and unrelated trips never get an invented stale live status", () => {
  const scheduled = normalizeDeparture({...sample,live:false});
  assert.equal(withBoardFreshness(scheduled,false).liveDataStale,undefined);
  assert.equal(withBoardFreshness(normalizeDeparture({...sample,cancelled:true}),false).liveDataStale,undefined);
  assert.equal(withBoardFreshness(normalizeDeparture({...sample,departed:true}),false).liveDataStale,undefined);
  const unknown = normalizeDeparture({...sample,live:undefined});
  assert.equal(withBoardFreshness(unknown,false).liveDataStale,undefined);
});
test("exact ID crosscheck: Rembrandtplein 01:52 arrival and 01:53 departure are consistent", async () => {
  const originalFetch = globalThis.fetch;
  const stopFixture = {
    name:"Amsterdam, Rembrandtplein",
    generated_at:"2026-10-15T01:25:00+02:00", feed_age_seconds:120, stale:false,
    departures:[sample]
  };
  const journeyFixture = {
    journey_id:"GVB_1603",line:"N85",destination:"Gein",carrier:"GVB",mode:"bus",
    delay:0, live:true,gps_age_seconds:36,
    vehicle:{lat:52.3793,lon:4.9021},
    stops:[
      {id:"3979709",name:"Amsterdam, Dam",planned_arrival_time:"01:48",planned_departure_time:"01:48"},
      {id:"3979986",name:"Amsterdam, Rokin",planned_arrival_time:"01:50",planned_departure_time:"01:50"},
      {id:"3979757",name:"Amsterdam, Rembrandtplein",
        planned_arrival_time:"01:52", planned_departure_time:"01:53",
        arrival_time:"01:52",departure_time:"01:53",
        arrival_timing_live:true,departure_timing_live:true}
    ]
  };
  globalThis.fetch = async (url) => ({
    ok:true, json:async () => String(url).includes("/api/rit/") ? journeyFixture : stopFixture
  });
  try {
    const board = await getHalte("3979757");
    const row = board.departures[0];
    const id = row.ritId;
    const rit = await getRit(id);
    const target=rit.stops.find(s=>s.id==="3979757");
    assert.equal(id,rit.id);
    assert.equal(id,"GVB_1603");
    assert.equal(rit.line,row.line);
    assert.equal(row.plannedTime,"01:53");
    assert.equal(target.plannedTime,"01:52");
    assert.equal(target.expectedTime,"01:52");
    assert.equal(target.plannedDepartureTime,"01:53");
    assert.equal(target.expectedDepartureTime,"01:53");
    assert.equal(boardingDepartureNote(target),"Vertrek 01:53");
    assert.equal(arrivalTimingDescription(rit.live,target.delayMinutes,false,false),"Op tijd");
    const freshness = feedFreshness(board,Date.parse("2026-10-14T23:27:00Z"),Date.parse("2026-10-14T23:27:00Z"));
    assert.equal(freshness.level,"aging");
    assert.equal(withBoardFreshness(row,false).liveDataStale,true);
  } finally {globalThis.fetch=originalFetch;}
});
test("do not fabricate separate departure when arrival and departure are same or missing",()=>{
  assert.equal(boardingDepartureNote(null),null);
  assert.equal(boardingDepartureNote({plannedTime:"01:53",expectedTime:"01:53",plannedDepartureTime:"01:53"}),null);
  assert.equal(boardingDepartureNote({plannedTime:"01:52",expectedTime:"01:52",plannedDepartureTime:undefined}),null);
  assert.equal(boardingDepartureNote({plannedTime:"01:52",expectedTime:"01:52",plannedDepartureTime:"01:53",expectedDepartureTime:"01:55"}),"Vertrek 01:55");
});
test("unknown delay is not equivalent to confirmed zero even if GPS is live",()=>{
  assert.equal(arrivalTimingDescription(true,undefined,false,false),"Vertraging niet bekend");
  assert.equal(arrivalTimingDescription(true,0,false,false),"Op tijd");
});
