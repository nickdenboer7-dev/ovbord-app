const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// A controllable stand-in for expo-location, so the real lib/location.ts runs under Node.
const gps = {};
function resetGps() {
  Object.assign(gps, {
    permission: { granted: true, canAskAgain: true },
    requested: 0,
    servicesEnabled: true,
    lastKnown: null, // { coords, timestamp }
    current: null, // { coords, timestamp } or null (no fix within the timeout)
    lastKnownCalls: 0,
    lastAccuracy: null
  });
}
resetGps();
const expoLocationMock = {
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: async () => gps.permission,
  requestForegroundPermissionsAsync: async () => { gps.requested += 1; return gps.permission; },
  hasServicesEnabledAsync: async () => gps.servicesEnabled,
  getLastKnownPositionAsync: async ({ maxAge }) => {
    gps.lastKnownCalls += 1;
    return gps.lastKnown && Date.now() - gps.lastKnown.timestamp <= maxAge ? gps.lastKnown : null;
  },
  getCurrentPositionAsync: async ({ accuracy }) => { gps.lastAccuracy = accuracy; return gps.current; },
  watchPositionAsync: async () => ({ remove() {} })
};
const MOCK_PATH = path.join(__dirname, "__expo-location-mock__.js");
require.cache[MOCK_PATH] = { id: MOCK_PATH, filename: MOCK_PATH, loaded: true, exports: expoLocationMock };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "expo-location") return MOCK_PATH;
  return originalResolve.call(this, request, ...rest);
};
global.__DEV__ = false;

