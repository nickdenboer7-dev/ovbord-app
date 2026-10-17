const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename
);
const { normalizeDeparture, getHalte } = require("../lib/api.ts");
const { isUnconfirmedExtremeEarlyDeparture } = require("../lib/earlyDepartureGuard.ts");
const { departureCountdown } = require("../lib/format.ts");
const { keepBoardDeparture } = require("../lib/boardSmartness.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const earlyLogin = {
  line: "20", destination: "Heerenveen", carrier: "QBUZZ", mode: "bus",
  journey_id: "QBUZZ_1027", planned_time: "19:58",
  planned_at: "2026-10-14T19:58:00+02:00",
  effective_time: "2026-10-14T19:27:44+02:00",
  delay: -1816, live: true, cancelled: false, platform: "B",
  trend: "up", trend_samples: 3
};

test("early-logged vehicle QBUZZ_1027 retains 19:58 and no phantom -30", () => {
  const dep = normalizeDeparture(earlyLogin);
  assert.equal(isUnconfirmedExtremeEarlyDeparture(earlyLogin), true);
  assert.equal(dep.plannedTime, "19:58");
  assert.equal(dep.expectedTime, "19:58");
  assert.equal(dep.effectiveAt, earlyLogin.planned_at);
  assert.equal(dep.delayMinutes, undefined);
  assert.equal(dep.isLive, true);
  assert.equal(dep.trend, undefined);
  assert.equal(departureCountdown(dep, Date.parse("2026-10-14T17:28:00Z")), "over 30 min");
  assert.equal(keepBoardDeparture(dep, Date.parse("2026-10-14T17:35:00Z")), true);
});

test("ordinary small early departure remains an early prediction", () => {
  const dep = normalizeDeparture({
    ...earlyLogin, effective_time:"2026-10-14T19:55:00+02:00", delay:-180
  });
  assert.equal(dep.expectedTime, "19:55");
  assert.equal(dep.delayMinutes, -3);
});

test("late departures and explicitly confirmed early departures stay untouched", () => {
  const late = normalizeDeparture({
    ...earlyLogin, effective_time:"2026-10-14T20:18:00+02:00",delay:1200
  });
  assert.equal(late.expectedTime, "20:18");
  assert.equal(late.delayMinutes, 20);
  const confirmed = normalizeDeparture({ ...earlyLogin, departure_confirmed:true });
  assert.equal(confirmed.expectedTime, "19:27");
  assert.equal(confirmed.delayMinutes, -30);
});

test("cancelled services stay cancelled and cannot become normal live departures", () => {
  const cancelled = normalizeDeparture({ ...earlyLogin, cancelled:true });
  assert.equal(cancelled.cancelled, true);
});

test("negative delay without absolute planned timestamp cannot create a fake early clock", () => {
  const dep = normalizeDeparture({ ...earlyLogin, planned_at:undefined });
  assert.equal(dep.expectedTime, "19:58");
  assert.equal(dep.delayMinutes, undefined);
});

test("login timestamp stays suppressed even when approaching the scheduled departure", () => {
  const stillLogged = {
    ...earlyLogin,
    effective_time: "2026-10-14T19:55:05+02:00",
    feed_generated_at: "2026-10-14T19:55:15+02:00",
    delay: -175
  };
  assert.equal(isUnconfirmedExtremeEarlyDeparture(stillLogged), true);
  const dep = normalizeDeparture(stillLogged);
  assert.equal(dep.expectedTime, "19:58");
  assert.equal(dep.delayMinutes, undefined);
  assert.equal(departureCountdown(dep, Date.parse("2026-10-14T17:55:00Z")), "over 3 min");
  assert.equal(isUnconfirmedExtremeEarlyDeparture({
    ...stillLogged, feed_generated_at: "2026-10-14T19:40:00+02:00"
  }), false);
});

test("getHalte transfers the actual API feed generation time to its departures", async () => {
  const existingFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      stop: { id:"2993405", name:"Leeuwarden" },
      generated_at:"2026-10-14T19:55:15+02:00",
      departures: [{ ...earlyLogin,
        effective_time:"2026-10-14T19:55:05+02:00",
        delay:-175
      }]
    })
  });
  try {
    const board = await getHalte("2993405");
    assert.equal(board.departures[0].expectedTime, "19:58");
    assert.equal(board.departures[0].isLive, true);
    assert.equal(board.departures[0].delayMinutes, undefined);
  } finally {
    globalThis.fetch = existingFetch;
  }
});
