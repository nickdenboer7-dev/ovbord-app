const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");

// V5.6 Concept C: blue headers on the stop board and the trip page (Start is white-green since V5.6.2).
test("stop board and trip page have a blue header in light and dark mode", () => {
  assert.match(read("components/FlowBoard.tsx"), /resolvedScheme === "dark" \? "#123C64" : "#175FAD"/);
  assert.doesNotMatch(read("components/FlowHome.tsx"), /#175FAD|#123C64/);
  assert.match(read("app/rit/[id].tsx"), /header: \{ backgroundColor: c\.statusBar === "dark" \? "#175FAD" : "#123C64"/);
});

test("the status bar has white icons on the blue headers", () => {
  const home = read("components/FlowHome.tsx");
  // Only while Start is the focused tab, so Favorieten and Meer keep the theme colours.
  // V5.6.2: white on an open (blue) stop board, dark on the white Start header in light mode.
  assert.match(home, /const statusBarStyle = showingBoard \|\| resolvedScheme === "dark" \? "light" : "dark";/);
  assert.match(home, /\{focused \? <ExpoStatusBar style=\{statusBarStyle\} \/> : null\}/);
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ setFocused\(true\); return \(\) => setFocused\(false\); \}, \[\]\)\)/);
  assert.match(read("app/rit/[id].tsx"), /<ExpoStatusBar style="light" \/>/);
  // Other screens follow the theme.
  assert.match(read("app/_layout.tsx"), /<StatusBar style=\{resolvedScheme === "dark" \? "light" : "dark"\} \/>/);
});

test("the next-stop label is as wide as its text", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /nextTag: \{[^}]*alignSelf: "flex-start"/);
  assert.match(rit, /<Text style=\{styles\.nextTag\}>Volgende halte<\/Text>/);
});

test("the line badge in the blue trip header has a white edge", () => {
  assert.match(read("app/rit/[id].tsx"), /headerBadge: \{[^}]*borderWidth: 1\.5, borderColor: "rgba\(255,255,255,0\.85\)"/);
});

test("live information stays green", () => {
  assert.match(read("components/DepartureLine.tsx"), /<Ionicons name="wifi" size=\{14\} color=\{colors\.success\} \/>/);
});
