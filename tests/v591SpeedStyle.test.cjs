const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
test("skeleton has six 66px placeholders with a matching row height", () => {
  const skeleton = read("components/DepartureSkeleton.tsx");
  assert.match(skeleton, /const SKELETON_ROWS = 6/);
  assert.match(skeleton, /DEPARTURE_ROW_HEIGHT = 66/);
  assert.match(skeleton, /height: DEPARTURE_ROW_HEIGHT/);
  assert.match(read("components/FlowBoard.tsx"), /<DepartureSkeleton rowHeight=\{52\} \/>/);
});
test("search starts 150ms after typing", () => {
  assert.match(read("components/FlowHome.tsx"), /\}, 150\);/);
});
test("favorites restore previous boards then refresh without clearing visible rows", () => {
  const ctx = read("context/FavoritesLive.tsx");
  assert.match(ctx, /AsyncStorage\.getItem\(FAVORITE_BOARDS_STORAGE_KEY\)/);
  assert.match(ctx, /stale: true/);
  assert.match(ctx, /setRefreshing\(true\)/);
  assert.match(ctx, /setRefreshing\(false\)/);
  assert.match(read("components/FlowHome.tsx"), /Bijwerken…/);
  assert.match(read("app\/(tabs)\/favorieten.tsx"), /Bijwerken…/);
});
test("Concept C stays on other screens while the stop board gets its blue filters", () => {
  const colors = read("constants/colors.ts");
  assert.match(colors, /heading: "#1454A0"/);
  assert.match(colors, /background: "#FFFFFF"/);
  const board = read("components/FlowBoard.tsx");
  assert.match(board, /backgroundColor:active\?STOP_BOARD_BLUE:colors\.surface/);
  assert.doesNotMatch(board, /backgroundColor: active \? colors\.accentSoft/);
  assert.match(read("components/DepartureLine.tsx"), /tone="plain"/);
  assert.match(read("components/DepartureLine.tsx"), /departurePresentation\(item, nowMs\)/);
});