const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, file
);
const live = require("../lib/liveLocation.ts");
const location = require("../lib/location.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// OVbord V5.8.1 "Live locatie en haltes": test scenario Amsterdam Centraal -> Zaandam Barkstraat.
const AMSTERDAM_CS = { latitude: 52.3791, longitude: 4.9003 };
const ZAANDAM_BARKSTRAAT = { latitude: 52.4352, longitude: 4.8261 };

test("distance: Amsterdam Centraal to Zaandam Barkstraat is kilometres, a platform walk is not 150 m", () => {
  const km = live.haversineMeters(AMSTERDAM_CS, ZAANDAM_BARKSTRAAT) / 1000;
  assert.ok(km > 6 && km < 10, "expected roughly 8 km, got " + km);
  const fewMetres = { latitude: AMSTERDAM_CS.latitude + 0.0003, longitude: AMSTERDAM_CS.longitude }; // ~33 m
  assert.equal(live.hasMovedEnough(AMSTERDAM_CS, fewMetres), false);
  const twoHundred = { latitude: AMSTERDAM_CS.latitude + 0.0018, longitude: AMSTERDAM_CS.longitude }; // ~200 m
  assert.equal(live.hasMovedEnough(AMSTERDAM_CS, twoHundred), true);
  assert.equal(live.hasMovedEnough(null, AMSTERDAM_CS), true, "the first fix always loads stops");
  assert.equal(live.MOVEMENT_REFRESH_METERS, 150);
});

test("scenario: Amsterdam Centraal, then Zaandam Barkstraat, switches stops without restart or manual refresh", () => {
  const t0 = Date.parse("2026-10-18T15:00:00+02:00");
  // 1. First fix at Amsterdam Centraal: shown and stops loaded.
  let current = null;
  let loadedAt = null;
  let refreshes = 0;
  const feed = (fix) => {
    const decision = live.decideLiveFix(current, loadedAt, fix);
    if (decision.accept) current = { fixAt: fix.fixAt, bron: fix.bron };
    if (decision.refresh) { loadedAt = fix.coords; refreshes += 1; }
    return decision;
  };
  assert.deepEqual(feed({ coords: AMSTERDAM_CS, bron: "gps", fixAt: t0 }), { accept: true, refresh: true });
  // 2. GPS jitter on the platform: accepted, but no new API call.
  assert.deepEqual(feed({ coords: { latitude: 52.3793, longitude: 4.9004 }, bron: "gps", fixAt: t0 + 20000 }), { accept: true, refresh: false });
  // 3. The train arrives in Zaandam: the watch delivers a new fix, stops reload automatically.
  assert.deepEqual(feed({ coords: ZAANDAM_BARKSTRAAT, bron: "gps", fixAt: t0 + 12 * 60000 }), { accept: true, refresh: true });
  assert.deepEqual(loadedAt, ZAANDAM_BARKSTRAAT);
  // 4. A late Amsterdam result (older fix) arrives afterwards: ignored, Zaandam stays.
  assert.deepEqual(feed({ coords: AMSTERDAM_CS, bron: "laatst-bekend", fixAt: t0 + 60000 }), { accept: false, refresh: false });
  assert.deepEqual(loadedAt, ZAANDAM_BARKSTRAAT);
  assert.equal(refreshes, 2, "exactly one load for Amsterdam and one for Zaandam");
});

test("a last-known fix never goes ahead of a current one; upgrading last-known to live GPS reloads", () => {
  const t = Date.parse("2026-10-18T15:00:00+02:00");
  const currentGps = { fixAt: t, bron: "gps" };
  assert.equal(live.isFresherFix({ fixAt: t - 90000, bron: "laatst-bekend" }, currentGps), false);
  assert.equal(live.isFresherFix({ fixAt: t + 1000, bron: "gps" }, currentGps), true);
  // Same position, but now a real fix after a last-known one: reload so stops are no longer "old".
  const decision = live.decideLiveFix({ fixAt: t - 60000, bron: "laatst-bekend" }, AMSTERDAM_CS,
    { coords: AMSTERDAM_CS, bron: "gps", fixAt: t });
  assert.deepEqual(decision, { accept: true, refresh: true });
});

test("a delayed Amsterdam API reply never overwrites a newer Zaandam list", () => {
  let latest = 0;
  const amsterdamToken = ++latest; // request for Amsterdam goes out
  const zaandamToken = ++latest; // a newer request for Zaandam goes out before Amsterdam answers
  assert.equal(live.shouldApplyResponse(zaandamToken, latest), true);
  assert.equal(live.shouldApplyResponse(amsterdamToken, latest), false);
});

test("old or missing GPS is labelled 'Laatst bekende locatie' with its age", () => {
  const now = Date.parse("2026-10-18T15:30:00+02:00");
  assert.equal(live.describeLocationAge(now - 20000, now), "nu");
  assert.equal(live.describeLocationAge(now - 3 * 60000, now), "3 min geleden");
  assert.equal(live.describeLocationAge(now - 2 * 3600000, now), "2 uur geleden");
  assert.equal(live.describeLocationAge(now - 26 * 3600000, now), "1 dag geleden");
  assert.equal(live.isLocationStale("laatst-bekend", now - 1000, now), true);
  assert.equal(live.isLocationStale("gps", now - 30000, now), false);
  assert.equal(live.isLocationStale("gps", now - 5 * 60000, now), false);
  assert.equal(live.isLocationStale("gps", now - (5 * 60000 + 1), now), true);
  assert.equal(live.isLocationStale("handmatig", now - 3600000, now), false);
});

test("GPS permission: denied without asking again gives permission-denied, granted asks once", async () => {
  resetGps();
  gps.permission = { granted: false, canAskAgain: false };
  await assert.rejects(location.bepaalLocatie({ fallbackToExample: false, preferFresh: true }),
    (error) => error instanceof location.LocatieFout && error.code === "permission-denied");
  assert.equal(gps.requested, 0, "no repeated permission dialog once the user said no for good");

  resetGps();
  gps.permission = { granted: false, canAskAgain: true };
  await assert.rejects(location.bepaalLocatie({ fallbackToExample: false, preferFresh: true }),
    (error) => error.code === "permission-denied");
  assert.equal(gps.requested, 1);
});

test("missing GPS: services off or no fix gives no-gps, never an old Amsterdam position as current", async () => {
  resetGps();
  gps.servicesEnabled = false;
  await assert.rejects(location.bepaalLocatie({ fallbackToExample: false, preferFresh: true }), (error) => error.code === "no-gps");

  resetGps();
  gps.current = null; // no fix within the timeout
  gps.lastKnown = { coords: AMSTERDAM_CS, timestamp: Date.now() - 4 * 60000 };
  const result = await location.bepaalLocatie({ fallbackToExample: false, preferFresh: true });
  assert.equal(result.bron, "laatst-bekend", "an old position is only ever offered as last known");
  assert.equal(result.fixAt, gps.lastKnown.timestamp, "with the age of the real fix");
});

test("live location prefers a current fix over a recent last-known one (fresh fix on open and resume)", async () => {
  resetGps();
  const now = Date.now();
  gps.lastKnown = { coords: AMSTERDAM_CS, timestamp: now - 60000 };
  gps.current = { coords: ZAANDAM_BARKSTRAAT, timestamp: now };
  const fresh = await location.bepaalLocatie({ fallbackToExample: false, preferFresh: true });
  assert.equal(fresh.bron, "gps");
  assert.deepEqual(fresh.coords, ZAANDAM_BARKSTRAAT);
  assert.equal(fresh.fixAt, now);
  // The old one-shot behaviour (without preferFresh) is unchanged for other callers.
  const quick = await location.bepaalLocatie({ fallbackToExample: false });
  assert.equal(quick.bron, "laatst-bekend");
});

test("GPS recovery uses high accuracy when requested and normal accuracy otherwise", async () => {
  resetGps();
  gps.current = { coords: ZAANDAM_BARKSTRAAT, timestamp: Date.now() };
  await location.bepaalLocatie({ fallbackToExample: false, preferFresh: true, preferPrecise: true, askPermission: false });
  assert.equal(gps.lastAccuracy, expoLocationMock.Accuracy.High);
  await location.bepaalLocatie({ fallbackToExample: false, preferFresh: true, askPermission: false });
  assert.equal(gps.lastAccuracy, expoLocationMock.Accuracy.Balanced);
  assert.equal(gps.requested, 0);
});

test("a manually chosen city stays fixed and never touches GPS", async () => {
  resetGps();
  gps.current = { coords: ZAANDAM_BARKSTRAAT, timestamp: Date.now() };
  const manual = await location.bepaalLocatie({ manualCity: "amsterdam", fallbackToExample: false, preferFresh: true });
  assert.equal(manual.bron, "handmatig");
  assert.equal(manual.cityName, "Amsterdam");
  assert.equal(gps.lastKnownCalls, 0);
  // Both screens switch the live hook off while a city is chosen, until "Gebruik GPS".
  assert.match(read("components/FlowHome.tsx"), /useLiveLocation\(!manualCity && !useUtrechtExample\)/);
  assert.match(read("app/(tabs)/buurtbord.tsx"), /useLiveLocation\(!manualCity\)/);
  assert.match(read("components/FlowHome.tsx"), /setManualCity\(null\);[^}]*live\.requestFresh\(\);/);
  assert.match(read("app/(tabs)/buurtbord.tsx"), /setManualCity\(null\);[^}]*live\.requestFresh\(\);/);
});

