const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rit = fs.readFileSync(path.resolve(__dirname, "../app/rit/[id].tsx"), "utf8");
const timeline = rit.slice(rit.indexOf("function TimeLine("), rit.indexOf("export default function RitScreen"));
test("skipped labels are consistently below the clock in the narrow time column", () => {
  const timeColumn = timeline.indexOf('<View style={styles.timelineTimeCol}>');
  const badge = timeline.indexOf('style={styles.skipTimeTag}>Vervalt</Text>');
  const rail = timeline.indexOf('<View style={styles.timelineRail}>');
  const name = timeline.indexOf('<View style={styles.timelineLabel}>');
  assert.ok(timeColumn >= 0 && badge > timeColumn && badge < rail && rail < name);
  assert.doesNotMatch(timeline.slice(name), /styles\.skipTag/);
  assert.match(rit, /skipTimeTag:\s*\{[^}]*fontSize:\s*10/);
  assert.match(rit, /skip && styles\.skippedTime/);
  assert.match(rit, /skip && styles\.skippedName/);
  assert.match(rit, /<Text maxFontSizeMultiplier=\{1\.3\} style=\{styles\.skipTimeTag\}>Vervalt<\/Text>/);
});
test("one trip-wide delay: don't spam +4 on every estimated stop, but keep per-stop changes", () => {
  assert.match(timeline, /stop\.timingSource === "journey_estimate" \? null : timelineTimeDelta\(stop\.delayMinutes\)/);
  assert.match(timeline, /\{delta && !passed && !skip \?/);
  assert.match(rit, /stop\.timingSource === "journey_estimate" && !passed && !skip/);
  // Important: the next-stop delay in the header is deliberately unchanged.
  assert.match(rit, /journey\.stops\.some\(/);
});
test("footer is short, truthful and remains readable in Dutch", () => {
  const concise = "≈ is een schatting op basis van ritvertraging, geen bevestigde haltetijd.";
  assert.ok(rit.includes(concise));
  assert.ok(concise.length < 85);
  assert.doesNotMatch(rit, /Tijden met ≈ zijn indicaties op basis van de ritvertraging/);
  assert.match(rit, /Alleen bevestigde GPS verschijnt als live positie/);
});
