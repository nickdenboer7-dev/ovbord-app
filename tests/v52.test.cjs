const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, file
);
const id = require("../lib/ritIdentity.ts");
const { usableRitReturnCache, usableOfflineRitCache } = require("../lib/ritReturnCache.ts");
const { visibleTimelineWindow } = require("../lib/ritRedesign.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const stop = (name, plannedDepartureTime) => ({ id: name, name: "Amsterdam, " + name, plannedTime: plannedDepartureTime,
  plannedDepartureTime, expectedTime: plannedDepartureTime, state: "upcoming" });
// Vastgesteld 16-10: /api/rit/GVB_1913 gaf 's nachts N85 naar Gein en om 10:46 lijn 71 naar Osdorpplein Oost.
const n85 = { id: "GVB_1913", line: "N85", destination: "Gein", stops: [stop("Centraal Station", "01:40"), stop("Dam", "01:43"), stop("Gein", "02:39")] };
const n85Back = { ...n85, destination: "Centraal Station", stops: [stop("Gein", "02:47"), stop("Dam", "03:30"), stop("Centraal Station", "03:33")] };
const line71 = { ...n85, line: "71", destination: "Osdorpplein Oost", stops: [stop("Matterhorn", "10:33"), stop("Osdorpplein Oost", "10:44")] };

test("vehicle-based trip IDs are recognised; timetable IDs are not", () => {
  for (const v of ["GVB_1913", "GVB_2116", "EBS_4312"]) assert.equal(id.vehicleBasedTripId(v), true, v);
  for (const v of ["GVB_METRO_GTFS_390510660", "4039", "390512165", "", "IFF:SPR:4039"]) assert.equal(id.vehicleBasedTripId(v), false, v);
});

test("a new trip of the same vehicle is recognised; refreshes of one trip are not", () => {
  const a = id.tripSignature(n85);
  assert.equal(id.differentTrip(a, id.tripSignature({ ...n85, stops: n85.stops.map(s => ({ ...s, expectedTime: "01:45" })) })), false);
  assert.equal(id.differentTrip(a, id.tripSignature({ ...n85, destination: "Amsterdam Gein" })), false);
  assert.equal(id.differentTrip(a, id.tripSignature(line71)), true);
  assert.equal(id.differentTrip(a, id.tripSignature(n85Back)), true);
  // Loop line: same start and destination, a later departure.
  assert.equal(id.differentTrip(a, id.tripSignature({ ...n85, stops: [stop("Centraal Station", "02:40"), ...n85.stops.slice(1)] })), true);
  // Missing data is never a difference.
  assert.equal(id.differentTrip(a, id.tripSignature({ ...n85, stops: [{ ...n85.stops[0], plannedDepartureTime: undefined, plannedTime: "--:--" }] })), false);
  assert.equal(id.differentTrip(null, a), false);
  assert.equal(id.tripSignature({ ...n85, stops: [] }), null);
});

test("the tapped trip versus what the vehicle drives right now", () => {
  assert.equal(id.otherLineThanExpected("N85", "71"), true);
  assert.equal(id.otherLineThanExpected("14", "014"), false);
  assert.equal(id.otherLineThanExpected("IC", "Intercity"), false);
  assert.equal(id.otherLineThanExpected("SPR", "Sprinter"), false);
  assert.equal(id.notTheTappedTrip("GVB_1913", { line: "N85", destination: "Gein" }, line71), true);
  assert.equal(id.notTheTappedTrip("GVB_1913", { line: "N85", destination: "Gein" }, n85Back), true);
  assert.equal(id.notTheTappedTrip("GVB_1913", { line: "N85", destination: "Gein" }, n85), false);
  assert.equal(id.notTheTappedTrip("GVB_1913", { line: "", destination: "" }, line71), false);
  assert.equal(id.notTheTappedTrip("390567211", { line: "N85", destination: "Gein" }, line71), false);
});

test("texts for another trip and for a continuing vehicle", () => {
  assert.equal(id.otherTripMessage(n85Back, { line: "N85", destination: "Gein" }),
    "Deze bus rijdt nu lijn N85 naar Centraal Station. Lijn N85 naar Gein verschijnt hier zodra die begint.");
  assert.equal(id.otherTripMessage(line71, { line: "", destination: "Gein" }),
    "Deze bus rijdt nu lijn 71 naar Osdorpplein Oost. Je rit naar Gein verschijnt hier zodra die begint.");
  assert.equal(id.continuationText(n85Back, "02:47"), "Rit beëindigd · deze bus rijdt verder als lijn N85 naar Centraal Station (vertrek 02:47)");
  assert.equal(id.continuationText(line71, ""), "Rit beëindigd · deze bus rijdt verder als lijn 71 naar Osdorpplein Oost");
});

test("vehicle place from verified progress only", () => {
  const names = ["Prinsengracht", "Frederiksplein", "Van Woustraat"];
  assert.equal(id.vehiclePlaceText(names, { kind: "between", index: 0 }, false), "Tussen Prinsengracht en Frederiksplein");
  assert.equal(id.vehiclePlaceText(names, { kind: "at", index: 1 }, false), "Bij Frederiksplein");
  assert.equal(id.vehiclePlaceText(names, { kind: "between", index: 0 }, true), "Laatst tussen Prinsengracht en Frederiksplein");
  assert.equal(id.vehiclePlaceText(names, { kind: "between", index: 2 }, false), "Bij Van Woustraat");
  assert.equal(id.vehiclePlaceText(names, null, false), "");
  assert.equal(id.vehiclePlaceText(names, { kind: "at", index: 9 }, false), "");
});