test("the hook follows GPS only in the foreground, while Start or Buurtbord is focused", () => {
  const hook = read("lib/useLiveLocation.ts");
  // Watch with expo-location, limited to ~150 m so small movements do not even reach JS.
  assert.match(hook, /Location\.watchPositionAsync\(\s*\{[^}]*distanceInterval: MOVEMENT_REFRESH_METERS/);
  // Tied to screen focus, and a fresh fix on open / return to the tab (V5.9: after permission).
  assert.match(hook, /useFocusEffect\(useCallback\(\(\) => \{\s*if \(!enabled\) return;/);
  assert.match(hook, /readFresh\(false\);[^\n]*\n\s*void startWatch\(\);\s*\};\s*void activate\(\);/);
  // Resume: fresh fix and watch again; background: stop watching.
  assert.match(hook, /next === "active" && previousAppState !== "active"\) \{\s*void activate\(\);/);
  assert.match(hook, /next !== "active" && previousAppState === "active"\) \{[\s\S]*?watchSub\?\.remove\(\);/);
  // Losing focus also stops it (watch, heartbeat and AppState listener).
  assert.match(hook, /return \(\) => \{\s*cancelled = true;[\s\S]*?watchSub\?\.remove\(\);\s*clearInterval\(heartbeat\);\s*subscription\.remove\(\);/);
  // Never background location.
  const all = hook + read("lib/location.ts") + read("app.json");
  assert.doesNotMatch(all, /requestBackgroundPermissionsAsync|startLocationUpdatesAsync|ACCESS_BACKGROUND_LOCATION|isAndroidBackgroundLocationEnabled/);
  assert.match(hook, /bepaalLocatie\(\{ fallbackToExample: false, preferFresh: true, askPermission: ask, preferPrecise: precise \}\)/);
});

test("V5.9: askPermission false never shows a second permission dialog", async () => {
  resetGps();
  gps.permission = { granted: false, canAskAgain: true }; // Android after a first "Weigeren"
  await assert.rejects(location.bepaalLocatie({ fallbackToExample: false, preferFresh: true, askPermission: false }),
    (error) => error.code === "permission-denied");
  assert.equal(gps.requested, 0);
  // Granted: the read works without any dialog.
  resetGps();
  gps.current = { coords: AMSTERDAM_CS, timestamp: Date.now() };
  const fix = await location.bepaalLocatie({ fallbackToExample: false, preferFresh: true, askPermission: false });
  assert.equal(fix.bron, "gps");
  assert.equal(gps.requested, 0);
});

test("Start and Buurtbord reload stops and departure previews when the location really changes", () => {
  const home = read("components/FlowHome.tsx");
  const buurt = read("app/(tabs)/buurtbord.tsx");
  // The fetch effects depend on the movement-gated token, not on every GPS tick.
  assert.match(home, /\}, \[nearbyRetry, manualLocation, live\.refreshToken, live\.errorCode, live\.loading, nearbyRefreshTick, locationWaitExpired\]\);/);
  assert.match(buurt, /\}, \[locatieRetry, manualCity, manualLocation, live\.refreshToken, live\.errorCode, refreshTick, cacheReady\]\);/);
  // Neither screen asks GPS on its own any more: one shared, live source.
  assert.doesNotMatch(home, /bepaalLocatie/);
  assert.doesNotMatch(buurt, /bepaalLocatie/);
  // Buurtbord reloads departures (getHalte) for the new stops in the same request.
  assert.match(buurt, /const nearby = \(await getNearby\(locatie\.coords\.latitude, locatie\.coords\.longitude\)\)\.slice\(0, 5\);/);
  assert.match(buurt, /const board = await getHalte\(stop\.id\);\s*if \(isCancelled\(\)\) return;/);
  // Only the newest request may write (requirement 9).
  assert.match(home, /const token = \+\+nearbyRequest\.current;/);
  assert.match(home, /shouldApplyResponse\(token, nearbyRequest\.current\)/);
  assert.match(buurt, /const isCancelled = \(\) => stopped \|\| !shouldApplyResponse\(token, nearbyRequest\.current\);/);
});

test("old GPS is labelled with its age on both screens", () => {
  const home = read("components/FlowHome.tsx");
  const buurt = read("app/(tabs)/buurtbord.tsx");
  // V5.9: judged by the newest live GPS fix, falling back to the fix the stops were loaded for.
  assert.match(home, /isLocationStale\(liveBron, liveFixAt, nowMs\)/);
  assert.match(home, /Laatst bekende locatie · \{describeLocationAge\(liveFixAt \?\? nowMs, nowMs\)\}/);
  assert.match(buurt, /isLocationStale\(liveBron, liveFixAt, nowMs\)/);
  assert.match(buurt, /Laatst bekende locatie · \{describeLocationAge\(liveFixAt \?\? nowMs, nowMs\)\}/);
});
