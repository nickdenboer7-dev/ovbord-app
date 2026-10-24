const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { themes } = loadTs('../constants/colors.ts');
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
    assert.match(text, /17:14395Amsterdam SloterdijkVertrokken\+3 min/);
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

test('primary row is clock then line then one-line destination, with status below it', () => {
  const html=render({...row,destination:'Een zeer lange bestemming met meerdere woorden'});
  const text=html.replace(/<[^>]*>/g,'');
  assert.match(text,/17:14395Een zeer lange bestemming met meerdere woordenLive/);
  assert.match(html,/flex-start/);
  assert.match(html,/lineHeight.*32/);
});
