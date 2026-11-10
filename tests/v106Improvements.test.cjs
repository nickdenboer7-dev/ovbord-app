const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const originalLoad = Module._load;
const oldTs = Module._extensions[".ts"];
Module._extensions[".ts"] = (m, filename) =>
  m._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText, filename);

let permissionCalls = 0;
Module._load = function (request, parent, isMain) {
  if (request === "expo-location") return {
    getForegroundPermissionsAsync: async () => { permissionCalls++; return { granted: true }; },
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: () => new Promise(() => {}),
    Accuracy: { High: 6, Balanced: 3 }
  };
  return originalLoad.call(this, request, parent, isMain);
};
global.__DEV__ = false;

const { bepaalLocatie, LocatieFout, LOCATION_FIX_DEADLINE_MS } = require("../lib/location.ts");

test("V1.0.6: city selection bypasses a stalled GPS provider", async () => {
  permissionCalls = 0;
  const result = await bepaalLocatie({ manualCity: "leeuwarden", fallbackToExample: false });
  assert.equal(result.bron, "handmatig");
  assert.equal(result.cityName, "Leeuwarden");
  assert.equal(permissionCalls, 0);
});

test("V1.0.6: hanging GPS obeys the five-second total timeout (simulated clock)", async () => {
  const savedSetTimeout = global.setTimeout;
  const savedClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (fn, ms) => {
    const id = timers.length + 1;
    timers.push({ id, fn, ms });
    return id;
  };
  global.clearTimeout = () => {};
  try {
    assert.equal(LOCATION_FIX_DEADLINE_MS, 5000);
    const pending = bepaalLocatie({ preferFresh: true, fallbackToExample: false });
    const rejection = assert.rejects(pending, error => error instanceof LocatieFout && error.code === "no-gps");
    const deadline = timers.find(timer => timer.ms === 5000);
    assert.ok(deadline, "a five-second clock starts before permission and GPS calls");
    deadline.fn();
    await rejection;
  } finally {
    global.setTimeout = savedSetTimeout;
    global.clearTimeout = savedClearTimeout;
  }
});

test("V1.0.6: filtering one line opens the complete schedule instead of 40 board rows", () => {
  const board = fs.readFileSync(require.resolve("../components/FlowBoard.tsx"), "utf8");
  const api = fs.readFileSync(require.resolve("../lib/api.ts"), "utf8");
  assert.match(board, /data=\{tab === "departures" && selectedLine \? \[\] : listRows\}/);
  assert.match(board, /<LineSchedulePanel key=\{stop.id \+ ":" \+ selectedLine\}/);
  assert.match(board, /routeIds=\{\[\]\}/); // no 40-row subset restricting the API route IDs
  assert.match(api, /\/api\/dienstregeling\/\$\{encodeURIComponent\(stopId\)\}/);
});

test("V1.0.6: current favorite board lines override a stale zero line count", () => {
  const home = fs.readFileSync(require.resolve("../components/FlowHome.tsx"), "utf8");
  assert.match(home, /currentBoard=favoriteBoards\[saved\.id\]\?\.board/);
  assert.match(home, /currentBoard\?\.departures\|\|\[\]/);
});
