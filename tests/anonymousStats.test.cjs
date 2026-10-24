const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const old = Module._extensions['.ts'];
Module._extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const { createAnonymousSessionPing, randomAnonymousId, ANONYMOUS_ID_KEY } = require('../lib/anonymousStats.ts');
if(old)Module._extensions['.ts']=old;else delete Module._extensions['.ts'];
const storage=()=>{const map=new Map();return{map,getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{map.set(k,v)}}};
test('persist one random ID before sending; reuse it on later cold starts with only ID and version',async()=>{
 const s=storage(),sent=[];const send=async(url,init)=>{const body=JSON.parse(init.body);assert.equal(s.map.get(ANONYMOUS_ID_KEY),body.id);assert.deepEqual(Object.keys(body).sort(),['id','v']);assert.equal(init.credentials,'omit');sent.push(body);return{ok:true}};
 await createAnonymousSessionPing(s,'1.0.4',send,()=> '2026-10-24')();
 await createAnonymousSessionPing(s,'1.0.4',send,()=> '2026-10-24')();
 assert.equal(sent[0].id,sent[1].id);assert.equal(sent[0].v,'1.0.4');
 assert.match(sent[0].id,/^[0-9a-f-]{36}$/);
});
test('concurrent initialisation sends once; a new day sends again with the same ID',async()=>{
 const s=storage(),sent=[];let day='2026-10-24';const ping=createAnonymousSessionPing(s,'1.0.4',async(_,init)=>{sent.push(JSON.parse(init.body));return{ok:true}},()=>day);
 await Promise.all([ping(),ping(),ping()]);await ping();assert.equal(sent.length,1);
 day='2026-10-25';await ping();assert.equal(sent.length,2);assert.equal(sent[0].id,sent[1].id);
});
test('network failure retries using the saved ID without marking the day sent',async()=>{
 const s=storage();let attempts=0;const ids=[];const ping=createAnonymousSessionPing(s,'1.0.4',async(_,init)=>{ids.push(JSON.parse(init.body).id);if(++attempts===1)throw Error('offline');return{ok:true}},()=> 'day');
 await assert.rejects(ping(),/offline/);await ping();assert.equal(attempts,2);assert.equal(ids[0],ids[1]);
});
test('storage failure sends no unstable identifier',async()=>{
 let called=false;const ping=createAnonymousSessionPing({getItem:async()=>null,setItem:async()=>{throw Error('disk')}},'1.0.4',async()=>{called=true;return{ok:true}});
 await assert.rejects(ping(),/disk/);assert.equal(called,false);
});
test('random IDs are UUID-shaped without reading device properties',()=>{
 assert.equal(randomAnonymousId(()=>0),'00000000-0000-4000-8000-000000000000');
 assert.notEqual(randomAnonymousId(),randomAnonymousId());
});
