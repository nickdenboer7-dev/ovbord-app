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
const {findBoardingIndex,boardingHintFromParams,distanceMeters,BOARDING_MATCH_RADIUS_M} = require("../lib/boardingMatch.ts");
const {normalizeRit} = require("../lib/api.ts");
const {bestNearbyStopId,buurtbordPreviewRows} = require("../lib/buurtbord.ts");
const {describeUpdate} = require("../lib/appVersion.ts");
const {ritColors} = require("../lib/ritTheme.ts");
const {tripCancellation} = require("../lib/ritCancellation.ts");
const {mapFitKey} = require("../lib/mapFit.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

// Real /api/halte/2993985 and /api/rit/387611721 (IC Utrecht -> Rotterdam), 15 Oct 2026.
const utrechtBoard = {id:"2993985",name:"Utrecht, Centraal Station",lat:52.08978110749147,lon:5.109667639900818,time:"04:10"};
const icRaw = {
  line:"Intercity", destination:"Rotterdam Centraal", mode:"train", live:false, cancelled:false, disruptions:[],
  stops:[
    {id:"2994010",name:"Utrecht Centraal",lat:52.090090840642866,lon:5.110243869991475,planned_arrival_time:"04:10",planned_departure_time:"04:10",track:"5",state:"future"},
    {id:"2992182",name:"Amsterdam Centraal",lat:52.3796500217,lon:4.89998281002,planned_arrival_time:"04:44",planned_departure_time:"04:46",track:"15a",state:"future"},
    {id:"3065387",name:"Schiphol Airport",lat:52.309126024937584,lon:4.762030265997592,planned_arrival_time:"05:01",planned_departure_time:"05:05",track:"1-2",state:"future"},
    {id:"2993770",name:"Rotterdam Centraal",lat:51.924970372558775,lon:4.468569227289916,planned_arrival_time:"05:57",planned_departure_time:"05:57",track:"8",state:"future"}
  ]
};
const ic = normalizeRit("387611721", icRaw);

// Punt 1: halteherkenning
test("train station with different ID and name is found by position and time", () => {
  assert.ok(distanceMeters(utrechtBoard, ic.stops[0]) < 80);
  assert.equal(findBoardingIndex(ic.stops, utrechtBoard), 0);
});
test("without position a differently named station is NOT guessed", () => {
  assert.equal(findBoardingIndex(ic.stops, {id:"2993985",name:"Utrecht, Centraal Station",time:"04:10"}), -1);
});
test("same ID or punctuation-insensitive name still wins first", () => {
  assert.equal(findBoardingIndex(ic.stops, {id:"3065387"}), 2);
  assert.equal(findBoardingIndex(ic.stops, {name:"rotterdam  centraal"}), 3);
  assert.equal(findBoardingIndex(ic.stops, {name:"Schiphol-Airport"}), 2);
});
test("loop line visiting the boarding stop twice picks the planned time", () => {
  const loop = [
    {id:"A",name:"Station",plannedTime:"10:00",plannedDepartureTime:"10:00",state:"upcoming"},
    {id:"B",name:"Ziekenhuis",plannedTime:"10:10",state:"upcoming"},
    {id:"A",name:"Station",plannedTime:"10:20",plannedDepartureTime:"10:21",state:"end"}
  ];
  assert.equal(findBoardingIndex(loop, {id:"A",time:"10:21"}), 2);
  assert.equal(findBoardingIndex(loop, {id:"A",time:"10:00"}), 0);
  assert.equal(findBoardingIndex(loop, {id:"A"}), 0);
});
test("far away or ambiguous nearby stops do not match", () => {
  // ~70 m from Amsterdam Centraal, at a time that matches no stop:
  const far = {lat:52.3790,lon:4.9000,time:"23:59"};
  assert.equal(findBoardingIndex(ic.stops, {lat:52.0,lon:5.5}), -1);
  const twoClose = [
    {id:"1",name:"Halte Noord",lat:52.0000,lon:5.0000,plannedTime:"10:00",state:"upcoming"},
    {id:"2",name:"Halte Zuid",lat:52.0012,lon:5.0000,plannedTime:"10:02",state:"upcoming"}
  ];
  assert.equal(findBoardingIndex(twoClose, {lat:52.0006,lon:5.0,time:"09:00"}), -1);
  assert.equal(findBoardingIndex(twoClose, {lat:52.0006,lon:5.0,time:"10:02"}), 1);
  assert.equal(findBoardingIndex(twoClose, {lat:52.0001,lon:5.0}), -1);
  assert.equal(findBoardingIndex([twoClose[0]], {lat:52.0001,lon:5.0}), 0);
  assert.ok(distanceMeters(far, ic.stops[1]) < BOARDING_MATCH_RADIUS_M);
  assert.equal(findBoardingIndex(ic.stops, far), 1, "single stop in radius is accepted");
});
test("route params become a clean hint", () => {
  assert.deepEqual(boardingHintFromParams({boardingId:"2993985",boardingName:"Utrecht, Centraal Station",
    boardingLat:"52.0897",boardingLon:"5.1096",boardingTime:"04:10"}),
    {id:"2993985",name:"Utrecht, Centraal Station",lat:52.0897,lon:5.1096,time:"04:10"});
  assert.deepEqual(boardingHintFromParams({boardingLat:"",boardingLon:"abc"}),
    {id:undefined,name:undefined,lat:undefined,lon:undefined,time:undefined});
});

// Punt 4 + 5: uitval, meldingen en spoor uit /api/rit
test("trip cancellation and notices from /api/rit are kept", () => {
  assert.equal(ic.cancelled, false);
  assert.deepEqual(ic.disruptions, []);
  const cancelled = normalizeRit("x", {...icRaw, cancelled:true,
    disruptions:[{title:"Werkzaamheden",message:"Bus in plaats van trein",severity:"warning"}]});
  assert.equal(cancelled.cancelled, true);
  assert.deepEqual(cancelled.disruptions, [{title:"Werkzaamheden",description:"Bus in plaats van trein",severity:"warning"}]);
  const missing = normalizeRit("x", {stops:[]});
  assert.equal(missing.cancelled, false);
  assert.deepEqual(missing.disruptions, []);
});
test("track per stop is available for the timeline", () => {
  assert.deepEqual(ic.stops.map(s=>s.platform), ["5","15a","1-2","8"]);
  assert.equal(ic.stops[0].plannedDepartureTime, "04:10");
});

// Punt 3: Buurtbord
const now = Date.parse("2026-10-15T10:00:00+02:00");
const dep = (min, extra={}) => ({id:"d"+min+(extra.id||""),line:"12",destination:"X",plannedTime:"",relativeText:"",reliability:"planned",
  effectiveAt:new Date(now+min*60000).toISOString(),...extra});
test("preview drops departed and past trips, keeps cancelled ones marked", () => {
  const rows = buurtbordPreviewRows([dep(-10), dep(2,{departed:true}), dep(3,{cancelled:true}), dep(5), dep(8), dep(12)], now);
  assert.deepEqual(rows.map(r=>r.id), ["d3","d5","d8"]);
  assert.equal(rows[0].cancelled, true);
});
test("best stop ignores cancelled trips and unreachable departures", () => {
  const stops = [{id:"A",walkMinutes:2},{id:"B",walkMinutes:6}];
  assert.equal(bestNearbyStopId(stops, {A:[dep(3,{cancelled:true}), dep(30)], B:[dep(8)]}, now), "B");
  assert.equal(bestNearbyStopId(stops, {A:[dep(1)], B:[dep(4)]}, now), "", "nothing reachable on foot");
  assert.equal(bestNearbyStopId(stops, {A:[dep(4,{departed:true})]}, now), "");
  assert.equal(bestNearbyStopId(stops, {A:[dep(5)], B:[dep(7)]}, now), "A");
});

// Punt 8: versie en OTA
test("update description tells embedded, dev and OTA bundles apart", () => {
  const base = {isDev:false,isEnabled:true,isEmbeddedLaunch:false,createdAt:new Date("2026-10-15T01:20:00Z"),channel:"preview",updateId:"0a1b2c3d-4e5f"};
  assert.deepEqual(describeUpdate(base), {label:"Update van 15 okt 03:20",detail:"kanaal preview · id 0a1b2c3d"});
  assert.equal(describeUpdate({...base,isEmbeddedLaunch:true}).label, "Ingebouwde versie");
  assert.equal(describeUpdate({...base,isDev:true}).label, "Ontwikkelversie");
  assert.equal(describeUpdate({...base,isEnabled:false}).label, "Updates uitgeschakeld");
  assert.equal(describeUpdate({...base,createdAt:new Date("x")}).label, "Ingebouwde versie");
});

// Punt 2/4: kleuren
test("cancel colours match the board in light mode and exist in dark mode", () => {
  assert.equal(ritColors.light.cancelBg, "#FFF4F3");
  assert.equal(ritColors.dark.cancelBg, "#341919");
  for (const k of ["cancelBg","cancelBorder","warnAlertBg","warnAlertBorder"]) {
    assert.ok(ritColors.light[k] && ritColors.dark[k], k);
    assert.notEqual(ritColors.light[k], ritColors.dark[k], k);
  }
});

// Testronde V4.5: GTFS-rit 391344404 — /api/halte cancelled:true, /api/rit cancelled:false
test("a cancellation reported by either source is shown, with its source", () => {
  assert.deepEqual(tripCancellation(false, true), {cancelled:true, source:"haltebord"});
  assert.deepEqual(tripCancellation(true, false), {cancelled:true, source:"rit"});
  assert.deepEqual(tripCancellation(true, true), {cancelled:true, source:"rit"});
  assert.deepEqual(tripCancellation(false, false), {cancelled:false, source:null});
  assert.deepEqual(tripCancellation(undefined, false), {cancelled:false, source:null});
});

// Testronde V4.5: Buurtbord-kaart bleef op het eerste (lege) beeld staan
test("map re-frames when the set of stops changes, not on every refresh", () => {
  const utrecht = [{id:"a",lat:52.09,lon:5.11},{id:"b",lat:52.091,lon:5.112}];
  assert.equal(mapFitKey([], undefined), "", "nothing to frame while loading");
  const first = mapFitKey(utrecht, {lat:52.09,lon:5.11});
  assert.notEqual(first, "");
  assert.equal(mapFitKey([...utrecht].reverse(), {lat:52.0901,lon:5.1101}), first, "same stops, refresh: keep view");
  assert.notEqual(mapFitKey([{id:"c",lat:52.37,lon:4.9}], {lat:52.37,lon:4.9}), first, "other city: re-frame");
  assert.equal(mapFitKey([{id:"x",lat:NaN,lon:5}], undefined), "", "invalid markers are ignored");
});
