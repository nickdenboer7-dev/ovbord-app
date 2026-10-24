const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename
);
const { feedFreshness, parseDisruptions, refreshPlatformChanges, platformChangeFor } = require("../lib/haltebordV4.ts");
const { normalizeDeparture, getHalte } = require("../lib/api.ts");
if (previous) Module._extensions[".ts"] = previous; else delete Module._extensions[".ts"];

const now = Date.parse("2026-10-14T18:00:00Z");
const b = { generatedAt:"2026-10-14T19:59:54+02:00", feedAgeSeconds:8, stale:false };
function dep(id, platform, extras = {}) {
  return normalizeDeparture({
    gtfs_trip_id: id, line:"20", destination:"Heerenveen", carrier:"Qbuzz",
    planned_time:"20:03", effective_time:"2026-10-14T20:03:00+02:00",
    platform, ...extras
  });
}
test("age is real source age and advances while UI sits open", () => {
  const first = feedFreshness(b, now - 5000, now);
  assert.equal(first.level, "fresh");
  assert.equal(first.ageSeconds, 13);
  assert.equal(feedFreshness(b, now - 5000, now + 150000).level, "aging");
  assert.equal(feedFreshness(b, now - 5000, now + 400000).level, "stale");
});
test("a recent network fetch never disguises an old feed or stale flag", () => {
  assert.equal(feedFreshness({...b, feedAgeSeconds:900}, now, now).level,"stale");
  assert.equal(feedFreshness({...b, stale:true}, now, now).level,"stale");
  assert.equal(feedFreshness({generatedAt:"2026-10-14T19:49:00+02:00"}, now, now).level,"stale");
  assert.equal(feedFreshness({}, now, now).level,"unknown");
  assert.equal(feedFreshness({feedAgeSeconds:-1}, now, now).level,"unknown");
  assert.equal(feedFreshness(b, null, now).level,"unknown");
});
test("platform changes show observed before and after but never invent a first-load change", () => {
  const original = dep("trip-1", "I");
  const changed = dep("trip-1", "B");
  const fresh = refreshPlatformChanges(null, [changed], {}, now);
  assert.deepEqual(fresh,{});
  const result = refreshPlatformChanges([original], [changed], {}, now);
  assert.deepEqual(platformChangeFor(changed, result, now), {
    previous:"I", current:"B", changedAt:now
  });
  assert.equal(platformChangeFor(changed, result, now+600000),null);
});
test("unchanged or missing platform cannot trigger a false alert", () => {
  assert.deepEqual(refreshPlatformChanges([dep("x","I")],[dep("x","I")],{},now),{});
  assert.deepEqual(refreshPlatformChanges([dep("x")],[dep("x","B")],{},now),{});
  assert.deepEqual(refreshPlatformChanges([dep("x","I")],[dep("y","B")],{},now),{});
});
test("explicit platform change with no previous platform labels only current one", () => {
  const changed = dep("x","B",{platform_changed:true});
  const first = refreshPlatformChanges(null,[changed],{},now);
  assert.deepEqual(platformChangeFor(changed,first,now),{previous:undefined,current:"B",changedAt:now});
  const withOld = dep("x","B",{platform_changed:true,previous_platform:"I"});
  const seen=refreshPlatformChanges(null,[withOld],{},now);
  assert.equal(platformChangeFor(withOld,seen,now).previous,"I");
  const after=refreshPlatformChanges([withOld],[withOld],seen,now+5000);
  assert.equal(platformChangeFor(withOld,after,now+5000).changedAt,now);
});
test("disruptions show only supplied notices, deduped, without inventing a strike", () => {
  assert.deepEqual(parseDisruptions(undefined),[]);
  assert.deepEqual(parseDisruptions([]),[]);
  const alerts=parseDisruptions([
    {title:"Vakbondsstaking", message:"Minder bussen", severity:"warning"},
    {title:"Vakbondsstaking", message:"Minder bussen", severity:"warning"},
    {title:"Spoorwerkzaamheden",description:"Amersfoort-Zwolle",severity:"info"}
  ]);
  assert.equal(alerts.length,2);
  assert.equal(alerts[0].severity,"warning");
  assert.equal(alerts[1].description,"Amersfoort-Zwolle");
});
test("live API response parser preserves absence vs empty disruption feed", async () => {
  const oldFetch=globalThis.fetch;
  const fixture = {
    name:"Leeuwarden", generated_at:"2026-10-14T19:59:54+02:00",
    feed_age_seconds:63, stale:false,
    departures:[{gtfs_trip_id:"x",line:"3",destination:"Busstation",planned_time:"20:00",platform:"U"}]
  };
  globalThis.fetch = async ()=> ({ok:true,json:async()=>fixture});
  try {
    const result=await getHalte("2993405");
    assert.equal(result.feedAgeSeconds,63);
    assert.equal(result.generatedAt, fixture.generated_at);
    assert.equal(result.disruptionsAvailable,false);
    assert.deepEqual(result.disruptions,[]);
    fixture.disruptions=[{title:"Omleiding lijn 3", severity:"warning",source:"GTFS-RT",stop_ids:["2993405"]}];
    const result2=await getHalte("2993405");
    assert.equal(result2.disruptionsAvailable,true);
    assert.equal(result2.disruptions[0].title,"Omleiding lijn 3");
  } finally {globalThis.fetch=oldFetch;}
});
