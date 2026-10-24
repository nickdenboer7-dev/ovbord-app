const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("V5.6.1 removes the boarding banner, preserving cancellation and alighting", () => {
  const rit = read("app/rit/[id].tsx");
  assert.doesNotMatch(rit, /Je stapt in bij/);
  assert.match(rit, /Deze rit rijdt niet/);
  // V5.7: the alighting stop is named in the timeline (and warned for when it is next), not in a bar.
  assert.match(rit, /Je stapt hier uit/);
  assert.match(rit, /<TimeLine journey=/);
});

test("all non-selection timeline rows open the stop board with a tap", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /onPress=\{\(\) => \{ if \(!choosing\) onOpenStop\(stop\)/);
  assert.match(rit, /disabled=\{choosing && !selectable\}/);
  assert.match(rit, /name="chevron-forward" size=\{16\}/);
});

test("opening a stop remembers the exact originating trip for header and Android Back", () => {
  const rit = read("app/rit/[id].tsx");
  const nav = read("context/FlowNavigation.tsx");
  const workspace = read("components/FlowWorkspace.tsx");
  assert.match(rit, /followJourneyStop\(stop, journey\?\.mode \|\| "bus", returnTrip\)/);
  assert.match(nav, /returnTrip\?: Record<string, string>/);
  assert.match(nav, /initialBoard: board, returnTrip/);
  assert.match(workspace, /onBack=\{goBack\}/);
  assert.match(workspace, /goBack\(\);\s*return true/);
  assert.match(workspace, /pathname: "\/rit\/\[id\]", params: current.returnTrip/);
});

test("boarding-stop clock is departure, never an earlier arrival", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /isTime\(stop.expectedDepartureTime\)/);
  assert.match(rit, /isTime\(stop.plannedDepartureTime\)/);
  assert.match(rit, /clock: stopClock/);
  assert.match(rit, /styles\.alightTime, passed && styles\.passedText\]\}>\{stopClock\}<\/Text>/);
});
