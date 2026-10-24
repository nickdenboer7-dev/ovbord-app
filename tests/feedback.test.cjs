const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), Module = require('node:module'), ts = require('typescript');
const old = Module._extensions['.ts'];
Module._extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, f);
const { createFeedbackQueue, createFeedbackPrompt, FEEDBACK_QUEUE_KEY } = require('../lib/feedbackQueue.ts');
const { departureLineStatus } = require('../lib/departureLine.ts');
if (old) Module._extensions['.ts'] = old; else delete Module._extensions['.ts'];
const memory = () => { const map = new Map(); return { map, getItem: async k => map.get(k) ?? null, setItem: async (k,v) => { map.set(k,v); } }; };
const payload = id => ({ source: 'ovbord', client_id: id, category: 'anders', message: 'Dit is een testbericht.', contact: '', app_version: '1.0.4', device_model: 'Pixel 6' });
test('offline message survives a new queue instance and is sent once when online', async () => {
  const storage=memory(); let online=false; const delivered=[];
  const send=async p=> { assert.ok(JSON.parse(storage.map.get(FEEDBACK_QUEUE_KEY)).some(x=>x.client_id===p.client_id)); if (!online) throw Error('offline'); delivered.push(p); };
  assert.deepEqual(await createFeedbackQueue(storage,send).submit(payload('one')), {sent:false});
  online=true; const restarted=createFeedbackQueue(storage,send); await restarted.flush(); await restarted.flush();
  assert.deepEqual(delivered,[payload('one')]); assert.deepEqual(JSON.parse(storage.map.get(FEEDBACK_QUEUE_KEY)),[]);
});
test('overlapping retry and submissions never lose queued messages', async () => {
  const storage=memory();let online=false;const sent=[];
  const q=createFeedbackQueue(storage,async p=>{if(!online)throw Error('offline');sent.push(p.client_id);});
  await Promise.all([q.submit(payload('a')),q.flush(),q.submit(payload('b'))]);
  assert.deepEqual(JSON.parse(storage.map.get(FEEDBACK_QUEUE_KEY)).map(p=>p.client_id),['a','b']);
  online=true;await q.flush();assert.deepEqual(sent,['a','b']);
});
test('prompt counts each cold launch once and is permanently consumed on the third', async () => {
  const storage=memory(); const launch1=createFeedbackPrompt(storage);
  assert.equal(await launch1(),false);assert.equal(await launch1(),false);
  assert.equal(await createFeedbackPrompt(storage)(),false);
  assert.equal(await createFeedbackPrompt(storage)(),true);
  for(let i=0;i<5;i++)assert.equal(await createFeedbackPrompt(storage)(),false);
});
test('storage failure never claims feedback was saved or sent', async () => {
  const storage=memory();storage.setItem=async()=>{throw Error('disk');};
  await assert.rejects(createFeedbackQueue(storage,async()=>{assert.fail('not persisted');}).submit(payload('a')),/disk/);
});
test('board countdown respects the 60 and 180 minute boundaries',()=>{
  const now=Date.parse('2026-10-24T08:00:00Z');
  const item={line:'1',destination:'Station',plannedTime:'12:00',effectiveAt:'2026-10-24T10:00:00Z',isLive:false};
  const expected = new Map([[60,'over 60 min'],[61,'over 1 u 1 min'],[85,'over 1 u 25 min'],[120,'over 2 u'],[180,'over 3 u'],[181,'']]);
  for (const [minutes,countdown] of expected) {
    const row={...item,effectiveAt:new Date(now+minutes*60000).toISOString()};
    assert.equal(departureLineStatus(row,now).text,'Gepland'+(countdown?' · '+countdown:''));
    assert.equal(departureLineStatus({...row,isLive:true},now).text,'Live'+(countdown?' · '+countdown:''));
  }
  assert.equal(departureLineStatus({...item,cancelled:true},now).text,'Rijdt niet');
});
