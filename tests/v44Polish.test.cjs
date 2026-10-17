const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const previous = Module._extensions[".ts"];
Module._extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText, file
);
const {parseStoredList,isStoredStop,isStoredString,isStoredJourney} = require("../lib/storedJson.ts");
const {pruneRitReturnCache,RIT_OFFLINE_CACHE_MAX_AGE_MS,RIT_RETURN_CACHE_MAX_ENTRIES} = require("../lib/ritReturnCache.ts");
const {vehicleIcon,vehicleNoun} = require("../lib/ritVehicle.ts");
const {ritColors,ritColorsFor} = require("../lib/ritTheme.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const stop={id:"stoparea:1",name:"Amsterdam, Centraal",city:"Amsterdam",mode:"bus",lines:[]};

// Punt 4: veilige opslag
test("valid stored lists load unchanged",()=>{
  assert.deepEqual(parseStoredList(JSON.stringify([stop]),isStoredStop),[stop]);
  assert.deepEqual(parseStoredList(JSON.stringify(["N85","12"]),isStoredString),["N85","12"]);
});
test("corrupt JSON or wrong shape is ignored instead of throwing",()=>{
  assert.doesNotThrow(()=>parseStoredList("{not json",isStoredStop));
  assert.equal(parseStoredList("{not json",isStoredStop),undefined);
  assert.equal(parseStoredList(JSON.stringify({id:"x"}),isStoredStop),undefined);
  assert.equal(parseStoredList("null",isStoredStop),undefined);
  assert.equal(parseStoredList(null,isStoredStop),undefined);
  assert.equal(parseStoredList("",isStoredStop),undefined);
});
test("invalid items are dropped, valid items keep their order",()=>{
  const raw=JSON.stringify([stop,null,{id:""},{name:"geen id"},{...stop,id:"stoparea:2"}]);
  assert.deepEqual(parseStoredList(raw,isStoredStop).map(s=>s.id),["stoparea:1","stoparea:2"]);
  assert.deepEqual(parseStoredList(JSON.stringify(["N85",3,"",null,"12"]),isStoredString),["N85","12"]);
});
test("saved journeys need key, line and a valid stop",()=>{
  const ok={key:"n85::centraal::stoparea:1",line:"N85",direction:"Centraal",stop};
  assert.equal(isStoredJourney(ok),true);
  assert.equal(isStoredJourney({...ok,key:""}),false);
  assert.equal(isStoredJourney({...ok,stop:{name:"x"}}),false);
  assert.equal(isStoredJourney({...ok,line:12}),false);
});

// Punt 6: ritcache opruimen
const now=Date.parse("2026-10-15T02:40:00+02:00");
const entry=(age)=>({data:{},fetchedAt:now-age});
// V4.7: entries now live for the offline window (30 min) instead of 14 s.
test("expired, future and invalid cache entries are pruned; fresh ones stay",()=>{
  const cache=new Map([["fresh",entry(1000)],["edge",entry(RIT_OFFLINE_CACHE_MAX_AGE_MS-1)],
    ["expired",entry(RIT_OFFLINE_CACHE_MAX_AGE_MS)],["old",entry(3*RIT_OFFLINE_CACHE_MAX_AGE_MS)],["future",entry(-5)],["nan",{data:{},fetchedAt:NaN}]]);
  pruneRitReturnCache(cache,now);
  assert.deepEqual([...cache.keys()],["fresh","edge"]);
});
test("cache is capped and keeps the most recently stored trips",()=>{
  const cache=new Map();
  for(let i=0;i<RIT_RETURN_CACHE_MAX_ENTRIES+5;i++) cache.set("rit"+i,entry(100));
  pruneRitReturnCache(cache,now);
  assert.equal(cache.size,RIT_RETURN_CACHE_MAX_ENTRIES);
  assert.equal(cache.has("rit0"),false);
  assert.equal(cache.has("rit"+(RIT_RETURN_CACHE_MAX_ENTRIES+4)),true);
  assert.equal(RIT_RETURN_CACHE_MAX_ENTRIES,25);
});

// Punt 2: voertuig per modaliteit
test("vehicle icon and noun follow the journey mode",()=>{
  assert.deepEqual(["bus","tram","metro","train","ferry"].map(vehicleIcon),["bus","train","subway","train","boat"]);
  assert.deepEqual(["bus","tram","metro","train","ferry"].map(vehicleNoun),["Bus","Tram","Metro","Trein","Veerboot"]);
  assert.equal(vehicleIcon(undefined),"bus");
  assert.equal(vehicleNoun("onbekend"),"Bus");
});

// Punt 5: donkere modus ritverloop
test("light trip palette keeps the pre-dark-mode colours",()=>{
  const l=ritColors.light;
  assert.equal(l.page,"#FFFFFF"); assert.equal(l.text,"#13233D"); assert.equal(l.muted,"#69778A");
  assert.equal(l.navy,"#14518B"); assert.equal(l.blue,"#1478E3"); assert.equal(l.green,"#16894B");
  assert.equal(l.border,"#E6EAF0"); assert.equal(l.red,"#C93030"); assert.equal(l.statusBar,"dark");
  assert.equal(l.delayText,undefined);
});
test("dark palette defines every key and differs where it matters",()=>{
  assert.deepEqual(Object.keys(ritColors.dark).sort(),Object.keys(ritColors.light).sort());
  for(const [k,v] of Object.entries(ritColors.dark)) assert.ok(typeof v==="string"&&v.length>0,k);
  assert.equal(ritColors.dark.statusBar,"light");
  for(const k of ["page","surface","text","muted","border","summaryBg","boardingRowBg","railFill"])
    assert.notEqual(ritColors.dark[k],ritColors.light[k],k);
  assert.equal(ritColorsFor("dark"),ritColors.dark);
  assert.equal(ritColorsFor("light"),ritColors.light);
  assert.equal(ritColorsFor(undefined),ritColors.light);
});