test("speed between two GPS fixes, only when plausible", () => {
  const a = { lat: 52.3600, lon: 4.9000, observedMs: 0 };
  const b = { lat: 52.3609, lon: 4.9000, observedMs: 18000 };
  assert.equal(id.estimatedSpeedKmh(a, b), 20);
  assert.equal(id.estimatedSpeedKmh(a, { ...b, observedMs: 5000 }), null);
  assert.equal(id.estimatedSpeedKmh(a, { ...b, observedMs: 200000 }), null);
  assert.equal(id.estimatedSpeedKmh(a, { lat: 52.40, lon: 4.9, observedMs: 18000 }), null);
  assert.equal(id.estimatedSpeedKmh(null, b), null);
  assert.equal(id.estimatedSpeedKmh(a, { ...a, observedMs: 15000 }), 0);
});

test("a cached trip of the same vehicle in the other direction is not reused", () => {
  const now = 1_000_000;
  const entry = { data: { ...n85 }, fetchedAt: now - 1000 };
  assert.equal(usableRitReturnCache(entry, "GVB_1913", "N85", now, "Gein"), true);
  assert.equal(usableRitReturnCache(entry, "GVB_1913", "N85", now, "Centraal Station"), false);
  assert.equal(usableRitReturnCache(entry, "GVB_1913", "N85", now), true);
  assert.equal(usableOfflineRitCache(entry, "GVB_1913", "N85", now, "Centraal Station"), false);
  assert.equal(usableOfflineRitCache(entry, "GVB_1913", "N85", now, "Gein"), true);
});

test("on board, the timeline follows the vehicle instead of the boarding stop", () => {
  assert.deepEqual(visibleTimelineWindow(35, 3, { kind: "between", index: 12 }, false), { start: 10, end: 19, hiddenFollowing: 16 });
  assert.deepEqual(visibleTimelineWindow(35, 3, { kind: "between", index: 1 }, false), { start: 1, end: 10, hiddenFollowing: 25 });
  assert.deepEqual(visibleTimelineWindow(35, 3, { kind: "at", index: 12 }, false, 20), { start: 10, end: 22, hiddenFollowing: 13 });
});

test("trip page keeps the opened trip: continuation is checked before the line check", () => {
  const rit = read("app/rit/[id].tsx");
  const continuation = rit.indexOf("nextTripDecision(identity.current, signature, pendingNext.current)");
  const other = rit.indexOf("notTheTappedTrip(tripId,");
  const conflict = rit.indexOf("linesConflict(expectedLine, result.line)");
  assert.ok(continuation > 0 && other > continuation && conflict > other);
  assert.match(rit, /continuationText\(continuation\.rit, continuation\.firstDeparture\)/);
  assert.match(rit, /vehiclePlaceText\(/);
  assert.match(rit, /usableRitReturnCache\(cached, tripId, expectedLine, Date\.now\(\), fallbackDestination\)/);
});

// Aandachtspunt GPT 16-10: bij GVB_2094 meldde de bron na de wissel even weer de vorige rit.
test("a lagging source cannot end the trip: earlier trips are ignored, a later one must be seen twice", () => {
  const current = id.tripSignature(n85Back);           // N85 to Centraal, starts 02:47
  const previousTrip = id.tripSignature(n85);          // N85 to Gein, started 01:40
  const nextTrip = id.tripSignature({ ...n85, stops: [stop("Centraal Station", "03:40"), stop("Gein", "04:39")] });
  assert.equal(id.nextTripDecision(current, current, null), "same");
  assert.equal(id.nextTripDecision(current, previousTrip, null), "ignore");
  assert.equal(id.nextTripDecision(current, nextTrip, null), "wait");
  assert.equal(id.nextTripDecision(current, nextTrip, nextTrip), "continue");
  assert.equal(id.nextTripDecision(current, nextTrip, previousTrip), "wait");
  assert.equal(id.nextTripDecision(null, nextTrip, null), "same");
  // Another line without planned times: no order known, so confirmation decides.
  const other = { ...id.tripSignature(line71), firstPlanned: "" };
  assert.equal(id.nextTripDecision(current, other, null), "wait");
  assert.equal(id.nextTripDecision(current, other, other), "continue");
});

test("start order works around midnight", () => {
  const at = (firstPlanned) => ({ line: "N85", firstStop: "x", firstPlanned, destination: "Gein" });
  assert.equal(id.startDifferenceMinutes(at("23:50"), at("00:20")), 30);
  assert.equal(id.startDifferenceMinutes(at("00:20"), at("23:50")), -30);
  assert.equal(id.startDifferenceMinutes(at("02:47"), at("01:40")), -67);
  assert.equal(id.startDifferenceMinutes(at(""), at("01:40")), null);
});

test("from a trip page, stop boards open on the tabs without passing earlier trip pages", () => {
  assert.match(read("app/rit/[id].tsx"), /if \(router\.canDismiss\(\)\) router\.dismissAll\(\);/);
});
