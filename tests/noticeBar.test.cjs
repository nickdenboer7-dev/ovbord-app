const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const prior = Module._extensions['.ts'];
Module._extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, file);
const {parseDisruptions, disruptionSummary} = require('../lib/haltebordV4.ts');
if (prior) Module._extensions['.ts'] = prior; else delete Module._extensions['.ts'];

test('halt-specific notices precede detours and delays, with a readable collapsed summary', () => {
  const notices = parseDisruptions([
    {title:'Vertraging door verkeersdrukte op lijn 7 en 17',badge:'Vertraging'},
    {title:'Bus N83 rijdt om vanaf halte Bilderdijkstraat. -- Diverted route',badge:'Omleiding'},
    {title:'Tram 1 stopt hier niet. -- Stop not served',badge:'Halte vervalt',stop_ids:['here']}
  ]);
  assert.equal(notices[0].title,'Tram 1 stopt hier niet.');
  assert.equal(notices[1].title,'Bus N83 rijdt om vanaf halte Bilderdijkstraat.');
  assert.equal(notices[2].title,'Vertraging door verkeersdrukte op lijn 7 en 17');
  assert.deepEqual(notices[0].stopIds,['here']);
  assert.deepEqual(disruptionSummary('1',notices),{title:'Tram 1 stopt hier niet · 2 andere meldingen',detail:''});
});
test('trip cancellation is left to the trip itself, route closures remain in the notices', () => {
  const notices=parseDisruptions([
    {title:'Rit vervallen op lijn 7',effect:'CANCELLED'},
    {title:'Meerdere ritten vervallen op lijn 1'},
    {title:'Rit is vervallen'},
    {title:'Geen dienst op lijn 17',effect:'NO_SERVICE'}
  ]);
  assert.deepEqual(notices.map(n=>n.title),['Geen dienst op lijn 17']);
});
test('Dutch title and description stop exactly at the delimiter and do not repeat', () => {
  const [notice] = parseDisruptions([{title:'Tram 7 rijdt niet -- werkt later', description:'Tram 7 rijdt niet -- More'}]);
  assert.deepEqual(notice,{title:'Tram 7 rijdt niet',description:'',severity:'info'});
  assert.deepEqual(disruptionSummary('',[notice]),{title:'Tram 7 rijdt niet',detail:''});
  assert.deepEqual(disruptionSummary('',[]),{title:'',detail:''});
});
