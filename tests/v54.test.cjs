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
const line = require("../lib/departureLine.ts");
const progress = require("../lib/ritProgress.ts");
const snapshot = require("../lib/tripSnapshot.ts");
const { runLimited } = require("../lib/concurrency.ts");
const { activeTripLine } = require("../lib/activeTrip.ts");
const { visibleTimelineWindow } = require("../lib/ritRedesign.ts");
const { parseDisruptions } = require("../lib/haltebordV4.ts");
const { modeBadgeColors } = require("../lib/lineColors.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const now = Date.parse("2026-10-17T09:40:00+02:00");
const at = (clock) => new Date(Date.parse("2026-10-17T" + clock + ":00+02:00")).toISOString();
const dep = (clock, extra={}) => ({ id: "d" + clock, line: "14", carrier: "GVB", destination: "Centraal Station",
  plannedTime: clock, relativeText: "", reliability: "planned", effectiveAt: at(clock), ...extra });

// 1. Eén rustige vertrekregel
test("status line: live, planned, estimated and what can no longer be confirmed", () => {
  assert.deepEqual(line.departureLineStatus(dep("09:42", { isLive: true }), now), { tone: "live", text: "Live · over 2 min" });
  assert.deepEqual(line.departureLineStatus(dep("09:48", { isLive: false }), now), { tone: "planned", text: "Gepland · over 8 min" });
  assert.deepEqual(line.departureLineStatus(dep("09:45", { expectedTime: "09:47" }), now).tone, "estimated");
  assert.deepEqual(line.departureLineStatus(dep("09:42", { cancelled: true, platform: "5", mode: "train" }), now),
    { tone: "cancelled", text: "Rijdt niet · spoor 5" });
  assert.deepEqual(line.departureLineStatus(dep("09:39", { departed: true, isLive: true }), now), { tone: "departed", text: "Vertrokken" });
  // After a failed refresh each row explicitly shows its last-known time.
  assert.deepEqual(line.departureLineStatus(dep("09:44", { isLive: true }), now, { stale: true }), { tone: "stale", text: "Laatst bekende tijd" });
  assert.deepEqual(line.departureLineStatus(dep("09:44", { liveDataStale: true }), now).tone, "stale");
  assert.deepEqual(line.departureLineStatus(dep("09:41", { isLive: true }), now, { tooTight: true }), { tone: "muted", text: "Te krap om te lopen" });
  // Trains add the platform; a recent time change is appended.
  assert.equal(line.departureLineStatus(dep("09:50", { isLive: true, platform: "4b", mode: "train" }), now, { note: "was 09:47" }).text,
    "Live · over 10 min · spoor 4b · was 09:47");
  // Until three hours away show hours/minutes; after that only the kind of time.
  assert.equal(line.departureLineStatus(dep("11:30"), now).text, "Gepland · over 1 u 50 min");
  assert.equal(line.departureLineStatus(dep("13:00"), now).text, "Gepland");
});

test("delay under the time and the spoken row", () => {
  assert.deepEqual(line.departureDelayLabel(dep("09:51", { delayMinutes: 3 })), { text: "+3 min", late: true });
  assert.deepEqual(line.departureDelayLabel(dep("09:51", { delayMinutes: -1 })), { text: "−1 min", late: false });
  assert.equal(line.departureDelayLabel(dep("09:51", { delayMinutes: 0 })), null);
  assert.equal(line.departureDelayLabel(dep("09:51", { delayMinutes: 4, cancelled: true })), null);
  const item = dep("09:48", { isLive: true, delayMinutes: 2, expectedTime: "09:50", effectiveAt: at("09:50"), ritId: "GVB_1" });
  const status = line.departureLineStatus(item, now);
  assert.equal(line.departureLineLabel(item, now, status, true),
    "Lijn 14 naar Centraal Station, 09:50, 2 min vertraging, live · over 10 min, ritverloop openen");
});

// 2. Ritpagina: één positiekaart
test("position card headline and the line that follows the trip", () => {
  assert.equal(progress.positionHeadline({ ended: false, placeText: "Tussen Rembrandtplein en Keizersgracht", live: true, cancelled: false }),
    "Tussen Rembrandtplein en Keizersgracht");
  assert.equal(progress.positionHeadline({ ended: false, placeText: "", live: false, cancelled: false }), "Positie niet bevestigd");
  assert.equal(progress.positionHeadline({ ended: false, placeText: "", live: true, cancelled: false }), "Positie niet bevestigd");
  assert.equal(progress.positionHeadline({ ended: true, placeText: "Bij Dam", live: true, cancelled: false }), "Rit beëindigd");
  assert.equal(progress.positionHeadline({ ended: false, placeText: "Bij Dam", live: true, cancelled: true }), "Deze rit rijdt niet");

  const base = { name: "Rembrandtplein", clock: "09:44", minutes: 4, state: "approaching", lastKnown: false };
  // V5.4 mockup 2: the stop name first, then time and countdown; departure and platform on a second line.
  assert.deepEqual(progress.boardingProgress({ ...base, delayMinutes: 1, platform: "Perron B", note: "Vertrek 09:45" }),
    { name: "Rembrandtplein", clock: "09:44", delay: "+1", countdown: "over 4 min", detail: "Vertrek 09:45 · Perron B" });
  assert.deepEqual(progress.boardingProgress({ ...base, state: "at", minutes: 0 }),
    { name: "Rembrandtplein", clock: "09:44", delay: "", countdown: "bij je halte", detail: "" });
  assert.equal(progress.boardingProgress({ ...base, lastKnown: true }).countdown, "± 4 min");
  assert.equal(progress.boardingProgress({ ...base, delayMinutes: -2 }).delay, "−2");
  // On board: the boarding line disappears and the alighting line takes over.
  assert.equal(progress.boardingProgress({ ...base, state: "passed" }), null);
  assert.equal(progress.boardingProgress({ ...base, minutes: 140 }).countdown, "");
  // Without GPS a boarding time well in the past means the trip is beyond the stop; with GPS "approaching" it stays.
  assert.equal(progress.boardingProgress({ ...base, state: "unknown", minutes: -3 }), null);
  assert.equal(progress.boardingProgress({ ...base, state: "unknown", minutes: -1 }).countdown, "nu");
  assert.equal(progress.boardingProgress({ ...base, state: "approaching", minutes: -3 }).countdown, "nu");
  // The alighting row: "Spaklerweg · 02:57 · over 22 min" and "nog 11 haltes".
  const off = { name: "Spaklerweg", clock: "02:57", minutes: 22, status: "approaching", remaining: 11, lastKnown: false };
  assert.deepEqual(progress.alightRow(off), { name: "Spaklerweg", clock: "02:57", delay: "", countdown: "over 22 min", detail: "nog 11 haltes" });
  assert.equal(progress.alightRow({ ...off, remaining: 1 }).detail, "nog 1 halte");
  assert.equal(progress.alightRow({ ...off, remaining: null }).detail, "");
  assert.deepEqual(progress.alightRow({ ...off, status: "next", minutes: 2, remaining: 1 }), { name: "Spaklerweg", clock: "02:57", delay: "", countdown: "over 2 min", detail: "Volgende halte: uitstappen" });
  assert.equal(progress.alightRow({ ...off, status: "next", lastKnown: true }).detail, "Laatst bekend: volgende halte");
  assert.deepEqual(progress.alightRow({ ...off, status: "at", minutes: 0 }), { name: "Spaklerweg", clock: "02:57", delay: "", countdown: "nu", detail: "Stap hier uit" });
  assert.deepEqual(progress.alightRow({ ...off, status: "passed" }), { name: "Spaklerweg", clock: "02:57", delay: "", countdown: "", detail: "Uitstaphalte gepasseerd" });
});

test("timeline stops are spoken with their meaning for this trip", () => {
  const stop = { name: "Amsterdam, Centraal Station", clock: "09:56", passed: false, vehicleHere: false, next: false,
    boarding: false, alight: true, last: false, lastKnown: false };
  assert.equal(progress.timelineStopLabel(stop), "Amsterdam, Centraal Station, 09:56, jouw uitstaphalte");
  assert.equal(progress.timelineStopLabel({ ...stop, alight: false, passed: true, delayMinutes: 2 }), "Amsterdam, Centraal Station, 09:56, gepasseerd");
  assert.equal(progress.timelineStopLabel({ ...stop, alight: false, vehicleHere: true, boarding: true, delayMinutes: 1, platform: "Spoor 2" }),
    "Amsterdam, Centraal Station, 09:56, 1 minuut later, Spoor 2, voertuig is hier, jouw halte");
  assert.equal(progress.timelineStopLabel({ ...stop, alight: false, next: true, lastKnown: true, last: true }),
    "Amsterdam, Centraal Station, 09:56, laatst bekend als volgende halte, eindhalte");
});

// 3. Trillen bij uitstappen
test("the alighting alert fires once per trip and stop, only on live progress", () => {
  const alight = { id: "s1", index: 6 };
  assert.equal(progress.alightAlertKey("GVB_1", alight, "approaching", false), null);
  assert.equal(progress.alightAlertKey("GVB_1", alight, "next", true), null);
  assert.equal(progress.alightAlertKey("GVB_1", null, "next", false), null);
  const key = progress.alightAlertKey("GVB_1", alight, "next", false);
  assert.equal(key, "GVB_1|6|s1");
  assert.equal(progress.alightAlertKey("GVB_1", alight, "at", false), key);
  assert.equal(progress.markAlightAlert(key), true);
  assert.equal(progress.markAlightAlert(key), false);
  assert.equal(progress.markAlightAlert("GVB_1|7|s2"), true);
  const vibration = read("lib/alightAlert.ts");
  // The permission is checked before vibrating: a build without it does not crash.
  assert.ok(vibration.indexOf('check("android.permission.VIBRATE")') < vibration.indexOf("Vibration.vibrate("));
  assert.match(read("app/rit/[id].tsx"), /if \(markAlightAlert\(alertKey\)\) vibrateForAlighting\(\);/);
  assert.match(read("app/rit/[id].tsx"), /label: "Trillen bij uitstappen"/);
});

// 4. Rit zonder bereik
test("the followed trip is kept on the device for two hours", () => {
  const rit = { id: "GVB_2027", line: "14", destination: "Centraal Station", mode: "tram", polyline: [], stops: [{ id: "a", name: "Dam" }] };
  const raw = snapshot.serializeTripSnapshot("GVB_2027", rit, now - 60000);
  const parsed = snapshot.parseTripSnapshot(raw);
  assert.deepEqual(parsed, { tripId: "GVB_2027", fetchedAt: now - 60000, data: rit });
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "14", now, "Centraal Station"), true);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2028", "14", now), false);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "4", now), false);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "14", now, "Station Sloterdijk"), false);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "14", now - 61000 + snapshot.TRIP_SNAPSHOT_MAX_AGE_MS), true);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "14", now - 60000 + snapshot.TRIP_SNAPSHOT_MAX_AGE_MS), false);
  assert.equal(snapshot.usableTripSnapshot(parsed, "GVB_2027", "14", now - 120000), false);
  assert.equal(snapshot.parseTripSnapshot("{"), null);
  assert.equal(snapshot.parseTripSnapshot(JSON.stringify({ tripId: "x", fetchedAt: 1, data: { line: "1" } })), null);
  assert.deepEqual(snapshot.parseTripSnapshot(JSON.stringify({ tripId: "x", fetchedAt: 1, data: { ...rit, polyline: undefined } })).data.polyline, []);
  const huge = { ...rit, shape: Array.from({ length: 120000 }, (_, i) => [52 + i / 1e6, 4.9]) };
  assert.equal(snapshot.serializeTripSnapshot("GVB_2027", huge, now), null);
  const page = read("app/rit/[id].tsx");
  assert.match(page, /usableTripSnapshot\(snapshot, tripId, expectedLine, Date\.now\(\), fallbackDestination\)/);
  assert.match(page, /receivedAt - lastSnapshotAt\.current >= TRIP_SNAPSHOT_INTERVAL_MS/);
  assert.match(read("lib/activeTripStore.ts"), /removeItem\(TRIP_SNAPSHOT_STORAGE_KEY\)/);
});

