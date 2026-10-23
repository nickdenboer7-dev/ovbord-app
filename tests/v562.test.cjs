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
const { updateInfoRows } = require("../lib/appVersion.ts");
if (previous) Module._extensions[".ts"] = previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");

// V5.6.2: Start in the white-green style; Instellingen compact.
test("Start has a white header with the green brand and a built-in search field", () => {
  const home = read("components/FlowHome.tsx");
  assert.match(home, /styles\.top, \{ paddingTop: Math\.max\(insets\.top, 24\) \+ 10, backgroundColor: colors\.surface, borderBottomColor: colors\.border \}/);
  assert.match(home, /<Text style=\{\[styles\.brand, \{ color: colors\.heading \}\]\} accessibilityRole="header" maxFontSizeMultiplier=\{1\.2\}>OVbord<\/Text>/);
  // The field is always in view; a tap opens the search, "Sluiten" closes it.
  assert.match(home, /<Pressable onPress=\{openSearch\} accessibilityRole="button" accessibilityLabel="Zoek een halte, station of rit"/);
  assert.match(home, /<Pressable onPress=\{closeSearch\} accessibilityRole="button" accessibilityLabel="Zoeken sluiten"/);
  assert.match(home, /style=\{\[styles\.searchInput, \{ color: colors\.text \}\]\}/);
  assert.match(home, /if \(searchRequest > 0\) openSearch\(\);/);
});

test("nearby stops are one card of compact rows with a small green vehicle icon", () => {
  const home = read("components/FlowHome.tsx");
  assert.match(home, /first && styles\.cardFirst, last && styles\.cardLast/);
  assert.match(home, /const last = index === data\.length - 1;/);
  assert.match(home, /<Ionicons name=\{`\$\{vehicleIcon\(stop\.mode\)\}-outline`\} size=\{16\} color=\{colors\.accentText\} \/>/);
  assert.match(home, /\{shortStopName\(stop\.name\)\}<\/Text>/);
  assert.match(home, /nearRow: \{ marginHorizontal: 12, minHeight: 54,/);
  // The full name stays in what a screen reader says.
  assert.match(home, /accessibilityLabel=\{"Open halte " \+ stop\.name/);
});

test("Start keeps GPS, choosing a city, search, recent stops, favourites and the active trip", () => {
  const home = read("components/FlowHome.tsx");
  assert.match(home, /accessibilityLabel="Terug naar GPS"/);
  assert.match(home, />Gebruik GPS</);
  assert.match(home, /onPress=\{\(\) => \{ setManualCity\(city\.key\); setUseUtrechtExample\(false\); setShowCities\(false\); \}\}/);
  assert.match(home, /tab === "recent" \? "Onlangs bekeken" : "Favoriete haltes"/);
  assert.match(home, />Mijn ritten</);
  assert.match(home, /onPress=\{\(\) => openActiveTrip\(activeTrip\)\}/);
  assert.match(home, /onPress=\{dismissActiveTrip\}/);
  assert.match(home, /Linking\.openSettings\(\)/);
  assert.match(home, /onPress=\{\(\) => toggleFavoriteStop\(stop\)\}/);
  // No large decorative surfaces: no images on Start.
  assert.doesNotMatch(home, /<Image|ImageBackground/);
});

test("Instellingen: compact header, clear theme choice, saved items together", () => {
  const meer = read("app/(tabs)/meer.tsx");
  assert.match(meer, /paddingTop: Math\.max\(insets\.top, 24\) \+ 12/);
  assert.doesNotMatch(meer, /SettingsButton/);
  // No arrows or buttons that do nothing.
  assert.doesNotMatch(meer, /chevron-forward/);
  assert.match(meer, /accessibilityRole="radio" accessibilityState=\{\{ checked: active \}\}/);
  assert.match(meer, /active && \{ backgroundColor: colors\.accent \}/);
  assert.match(meer, /name=\{active \? "checkmark-circle" : option\.icon\}/);
  for (const title of ["Favoriete haltes", "Favoriete ritten", "Favoriete lijnen", "Recente haltes"]) {
    assert.match(meer, new RegExp(">" + title + "</SavedRow>"), title);
  }
  // Clearing recent stops still asks first.
  assert.match(meer, /Alert\.alert\("Recente haltes wissen\?"/);
  assert.match(meer, /\{ text: "Wissen", style: "destructive", onPress: clearRecentStops \}/);
  assert.match(meer, /onPress=\{confirmClearRecents\} disabled=\{!recentStops\.length\}/);
  assert.match(meer, /UPDATE_ROWS\.map\(\(row\) =>/);
});

test("version, preview channel and update stay visible in Instellingen", () => {
  const base = { isDev: false, isEnabled: true, isEmbeddedLaunch: false, createdAt: new Date("2026-10-17T23:12:18Z"),
    channel: "preview", updateId: "01a14c23-37fe-7652-bded-fee201ec216e" };
  assert.deepEqual(updateInfoRows(base, "1.0.3"), [
    { label: "Versie", value: "1.0.3" },
    { label: "Update", value: "Update van 18 okt 01:12" },
    { label: "Kanaal", value: "preview" },
    { label: "Update-ID", value: "01a14c23" }
  ]);
  // The built-in version still shows its channel, without an id.
  assert.deepEqual(updateInfoRows({ ...base, isEmbeddedLaunch: true }, "1.0.3").map((row) => row.label + ": " + row.value),
    ["Versie: 1.0.3", "Update: Ingebouwde versie", "Kanaal: preview"]);
  assert.deepEqual(updateInfoRows({ ...base, isDev: true }, "1.0.3").map((row) => row.label), ["Versie", "Update"]);
  assert.equal(updateInfoRows({ ...base, channel: null, isEnabled: false }, "1.0.3")[2].value, "onbekend");
});
