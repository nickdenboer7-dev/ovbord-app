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
const trip = require("../lib/activeTrip.ts");
const leave = require("../lib/leaveTime.ts");
const fav = require("../lib/favoriteLines.ts");
const route = require("../lib/ritMapRoute.ts");
const { arrivalShareText } = require("../lib/alighting.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const now = Date.parse("2026-10-16T17:00:00+02:00");
const at = (clock) => new Date(Date.parse("2026-10-16T" + clock + ":00+02:00")).toISOString();
const dep = (clock, extra={}) => ({ id: "d" + clock + (extra.id || ""), line: "14", carrier: "GVB", destination: "Flevopark",
  plannedTime: clock, relativeText: "", reliability: "planned", effectiveAt: at(clock), ...extra });

// 1. Rit hervatten
const stored = {
  tripId: "GVB_2027", params: { id: "GVB_2027", line: "14", destination: "Centraal Station", boardingName: "Amsterdam, Rembrandtplein" },
  line: "14", destination: "Centraal Station", carrier: "GVB", boardingName: "Rembrandtplein", endClock: "17:20",
  alighting: { id: "3980000", name: "Amsterdam, Dam", index: 6 }, alightName: "Dam", alightClock: "17:12", savedAt: now - 60000
};

test("an active trip is stored and read back; broken values are ignored", () => {
  assert.deepEqual(trip.parseActiveTrip(JSON.stringify(stored)), stored);
  assert.equal(trip.parseActiveTrip("{"), null);
  assert.equal(trip.parseActiveTrip(null), null);
  assert.equal(trip.parseActiveTrip(JSON.stringify({ ...stored, params: { id: "other" } })), null);
  assert.equal(trip.parseActiveTrip(JSON.stringify({ ...stored, savedAt: "x" })), null);
  const noAlight = trip.parseActiveTrip(JSON.stringify({ ...stored, alighting: { id: 3 } }));
  assert.equal(noAlight.alighting, null);
  assert.equal(noAlight.alightClock, "");
});

test("the trip is offered until 10 minutes after arrival, at most three hours", () => {
  assert.equal(trip.activeTripValid(stored, now), true);
  assert.equal(trip.activeTripValid(stored, Date.parse("2026-10-16T17:21:00+02:00")), true);
  assert.equal(trip.activeTripValid(stored, Date.parse("2026-10-16T17:23:00+02:00")), false);
  const noAlight = { ...stored, alighting: null, alightName: "", alightClock: "" };
  assert.equal(trip.activeTripValid(noAlight, Date.parse("2026-10-16T17:29:00+02:00")), true);
  assert.equal(trip.activeTripValid(noAlight, Date.parse("2026-10-16T17:31:00+02:00")), false);
  assert.equal(trip.activeTripValid({ ...stored, savedAt: now - trip.ACTIVE_TRIP_MAX_AGE_MS - 1 }, now), false);
  assert.equal(trip.activeTripValid({ ...stored, savedAt: now + 5000 }, now), false);
  assert.equal(trip.activeTripValid(null, now), false);
});

test("card text on Start", () => {
  assert.deepEqual(trip.activeTripSummary(stored), { title: "Je rit", destination: "Centraal Station", detail: "Uitstappen bij Dam · 17:12" });
  assert.deepEqual(trip.activeTripSummary({ ...stored, alighting: null }),
    { title: "Laatst bekeken rit", destination: "Centraal Station", detail: "Vanaf Rembrandtplein" });
});

// 2. Wanneer moet ik weg
test("walking minutes from the own position", () => {
  const stop = { lat: 52.3600, lon: 4.9000 };
  assert.equal(leave.walkMinutesTo(null, stop), null);
  assert.equal(leave.walkMinutesTo({ lat: 52.3603, lon: 4.9000 }, stop), 0);
  assert.equal(leave.walkMinutesTo({ lat: 52.3645, lon: 4.9000 }, stop), 8);
  assert.equal(leave.walkMinutesTo({ lat: 52.40, lon: 4.9 }, stop), null);
  assert.equal(leave.walkMinutesTo({ lat: 52.3645, lon: 4.9 }, {}), null);
});

test("leave advice names the first departure still reachable on foot", () => {
  const rows = [dep("17:03"), dep("17:08"), dep("17:15")];
  assert.deepEqual(leave.leaveAdvice(rows, 2, now), { text: "2 min lopen · vertrek over 1 min", tight: false });
  assert.deepEqual(leave.leaveAdvice(rows, 3, now), { text: "3 min lopen · vertrek nu", tight: false });
  assert.deepEqual(leave.leaveAdvice(rows, 5, now), { text: "5 min lopen · te krap voor 17:03, vertrek over 3 min voor 17:08", tight: true });
  assert.deepEqual(leave.leaveAdvice(rows, 20, now), { text: "20 min lopen · te krap voor 17:03", tight: true });
  assert.deepEqual(leave.leaveAdvice(rows, 0, now), { text: "Je bent bij de halte", tight: false });
  assert.equal(leave.leaveAdvice(rows, null, now), null);
  assert.deepEqual(leave.leaveAdvice([dep("17:03", { cancelled: true }), dep("17:08")], 2, now), { text: "2 min lopen · vertrek over 6 min", tight: false });
  assert.equal(leave.leaveAdvice([], 2, now), null);
});

// 3. Aankomsttijd delen
test("sharing the arrival time", () => {
  const base = { stopName: "Dam", clock: "17:12", line: "14", destination: "Centraal Station", live: true, lastKnown: false };
  assert.equal(arrivalShareText({ ...base, delayMinutes: 2 }), "Ik ben om 17:12 bij Dam (lijn 14 naar Centraal Station, 2 min vertraging).");
  assert.equal(arrivalShareText({ ...base, delayMinutes: -1 }), "Ik ben om 17:12 bij Dam (lijn 14 naar Centraal Station, 1 min eerder).");
  assert.equal(arrivalShareText({ ...base, delayMinutes: 0 }), "Ik ben om 17:12 bij Dam (lijn 14 naar Centraal Station).");
  assert.equal(arrivalShareText({ ...base, live: false, delayMinutes: 3 }), "Ik ben om 17:12 bij Dam (lijn 14 naar Centraal Station). Volgens de dienstregeling.");
  assert.equal(arrivalShareText({ ...base, lastKnown: true }), "Ik ben rond 17:12 bij Dam (lijn 14 naar Centraal Station).");
});

// 4. Kaart: rit tot de uitstaphalte
test("the route part still to ride runs from the vehicle to the alighting stop", () => {
  const points = [0, 1, 2, 3, 4, 5].map((i) => ({ lat: 52.36 + i * 0.001, lon: 4.9 }));
  assert.equal(route.nearestPointIndex(points, { lat: 52.3621, lon: 4.9 }), 2);
  assert.equal(route.nearestPointIndex(points, null), -1);
  assert.equal(route.nearestPointIndex([], { lat: 52.36, lon: 4.9 }), -1);
  assert.deepEqual(route.rideSegmentRange(points, { lat: 52.3611, lon: 4.9 }, { lat: 52.3649, lon: 4.9 }), { start: 1, end: 5 });
  assert.equal(route.rideSegmentRange(points, { lat: 52.3649, lon: 4.9 }, { lat: 52.3611, lon: 4.9 }), null);
  assert.equal(route.rideSegmentRange(points, undefined, { lat: 52.3649, lon: 4.9 }), null);
});

// 5. Favoriete lijnen
test("favourite lines: per carrier, next departure per direction, first in the filter", () => {
  assert.equal(fav.favoriteLineKey("14", "GVB"), "14|GVB");
  assert.equal(fav.favoriteLineKey("Sprinter", "NS"), "SPR|NS");
  const rows = [dep("17:02"), dep("17:04", { destination: "Centraal Station" }), dep("17:09"),
    dep("17:05", { line: "14", carrier: "U-OV" }), dep("17:01", { cancelled: true }), dep("17:03", { line: "4" })];
  assert.deepEqual(fav.pinnedDepartures(rows, ["14|GVB"], now).map(r => r.id), ["d17:02", "d17:04"]);
  assert.deepEqual(fav.pinnedDepartures(rows, [], now), []);
  assert.deepEqual(fav.favoriteLinesFirst(["2", "4", "14", "24"], new Set(["14", "24"])), ["14", "24", "2", "4"]);
});

// 6. Grote systeemlettergrootte en samenhang in de schermen
test("screens are wired to V5.3", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /saveActiveTrip\(/);
  assert.match(rit, /clearActiveTrip\(tripId\)/);
  // V5.4: sharing the arrival moved into the ⋮ menu of the trip page.
  assert.match(rit, /label: "Aankomsttijd delen"/);
  assert.match(rit, /onFocusVehicle=\{focusVehicle\}/);
  assert.match(rit, /initialFollow=\{mapFollowStart\}/);
  assert.match(rit, /<Text maxFontSizeMultiplier=\{1\.25\} style=\{\[styles\.timelineTime/);
  const home = read("components/FlowHome.tsx");
  assert.match(home, /loadActiveTrip\(Date\.now\(\)\)/);
  assert.match(home, /rememberAlighting\(trip\.tripId, trip\.alighting\)/);
  assert.match(home, /leaveAdvice\(rows, walkMinutesTo\(userCoords, boardStop\), nowMs\)/);
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /pinnedDepartures\(source, favoriteLines, nowMs, MAX_PINNED_ROWS\)/);
  // V5.4: the time column lives in the shared DepartureLine row.
  // V5.4 (OVinfo-stijl): the minutes sit on the right with a minimum width, so large fonts do not cut them off.
  assert.match(read("components/DepartureLine.tsx"), /right: \{ fontSize: 20,[^}]*minWidth: 48 \}/);
  assert.match(read("components/FlowLineGroups.tsx"), /Bewaar als favoriete lijn /);
  assert.match(read("components/LijnBadge.tsx"), /maxFontSizeMultiplier=\{1\.3\}/);
  assert.match(read("app/(tabs)/meer.tsx"), /Favoriete lijnen/);
});

