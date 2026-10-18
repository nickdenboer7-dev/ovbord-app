const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const prev = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename);
const { groupNearbyStops, nearbyModeLabel } = require('../lib/nearbyGroups.ts');
if (prev) Module._extensions['.ts'] = prev; else delete Module._extensions['.ts'];

const stop = (id, name, mode, lat, lon, lines = []) => ({ id, name, mode, lat, lon, lines,
  city: 'Amsterdam', walkMinutes: id === 'metro' ? 2 : 1 });

test('Henk Sneevlietweg variants group, with both tappable stop IDs retained', () => {
  const rows = [
    stop('bus', 'Amsterdam, Henk Sneevlietweg', 'bus', 52.345, 4.833, [{line:'62'}]),
    stop('metro', 'Henk Sneevlietweg Metro', 'metro', 52.3451, 4.8331, [{line:'50'},{line:'51'}])
  ];
  const g = groupNearbyStops(rows);
  assert.equal(g.length, 1);
  assert.equal(g[0].name, 'Henk Sneevlietweg');
  assert.deepEqual(g[0].stops.map(s=>s.id), ['bus','metro']);
  assert.deepEqual(g[0].stops[1].lines.map(x=>x.line), ['50','51']);
  assert.equal(g[0].walkMinutes, 1);
});

test('different stops and similarly named distant stops never merge', () => {
  const rows = [stop('a', 'Amsterdam, Henk Sneevlietweg', 'bus', 52.345, 4.833),
    stop('b', 'Amsterdam, Henk Sneevlietweg', 'bus', 52.350, 4.833),
    stop('c', 'Amsterdam, Ottho Heldringstraat', 'bus', 52.345, 4.834)];
  assert.equal(groupNearbyStops(rows).length, 3);
});

test('Lelylaan platform variants group by their nearby station name', () => {
  const rows = [
    stop('station','Amsterdam, Station Lelylaan','train',52.357,4.835),
    stop('m','[Amsterdam Lelylaan] Metrostation Amsterdam Lelylaan','metro',52.3571,4.8351),
    stop('p','Amsterdam Lelylaan','bus',52.3571,4.8352)
  ];
  const groups=groupNearbyStops(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].stops.map(x=>x.id),['station','m','p']);
});

test('no position: only exactly matching names group, preserve order and input', () => {
  const rows=[stop('1','Zaandam, Barkstraat','bus',undefined,undefined),
    stop('2','Zaandam, Barkstraat','bus',undefined,undefined)];
  rows.forEach(x=>x.city='Zaandam');
  const groups=groupNearbyStops(rows);
  assert.equal(groups.length,1);
  assert.deepEqual(groups[0].stops.map(x=>x.id), ['1','2']);
  assert.equal(rows.length,2);
});

test('mode names are explicit and never invent line numbers',()=>{
  assert.equal(nearbyModeLabel(stop('x','Amsterdam, Test','metro')), 'Metrostation');
  assert.equal(nearbyModeLabel(stop('y','Amsterdam, Test','bus')), 'Bushalte');
});

test('re-tapping the active Start tab opens the Start list; switching tabs and Android Back are untouched', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const tabs = read('app/(tabs)/_layout.tsx');
  // Only when Start is already the focused tab: coming back from Buurtbord keeps an open board.
  assert.match(tabs, /listeners=\{\(\{ navigation \}\) => \(\{ tabPress: \(\) => \{ if \(navigation\.isFocused\(\)\) goHome\(\); \} \}\)\}/);
  // No preventDefault: the tab press itself keeps its normal behaviour.
  assert.doesNotMatch(tabs, /preventDefault/);
  const nav = read('context/FlowNavigation.tsx');
  assert.match(nav, /const goHome = useCallback\(\(\) => \{ cancelPending\(\); setScreens\(\[\]\); setHomeRequest\(\(n\) => n \+ 1\); \}/);
  // Start also leaves an open search, back to the nearby list.
  assert.match(read('components/FlowHome.tsx'), /useEffect\(\(\) => \{ if \(homeRequest > 0\) \{ closeSearch\(\); setShowCities\(false\); \} \}, \[homeRequest\]\);/);
  // Android Back still steps back one board at a time, only while a board is open.
  const workspace = read('components/FlowWorkspace.tsx');
  assert.match(workspace, /if \(screens\.length === 0\) return;\s*const subscription = BackHandler\.addEventListener\("hardwareBackPress", \(\) => \{\s*goBack\(\);\s*return true;/);
  assert.match(nav, /const back = useCallback\(\(\) => \{ cancelPending\(\); setScreens\(\(previous\) => previous\.slice\(0, -1\)\); \}/);
});

test('grouping never loses a stop ID, keeps every original stop object and order, and does not mutate input', () => {
  const rows = [
    stop('bus', 'Amsterdam, Henk Sneevlietweg', 'bus', 52.345, 4.833, [{ line: '62', carrier: 'GVB' }]),
    stop('x', 'Amsterdam, Ottho Heldringstraat', 'bus', 52.3452, 4.8345, [{ line: '15', carrier: 'GVB' }]),
    stop('metro', 'Henk Sneevlietweg Metro', 'metro', 52.3451, 4.8331, [{ line: '50', carrier: 'GVB' }, { line: '51', carrier: 'GVB' }]),
    stop('station', 'Amsterdam, Station Lelylaan', 'train', 52.357, 4.835),
    stop('m', '[Amsterdam Lelylaan] Metrostation Amsterdam Lelylaan', 'metro', 52.3571, 4.8351)
  ];
  const snapshot = JSON.stringify(rows);
  const groups = groupNearbyStops(rows);
  assert.equal(JSON.stringify(rows), snapshot, 'input untouched');
  const ids = groups.flatMap((g) => g.stops.map((s) => s.id));
  assert.deepEqual([...ids].sort(), rows.map((r) => r.id).sort(), 'every stop ID exactly once');
  assert.equal(new Set(ids).size, rows.length);
  // The same stop objects (with their own ID and lines) are handed to openStop: their boards and
  // departures are loaded per original ID, so grouping can never hide departures.
  for (const g of groups) for (const s of g.stops) assert.ok(rows.includes(s));
  // The station area keeps its recognisable name (shortest real variant), not a bare street name.
  assert.deepEqual(groups.map((g) => g.name), ['Henk Sneevlietweg', 'Ottho Heldringstraat', 'Station Lelylaan']);
  assert.deepEqual(groups[0].stops.map((s) => s.id), ['bus', 'metro']);
});

test('without an API city the "Plaats, " prefix is used, so names stay short and cities never mix', () => {
  const noCity = (id, name, mode, lat, lon) => ({ ...stop(id, name, mode, lat, lon), city: '' });
  const groups = groupNearbyStops([
    noCity('b', 'Amsterdam, Henk Sneevlietweg', 'bus', 52.345, 4.833),
    noCity('m', 'Henk Sneevlietweg Metro', 'metro', 52.3451, 4.8331),
    noCity('z', 'Zaandam, Henk Sneevlietweg', 'bus', 52.3452, 4.8332)
  ]);
  assert.equal(groups[0].name, 'Henk Sneevlietweg');
  assert.deepEqual(groups[0].stops.map((s) => s.id), ['b', 'm']);
  assert.deepEqual(groups[1].stops.map((s) => s.id), ['z'], 'another place never joins, however close');
});

test('Buurtbord keeps one card per real stop with its own departures (no grouping there)', () => {
  const buurt = fs.readFileSync(path.join(__dirname, '..', 'app/(tabs)/buurtbord.tsx'), 'utf8');
  assert.doesNotMatch(buurt, /groupNearbyStops/);
  assert.match(buurt, /const board = await getHalte\(stop\.id\);/);
});

test('favourite stops keep their star inside a group', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'components/FlowHome.tsx'), 'utf8');
  assert.match(home, /\{isFavoriteStop\(stop\.id\) \? <Ionicons name="star" size=\{14\} color=\{colors\.warning\} \/> : null\}\s*<Ionicons name="chevron-forward"/);
  assert.match(home, /\(isFavoriteStop\(stop\.id\) \? ", favoriete halte" : ""\)/);
});

