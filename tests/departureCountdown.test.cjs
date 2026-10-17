const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../lib/format.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(compiled.outputText, filename);
const { departureCountdown, minutesUntil, relativeMinutesText } = loaded.exports;

const midday = Date.parse("2026-10-14T10:00:00Z"); // 12:00 Europe/Amsterdam
const row = (plannedTime, effectiveAt) => ({ plannedTime, effectiveAt });

test("countdown is visible only for departures within one hour", () => {
  assert.equal(departureCountdown(row("12:59"), midday), "over 59 min");
  assert.equal(departureCountdown(row("13:00"), midday), "over 60 min");
  assert.equal(departureCountdown(row("13:01"), midday), "");
  assert.equal(departureCountdown(row("15:00"), midday), "");
  assert.equal(departureCountdown(row("12:00"), midday), "nu");
});
test("recent departures never jump 24 hours forward", () => {
  assert.equal(departureCountdown(row("11:57"), midday), "");
  assert.equal(departureCountdown(row("11:59"), midday), "nu");
  assert.equal(departureCountdown(row("11:00"), midday), "");
  assert.equal(departureCountdown(row("00:02"), Date.parse("2026-10-14T21:58:00Z")), "over 4 min");
});
test("dated realtime departures use timestamps and same 60-minute limit", () => {
  assert.equal(departureCountdown(row("12:00", "2026-10-14T10:59:00Z"), midday), "over 59 min");
  assert.equal(departureCountdown(row("12:00", "2026-10-14T11:00:00Z"), midday), "over 60 min");
  assert.equal(departureCountdown(row("12:00", "2026-10-14T11:01:00Z"), midday), "");
  assert.equal(departureCountdown(row("12:00", "2026-10-14T09:57:00Z"), midday), "");
});
test("absolute dates and relative previews do not resurrect departed services", () => {
  const past = new Date(Date.now() - 3 * 60000).toISOString();
  const future = new Date(Date.now() + 180 * 60000).toISOString();
  assert.equal(relativeMinutesText(past), "");
  assert.equal(relativeMinutesText(future), "");
  assert.ok(minutesUntil(past) < 0);
});