// Hertest 16-10 bij lettergrootte 1,5: lange namen afgekapt, tabbladen ingekort, Buurtbord-kaart te groot
test("large system font: two-line names, smaller Buurtbord map, capped tab labels", () => {
  const Module = require("node:module");
  const ts = require("typescript");
  const prev = Module._extensions[".ts"];
  Module._extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  const { largeText, LARGE_TEXT_SCALE } = require("../lib/textScale.ts");
  if (prev) Module._extensions[".ts"] = prev; else delete Module._extensions[".ts"];
  assert.equal(LARGE_TEXT_SCALE, 1.3);
  assert.equal(largeText(1), false);
  assert.equal(largeText(1.29), false);
  assert.equal(largeText(1.3), true);
  assert.equal(largeText(1.5), true);
  assert.equal(largeText(undefined), false);
  assert.match(read("components/DepartureLine.tsx"), /numberOfLines=\{large \? 2 : 1\}>\s*\{item\.destination\}/);
  assert.match(read("components/FlowBoard.tsx"), /<DepartureLine /);
  const buurt = read("app/(tabs)/buurtbord.tsx");
  assert.match(buurt, /large && styles\.mapWrapLarge/);
  assert.match(buurt, /numberOfLines=\{large \? 2 : 1\}>\{item\.name\}/);
  assert.match(read("app/(tabs)/favorieten.tsx"), /<DepartureLine /);
  assert.match(read("components/FlowHome.tsx"), /numberOfLines=\{large \? 2 : 1\}>\{item\.direction\}/);
  const tabs = read("app/(tabs)/_layout.tsx");
  assert.match(tabs, /maxFontSizeMultiplier=\{1\.15\}/);
  assert.equal((tabs.match(/tabBarLabel: tabLabel\(/g) || []).length, 4);
});
