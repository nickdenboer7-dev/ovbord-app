const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8").replace(/\r\n/g, "\n");

// V5.8: the stop board gets the compact white-green header too; no blue headers remain anywhere.
test("no screen uses the old blue header any more", () => {
  assert.doesNotMatch(read("components/FlowBoard.tsx"), /#175FAD|#123C64/);
  assert.doesNotMatch(read("components/FlowHome.tsx"), /#175FAD|#123C64/);
  assert.doesNotMatch(read("app/rit/[id].tsx"), /#175FAD|#123C64/);
});

test("the status bar follows the theme on every white header", () => {
  const home = read("components/FlowHome.tsx");
  // Only while Start is the focused tab, so Favorieten and Meer keep the theme colours.
  // V5.8: the stop board is white too now, so it no longer forces white (light) icons.
  assert.match(home, /const statusBarStyle = resolvedScheme === "dark" \? "light" : "dark";/);
  assert.match(home, /\{focused \? <ExpoStatusBar style=\{statusBarStyle\} \/> : null\}/);
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{ setFocused\(true\); return \(\) => setFocused\(false\); \}, \[\]\)\)/);
  // V5.7: the trip page has a white header, so its status bar follows the theme.
  assert.match(read("app/rit/[id].tsx"), /<ExpoStatusBar style=\{c\.statusBar\} \/>/);
  // Other screens follow the theme.
  assert.match(read("app/_layout.tsx"), /<StatusBar style=\{resolvedScheme === "dark" \? "light" : "dark"\} \/>/);
});

test("the next-stop label is as wide as its text", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /nextTag: \{[^}]*alignSelf: "flex-start"/);
  assert.match(rit, /<Text style=\{styles\.nextTag\}>Volgende halte<\/Text>/);
});

// V5.7: on the white trip header the line badge is OVbord green (no edge needed any more).
test("the line badge in the trip header is the green accent", () => {
  assert.match(read("app/rit/[id].tsx"), /<LijnBadge line=\{line\} carrier=\{carrier\} tone="accent" \/>/);
});

test("live information stays green", () => {
  assert.match(read("components/DepartureLine.tsx"), /<Text style=\{\{ color: colors\.success \}\}>Live<\/Text>/);
});
