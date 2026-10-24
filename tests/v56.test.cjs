const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");

// The legacy navy-blue variants stay retired; the focused board and trip use #185c98.
test("no screen uses the old blue header palette", () => {
  assert.doesNotMatch(read("components/FlowBoard.tsx"), /#175FAD|#123C64/);
  assert.doesNotMatch(read("components/FlowHome.tsx"), /#175FAD|#123C64/);
  assert.doesNotMatch(read("app/rit/[id].tsx"), /#175FAD|#123C64/);
});

test("white screens follow the theme; the blue trip header uses light status icons", () => {
  const home = read("components/FlowHome.tsx");
  // Only while Start is the focused tab, so Favorieten and Meer keep the theme colours.
  // Start remains theme-aware; focused blue headers use light icons.
  assert.match(home, /const statusBarStyle = resolvedScheme === "dark" \? "light" : "dark";/);
  assert.match(home, /\{focused \? <ExpoStatusBar style=\{statusBarStyle\} \/> : null\}/);
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ setFocused\(true\); return \(\) => setFocused\(false\); \}, \[\]\)\)/);
  // The trip now matches the stop board: white icons on #185c98.
  assert.match(read("app/rit/[id].tsx"), /<ExpoStatusBar style="light" \/>/);
  // Other screens follow the theme.
  assert.match(read("app/_layout.tsx"), /<StatusBar style=\{resolvedScheme === "dark" \? "light" : "dark"\} \/>/);
});

test("the next-stop label is as wide as its text", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /nextTag: \{[^}]*alignSelf: "center"/);
  assert.match(rit, /<Text maxFontSizeMultiplier=\{1\.3\} style=\{styles\.nextTag\}>Volgende halte<\/Text>/);
});

// The trip badge uses the exact feed/GTFS palette from the tapped stop-board row.
test("the line badge in the blue trip header matches the stop board", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /stopBoardLineBadge\(\{ line, carrier/);
  assert.match(rit, /backgroundColor: lineBadge\.bg/);
});

test("live information stays green", () => {
  assert.match(read("components/DepartureLine.tsx"), /<Text style=\{\{ color: colors\.success \}\}>Live<\/Text>/);
});
