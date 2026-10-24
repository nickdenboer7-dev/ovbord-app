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
const al = require("../lib/alighting.ts");
const dir = require("../lib/boardDirectionFilters.ts");
const { moveItem } = require("../lib/listOrder.ts");
const fav = require("../lib/favoritesLive.ts");
const { ritColors } = require("../lib/ritTheme.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const now = Date.parse("2026-10-16T08:00:00+02:00");
const at = (clock) => new Date(Date.parse("2026-10-16T" + clock + ":00+02:00")).toISOString();
const dep = (clock, extra={}) => ({ id: "d" + clock + (extra.id || ""), line: "2", destination: "Nieuw Sloten",
  plannedTime: clock, relativeText: "", reliability: "planned", effectiveAt: at(clock), ...extra });

// 1. Uitstaphalte
test("the alighting stop is found again after a refresh, always after boarding", () => {
  const stops = ["A", "B", "C", "D", "B"].map((name, i) => ({ id: name.toLowerCase(), name }));
  assert.equal(al.findAlightingIndex(stops, { id: "b", name: "B", index: 4 }, 2), 4);
  assert.equal(al.findAlightingIndex(stops, { id: "b", name: "B", index: 1 }, 2), 4);
  assert.equal(al.findAlightingIndex([{ id: "z", name: "Z" }, ...stops], { id: "c", name: "C", index: 2 }, -1), 3);
  assert.equal(al.findAlightingIndex(stops, { id: "other", name: "C", index: 0 }, -1), 2);
  assert.equal(al.findAlightingIndex(stops, null, -1), -1);
  assert.equal(al.findAlightingIndex(stops, { id: "q", name: "Q", index: 1 }, -1), -1);
});

test("only verified progress says next, at or passed; the timetable only estimates the count", () => {
  assert.deepEqual(al.alightingState(5, { kind: "at", index: 5 }, -1), { status: "at", remaining: 0 });
  assert.deepEqual(al.alightingState(5, { kind: "at", index: 6 }, -1), { status: "passed", remaining: null });
  assert.deepEqual(al.alightingState(5, { kind: "between", index: 5 }, -1), { status: "passed", remaining: null });
  assert.deepEqual(al.alightingState(5, { kind: "between", index: 4 }, -1), { status: "next", remaining: 1 });
  assert.deepEqual(al.alightingState(5, { kind: "at", index: 4 }, -1), { status: "next", remaining: 1 });
  assert.deepEqual(al.alightingState(5, { kind: "at", index: 2 }, -1), { status: "approaching", remaining: 3 });
  assert.deepEqual(al.alightingState(5, null, 2), { status: "approaching", remaining: 3 });
  assert.deepEqual(al.alightingState(5, null, 7), { status: "approaching", remaining: null });
  assert.deepEqual(al.alightingState(-1, { kind: "at", index: 2 }, 2), { status: "approaching", remaining: null });
});

test("alighting summary texts, live and last known", () => {
  const base = { name: "Dam", clock: "08:10", minutes: 10, status: "approaching", remaining: 4, lastKnown: false };
  assert.deepEqual(al.alightingSummary(base), { title: "Uitstappen bij Dam", detail: "08:10 · over 10 min · nog 4 haltes" });
  assert.equal(al.alightingSummary({ ...base, lastKnown: true }).detail, "08:10 · ± 10 min · nog 4 haltes");
  assert.equal(al.alightingSummary({ ...base, remaining: 1 }).detail, "08:10 · over 10 min · nog 1 halte");
  assert.equal(al.alightingSummary({ ...base, minutes: null, remaining: null }).detail, "08:10");
  assert.equal(al.alightingSummary({ ...base, minutes: 120 }).detail, "08:10 · nog 4 haltes");
  assert.deepEqual(al.alightingSummary({ ...base, status: "next", minutes: 2, remaining: 1 }),
    { title: "Volgende halte: uitstappen", detail: "Dam · 08:10 · over 2 min" });
  assert.equal(al.alightingSummary({ ...base, status: "next", minutes: 0, lastKnown: true }).title, "Laatst bekend: volgende halte is je uitstaphalte");
  assert.equal(al.alightingSummary({ ...base, status: "next", minutes: 0, lastKnown: true }).detail, "Dam · 08:10 · ± nu");
  assert.deepEqual(al.alightingSummary({ ...base, status: "at" }), { title: "Stap hier uit", detail: "Dam · 08:10" });
  assert.equal(al.alightingSummary({ ...base, status: "passed" }).title, "Uitstaphalte gepasseerd");
});

test("timetable position and clock helpers", () => {
  assert.equal(al.scheduleIndex(["07:50", "07:58", "08:00", "08:05", "--:--"], now), 2);
  assert.equal(al.scheduleIndex(["08:05", "08:10"], now), -1);
  assert.equal(al.clockRemainingMs("08:30", now), 30 * 60000);
  assert.equal(al.clockRemainingMs("--:--", now), null);
  assert.equal(al.clockRemainingMs("", now), null);
});

test("the choice is remembered per trip, capped", () => {
  al.rememberAlighting("t1", { id: "b", name: "B", index: 1 });
  assert.deepEqual(al.recallAlighting("t1"), { id: "b", name: "B", index: 1 });
  al.rememberAlighting("t1", null);
  assert.equal(al.recallAlighting("t1"), null);
  for (let i = 0; i < al.MAX_REMEMBERED_ALIGHTINGS + 5; i++) al.rememberAlighting("trip" + i, { id: "x", name: "X", index: 2 });
  assert.equal(al.recallAlighting("trip0"), null);
  assert.notEqual(al.recallAlighting("trip" + (al.MAX_REMEMBERED_ALIGHTINGS + 4)), null);
  al.rememberAlighting("", { id: "x", name: "X", index: 2 });
  assert.equal(al.recallAlighting(""), null);
});

// 2. Overstappen
test("transfers: after arrival only, own trip left out, tight below 2 minutes", () => {
  const rows = [
    dep("08:09"),
    dep("08:11"),
    dep("08:12", { line: "5", cancelled: true }),
    dep("08:13", { line: "7", departed: true }),
    dep("08:14", { line: "22" }),
    dep("08:15", { line: "26", ritId: "R1" }),
    dep("08:16", { line: "14", destination: "Flevopark" }),
    dep("08:17", { line: "14", destination: "Centraal Station" })
  ];
  const input = { arrivalClock: "08:10", tripId: "R1", line: "14", destination: "Flevopark" };
  const options = al.transferOptions(rows, input, now);
  assert.deepEqual(options.map(o => [o.item.id, o.marginMinutes, o.tight]), [["d08:11", 1, true], ["d08:12", 2, false], ["d08:14", 4, false]]);
  // V5.1: the own line is left out in both directions (08:17 line 14 back to Centraal is no transfer).
  assert.deepEqual(al.transferOptions(rows, input, now, 5).map(o => o.item.id), ["d08:11", "d08:12", "d08:14"]);
  assert.equal(al.transferOptions([dep("08:12", { cancelled: true })], { ...input, arrivalClock: "08:11" }, now)[0].tight, false);
  assert.deepEqual(al.transferOptions(rows, { ...input, arrivalClock: "" }, now), []);
  assert.equal(al.MIN_TRANSFER_MINUTES, 2);
});

// 4. Laatst bekende tijden op het toestel
test("favourite boards are stored small and read back only while young enough", () => {
  const stop = { id: "s1", name: "Waterlooplein", city: "Amsterdam", mode: "tram", lines: [] };
  const departures = Array.from({ length: 25 }, (_, i) => dep("08:" + String(10 + i).padStart(2, "0")));
  const boards = {
    s1: { board: { stop, departures, arrivals: [dep("08:01")], disruptions: [{ title: "x", description: "", severity: "info" }] }, fetchedAt: now - 1000 },
    s2: { board: undefined },
    s3: { board: { stop: { ...stop, id: "s3" }, departures, arrivals: [], disruptions: [] } }
  };
  const raw = fav.serializeFavoriteBoards(boards, ["s1", "s2", "s3"]);
  const parsed = fav.parseStoredFavoriteBoards(raw, now);
  assert.deepEqual(Object.keys(parsed), ["s1"]);
  assert.equal(parsed.s1.board.departures.length, fav.STORED_DEPARTURES_PER_STOP);
  assert.deepEqual(parsed.s1.board.arrivals, []);
  assert.deepEqual(parsed.s1.board.disruptions, []);
  assert.equal(parsed.s1.fetchedAt, now - 1000);
  assert.deepEqual(fav.parseStoredFavoriteBoards(raw, now - 1000 + fav.FAVORITE_BOARDS_MAX_AGE_MS), {});
  assert.deepEqual(fav.parseStoredFavoriteBoards(raw, now - 5000), {});
  assert.equal(fav.FAVORITE_BOARDS_MAX_AGE_MS, 3 * 60 * 60000);
});

test("unreadable stored boards are skipped instead of crashing", () => {
  assert.deepEqual(fav.parseStoredFavoriteBoards("{", now), {});
  assert.deepEqual(fav.parseStoredFavoriteBoards("[]", now), {});
  assert.deepEqual(fav.parseStoredFavoriteBoards(null, now), {});
  const raw = JSON.stringify({
    ok: { fetchedAt: now - 10, board: { stop: { id: "ok", name: "Dam" }, departures: [dep("08:10"), { id: 3 }, null] } },
    noStop: { fetchedAt: now - 10, board: { departures: [] } },
    noTime: { board: { stop: { id: "x", name: "X" }, departures: [] } }
  });
  const parsed = fav.parseStoredFavoriteBoards(raw, now);
  assert.deepEqual(Object.keys(parsed), ["ok"]);
  assert.equal(parsed.ok.board.departures.length, 1);
  assert.deepEqual(parsed.ok.board.stop.lines, []);
  assert.equal(parsed.ok.board.stop.city, "");
  assert.equal(parsed.ok.board.stop.mode, "bus");
});

// 5. Favorieten ordenen
test("moving a favourite up or down", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], -1, 1), ["a", "b", "c"]);
  const list = ["a", "b"];
  assert.notEqual(moveItem(list, 0, 0), list);
});

