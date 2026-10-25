const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const old = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename
);
const S = require("../lib/lineSchedule.ts");
if (old) Module._extensions[".ts"] = old;
else delete Module._extensions[".ts"];

function trip(id, at, extra = {}) {
  return { trip_id: id, route_id: "R1", direction_id: 0, destination: "Grou", stop_id: "A1", platform: "A",
    planned_time: at.slice(11, 16), planned_at: at, service_date: at.slice(0, 10), variant: false, ...extra };
}

const raw = {
  ok: true, date: "2026-10-26", in_feed: true, feed_first_date: "2026-10-22", feed_last_date: "2026-12-12",
  service_dates: ["2026-10-26", "2026-10-27"],
  directions: [
    { key: "R1|d0", route_id: "R1", direction_id: 0, line: "1", destination: "Grou", destinations: ["Grou", "Hemrik"],
      trips: [
        trip("b", "2026-10-26T06:30:00+01:00", { destination: "Hemrik", variant: true }),
        trip("a", "2026-10-26T00:30:00+01:00", { service_date: "2026-10-25" }),
        trip("c", "2026-10-26T23:50:00+01:00"),
        { trip_id: "broken", planned_at: "geen tijd" }
      ] },
    { key: "R1|d1", route_id: "R1", direction_id: 1, line: "1", destination: "Busstation", destinations: ["Busstation"],
      trips: [trip("d", "2026-10-26T07:10:00+01:00", { direction_id: 1, destination: "Busstation", stop_id: "A2", platform: "B" })] }
  ]
};

test("normalizeSchedule sorteert chronologisch, bewaart dienstdag en laat kapotte tijden weg", () => {
  const s = S.normalizeSchedule(raw);
  const grou = s.directions[0];
  assert.deepEqual(grou.trips.map((t) => t.tripId), ["a", "b", "c"]);
  assert.equal(grou.trips[0].serviceDate, "2026-10-25");
  assert.equal(grou.firstTime, "00:30");
  assert.equal(grou.lastTime, "23:50");
  assert.equal(grou.tripCount, 3);
  assert.equal(grou.trips[1].variant, true);
  assert.equal(s.feedLastDate, "2026-12-12");
});

test("pickDirection: eerst trip-ID, dan bestemming, nooit verzinnen", () => {
  const s = S.normalizeSchedule(raw);
  assert.equal(S.pickDirection(s, { destination: "Iets anders", gtfsTripIds: ["d"] }).key, "R1|d1");
  assert.equal(S.pickDirection(s, { destination: "Hemrik", gtfsTripIds: [] }).key, "R1|d0");
  assert.equal(S.pickDirection(s, { destination: "busstation", gtfsTripIds: [] }).key, "R1|d1");
  assert.equal(S.pickDirection(s, { destination: "Joure", gtfsTripIds: [] }), null);
  assert.equal(S.pickDirection(s, { destination: "Grou", gtfsTripIds: [], routeIds: ["R9"] }).key, "R1|d0");
});

test("oppositeDirection gebruikt direction_id op dezelfde route", () => {
  const s = S.normalizeSchedule(raw);
  assert.equal(S.oppositeDirection(s, s.directions[0]).key, "R1|d1");
  const noDir = S.normalizeSchedule({ directions: [
    { key: "R95|hheerenveen", route_id: "R95", direction_id: null, destination: "Heerenveen", trips: [trip("x", "2026-10-26T09:00:00+01:00")] },
    { key: "R95|hjoure", route_id: "R95", direction_id: null, destination: "Joure", trips: [trip("y", "2026-10-26T09:30:00+01:00")] },
    { key: "R95|hleeuwarden", route_id: "R95", direction_id: null, destination: "Leeuwarden", trips: [trip("z", "2026-10-26T10:00:00+01:00")] }
  ] });
  assert.equal(S.oppositeDirection(noDir, noDir.directions[0]), null, "drie groepen zonder direction_id: geen gok");
});

