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
const {usableRitReturnCache,RIT_RETURN_CACHE_MAX_AGE_MS} = require("../lib/ritReturnCache.ts");
if (previous) Module._extensions[".ts"]=previous;
else delete Module._extensions[".ts"];

const id="GVB_2252";
const now=Date.parse("2026-10-15T02:07:00+02:00");
const cached={data:{id,line:"N85",stops:[],gpsAgeSeconds:20,live:true},fetchedAt:now-5000};

test("return within 14 s uses the same trip ID and expected line",()=>{
  assert.equal(usableRitReturnCache(cached,id,"N85",now),true);
  assert.equal(usableRitReturnCache(cached,id,"",now),true);
  assert.equal(usableRitReturnCache({...cached,fetchedAt:now-13999},id,"N85",now),true);
  assert.equal(RIT_RETURN_CACHE_MAX_AGE_MS,14000);
});
test("wrong-line cache NEVER suppresses the first network request",()=>{
  assert.equal(usableRitReturnCache(cached,id,"N87",now),false);
  assert.equal(usableRitReturnCache({...cached,data:{...cached.data,line:"N87"}},id,"N85",now),false);
});
test("stale and future caches demand a fresh API request",()=>{
  assert.equal(usableRitReturnCache({...cached,fetchedAt:now-14000},id,"N85",now),false);
  assert.equal(usableRitReturnCache({...cached,fetchedAt:now-99999},id,"N85",now),false);
  assert.equal(usableRitReturnCache({...cached,fetchedAt:now+1},id,"N85",now),false);
});
test("different trip ID cannot reuse cache even when line matches",()=>{
  assert.equal(usableRitReturnCache(cached,"GVB_2253","N85",now),false);
  assert.equal(usableRitReturnCache({...cached,data:{...cached.data,id:"GVB_999"}},id,"N85",now),false);
  assert.equal(usableRitReturnCache(undefined,id,"N85",now),false);
});
test("invalid entry times and missing ID cannot skip network",()=>{
  assert.equal(usableRitReturnCache({...cached,fetchedAt:NaN},id,"N85",now),false);
  assert.equal(usableRitReturnCache({...cached,fetchedAt:Infinity},id,"N85",now),false);
  assert.equal(usableRitReturnCache(cached,"","N85",now),false);
});
test("cache eligibility does not mutate stored GPS and journey data",()=>{
  const before={...cached.data};
  assert.equal(usableRitReturnCache(cached,id,"N85",now),true);
  assert.deepEqual(cached.data,before);
});
