const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (relative) => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("Lijnen tab keeps direction and date visible, with a jump to the next trip", () => {
  const list = read("components/FlowLineGroups.tsx");
  assert.match(list, /styles\.contextBar/);
  assert.match(list, /shortDateLabel\(date\)/);
  assert.match(list, /Naar eerstvolgende rit/);
  assert.match(list, /jumpToNextToken=\{jumpToken\}/);
});

test("full-day schedule has a service-gap separator and never flashes today's live row for future dates", () => {
  const panel = read("components/LineSchedulePanel.tsx");
  assert.match(panel, /scheduleGapStartClock\(i > 0 \? visible\[i - 1\]/);
  assert.match(panel, /Volgende vertrekken vanaf \{gapClock\}/);
  assert.match(panel, /schedule\?\.date === date/);
  assert.match(panel, /isToday \? fallback : null/);
  assert.match(panel, /onDisplayDirection\?\.\(opposite\.destination\)/);
});

test("calendar distinguishes absent service from unavailable feed days", () => {
  const panel = read("components/LineSchedulePanel.tsx");
  assert.match(panel, /deze lijn rijdt niet op die dag/);
  assert.match(panel, /dienstregeling nog niet beschikbaar/);
});

test("empty favourites offers actionable navigation and line direction stars can be saved", () => {
  const fav = read("app/(tabs)/favorieten.tsx");
  const list = read("components/FlowLineGroups.tsx");
  assert.match(fav, /Zoek een halte/);
  assert.match(fav, /Haltes in de buurt/);
  assert.match(list, /favoriteJourneyKey\(group\.line, displayName, stop\.id\)/);
  assert.match(list, /toggleFavoriteJourney\(\{/);
});

test("stale stop board displays refresh skeleton while fetching; disruptions open inline", () => {
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /waitingForFreshBoard && tab !== "disruptions"/);
  assert.match(board, /Vertrektijden vernieuwen/);
  assert.match(board, /Bekijk melding/);
});

test("nearby advice only recommends with current GPS and recent departures", () => {
  const ui = read("app/(tabs)/buurtbord.tsx");
  assert.match(ui, /hasCurrentGps && previewsAreFresh/);
  assert.match(ui, /Haalbare vertrekken vergelijken/);
});