test("nextTripIndex gebruikt live verwachting en slaat vertrokken ritten over", () => {
  const s = S.normalizeSchedule(raw);
  const trips = s.directions[0].trips;
  const now = Date.parse("2026-10-26T06:35:00+01:00");
  assert.equal(S.nextTripIndex(trips, new Map(), now), 2);
  const live = S.liveByTripId([{ gtfsTripId: "b", effectiveAt: "2026-10-26T06:40:00+01:00" }]);
  assert.equal(S.nextTripIndex(trips, live, now), 1);
  const gone = S.liveByTripId([{ gtfsTripId: "b", effectiveAt: "2026-10-26T06:40:00+01:00", departed: true }]);
  assert.equal(S.nextTripIndex(trips, gone, now), 2);
  assert.equal(S.nextTripIndex(trips, new Map(), Date.parse("2026-10-27T01:00:00+01:00")), -1);
});

test("datums: labels, optellen over maandgrens en zomertijd, maandraster begint op maandag", () => {
  assert.equal(S.longDateLabel("2026-10-26"), "Maandag 26 oktober");
  assert.equal(S.shortDateLabel("2026-10-29"), "do 29 okt");
  assert.equal(S.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(S.addDays("2027-03-27", 1), "2027-03-28");
  assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
  const grid = S.monthGrid(2026, 10);
  assert.deepEqual(grid[0], [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.equal(grid[grid.length - 1].filter(Boolean).pop(), "2026-10-31");
  assert.equal(S.monthLabel(2026, 10), "Oktober 2026");
  assert.equal(S.localIsoDate(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
});

test("dayState: verleden en na einde dienstregeling niet kiesbaar, dagen zonder ritten gedimd", () => {
  const s = S.normalizeSchedule(raw);
  assert.equal(S.dayState("2026-10-25", "2026-10-26", s), "unavailable");
  assert.equal(S.dayState("2026-10-26", "2026-10-26", s), "selectable");
  assert.equal(S.dayState("2026-10-28", "2026-10-26", s), "noService");
  assert.equal(S.dayState("2026-12-13", "2026-10-26", s), "unavailable");
  assert.equal(S.dayState("2026-11-02", "2026-10-26", null), "selectable");
});

test("showsPlatforms alleen bij meerdere haltepalen met perron", () => {
  const s = S.normalizeSchedule(raw);
  assert.equal(S.showsPlatforms(s.directions[0]), false);
  const mixed = S.normalizeSchedule({ directions: [{ key: "k", route_id: "R", trips: [trip("1", "2026-10-26T06:00:00+01:00"), trip("2", "2026-10-26T07:00:00+01:00", { stop_id: "A2", platform: "B" })] }] });
  assert.equal(S.showsPlatforms(mixed.directions[0]), true);
});

test("cache: zelfde sleutel één keer laden, fout wordt niet bewaard", async () => {
  let calls = 0;
  const key = S.scheduleCacheKey("halte", ["R2", "R1"], "1", "2026-10-26");
  assert.equal(key, "halte|R1,R2||2026-10-26");
  const load = () => { calls++; return Promise.resolve(S.normalizeSchedule(raw)); };
  await S.cachedSchedule(key, load);
  await S.cachedSchedule(key, load);
  assert.equal(calls, 1);
  const badKey = "fout|x";
  await assert.rejects(S.cachedSchedule(badKey, () => Promise.reject(new Error("502"))));
  await new Promise((r) => setImmediate(r));
  let retried = false;
  await S.cachedSchedule(badKey, () => { retried = true; return Promise.resolve(S.normalizeSchedule(raw)); });
  assert.equal(retried, true);
});

test("Lijnen-tab onthoudt uitklap en datum per halte", () => {
  S.rememberLinesTab("h1", { expanded: "1:qbuzz/grou", date: "2026-10-27" });
  S.rememberLinesTab("h1", { scrollY: 240 });
  assert.deepEqual(S.recallLinesTab("h1"), { expanded: "1:qbuzz/grou", date: "2026-10-27", scrollY: 240 });
  assert.deepEqual(S.recallLinesTab("h2"), { expanded: null, date: null, scrollY: 0 });
});