// 5. Snellere start
test("favourite boards load a few at a time, in order", async () => {
  let running = 0, most = 0;
  const order = [];
  await runLimited([1, 2, 3, 4, 5, 6, 7, 8], 3, async (n) => {
    running++; most = Math.max(most, running); order.push(n);
    await new Promise((resolve) => setTimeout(resolve, n % 3));
    running--;
    if (n === 4) throw new Error("one stop failing does not stop the others");
  });
  assert.equal(most, 3);
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7, 8]);
  await runLimited([], 3, async () => { throw new Error("never"); });
  const live = read("context/FavoritesLive.tsx");
  assert.match(live, /await runLimited\(list, MAX_PARALLEL_BOARDS,/);
  assert.match(live, /export const MAX_PARALLEL_BOARDS = 3;/);
  assert.doesNotMatch(live, /await Promise\.all\(list\.map/);
});

// 6. Rustige schermen
test("Start: one compact trip line and a search icon", () => {
  const trip = { tripId: "GVB_2027", params: { id: "GVB_2027" }, line: "14", destination: "Centraal Station", carrier: "GVB",
    boardingName: "Rembrandtplein", endClock: "10:02", alighting: { id: "s", name: "Amsterdam, Centraal Station", index: 9 },
    alightName: "Centraal Station", alightClock: "09:56", savedAt: now };
  assert.deepEqual(activeTripLine(trip), { lead: "Je rit: ", line: "14", text: " naar Centraal Station · uitstappen 09:56" });
  assert.deepEqual(activeTripLine({ ...trip, alighting: null, alightName: "", alightClock: "" }),
    { lead: "Laatst bekeken: ", line: "14", text: " naar Centraal Station · vanaf Rembrandtplein" });
  const home = read("components/FlowHome.tsx");
  assert.match(home, /const \[searchOpen, setSearchOpen\] = useState\(false\);/);
  assert.doesNotMatch(home, /accessibilityRole="tablist"/);
  assert.doesNotMatch(home, /Snel openen/);
  assert.match(home, /detail=\{advice\|\|undefined\}/);
  // The live time is shown with an icon next to the destination (DepartureLine), not as a green clock.
  assert.match(read("components/DepartureLine.tsx"), /statusIsLive \? <><Text style=\{\{ color: colors\.success \}\}>Live/);
});

