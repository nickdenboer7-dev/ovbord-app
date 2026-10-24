const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { themes } = loadTs('../constants/colors.ts');
const { departureClockDelay } = loadTs('../lib/departureLine.ts');
const { normalizeDeparture } = loadTs('../lib/api.ts');
let scheme = 'light';

function loadTs(file) {
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = compile;
  try { return require(file); } finally {
    if (previous) Module._extensions['.ts'] = previous; else delete Module._extensions['.ts'];
  }
}
function compile(mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText, filename);
}

// Render the real component without starting a browser, emulator or native runtime.
const previousLoad = Module._load;
const previousTs = Module._extensions['.ts'];
const previousTsx = Module._extensions['.tsx'];
const nativeNode = tag => ({ children, style, disabled, accessibilityLabel, accessibilityRole }) =>
  React.createElement(tag, { disabled, 'aria-label': accessibilityLabel, role: accessibilityRole,
    'data-rn-style': JSON.stringify(typeof style === 'function' ? style({ pressed: false }) : style) }, children);
Module._extensions['.ts'] = Module._extensions['.tsx'] = compile;
Module._load = function(request, parent, ...args) {
  if (request === 'react-native') return {
    Text: nativeNode('span'), View: nativeNode('div'), Pressable: nativeNode('button'),
    StyleSheet: { create: value => value, hairlineWidth: 0.5 },
    useWindowDimensions: () => ({ width: 375, height: 667, fontScale: 1 })
  };
  if (request === '../context/AppProvider') return { useApp: () => ({ colors: themes[scheme] }) };
  if (request === './LijnBadge') return { LijnBadge: ({ line }) => React.createElement('span', null, line) };
  return previousLoad.call(this, request, parent, ...args);
};
let DepartureLine;
try { ({ DepartureLine } = require('../components/DepartureLine.tsx')); } finally {
  Module._load = previousLoad;
  for (const [ext, previous] of [['.ts', previousTs], ['.tsx', previousTsx]]) {
    if (previous) Module._extensions[ext] = previous; else delete Module._extensions[ext];
  }
}
const now = Date.parse('2026-10-24T17:14:00+02:00');
const row = { id: '395-sloterdijk', ritId: 'bus_395', line: '395', destination: 'Amsterdam Sloterdijk',
  mode: 'bus', plannedTime: '17:11', expectedTime: '17:14', effectiveAt: new Date(now).toISOString(),
  delayMinutes: 3, isLive: true, relativeText: '', reliability: 'high' };
const render = (item, extra = {}) => renderToStaticMarkup(React.createElement(DepartureLine,
  { item, nowMs: now, onPress: () => {}, ...extra }));

test('departed row keeps time, line, destination and delay with one explicit badge, without walking advice or countdown', () => {
  for (scheme of ['light', 'dark']) {
    const html = render({ ...row, departed: true }, { detail: { text: 'Nu vertrekken om de bus te halen' } });
    const text = html.replace(/<[^>]*>/g, '');
    assert.match(text, /395Amsterdam SloterdijkVertrokken17:14\+3/);
    assert.equal((text.match(/Vertrokken/g) || []).length, 1);
    assert.doesNotMatch(text, /Live|Gepland|over |Nu vertrekken/);
    assert.match(html, /disabled=""/);
    assert.match(html, /3 min vertraging, vertrokken/);
    assert.doesNotMatch(html, /ritverloop openen|opacity.*0\.55/);
  }
  scheme = 'light';
});

test('live status without countdown still renders green Live; normal and cancelled rows keep their meaning', () => {
  const future = { ...row, effectiveAt: new Date(now + 181 * 60000).toISOString(), delayMinutes: 0 };
  const html = render(future);
  assert.match(html.replace(/<[^>]*>/g, ''), /Live/);
  assert.match(html, new RegExp(themes.light.success));
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /over /);
  const cancelled = render({ ...row, departed: true, cancelled: true }).replace(/<[^>]*>/g, '');
  assert.match(cancelled, /Rijdt niet/);
  assert.doesNotMatch(cancelled, /Vertrokken|\+3 min/);
  assert.match(render({ ...row, isLive: false }).replace(/<[^>]*>/g, ''), /Gepland/);
});

test('primary row is line then one-line destination/status then expected clock and short delay', () => {
  const html=render({...row,destination:'Een zeer lange bestemming met meerdere woorden'});
  const text=html.replace(/<[^>]*>/g,'');
  assert.match(text,/395Een zeer lange bestemming met meerdere woordenLive.*17:14\+3/);
  assert.match(html,/flex-start/);
  assert.match(html,/lineHeight.*32/);
});

test('short delay is empty at zero, orange through four minutes and red from five, below the clock', () => {
  for (const minutes of [undefined,NaN,0,-1]) assert.equal(departureClockDelay({...row,delayMinutes:minutes}),null);
  for (const [minutes,tone] of [[1,'orange'],[3,'orange'],[4,'orange'],[5,'red'],[12,'red']]) {
    assert.deepEqual(departureClockDelay({...row,delayMinutes:minutes}),{text:'+'+minutes,tone});
    const html=render({...row,delayMinutes:minutes});
    assert.match(html.replace(/<[^>]*>/g,''),new RegExp('17:14\\+'+minutes+'$'));
    assert.match(html,new RegExp(tone==='red'?themes.light.danger:themes.light.delayWarning));
  }
  assert.doesNotMatch(render({...row,delayMinutes:0}).replace(/<[^>]*>/g,''),/Op tijd|\+0/);
});

test('API expected clock and countdown share the same instant and never add the delay twice', () => {
  const item=normalizeDeparture({line:'395',destination:'Amsterdam Sloterdijk',planned_time:'17:11',
    planned_at:'2026-10-24T17:11:00+02:00',effective_time:'2026-10-24T17:14:00+02:00',delay:180,live:true});
  const html=render(item,{nowMs:Date.parse('2026-10-24T17:06:00+02:00')});
  assert.match(html.replace(/<[^>]*>/g,''),/395Amsterdam SloterdijkLive · over 8 min17:14\+3/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g,''),/17:17|17:11/);
});
