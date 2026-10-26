const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("Buurtbord kaart is alleen zichtbaar als de instelling aanstaat en de kaart opengeklapt is", () => {
  const screen = read("app/(tabs)/buurtbord.tsx");
  assert.match(screen, /settings\.buurtbordMap\s*\?/);
  assert.match(screen, /mapExpanded\s*,\s*setMapExpanded/);
  assert.match(screen, /accessibilityState=\{\{ expanded: mapExpanded \}\}/);
  assert.match(screen, /mapExpanded\s*\?\s*<View[^>]+styles\.mapWrap/);
  assert.match(screen, /<LeafletMap markers=\{mapMarkers\} center=\{center\}/);
  assert.match(screen, /paddingBottom: Math\.max\(insets\.bottom, 16\) \+ 78/);
});

test("Favorieten hebben actuele tijden, sorteermogelijkheden en een haltebord-snelkoppeling", () => {
  const screen = read("app/(tabs)/favorieten.tsx");
  assert.match(screen, /useFavoritesLive\(\)/);
  assert.match(screen, /moveFavoriteStop\(item\.id, delta\)/);
  assert.match(screen, /moveFavoriteJourney\(item\.key, delta\)/);
  assert.match(screen, /onPress=\{\(\) => openStop\(item\)\}[^>]*accessibilityRole="button"/);
  assert.match(screen, />Open haltebord<\/Text>/);
  assert.match(screen, /paddingBottom: Math\.max\(insets\.bottom, 16\) \+ 72/);
});

test("Beide tabs gebruiken het blauwe kopvlak en de omgekeerde witte instellingenknop", () => {
  const buurtbord = read("app/(tabs)/buurtbord.tsx");
  const favorieten = read("app/(tabs)/favorieten.tsx");
  const settings = read("components/SettingsButton.tsx");
  for (const screen of [buurtbord, favorieten]) {
    assert.match(screen, /backgroundColor: STOP_BOARD_BLUE/);
    assert.match(screen, /<SettingsButton inverted/);
    assert.match(screen, /<ExpoStatusBar style="light"/);
  }
  assert.match(settings, /inverted \? "#FFFFFF" : colors\.text/);
});

test("Sorteerlogica verplaatst alleen het gekozen item", () => {
  const module = { exports: {} };
  const js = ts.transpileModule(read("lib/listOrder.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  new Function("module", "exports", js)(module, module.exports);
  const { moveItem } = module.exports;
  assert.deepEqual(moveItem(["A", "B", "C"], 2, -1), ["A", "C", "B"]);
  assert.deepEqual(moveItem(["A", "B", "C"], 0, -1), ["A", "B", "C"]);
});