test("stop board and trip page: options under ⋮, one row style everywhere", () => {
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /<OverflowMenu open=\{menuOpen\}/);
  // Stop board filters replace tabs; arrivals remain in the menu when supplied.
  assert.match(board, /BOARD_MODE_LABEL\[mode\]/);
  assert.match(board, /key:"all",label:"Alle"/);
  assert.match(board, /key:"lines",label:"Lijnen"/);
  assert.match(board, /if\(hasArrivals\)menuItems/);
  assert.doesNotMatch(board, /setCompact/);
  assert.match(board, /<DepartureHeading title="Jouw lijnen" star \/>/);
  assert.match(board, /const remaining = pinned\.length \? entries\.filter\(\(item\) => !shown\.has\(boardDepartureIdentity\(item\)\)\) : entries;/);
  assert.match(board, /return tab === "departures" \? groupBoardDepartures\(remaining, nowMs\) : remaining;/);
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /<MenuButton onPress=\{\(\) => setMenuOpen\(true\)\}/);
  assert.match(rit, /styles\.tripBar/);
  assert.doesNotMatch(rit, /styles\.summaryCard/);
  assert.doesNotMatch(rit, /accessibilityLabel="Uitstaphalte wijzigen"/);
  // Transfers sit under the timeline, collapsed.
  assert.ok(rit.indexOf("<RitTransfers") > rit.indexOf("<TimeLine journey="));
  assert.match(read("components/RitTransfers.tsx"), /Overstappen op \{name\}/);
  for (const file of ["app/(tabs)/favorieten.tsx", "app/(tabs)/buurtbord.tsx", "components/FlowHome.tsx"]) {
    assert.match(read(file), /<DepartureLine /, file);
  }
  // Large font: the "Beste halte" label moves under the stop name.
  assert.match(read("app/(tabs)/buurtbord.tsx"), /\{large && item\.id === highlightedStopId \?/);
  assert.match(read("app/(tabs)/buurtbord.tsx"), /\{!large && item\.id === highlightedStopId \?/);
});