// 6. Haltebord filteren op richting
test("direction choices: one per destination, most departures first", () => {
  const rows = ["Centraal Station", "centraal station", "Centraal Station", "Zuid", "Zuid", "Sloterdijk", ""].map(destination => ({ destination }));
  assert.deepEqual(dir.boardDirectionChoices(rows), [
    { key: "centraal station", label: "Centraal Station", count: 3 },
    { key: "zuid", label: "Zuid", count: 2 },
    { key: "sloterdijk", label: "Sloterdijk", count: 1 }
  ]);
  assert.equal(dir.boardDirectionChoices(rows, 2).length, 2);
  assert.equal(dir.matchesBoardDirection({ destination: "CENTRAAL  station" }, "centraal station"), true);
  assert.equal(dir.matchesBoardDirection({ destination: "Zuid" }, "centraal station"), false);
  assert.equal(dir.matchesBoardDirection({ destination: "Zuid" }, null), true);
});

// Samenhang in de schermen
test("screens are wired to the new features", () => {
  assert.equal(ritColors.light.alightTagText, "#5A3E9E");
  assert.ok(ritColors.dark.alightRowBg && ritColors.dark.alightTagBg && ritColors.dark.alightTagText);
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /<RitTransfers /);
  assert.match(rit, /onLongPress=/);
  // V5.4: the alighting row in the position card (alightRow) replaced the summary text.
  assert.match(rit, /alightingSummary\(|alightRow\(/);
  assert.match(read("context/FlowNavigation.tsx"), /await loadJourneyStopBoard\(stop\)/);
  assert.match(read("app/_layout.tsx"), /<FavoritesLiveProvider>/);
  assert.match(read("components/FlowBoard.tsx"), /matchesBoardDirection\(item, selectedDirection\)/);
  const favorites = read("app/(tabs)/favorieten.tsx");
  assert.match(favorites, /useFavoritesLive\(\)/);
  assert.match(favorites, /moveFavoriteJourney\(item\.key, delta\)/);
  assert.match(read("app/(tabs)/buurtbord.tsx"), /toggleFavoriteStop\(item\)/);
  assert.match(read("components/FlowHome.tsx"), />Voor jou</);
});

// Gevonden bij controle: een lege sectie telt als inhoud, waardoor uitleg en knoppen op Start nooit verschenen
test("Start shows its empty-state explanation: no empty section when there are no stops", () => {
  const home = read("components/FlowHome.tsx");
  assert.match(home, /if \(!finding\) return haltes\.length \? \[\{ title: "", data: haltes \}\] : \[\];/);
  assert.doesNotMatch(home, /if \(!finding\) return \[\{ title: "", data: haltes \}\];/);
});
