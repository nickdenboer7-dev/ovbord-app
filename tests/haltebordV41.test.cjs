const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const Module=require("node:module");
const ts=require("typescript");
const previous=Module._extensions[".ts"];
Module._extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
  }}).outputText,file
);
const { boardLineFilterKey,boardLineFilterChoices,matchesBoardLineFilter } = require("../lib/boardLineFilters.ts");
const { feedFreshness } = require("../lib/haltebordV4.ts");
if(previous)Module._extensions[".ts"]=previous;else delete Module._extensions[".ts"];

function row(line, carrier="NS"){return {line,carrier};}
test("IC and Intercity map to exactly one chip without mixing ICE",()=>{
  const rows=[row("IC"),row("Intercity"),row("ICE"),row("Sprinter"),row("SPR"),row("355","Qbuzz")];
  const labels=boardLineFilterChoices(rows);
  assert.equal(labels.filter(label=>label==="IC").length,1);
  assert.equal(labels.includes("Intercity"),false);
  assert.equal(labels.filter(label=>label==="SPR").length,1);
  assert.equal(labels.includes("ICE"),true);
  assert.equal(labels.includes("355"),true);
  assert.equal(matchesBoardLineFilter(rows[0],"IC"),true);
  assert.equal(matchesBoardLineFilter(rows[1],"IC"),true);
  assert.equal(matchesBoardLineFilter(rows[2],"IC"),false);
  assert.equal(matchesBoardLineFilter(rows[2],"ICE"),true);
});
test("regional train codes remain separate where relevant",()=>{
  assert.equal(boardLineFilterKey("Sneltrein RE1","Arriva"),"RE1");
  assert.equal(boardLineFilterKey("Stoptrein RS1","Arriva"),"RS1");
  assert.equal(boardLineFilterKey("Sneltrein","Arriva"),"RE");
  assert.equal(boardLineFilterKey("Stoptrein","Arriva"),"RS");
  assert.equal(boardLineFilterKey("Intercity","NS"),"IC");
  assert.deepEqual(boardLineFilterChoices([row("RS1","Arriva"),row("RE1","Arriva")]),["RE1","RS1"]);
});
test("all lines reset works, and real trip data is not rewritten",()=>{
  const original=row("Intercity");
  assert.equal(matchesBoardLineFilter(original,null),true);
  assert.equal(matchesBoardLineFilter(row("ICE"),null),true);
  assert.equal(original.line,"Intercity");
});
test("fresh source age has a short inline label while warning text remains",()=>{
  const at=Date.parse("2026-10-14T20:45:00Z");
  const base={generatedAt:"2026-10-14T22:44:41+02:00",feedAgeSeconds:19,stale:false};
  const current=feedFreshness(base,at,at);
  assert.equal(current.level,"fresh");
  assert.equal(current.ageLabel,"19 sec oud");
  assert.match(current.label,/Vertrekgegevens/);
  const stale=feedFreshness({...base,stale:true},at,at);
  assert.equal(stale.level,"stale");
  assert.match(stale.label,/Verouderde/);
});
