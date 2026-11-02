const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const file=path.resolve(__dirname,"../lib/ritLivePresentation.ts"),m=new Module(file,module);
m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),
{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {overdueNextStop}=m.exports;
const time=(hhmm)=>Date.parse("2026-11-02T"+hhmm+":30+01:00");
test("next GPS stop with 20:07 ETA at 20:08 is overdue, never shown as current",()=>{
 assert.equal(overdueNextStop("20:07",time("20:08"),true),true);
 assert.equal(overdueNextStop("20:08",time("20:08"),true),false);
 assert.equal(overdueNextStop("20:09",time("20:08"),true),false);
 assert.equal(overdueNextStop("20:07",time("20:08"),false),false);
});
test("near-midnight stop ETA is compared locally and never confused with tomorrow",()=>{
 assert.equal(overdueNextStop("23:59",Date.parse("2026-11-03T00:02:00+01:00"),true),true);
 assert.equal(overdueNextStop("00:02",Date.parse("2026-11-02T23:59:00+01:00"),true),false);
 assert.equal(overdueNextStop("bad",time("20:08"),true),false);
});
const view=fs.readFileSync(path.resolve(__dirname,"../app/rit/[id].tsx"),"utf8");
test("without verified GPS the timeline shows Geschat, not a vehicle-at-stop icon",()=>{
 assert.match(view,/atStop && !progress\.estimated \? <View style=\{\[styles\.railVehicle/);
 assert.match(view,/progress\.estimated \? "Geschat" : "Nu hier"/);
 assert.match(view,/Geschatte positie volgens vertrektijden/);
 assert.match(view,/vehicleHere: atStop && !progress\.estimated/);
});
test("when GPS next-stop prediction has already passed, both views display no ETA",()=>{
 assert.match(view,/const overdueNext = isNext && !progress\.estimated && overdueNextStop/);
 assert.match(view,/overdueNext \? "[\u2014-]" : stop\.timingSource/);
 assert.match(view,/overdueNext \? <Text style=\{styles\.delayText\}>geen ETA/);
 assert.match(view,/nextStopOverdue \? "-" : timeOf\(nextStop\)/);
 assert.match(view,/nextStopOverdue \? <Text style=\{\[styles\.nextStopQuickDelta/);
 assert.match(view,/journey\?\.live && !nextStopOverdue/);
});
