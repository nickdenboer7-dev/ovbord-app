const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, file
);
global.__DEV__ = false;
const api = require("../lib/api.ts");
const groups = require("../lib/nearbyGroups.ts");
const stopLines = require("../lib/stopLines.ts");
const lineSet = require("../lib/lineSet.ts");
const { compactTrainLineLabel } = require("../lib/trainLineLabel.ts");
const { haversineMeters } = require("../lib/liveLocation.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// OVbord V5.9.1 "Complete lijnen op Start".
// Real OVbord responses (recorded 18 Oct 2026 from https://ovbord.nl): /api/nearby rows unchanged,
// /api/halte boards trimmed to their distinct [line, carrier, mode].
const FX = JSON.parse(read("tests/fixtures/v591-api.json"));

let requests = [];
let nearbyOverride = null;
function boardResponse(id) {
  const board = FX.boards[FX.halte[id]];
  if (!board) return null;
  return {
    name: board.name, lat: board.lat, lon: board.lon, departure_count: board.departure_count,
    departures: board.lines.map(([line, carrier, mode], i) => ({ line, carrier, mode, destination: "Eindhalte",
      planned_time: "20:" + String(10 + i).padStart(2, "0"), journey_id: carrier + "_" + i, cancelled: false }))
  };
}
globalThis.fetch = async (url) => {
  const u = new URL(url);
  requests.push(u.pathname);
  let body = null;
  if (u.pathname === "/api/nearby") {
    const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
    const source = nearbyOverride || FX.nearby;
    const hit = Object.values(source).find((point) => point.lat === lat && point.lon === lon);
    body = hit ? hit.rows : [];
  } else if (u.pathname.startsWith("/api/halte/")) {
    body = boardResponse(decodeURIComponent(u.pathname.slice("/api/halte/".length)));
  }
  if (!body) return { ok: false, status: 404, json: async () => ({ ok: false }) };
  return { ok: true, status: 200, json: async () => body };
};

const label = (line) => compactTrainLineLabel(line.line, line.carrier);
/** What Start shows for the nearby list at this recorded position. */
async function startAt(point, { enrich = true } = {}) {
  const rows = await api.getNearby(point.lat, point.lon);
  const grouped = groups.groupNearbyStops(rows);
  const loader = stopLines.createAreaLinesLoader({ fetchBoard: api.getHalte });
  const extra = enrich ? await loader.load(groups.areaLineSources(grouped)) : {};
  const cards = grouped.map((group) => ({ group, rows: groups.nearbyGroupRows(group, extra) }));
  return { rows, cards, loader };
}
function card(cards, name) {
  const hit = cards.find((entry) => entry.group.name === name);
  assert.ok(hit, "no group " + name + " in " + cards.map((entry) => entry.group.name).join(", "));
  return hit;
}
const linesOf = (entry, mode) => (entry.rows.find((row) => row.mode === mode)?.lines || []).map(label);

test("root cause: /api/nearby keeps only the nearest platform of a stop name, with only its lines", async () => {
  // At the platform of line 36 the API sends Floraweg with only ["36"]: exactly the reported screen.
  const { rows, cards } = await startAt(FX.nearby.floraweg_perron36, { enrich: false });
  const flora = rows.filter((row) => row.name === "Amsterdam, Floraweg");
  assert.equal(flora.length, 1, "one Floraweg entry for four real platforms");
  assert.deepEqual(flora[0].lines.map(label), ["36"]);
  assert.deepEqual(linesOf(card(cards, "Floraweg"), "bus"), ["36"]);
  // The backend itself knows six lines for this stop (search line_count), as OVinfo shows.
  assert.equal(FX.search.Floraweg.line_count, 6);
  // At most five entries, each a different name (sibling platforms are dropped, not listed).
  for (const point of Object.values(FX.nearby)) {
    assert.ok(point.rows.length <= 5);
    assert.equal(new Set(point.rows.map((row) => row.name)).size, point.rows.length);
  }
});

test("Floraweg: the stop area's own lines are restored (36, 39, 391, 394, N94), none invented", async () => {
  for (const point of [FX.nearby.floraweg_perron36, FX.nearby.floraweg]) {
    const { cards } = await startAt(point);
    const flora = card(cards, "Floraweg");
    assert.deepEqual(linesOf(flora, "bus"), ["36", "39", "391", "394", "N94"]);
    // OVinfo: 36, 39, 391, 394, N93, N94. N93 only runs at night and sits on a platform that
    // /api/nearby leaves out: the app cannot know it until the backend sends complete lines.
    const ovinfo = ["36", "39", "391", "394", "N93", "N94"];
    assert.deepEqual(ovinfo.filter((line) => !linesOf(flora, "bus").includes(line)), ["N93"]);
    // The real stop ID stays: the row opens the platform the API returned.
    assert.equal(flora.rows[0].openStop.id, point.rows.find((row) => row.name === "Amsterdam, Floraweg").id);
  }
});

test("Noorderpark: metro 52 gets its own row next to all known bus lines", async () => {
  const { cards } = await startAt(FX.nearby.noorderpark);
  const park = card(cards, "Noorderpark");
  assert.deepEqual(park.rows.map((row) => row.label), ["Metrostation", "Bushalte"]);
  assert.deepEqual(linesOf(park, "metro"), ["52"]);
  assert.deepEqual(linesOf(park, "bus"), ["34", "36", "38", "391", "394"]);
  // OVinfo also lists N91 and N93 (night lines on platforms /api/nearby leaves out).
  assert.deepEqual(["34", "36", "38", "391", "394", "N91", "N93"].filter((line) => !linesOf(park, "bus").includes(line)), ["N91", "N93"]);
  // Before the fix the metro was lost entirely and only the EBS platform remained.
  const { cards: before } = await startAt(FX.nearby.noorderpark, { enrich: false });
  assert.deepEqual(card(before, "Noorderpark").rows.map((row) => row.label + ":" + row.lines.map(label).join(",")), ["Bushalte:391,394"]);
});

test("Sneeuwbalstraat, Pinksterbloemstraat and Johan van Hasseltweg match OVinfo completely", async () => {
  const sneeuw = await startAt(FX.nearby.sneeuwbalstraat);
  assert.deepEqual(linesOf(card(sneeuw.cards, "Sneeuwbalstraat"), "bus"), ["34", "N93"]);
  assert.deepEqual(linesOf(card(sneeuw.cards, "Pinksterbloemstraat"), "bus"), ["34", "N93"]);
  const jvh = await startAt(FX.nearby.johanvanhasseltweg);
  assert.deepEqual(linesOf(card(jvh.cards, "Johan van Hasseltweg"), "bus"), ["34", "36", "38", "N91"]);
});

test("Station Lelylaan: train, metro, tram and bus are separate rows; station nodes add no fake rows", async () => {
  const { cards } = await startAt(FX.nearby.lelylaan);
  const lely = card(cards, "Station Lelylaan");
  assert.deepEqual(lely.rows.map((row) => row.label), ["Treinstation", "Metrostation", "Tramhalte", "Bushalte"]);
  assert.deepEqual(linesOf(lely, "train"), ["IC", "SPR"]); // "Sprinter" and "SPR" are one line
  assert.deepEqual(linesOf(lely, "metro"), ["50", "51"]);
  assert.deepEqual(linesOf(lely, "tram"), ["1", "17"]);
  assert.deepEqual(linesOf(lely, "bus"), ["18", "62", "63", "195"]);
  // Real IDs: the train row opens the NS platform, the metro row the metro platform.
  assert.equal(lely.rows.find((row) => row.mode === "train").openStop.id, "2860888");
  assert.equal(lely.rows.find((row) => row.mode === "metro").openStop.id, "3980624");
  // The two "[Amsterdam Lelylaan] …" nodes without lines join the station, keep their IDs, add no row.
  assert.deepEqual(lely.group.stops.map((stop) => stop.id).sort(), ["2860546", "2860547", "2860888", "3980624"]);
  assert.ok(!cards.some((entry) => /Frogerplein|Halte C/.test(entry.group.name)));
});

test("all lines of an entry are kept: 'lines' and 'line_details' are merged, not replaced", async () => {
  // Derkinderenstraat: lines 1, 17, 27, 28 but line_details only 1, 17, 27 — 28 used to vanish.
  const { cards } = await startAt(FX.nearby.lelylaan);
  assert.deepEqual(linesOf(card(cards, "Derkinderenstraat"), "tram"), ["1", "17", "27", "28"]);
  // A long street with one board for stops far apart adds nothing to this platform.
  const flora = await startAt(FX.nearby.floraweg);
  assert.deepEqual(linesOf(card(flora.cards, "Klaprozenweg"), "bus"), ["38"]);
});

test("no duplicate line numbers in any row, for every recorded position", async () => {
  for (const point of Object.values(FX.nearby)) {
    const { cards } = await startAt(point);
    for (const entry of cards) for (const row of entry.rows) {
      const keys = row.lines.map((line) => lineSet.lineIdentityKey(line.line, line.carrier));
      assert.equal(new Set(keys).size, keys.length, entry.group.name + " " + row.label + ": " + keys.join(","));
    }
  }
});

test("line order follows OVinfo: numbers first, lowest first, then lettered lines", () => {
  const sorted = ["N94", "394", "36", "N93", "391", "39", "SPR", "IC", "195", "18"].sort(lineSet.compareLines);
  assert.deepEqual(sorted, ["18", "36", "39", "195", "391", "394", "IC", "N93", "N94", "SPR"]);
  assert.equal(lineSet.lineIdentityKey("Sprinter", "NS"), lineSet.lineIdentityKey("SPR", "NS"));
  assert.equal(lineSet.lineIdentityKey("Intercity", "NS"), "IC");
  // Same number, different mode (tram 1 / bus 1) stays two lines; same mode merges.
  assert.equal(lineSet.mergeLines([{ line: "1", mode: "tram" }], [{ line: "1", mode: "bus" }]).length, 2);
  assert.equal(lineSet.mergeLines([{ line: "36", mode: "bus" }], [{ line: "36" }], [{ line: " 36 ", carrier: "GVB", mode: "bus" }]).length, 1);
});

// The real platforms behind these stops, as /api/nearby itself returns them when you stand next to
// each one (grid sampling on 18 Oct 2026). A backend that sends them all ("quays") is complete.
const Q = (id, lat, lon, mode, lines, operator) => ({ id, lat, lon, modes: [mode], lines,
  line_details: lines.map((line) => ({ line, operator, mode })) });
const QUAYS = {
  floraweg: [Q("3184394", 52.398986, 4.906126, "bus", ["391", "394", "N94"], "EBS"), Q("3184395", 52.398309, 4.907676, "bus", ["391", "394", "N94"], "EBS"),
    Q("3980289", 52.398995, 4.906141, "bus", ["36", "39", "N93"], "GVB"), Q("3980341", 52.398282, 4.907662, "bus", ["36"], "GVB")],
  noorderpark: [Q("3184393", 52.389018, 4.919558, "bus", ["391", "394"], "EBS"), Q("3979933", 52.389459, 4.919774, "metro", ["52"], "GVB"),
    Q("3980581", 52.388553, 4.917874, "metro", ["52"], "GVB"), Q("3980727", 52.389304, 4.919217, "bus", ["34", "36", "38", "N91", "N93"], "GVB"),
    Q("3981214", 52.389081, 4.919631, "bus", ["34", "36", "38"], "GVB")],
  stationLelylaan: [Q("3894739", 52.356718, 4.834392, "bus", ["195"], "Connexxion"), Q("3980492", 52.357869, 4.834598, "tram", ["1", "17", "27", "28"], "GVB"),
    Q("3980624", 52.357652, 4.834263, "metro", ["50", "51"], "GVB"), Q("3980810", 52.358165, 4.834462, "metro", ["50", "51"], "GVB"),
    Q("3981175", 52.356709, 4.834481, "bus", ["62"], "GVB"), Q("3981436", 52.357901, 4.83379, "tram", ["1", "17", "27", "28"], "GVB"),
    Q("4139069", 52.35671, 4.83473, "bus", ["18"], "GVB")],
  amsterdamLelylaan: [Q("2860887", 52.35785533419017, 4.833954017751173, "train", ["IC", "SPR"], "NS"), Q("2860888", 52.357863436615844, 4.8340987850204, "train", ["IC", "SPR"], "NS")]
};
/** The proposed backend answer: one entry per stop area with every platform and all lines. */
function fixedRow(name, quays, at) {
  const dist = (q) => Math.round(haversineMeters({ latitude: at.lat, longitude: at.lon }, { latitude: q.lat, longitude: q.lon }));
  const withDistance = quays.map((q) => ({ ...q, distance_m: dist(q) })).sort((a, b) => a.distance_m - b.distance_m);
  const details = []; for (const q of withDistance) for (const d of q.line_details) if (!details.some((x) => x.line === d.line && x.mode === d.mode)) details.push(d);
  return { id: withDistance[0].id, name, distance_m: withDistance[0].distance_m, lat: withDistance[0].lat, lon: withDistance[0].lon,
    modes: [...new Set(withDistance.flatMap((q) => q.modes))], lines: details.map((d) => d.line), line_details: details,
    lines_complete: true, quays: withDistance };
}

test("with complete backend data Start matches OVinfo exactly, with every real ID and no extra requests", async () => {
  const at = { lat: 52.389083, lon: 4.919211 };
  nearbyOverride = {
    flora: { lat: 52.398643, lon: 4.906901, rows: [fixedRow("Amsterdam, Floraweg", QUAYS.floraweg, { lat: 52.398643, lon: 4.906901 })] },
    park: { ...at, rows: [fixedRow("Amsterdam, Noorderpark", QUAYS.noorderpark, at)] },
    lely: { lat: 52.357347, lon: 4.834379, rows: [
      fixedRow("Amsterdam, Station Lelylaan", QUAYS.stationLelylaan, { lat: 52.357347, lon: 4.834379 }),
      fixedRow("Amsterdam Lelylaan", QUAYS.amsterdamLelylaan, { lat: 52.357347, lon: 4.834379 })] }
  };
  try {
    requests = [];
    const flora = await startAt(nearbyOverride.flora);
    assert.deepEqual(linesOf(card(flora.cards, "Floraweg"), "bus"), ["36", "39", "391", "394", "N93", "N94"]);
    assert.deepEqual(card(flora.cards, "Floraweg").group.stops.map((s) => s.id).sort(), ["3184394", "3184395", "3980289", "3980341"]);
    const park = await startAt(nearbyOverride.park);
    const noord = card(park.cards, "Noorderpark");
    assert.deepEqual(linesOf(noord, "metro"), ["52"]);
    assert.deepEqual(linesOf(noord, "bus"), ["34", "36", "38", "391", "394", "N91", "N93"]);
    assert.equal(noord.rows.find((row) => row.mode === "metro").openStop.id, "3979933", "nearest metro platform");
    const lely = await startAt(nearbyOverride.lely);
    const station = card(lely.cards, "Station Lelylaan");
    const bus = station.rows.find((row) => row.mode === "bus"), metro = station.rows.find((row) => row.mode === "metro");
    assert.deepEqual(linesOf(station, "tram"), ["1", "17", "27", "28"]);
    assert.deepEqual(bus.lines.map(label), ["18", "62", "195"]);
    // Bus and metro open their own real stop IDs.
    assert.ok(["3894739", "3981175", "4139069"].includes(bus.openStop.id));
    assert.ok(["3980624", "3980810"].includes(metro.openStop.id));
    assert.notEqual(bus.openStop.id, metro.openStop.id);
    // Complete data: not a single extra board request.
    assert.equal(requests.filter((p) => p.startsWith("/api/halte/")).length, 0);
    assert.equal(flora.loader.requestCount() + park.loader.requestCount() + lely.loader.requestCount(), 0);
  } finally {
    nearbyOverride = null;
  }
});

test("stops from different places never merge, also through a node without a place", () => {
  const stop = (id, name, lat, lon, lines, mode = "bus") => ({ id, name, city: "", mode, modes: [mode], lat, lon, lines: lines.map((line) => ({ line, mode })) });
  const out = groups.groupNearbyStops([
    stop("a", "Amsterdam, Floraweg", 52.3983, 4.9077, ["36"]),
    stop("n", "[Amsterdam Floraweg] Perron B", 52.3984, 4.9078, []),
    stop("z", "Zaandam, Floraweg", 52.3985, 4.9079, ["69"])
  ]);
  assert.deepEqual(out.map((g) => g.stops.map((s) => s.id)), [["a", "n"], ["z"]]);
  // "[Station] Halte C, Willem Frogerplein" is not a city called "Halte C".
  const lely = groups.groupNearbyStops([stop("m", "Amsterdam, Station Lelylaan", 52.35765, 4.83426, ["50"], "metro"),
    stop("c", "[Amsterdam Lelylaan] Halte C, Willem Frogerplein", 52.35659, 4.83451, [])]);
  assert.equal(lely.length, 1);
});

test("modes are read from /api/nearby: metro platforms are metro, nodes without lines get no mode list", async () => {
  const rows = await api.getNearby(FX.nearby.lelylaan.lat, FX.nearby.lelylaan.lon);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(byId["3980624"].mode, "metro");
  assert.deepEqual(byId["3980624"].modes, ["metro"]);
  assert.equal(groups.nearbyModeLabel(byId["3980624"]), "Metrostation");
  assert.equal(byId["2860888"].mode, "train");
  assert.equal(byId["3980220"].mode, "tram");
  assert.equal(byId["2860547"].modes, undefined);
  assert.deepEqual(byId["2860547"].lines, []);
  // Every line carries its mode, so the badge has the right colour.
  assert.ok(byId["3980624"].lines.every((line) => line.mode === "metro"));
});

test("enrichment stays bounded: cache, shared in-flight requests, 2 at a time, 10 per minute", async () => {
  let clock = 1_000_000;
  let active = 0, peak = 0, calls = 0;
  const fetchBoard = async (id) => {
    calls += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { stop: { id, name: "X", city: "", mode: "bus", lines: [], lat: 52, lon: 5 }, departures: [{ id: "d", line: "L" + id, carrier: "GVB", mode: "bus", destination: "", plannedTime: "20:00", relativeText: "", reliability: "planned" }], arrivals: [], disruptions: [] };
  };
  const loader = stopLines.createAreaLinesLoader({ fetchBoard, now: () => clock });
  const stop = (id) => ({ id, name: "S" + id, city: "", mode: "bus", lines: [], lat: 52, lon: 5 });
  const five = ["1", "2", "3", "4", "5"].map(stop);
  const [a, b] = await Promise.all([loader.load(five), loader.load(five)]);
  assert.equal(calls, 5, "two loads at once share the requests");
  assert.ok(peak <= 2, "never more than two at a time (peak " + peak + ")");
  assert.deepEqual(a["3"].map((l) => l.line), ["L3"]);
  assert.deepEqual(b, a);
  await loader.load(five);
  assert.equal(calls, 5, "cached: a GPS update at the same place costs nothing");
  // Moving on: many new stops in one minute never exceed the budget.
  await loader.load(["6", "7", "8", "9", "10", "11", "12", "13"].map(stop));
  assert.equal(calls, 10, "10 per minute at most");
  clock += 61_000;
  await loader.load(["11", "12"].map(stop));
  assert.equal(calls, 12, "budget refills after a minute");
  clock += 16 * 60_000;
  await loader.load([stop("1")]);
  assert.equal(calls, 13, "after 15 minutes a stop area is checked again");
  // Complete backend entries never trigger a request.
  await loader.load([{ ...stop("99"), linesComplete: true }, { ...stop("98"), variants: [stop("97")] }]);
  assert.equal(calls, 13);
});

test("a board far from the platform adds nothing; failures are not retried at once", async () => {
  let calls = 0;
  const far = { stop: { id: "x", name: "Lange straat", city: "", mode: "bus", lines: [], lat: 52.40186, lon: 4.899149 },
    departures: [{ id: "d", line: "391", carrier: "EBS", mode: "bus", destination: "", plannedTime: "20:00", relativeText: "", reliability: "planned" }], arrivals: [], disruptions: [] };
  const loader = stopLines.createAreaLinesLoader({ fetchBoard: async (id) => { calls += 1; if (id === "bad") throw new Error("offline"); return far; } });
  const platform = { id: "3980306", name: "Amsterdam, Klaprozenweg", city: "", mode: "bus", lines: [{ line: "38" }], lat: 52.398178, lon: 4.906385 };
  assert.deepEqual(await loader.load([platform]), {});
  await loader.load([{ ...platform, id: "bad" }]);
  await loader.load([{ ...platform, id: "bad" }]);
  assert.equal(calls, 2, "one failed request, then a pause instead of retrying on every GPS update");
});

test("nearby list counts the complete line set without badges; saved/search stops keep their lines", () => {
  const home = read("components/FlowHome.tsx");
  const nearby = home.slice(home.indexOf('if (item.kind === "groep")'), home.indexOf('if (item.kind === "rit")'));
  assert.doesNotMatch(nearby, /<LijnBadge/);
  assert.match(nearby, /row\.lines\.length/);
  assert.match(nearby, /distanceText/);
  assert.match(nearby, /chevron-forward/);
  assert.match(home, /sortLines\(stop\.lines\)\.map\(\(line, i\) =>/);
});

test("Start applies only the enrichment of the list on screen, one bounded loader for the app", () => {
  const home = read("components/FlowHome.tsx");
  assert.match(home, /const areaLinesLoader = createAreaLinesLoader\(\{ fetchBoard: getHalte \}\);/);
  assert.match(home, /const sources = areaLineSources\(nearbyGroups\);/);
  assert.match(home, /void areaLinesLoader\.load\(sources\)\.then\(\(lines\) => \{ if \(active\) setAreaLines\(lines\); \}\);\s*return \(\) => \{ active = false; \};\s*\}, \[nearbyGroups\]\);/);
  assert.match(home, /nearbyGroupRows\(group, areaLines\)/);
  assert.match(home, /onPress=\{\(\) => openStop\(\{\.\.\.row\.openStop,variants:row\.stops\}\)\}/);
});
