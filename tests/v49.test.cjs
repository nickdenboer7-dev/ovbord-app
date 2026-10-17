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
const fav = require("../lib/favoritesLive.ts");
const { ritParamsForDeparture } = require("../lib/ritRoute.ts");
const { mergeLoadedList } = require("../lib/storedJson.ts");
const offline = require("../lib/offline.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-15T23:30:00+02:00");
const stop = (id, extra={}) => ({ id, name: "Halte " + id, city: "", mode: "bus", lines: [], ...extra });
const dep = (min, extra={}) => ({ id: "d" + min + (extra.id || ""), line: "12", destination: "Amsterdam Centraal Station",
  plannedTime: "", relativeText: "", reliability: "planned", effectiveAt: new Date(now + min*60000).toISOString(), ...extra });

// Favorieten live: welke haltes worden geladen
test("favourite boards: saved trips first, each stop once, capped", () => {
  const journeys = [{ stop: stop("a") }, { stop: stop("b") }, { stop: stop("a") }];
  assert.deepEqual(fav.favoriteBoardStops(journeys, [stop("b"), stop("c")]).map(s => s.id), ["a", "b", "c"]);
  const many = Array.from({ length: 12 }, (_, i) => stop("s" + i));
  assert.equal(fav.favoriteBoardStops([], many).length, fav.MAX_FAVORITE_BOARDS);
  assert.equal(fav.MAX_FAVORITE_BOARDS, 8);
  assert.deepEqual(fav.favoriteBoardStops([{ stop: { ...stop(""), id: "" } }], []), []);
});

test("destinations match on whole words, ignoring case, accents and punctuation", () => {
  assert.equal(fav.directionMatches("Amsterdam Centraal Station", "Centraal Station"), true);
  assert.equal(fav.directionMatches("Centraal Station", "Amsterdam Centraal Station"), true);
  assert.equal(fav.directionMatches("Den Haag, Centraal", "den haag centraal"), true);
  assert.equal(fav.directionMatches("Station Zuid", "Zuidplein"), false);
  assert.equal(fav.directionMatches("Amsterdam Zuid", "Zuid"), true);
  assert.equal(fav.directionMatches("Centraal Station", "Station Zuid"), false);
  assert.equal(fav.directionMatches("Café Rouge", "cafe rouge"), true);
  assert.equal(fav.directionMatches("", "Zuid"), false);
});

test("a saved trip shows the next departures of its own line and direction only", () => {
  const journey = { line: "12", direction: "Centraal Station", stop: stop("a") };
  const rows = fav.favoriteJourneyDepartures([
    dep(-10), dep(2, { departed: true }), dep(3, { cancelled: true }),
    dep(4, { destination: "Station Sloterdijk" }), dep(5, { line: "13" }),
    dep(6), dep(9, { line: "012" }), dep(15), dep(20)
  ], journey, now);
  assert.deepEqual(rows.map(r => r.id), ["d3", "d6", "d9"]);
  assert.equal(rows[0].cancelled, true);
  assert.equal(fav.favoriteJourneyDepartures([dep(5), dep(8)], journey, now, 1).length, 1);
});

test("board line and destination saved with the trip are used when the trip feed names them differently", () => {
  const rows = [dep(5, { line: "IC", carrier: "NS", destination: "Schiphol" })];
  const old = { line: "IC 1410", direction: "Schiphol Airport", carrier: "NS", stop: stop("a") };
  assert.deepEqual(fav.favoriteJourneyDepartures(rows, old, now), []);
  const saved = { ...old, boardLine: "IC", boardDirection: "Schiphol" };
  assert.deepEqual(fav.favoriteJourneyDepartures(rows, saved, now).map(r => r.id), ["d5"]);
  // Corrupt stored extras are ignored instead of crashing.
  assert.deepEqual(fav.favoriteJourneyDepartures(rows, { ...old, boardLine: 7, boardDirection: null }, now), []);
});

// Rit openen vanuit Favorieten gebruikt dezelfde parameters als het haltebord
test("trip route params carry boarding stop, position, planned time and cancellation", () => {
  const item = dep(5, { ritId: "391344404", carrier: "GVB", plannedTime: "23:35", cancelled: true });
  assert.deepEqual(ritParamsForDeparture(item, stop("3257874", { name: "Weesperplein", lat: 52.36, lon: 4.9 })), {
    id: "391344404", line: "12", destination: "Amsterdam Centraal Station", carrier: "GVB",
    boardingName: "Weesperplein", boardingId: "3257874", boardingLat: "52.36", boardingLon: "4.9",
    boardingTime: "23:35", boardCancelled: "1"
  });
  const plain = ritParamsForDeparture(dep(5, { ritId: "r" }), stop("x"));
  assert.equal(plain.boardingLat, ""); assert.equal(plain.carrier, ""); assert.equal(plain.boardCancelled, "");
});

test("stop board and favourites open trips through the shared helper", () => {
  const board = fs.readFileSync(path.join(__dirname, "../components/FlowBoard.tsx"), "utf8");
  assert.match(board, /params: ritParamsForDeparture\(item, board\?\.stop \|\| stop\)/);
  assert.doesNotMatch(board, /boardingLat: typeof/);
  const favorites = fs.readFileSync(path.join(__dirname, "../app/(tabs)/favorieten.tsx"), "utf8");
  assert.match(favorites, /ritParamsForDeparture\(item, stop\)/);
});

// Opslag: vroege tik tijdens het laden wist geen favorieten
test("lists saved while loading come first and keep the stored items", () => {
  const key = s => s.id;
  assert.deepEqual(mergeLoadedList([stop("new")], [stop("a"), stop("new"), stop("b")], key).map(key), ["new", "a", "b"]);
  assert.deepEqual(mergeLoadedList([], [stop("a")], key).map(key), ["a"]);
  assert.deepEqual(mergeLoadedList([stop("n")], Array.from({ length: 12 }, (_, i) => stop("s" + i)), key, 10).length, 10);
  assert.deepEqual(mergeLoadedList(["N85"], ["12", "N85"], x => x), ["N85", "12"]);
});

// Offline-meldingen op Start en bij het openen van een halte vanuit een rit
test("offline messages for nearby stops and stop boards", () => {
  assert.equal(offline.nearbyUnavailableMessage("offline"), "Je bent offline. Haltes in de buurt laden zodra er weer verbinding is.");
  assert.equal(offline.nearbyUnavailableMessage("server"), "Haltes ophalen is mislukt. Probeer het opnieuw.");
  const at = Date.parse("2026-10-15T22:58:00+02:00");
  assert.equal(offline.listRefreshNotice("offline", at), "Geen internet · lijst van 22:58 niet ververst");
  assert.equal(offline.listRefreshNotice("server", null), "Verversen mislukt · lijst blijft zichtbaar");
  assert.equal(offline.stopBoardLoadError("Weesperplein", "offline"), "Geen internet · vertrektijden voor Weesperplein niet geladen.");
  assert.equal(offline.stopBoardLoadError("Weesperplein", "server"), "Vertrektijden voor Weesperplein konden niet worden geladen.");
});