test('location permission: one automatic dialog per session, never two in a row, never on resume', () => {
  const loc = fs.readFileSync(path.join(__dirname, '..', 'lib/useLiveLocation.ts'), 'utf8');
  assert.match(loc, /if \(!current\.granted && current\.canAskAgain && !permissionAskedThisSession\) \{\s*permissionAskedThisSession = true;\s*await Location\.requestForegroundPermissionsAsync\(\);/);
  // The read right after the dialog, the heartbeat and resume never ask again.
  assert.match(loc, /readFresh\(false\); \/\/ never a second dialog right after the first/);
  assert.match(loc, /> LIVE_HEARTBEAT_MS \/ 2\) readFresh\(false\);/);
  assert.match(loc, /bepaalLocatie\(\{ fallbackToExample: false, preferFresh: true, askPermission: ask \}\)/);
  // Only an explicit tap may ask once more; afterwards the watch starts at once.
  assert.match(loc, /const requestFresh = useCallback\(\(\) => readFresh\(true\), \[readFresh\]\);/);
  assert.match(loc, /applyFix\(result\);\s*\/\/ Permission may have been granted just now \(a retry tap\): start following at once\.\s*kickWatch\.current\(\);/);
  assert.doesNotMatch(loc, /requestBackgroundPermissionsAsync|startLocationUpdatesAsync/);
});

test('a stationary live fix is not labelled "laatst bekend": the note follows the newest GPS fix', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('components/FlowHome.tsx'), /isLocationStale\(liveBron, liveFixAt, nowMs\)/);
  assert.match(read('components/FlowHome.tsx'), /const liveFixAt = live\.fixAt \?\? locationFixAt;/);
  assert.match(read('app/(tabs)/buurtbord.tsx'), /isLocationStale\(liveBron, liveFixAt, nowMs\)/);
  assert.match(read('app/(tabs)/buurtbord.tsx'), /const liveFixAt = live\.fixAt \?\? locatieFixAt;/);
  // Heartbeat every 60s re-reads a fix older than 30s: a stationary fix stays well under 2 minutes.
  assert.match(read('lib/useLiveLocation.ts'), /export const LIVE_HEARTBEAT_MS = 60000;/);
});

test('Start nearby groups show real line badges and each original stop remains tappable', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'components/FlowHome.tsx'), 'utf8');
  assert.match(home, /groupNearbyStops\(nearby\)/);
  assert.match(home, /group\.stops\.map\(\(stop, stopIndex\) =>/);
  assert.match(home, /onPress=\{\(\) => openStop\(stop\)\}/);
  assert.match(home, /stop\.lines\.slice\(0, 4\)\.map/);
});

test('foreground location watcher is started only after permission, and avoids duplicates', () => {
  const loc = fs.readFileSync(path.join(__dirname, '..', 'lib/useLiveLocation.ts'), 'utf8');
  assert.match(loc, /await Location\.requestForegroundPermissionsAsync\(\)/);
  assert.match(loc, /if \(cancelled \|\| starting \|\| watchSub \|\| AppState\.currentState !== "active"\) return/);
  assert.match(loc, /const heartbeat = setInterval/);
  assert.match(loc, /clearInterval\(heartbeat\)/);
});