// Hertest 17-10: in het ⋮-menu sloot een tik op een optie alleen het menu (Modal in de Android-build)
test("the ⋮ menu is a plain overlay: an option runs, then the menu closes", () => {
  const menu = read("components/OverflowMenu.tsx");
  assert.doesNotMatch(menu, /<Modal|import \{[^}]*\bModal\b/);
  assert.match(menu, /onPress=\{\(\) => \{ item\.onPress\(\); if \(!setting\) onClose\(\); \}\}/);
  assert.match(menu, /BackHandler\.addEventListener\("hardwareBackPress"/);
  // Backdrop and menu are siblings, not parent and child.
  assert.match(menu, /<Pressable style=\{\[styles\.backdrop,[^>]*\n\s*onPress=\{onClose\}[^>]*\/>/);
  for (const file of ["components/FlowBoard.tsx", "app/rit/[id].tsx"]) {
    const source = read(file).replace(/\r\n/g, "\n");
    const at = source.indexOf("<OverflowMenu open={menuOpen}");
    assert.ok(at > source.lastIndexOf("<FlatList") || file.includes("rit"), file);
    // Last child of the screen: nothing but closing tags after it.
    assert.match(source.slice(at), /^<OverflowMenu open=\{menuOpen\} onClose=\{\(\) => setMenuOpen\(false\)\} items=\{menuItems\} title="[^"]+" \/>\n\s*<\/View>;?\n\s*\)?;?\n?\}/, file);
  }
  const home = read("components/FlowHome.tsx");
  assert.match(home, /numberOfLines=\{large \? undefined : 2\}/);
  assert.match(home, /maxFontSizeMultiplier=\{1\.3\}/);
});

// Telefoontest 17-10 (N85 naar Gein): bus vóór het zichtbare deel, "Halte vervalt" zonder halte, menu afgekapt
test("the vehicle stays in view a few stops before the boarding stop", () => {
  // Between Centraal Station (0) and Dam (1), boarding at Rembrandtplein (3): the vehicle row is shown.
  assert.deepEqual(visibleTimelineWindow(35, 3, { kind: "between", index: 0 }, false), { start: 0, end: 9, hiddenFollowing: 26 });
  assert.deepEqual(visibleTimelineWindow(35, 8, { kind: "at", index: 4 }, false), { start: 4, end: 14, hiddenFollowing: 21 });
  // Further away the window stays at the boarding stop; the hidden row says the vehicle is there.
  assert.deepEqual(visibleTimelineWindow(35, 10, { kind: "between", index: 2 }, false), { start: 8, end: 17, hiddenFollowing: 18 });
  // V5.7: the trip page shows every stop and scrolls to the vehicle once, so no stops are hidden before it.
  assert.doesNotMatch(read("app/rit/[id].tsx"), /styles\.hiddenStops/);
});

test("skipped stops come from the notice's stop IDs and are named", () => {
  const notices = parseDisruptions([
    { badge: "Halte vervalt", title: "Bus N85 stopt hier niet. -- Bus N85 does not stop here.", stop_ids: ["3979913", 3980815, "3981164"] },
    { badge: "Omleiding", title: "Bus N85 rijdt om vanaf halte Van Woustraat.", stop_ids: ["3979757", "3981011"] }
  ]);
  assert.deepEqual(notices[0].stopIds, ["3979913", "3980815", "3981164"]);
  const stops = [{ id: "3979757", name: "Amsterdam, Rembrandtplein" }, { id: "3981011", name: "Amsterdam, Van Woustraat" },
    { id: "3980815", name: "Amsterdam, Wibautstraat" }, { id: "3981164", name: "Amsterdam, Prins Bernhardplein" }];
  const short = (name) => name.split(", ").pop();
  // Only "Halte vervalt" marks stops as skipped; a diversion does not.
  assert.deepEqual([...progress.skippedStopIds(notices, stops)], ["3980815", "3981164"]);
  assert.equal(progress.isSkipNotice({ title: "Bus 15 stopt niet bij deze halte" }), true);
  assert.equal(progress.isSkipNotice({ badge: "Omleiding", title: "Bus rijdt om" }), false);
  assert.equal(progress.noticeStopsText(notices[0].stopIds, stops, short), "Geldt voor: Wibautstraat, Prins Bernhardplein");
  assert.equal(progress.noticeStopsText(["x"], stops, short), "");
  assert.equal(progress.noticeStopsText(stops.map((s) => s.id), stops, short, 2), "Geldt voor: Rembrandtplein, Van Woustraat en 2 meer");
  assert.match(progress.timelineStopLabel({ name: "Wibautstraat", clock: "02:47", passed: false, vehicleHere: false, next: false,
    boarding: false, alight: true, last: false, lastKnown: false, skipped: true }), /jouw uitstaphalte, stopt hier niet volgens een melding$/);
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /skippedStopIds\(disruptions, journey\?\.stops \|\| \[\]\)/);
  assert.match(rit, /Let op: stopt niet bij/);
});

// Ontwerp 17-10 (OVinfo-stijl): minuten rechts, tabs, zoekbalk, één balk op de ritpagina, eenvoudig menu
test("rows show the minutes on the right and the clock below the destination", () => {
  const item = dep("09:42", { isLive: true, platform: "5", mode: "train", delayMinutes: 2, expectedTime: "09:44", effectiveAt: at("09:44") });
  assert.deepEqual(line.departureRightText(item, now), { text: "4 min", tone: "normal" });
  assert.deepEqual(line.departureRightText(dep("09:40"), now), { text: "nu", tone: "normal" });
  assert.deepEqual(line.departureRightText(dep("11:15"), now), { text: "11:15", tone: "normal" });
  assert.deepEqual(line.departureRightText(dep("09:44"), now, { stale: true }), { text: "± 4 min", tone: "stale" });
  assert.deepEqual(line.departureRightText(dep("09:44", { cancelled: true }), now), { text: "Rijdt niet", tone: "cancelled" });
  assert.deepEqual(line.departureRightText(dep("09:39", { departed: true }), now), { text: "Vertrokken", tone: "departed" });
  assert.deepEqual(line.departureRightText(dep("09:41"), now, { tooTight: true }).tone, "muted");
  assert.deepEqual(line.departureSubParts(item, now, "was 09:41"), { clock: "09:44", delay: "+2", late: true, rest: "spoor 5 · was 09:41" });
  assert.equal(line.showsLive(item), true);
  assert.equal(line.showsLive(item, true), false);
  assert.equal(line.showsLive({ ...item, cancelled: true }), false);
  assert.equal(line.showsLive(dep("09:44", { isLive: false })), false);
});

test("badges by kind of transport, tabs and search on the board", () => {
  assert.equal(modeBadgeColors("metro").bg, "#D7263D");
  assert.equal(modeBadgeColors("tram").bg, "#1767D2");
  assert.equal(modeBadgeColors(undefined).bg, "#1767D2");
  assert.match(read("components/DepartureLine.tsx"), /tone="plain"/);
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /<Pressable onPress=\{requestSearch\} accessibilityRole="button" accessibilityLabel="Zoek halte, lijn of plaats"/);
  assert.match(read("context/FlowNavigation.tsx"), /setScreens\(\[\]\); setSearchRequest\(\(n\) => n \+ 1\);/);
  assert.match(read("components/FlowHome.tsx"), /if \(searchRequest > 0\) openSearch\(\);/);
  // No line chips any more; a chosen line shows as one removable filter.
  assert.doesNotMatch(board, /favoriteLinesFirst/);
  assert.match(board, /"Lijnfilter " \+ selectedLineLabel \+ " wissen"/);
});

test("trip page: one bar that follows the trip and a simple menu", () => {
  const rit = read("app/rit/[id].tsx");
  // V5.6.1: the boarding bar is gone; the boarding stop is shown in the timeline.
  assert.doesNotMatch(rit, /Je stapt in bij/);
  assert.doesNotMatch(rit, /openStopBoard\(boardingStop\)/);
  // V5.7: no permanent alighting bar; a warning only when the alighting stop is next or reached.
  assert.match(rit, /alightLine && \(alightState\.status === "next" \|\| alightState\.status === "at"\) \? <View style=\{styles\.alightWarning\}/);
  assert.match(rit, />Je stapt hier uit</);
  assert.match(rit, /style=\{styles\.passedSub\}>Vertrokken<\/Text>/);
  assert.match(rit, /style=\{styles\.headerStatusText\} numberOfLines=\{1\}>\{headerStatusText\}<\/Text>/);
  assert.match(rit, /title="Meer acties voor deze rit"/);
  assert.match(rit, /description: "Rit-ID: " \+ tripId/);
  assert.match(rit, /checked: vibrate, group: 1/);
  // Every stop in the timeline opens its board; the alighting stop is chosen under ⋮.
  assert.match(rit, /onOpenStop=\{openStopBoard\}/);
  assert.match(rit, /onPress=\{\(\) => \{ if \(!choosing\) onOpenStop\(stop\); else if \(selectable\) onChooseAlight\?\.\(stop, index\); \}\}/);
  assert.match(rit, /label: alightStop \? "Uitstaphalte wijzigen" : "Kies waar je uitstapt", icon: "flag-outline", onPress: startChoosingAlight/);
  // All stops are shown: no "Toon alle haltes" button.
  assert.doesNotMatch(rit, /Toon alle haltes/);
  const menu = read("components/OverflowMenu.tsx");
  assert.match(menu, /sheet: \{ position: "absolute", left: 0, right: 0, bottom: 0,/);
  assert.match(menu, /<Switch value=\{item\.checked\}/);
  assert.match(menu, /const newGroup = index > 0 && \(item\.group \?\? 0\) !== \(items\[index - 1\]\.group \?\? 0\);/);
});

// LDPlayer 17-10 bij lettergrootte 1,5: Instellingen niet te scrollen, keuze uitstaphalte begon bij de eerste halte, koppen afgekapt
test("large font and choosing the alighting stop", () => {
  const meer = read("app/(tabs)/meer.tsx").replace(/\r\n/g, "\n");
  assert.match(meer, /<ScrollView style=\{styles\.scroll\}/);
  // The theme setting comes first, so it is in view without scrolling.
  assert.ok(meer.indexOf(">Thema<") < meer.indexOf(">Favorieten beheren<"));
  const rit = read("app/rit/[id].tsx");
  // V5.7: choosing scrolls to the first stop that can be chosen; the earlier stops stay in the list.
  assert.match(rit, /scrollToStop\(Math\.max\(0, minAlightIndex - 1\), true\)/);
  assert.doesNotMatch(rit, /setChoosingAlight\(true\);\s*setShowAll\(true\);/);
  assert.match(rit, /<Text maxFontSizeMultiplier=\{1\.3\} style=\{\[styles\.headerTitle/);
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /<Text maxFontSizeMultiplier=\{1\.3\} style=\{styles\.title\} numberOfLines=\{1\}/);
  assert.doesNotMatch(board, /searchBar: \{ position: "absolute"/);
});

// LDPlayer 17-10 bij 1,5: "Systeem" en "Centraal" werden midden in het woord afgebroken
test("no word is broken in the middle at a large font", () => {
  const row = read("components/DepartureLine.tsx");
  assert.doesNotMatch(row, /styles\.titleRow/);
  assert.match(row, /destination: \{ fontSize: 16,/);
  assert.match(read("app/(tabs)/meer.tsx"), /maxFontSizeMultiplier=\{1\.3\} adjustsFontSizeToFit minimumFontScale=\{0\.75\} numberOfLines=\{1\}/);
});

// LDPlayer 17-10 middag: op Start → Mijn ritten werd "Rembrandtplein" gesplitst in "Re" / "mbrandtplein"
test("the small line under a destination wraps between words", () => {
  const row = read("components/DepartureLine.tsx").replace(/\r\n/g, "\n");
  assert.match(row, /sub: \{ fontSize: 12\.5, lineHeight: 17 \}/);
  assert.doesNotMatch(row, /styles\.subRow/);
});

// LDPlayer 17-10 12:44: daarna nog "Rembr" / "andtplein" — het woord zelf was breder dan de kolom
test("a long word gets a slightly smaller font instead of being broken", () => {
  const { wordFitScale } = require("../lib/textScale.ts");
  // 120 dp column (small phone, font 1.5): "Rembrandtplein" (14 letters) needs about 105 dp at 12.5
  assert.equal(wordFitScale("12:51 · Rembrandtplein", 120, 12.5, 1.3), 1.14);
  assert.equal(wordFitScale("12:51 · Rembrandtplein", 160, 12.5, 1.3), 1.3);
  assert.equal(wordFitScale("Muiderpoortstation", 90, 16, 1.5), 1);
  assert.equal(wordFitScale("Station RAI", undefined, 16, 1.5), 1.5);
  assert.equal(wordFitScale("Amstelveen-Stadshart", 120, 16, 1.5), 1.25); // breaks at the hyphen anyway
  const row = read("components/DepartureLine.tsx").replace(/\r\n/g, "\n");
  assert.match(row, /maxFontSizeMultiplier=\{wordFitScale\(item\.destination, bodyWidth/);
  assert.match(row, /maxFontSizeMultiplier=\{wordFitScale\(status\.text, bodyWidth, 12\.5, 1\.3\)\}/);
  assert.match(row, /onLayout=\{large \?/);
  assert.match(row, /rowLarge: \{ gap: 8 \}/);
});
