const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, file
);
const { parseDisruptions, disruptionSummary, dutchNoticeText } = require("../lib/haltebordV4.ts");
const al = require("../lib/alighting.ts");
const { visibleTimelineWindow } = require("../lib/ritRedesign.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const now = Date.parse("2026-10-16T01:58:00+02:00");
const at = (clock) => new Date(Date.parse("2026-10-16T" + clock + ":00+02:00")).toISOString();
const dep = (clock, extra={}) => ({ id: "d" + clock + (extra.id || ""), line: "N85", destination: "Centraal Station",
  plannedTime: clock, relativeText: "", reliability: "planned", effectiveAt: at(clock), ...extra });

// Echte GVB-meldingen (lijn N85, 16-10): Nederlands en Engels in één tekst, titel = omschrijving
const gvb = [
  "Bus N85 rijdt om vanaf halte Van Woustraat. Details: gvb.nl -- Bus N85 runs a diverted route from Van Woustraat. Details: gvb.nl",
  "Bus N85 rijdt om vanaf halte Dennenrode. Details: gvb.nl -- Bus N85 runs a diverted route from Dennenrode. Details: gvb.nl",
  "Bus N85 stopt hier niet. Details: gvb.nl -- Stop not served by bus N85. Details: gvb.nl"
];
const badges = ["Omleiding", "Omleiding", "Halte vervalt"];

test("bilingual notices keep only the Dutch text, once, with the link as one short line", () => {
  const notices = parseDisruptions(gvb.map((text, i) => ({ title: text, description: text, badge: badges[i], severity: "low" })));
  assert.deepEqual(notices[0], { title: "Bus N85 rijdt om vanaf halte Van Woustraat.", description: "Meer informatie: gvb.nl", severity: "info", badge: "Omleiding" });
  assert.equal(notices[2].title, "Bus N85 stopt hier niet.");
  assert.equal(notices.length, 3);
  for (const notice of notices) assert.doesNotMatch(notice.title + notice.description, /runs|served|--/);
});

test("Dutch text with ' -- ' is only split when the second half is English", () => {
  assert.equal(dutchNoticeText("Werk aan de weg -- de bus rijdt om via de Dam"), "Werk aan de weg -- de bus rijdt om via de Dam");
  assert.equal(dutchNoticeText("Tram 2 rijdt niet -- Tram 2 does not run"), "Tram 2 rijdt niet");
  assert.equal(dutchNoticeText("Geen scheiding"), "Geen scheiding");
  const [plain] = parseDisruptions([{ title: "Werkzaamheden", message: "Werkzaamheden", severity: "warning" }]);
  assert.deepEqual(plain, { title: "Werkzaamheden", description: "", severity: "warning" });
});

test("one compact line for all notices", () => {
  const notices = parseDisruptions(gvb.map((text, i) => ({ title: text, badge: badges[i] })));
  assert.deepEqual(disruptionSummary("N85", notices), { title: "Lijn N85 · 3 meldingen", detail: "2× Omleiding · Halte vervalt" });
  const single = parseDisruptions([{ title: "Omleiding lijn 3", severity: "warning" }]);
  assert.deepEqual(disruptionSummary("?", single), { title: "1 melding", detail: "Omleiding lijn 3" });
});

// Overstappen: alleen zinvolle aansluitingen
test("transfers leave out the own line (both directions), long waits and repeats of one line", () => {
  const input = { arrivalClock: "01:58", tripId: "GVB_1913", line: "N85", destination: "Gein" };
  // Video 16-10: at Wibautstraat only N85 back to Centraal at 02:03, 03:06 and 04:04 were offered.
  assert.deepEqual(al.transferOptions([dep("02:03"), dep("03:06"), dep("04:04")], input, now), []);
  const rows = [
    dep("02:01", { line: "N87", destination: "Station Bijlmer ArenA" }),
    dep("02:05", { line: "N87", destination: "Station Bijlmer ArenA" }),
    dep("02:07", { line: "N89", destination: "IJburg" }),
    dep("02:20", { line: "N91", destination: "Nieuwendam" }),
    dep("02:35", { line: "N93", destination: "Molenwijk" })
  ];
  assert.deepEqual(al.transferOptions(rows, input, now).map(o => [o.item.line, o.marginMinutes]), [["N87", 3], ["N89", 9], ["N91", 22]]);
  assert.deepEqual(al.transferOptions(rows, input, now, 5).map(o => o.item.line), ["N87", "N89", "N91"]);
  assert.deepEqual(al.transferOptions(rows, input, now, 5, 60).map(o => o.item.line), ["N87", "N89", "N91", "N93"]);
  assert.equal(al.MAX_TRANSFER_WAIT_MINUTES, 30);
});

test("collapsed transfer line", () => {
  const options = al.transferOptions([dep("02:01", { line: "N87", destination: "Bijlmer" }), dep("02:07", { line: "N89", destination: "IJburg" })],
    { arrivalClock: "02:00", tripId: "x", line: "N85", destination: "Gein" }, now);
  assert.equal(al.transferSummary(options, "02:01"), "2 aansluitingen · eerste N87 om 02:01 (te krap)");
  assert.equal(al.transferSummary([], "02:01"), "");
});

// Ritverloop: de resterende haltes tot de uitstaphalte blijven in beeld
test("the timeline window reaches the alighting stop", () => {
  assert.deepEqual(visibleTimelineWindow(35, 3, null, false), { start: 1, end: 10, hiddenFollowing: 25 });
  assert.deepEqual(visibleTimelineWindow(35, 3, null, false, 20), { start: 1, end: 22, hiddenFollowing: 13 });
  assert.deepEqual(visibleTimelineWindow(35, 3, null, false, 34), { start: 1, end: 35, hiddenFollowing: 0 });
  assert.deepEqual(visibleTimelineWindow(35, 3, null, false, 5), { start: 1, end: 10, hiddenFollowing: 25 });
  assert.deepEqual(visibleTimelineWindow(35, 3, null, true, 20), { start: 0, end: 35, hiddenFollowing: 0 });
});

test("trip page: notices and transfers are collapsible, transfers open when the stop is near", () => {
  const rit = read("app/rit/[id].tsx");
  assert.match(rit, /disruptionSummary\(line, disruptions\)/);
  assert.match(rit, /transfersOpen \?\? \(alightState\.status === "next" \|\| alightState\.status === "at"\)/);
  assert.match(rit, /showAll, alightIndex\)/);
  assert.doesNotMatch(rit, /disruptions\.slice\(0, 3\)\.map/);
  assert.match(read("components/RitTransfers.tsx"), /accessibilityState=\{\{ expanded \}\}/);
});
