const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm'),ts=require('typescript');
const load=Module._load,extension=Module._extensions['.ts'],jsxExtension=Module._extensions['.tsx'];
const compile=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText,file);
Module._extensions['.ts']=compile;Module._extensions['.tsx']=compile;
let activeHarness=null,stored=null,readStorage=async()=>stored,buurtMode=false,buurtLive=null,nearbyNetwork,boardNetwork,searchNetwork,shownStop=null;
const storage={getItem:(key)=>readStorage(key),setItem:async(key,value)=>{stored=value;}};
const listeners=new Set();
const appState={currentState:'active',addEventListener:(_event,callback)=>{listeners.add(callback);return {remove:()=>listeners.delete(callback)};}};
const React={
  createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useRef:value=>activeHarness.slot(()=>({current:value})),
  useState:initial=>{const h=activeHarness,index=h.cursor++,s=h.slots[index]??(h.slots[index]={value:typeof initial==='function'?initial():initial});return [s.value,value=>{s.value=typeof value==='function'?value(s.value):value;}];},
  useMemo:(fn,deps)=>activeHarness.memo(fn,deps),useCallback:(fn,deps)=>activeHarness.memo(()=>fn,deps),
  useEffect:(fn,deps)=>activeHarness.effect(fn,deps)
};React.default=React;
Module._load=function(request,parent,isMain){
  if(request==='react')return React;
  if(request==='expo-router')return {useFocusEffect:callback=>{activeHarness.focus=callback;},useRouter:()=>({navigate(){}})};
  if(request==='react-native')return {AppState:appState,StyleSheet:{create:value=>value,hairlineWidth:1},View:'View',Text:'Text',TextInput:'TextInput',ActivityIndicator:'ActivityIndicator',Keyboard:{dismiss(){}},ScrollView:'ScrollView',FlatList:'FlatList',Pressable:'Pressable',RefreshControl:'RefreshControl',useWindowDimensions:()=>({fontScale:1})};
  if(request==='react-native-webview')return {WebView:'WebView'};
  if(request==='@react-native-async-storage/async-storage')return {default:storage,__esModule:true};
  if(buurtMode){
    if(request==='@expo/vector-icons')return {Ionicons:'Ionicons'};
    if(request==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:24})};
    if(request.endsWith('/context/AppProvider'))return {useApp:()=>({colors:{},manualCity:null,addRecentStop(){},setManualCity(){},toggleFavoriteStop(){},isFavoriteStop:()=>false})};
    if(request.endsWith('/context/FlowNavigation'))return {useFlowNavigation:()=>({showStop(stop,options){shownStop={stop,options};}})};
    if(request.endsWith('/lib/useLiveLocation'))return {useLiveLocation:()=>buurtLive};
    if(request.endsWith('/lib/useSmartRefresh'))return {useSmartRefresh(){}};
    if(request.endsWith('/lib/location'))return {MANUAL_CITIES:[]};
    if(request.endsWith('/lib/api'))return {getNearby:(...args)=>nearbyNetwork(...args),getHalte:(...args)=>boardNetwork(...args),searchStops:(...args)=>searchNetwork(...args)};
    for(const name of ['NearbySkeleton','DepartureLine','SettingsButton','LeafletMap'])if(request.endsWith('/components/'+name))return {[name]:name};
  }
  return load.call(this,request,parent,isMain);
};
class Harness{
  constructor(){this.slots=[];this.cursor=0;this.pending=[];}
  slot(create){const i=this.cursor++;return this.slots[i]??(this.slots[i]=create());}
  memo(fn,deps){const s=this.slot(()=>({}));if(!s.deps||deps.some((v,i)=>v!==s.deps[i])){s.value=fn();s.deps=deps;}return s.value;}
  effect(fn,deps){const s=this.slot(()=>({}));if(!s.deps||deps.some((v,i)=>v!==s.deps[i])){this.pending.push(()=>{s.cleanup?.();s.cleanup=fn();});s.deps=deps;}}
  render(fn){this.cursor=0;activeHarness=this;try{return fn();}finally{activeHarness=null;}}
  flush(){const pending=this.pending.splice(0);for(const effect of pending)effect();}
  destroy(){for(const s of this.slots)s?.cleanup?.();}
}
const {useLocationStartup}=require('../lib/useLocationStartup.ts');
const {useBoardFocusRefresh}=require('../lib/useBoardFocusRefresh.ts');
const {feedFreshness,disruptionSummary}=require('../lib/haltebordV4.ts');
const {withBoardFreshness}=require('../lib/realtimeConsistency.ts');
const {upcomingJourneyNotices}=require('../lib/upcomingJourneyNotices.ts');
const {LeafletMap}=require('../components/LeafletMap.tsx');
const cachePath=require.resolve('../lib/nearbyCache.ts');
function freshCache(value=null){stored=value;readStorage=async()=>stored;delete require.cache[cachePath];return require(cachePath);}
const leeuw={coords:{latitude:53.2012,longitude:5.7999},bron:'gps',fixAt:1000};
const amsterdam={coords:{latitude:52.3676,longitude:4.9041},bron:'gps',fixAt:500};
const stop={id:'L',name:'Leeuwarden, Bordineweg',city:'Leeuwarden',mode:'bus',lines:[],lat:53.2012,lon:5.7999};
const snapshot=(location=leeuw,scope='gps')=>({scope,location,items:[stop],previews:{L:{loading:false,departures:[{id:'25',line:'25',destination:'Busstation'}]}},updatedAt:2000});
const find=(tree,type)=>{
  if(!tree||typeof tree!=='object')return null;
  if(tree.type===type)return tree;
  for(const child of (tree.props?.children||[]).flat(Infinity)){const hit=find(child,type);if(hit)return hit;}
  return null;
};
const findLabel=(tree,label)=>{
  if(!tree||typeof tree!=='object')return null;
  if(tree.props?.accessibilityLabel===label)return tree;
  for(const child of (tree.props?.children||[]).flat(Infinity)){const hit=findLabel(child,label);if(hit)return hit;}
  return null;
};
const textOf=tree=>!tree?'':typeof tree==='string'?tree:(tree.props?.children||[]).flat(Infinity).map(textOf).join(' ');
const renderedStopNames=tree=>{
  const names=[];
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='Pressable'&&typeof node.props?.accessibilityLabel==='string'
      &&node.props.accessibilityLabel.startsWith('Open halte ')){
      names.push(node.props.accessibilityLabel.slice('Open halte '.length).split(', beste halte')[0]);
    }
    for(const child of (node.props?.children||[]).flat(Infinity))visit(child);
  };
  visit(tree);
  return names;
};

test('GPS recovery stays hidden for 9999 ms, appears after ten seconds, and resets on retry',()=>{
  const originalSet=global.setTimeout,originalClear=global.clearTimeout;let now=0,id=0;const timers=new Map();
  global.setTimeout=(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;};global.clearTimeout=id=>timers.delete(id);
  const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  const h=new Harness();let retry=0,enabled=true;const render=()=>h.render(()=>useLocationStartup(retry,enabled));
  try{
    assert.equal(render(),false);h.flush();advance(9999);assert.equal(render(),false);
    advance(1);assert.equal(render(),true);
    retry++;render();h.flush();assert.equal(render(),false);advance(1000);
    enabled=false;render();h.flush();advance(10000);assert.equal(render(),false);
  }finally{h.destroy();global.setTimeout=originalSet;global.clearTimeout=originalClear;}
});
test('board refocus, inline return and app resume refresh immediately; mounting a new stop does not duplicate its fetch',()=>{
  const h=new Harness();let calls=0,stopId='A',enabled=true;
  const render=()=>h.render(()=>useBoardFocusRefresh(async()=>{calls++;},stopId,enabled));
  render();let cleanup=h.focus();assert.equal(calls,0);cleanup();
  render();cleanup=h.focus();assert.equal(calls,1);
  for(const fn of listeners)fn('background');for(const fn of listeners)fn('active');assert.equal(calls,2);
  cleanup();enabled=false;render();assert.equal(h.focus(),undefined);
  enabled=true;render();cleanup=h.focus();assert.equal(calls,3);cleanup();
  stopId='B';render();cleanup=h.focus();assert.equal(calls,3);cleanup();assert.equal(listeners.size,0);
});
test('age labels use completed minutes and preserve the 90-second timing threshold',()=>{
  const generated=Date.parse('2026-10-24T19:05:00+02:00');
  for(const seconds of [60,61,89,90,90.1,91,119,119.999]){
    const f=feedFreshness({generatedAt:new Date(generated).toISOString(),feedAgeSeconds:0},generated,generated+seconds*1000);
    assert.equal(f.ageLabel,'1 min oud');
    assert.equal(f.level,seconds<=90?'fresh':'aging');
    const row=withBoardFreshness({id:'x',isLive:true},f.level==='fresh');
    assert.equal(row.liveDataStale,seconds<=90?undefined:true);
  }
  assert.equal(feedFreshness({generatedAt:new Date(generated).toISOString(),feedAgeSeconds:0},generated,generated+120000).ageLabel,'2 min oud');
  assert.equal(feedFreshness({generatedAt:new Date(generated).toISOString(),feedAgeSeconds:0},generated,generated+59999).ageLabel,'59 sec oud');
});
test('source age and local elapsed time advance once, and fetching old data never makes it fresh',()=>{
  const at=Date.parse('2026-10-24T19:05:00+02:00');
  const current=feedFreshness({generatedAt:new Date(at).toISOString(),feedAgeSeconds:30},at,at+30000);
  assert.equal(current.ageSeconds,60);assert.equal(current.level,'fresh');
  assert.equal(feedFreshness({generatedAt:new Date(at).toISOString(),feedAgeSeconds:180},at,at).level,'aging');
});
test('cached GPS, stops and departure previews are available synchronously, labelled last known',async()=>{
  const cache=freshCache();await cache.hydrateNearbyCache();cache.rememberNearby(snapshot());
  assert.deepEqual(cache.peekLastLocation().coords,leeuw.coords);
  assert.equal(cache.peekLastLocation().bron,'laatst-bekend');
  const cached=cache.peekNearby('gps');assert.equal(cached.items[0].id,'L');
  assert.equal(cached.previews.L.departures[0].line,'25');assert.equal(cached.previews.L.stale,true);
  await new Promise(setImmediate);assert.ok(JSON.parse(stored).snapshots[0].previews.L.departures.length);
});
test('persistent cached results survive restarting the app; another city is never shown for the current fix',async()=>{
  const cache=freshCache(JSON.stringify({lastLocation:leeuw,snapshots:[snapshot()]}));
  await cache.hydrateNearbyCache();assert.equal(cache.peekNearby('gps').items[0].name,stop.name);
  cache.rememberLocation({...amsterdam,fixAt:3000});assert.equal(cache.peekNearby('gps'),null);
  assert.equal(cache.peekNearby('city:leeuwarden'),null);
});
test('a slow disk hydration cannot overwrite a newer GPS fix or cache from another city',async()=>{
  const cache=freshCache();let resolve;readStorage=()=>new Promise(r=>{resolve=r;});
  const pending=cache.hydrateNearbyCache();cache.rememberLocation({...leeuw,fixAt:5000});
  resolve(JSON.stringify({lastLocation:amsterdam,snapshots:[snapshot(amsterdam)]}));await pending;
  assert.deepEqual(cache.peekLastLocation().coords,leeuw.coords);assert.equal(cache.peekNearby('gps'),null);
});
test('Start warming the nearby cache retains the previously loaded departure previews',async()=>{
  const cache=freshCache();await cache.hydrateNearbyCache();cache.rememberNearby(snapshot());
  cache.rememberNearby({...snapshot(),previews:{},updatedAt:3000});
  assert.equal(cache.peekNearby('gps').previews.L.departures[0].line,'25');
  readStorage=async()=>{throw Error('storage unavailable');};cache.rememberLocation({...leeuw,fixAt:4000});
  assert.equal(cache.peekLastLocation().fixAt,4000);
});
test('initial map view uses the actual cached location before receiving any WebView message',()=>{
  const h=new Harness();const tree=h.render(()=>LeafletMap({center:{lat:53.2012,lon:5.7999},markers:[]}));
  const html=tree.props.children[0].props.source.html;
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  let firstView;
  const map={setView:(coords,zoom)=>{firstView={coords,zoom};return map;}};
  const layer={addTo(){return this;}};
  vm.runInNewContext(script,{L:{map:()=>map,tileLayer:()=>layer,polyline:()=>layer,layerGroup:()=>layer},document:{addEventListener(){}},window:{addEventListener(){}}});
  assert.deepEqual(JSON.parse(JSON.stringify(firstView)),{coords:[53.2012,5.7999],zoom:14});
});
test('trip alerts exclude passed stops, trim mixed notices and keep a stop until departure is confirmed',()=>{
  const now=Date.parse('2026-10-24T19:06:00+02:00');
  const stops=[{id:'A',name:'A',state:'passed'},{id:'B',name:'B',state:'current'},{id:'C',name:'C',state:'upcoming'}];
  const notices=[{title:'Oude halte',stopIds:['A']},{title:'Huidige halte',stopIds:['B']},
    {title:'Toekomstige halte',stopIds:['A','C']},{title:'Geen gekoppelde halte'},
    {title:'Verlopen',stopIds:['C'],activePeriods:[[null,now/1000]]}];
  let shown=upcomingJourneyNotices(notices,stops,{kind:'at',index:1,updated:new Date(now)},now);
  assert.deepEqual(shown.map(n=>n.title),['Huidige halte','Toekomstige halte']);
  assert.deepEqual(shown[1].stopIds,['C']);assert.equal(notices[2].stopIds.length,2);
  assert.equal(disruptionSummary('',shown).title,'Huidige halte · 1 andere melding');
  shown=upcomingJourneyNotices(notices,stops,{kind:'between',index:1,updated:new Date(now)},now);
  assert.deepEqual(shown.map(n=>n.title),['Toekomstige halte']);
  assert.deepEqual(upcomingJourneyNotices(notices,stops,null,now).map(n=>n.title),['Huidige halte','Toekomstige halte']);
  assert.deepEqual(upcomingJourneyNotices(notices,stops,null,now,true),[]);
});
test('loop trips retain a notice if the same stop will be visited again',()=>{
  const stops=[{id:'A',state:'passed'},{id:'B',state:'current'},{id:'A',state:'end'}];
  assert.equal(upcomingJourneyNotices([{title:'Halte A',stopIds:['A']}],stops,{kind:'between',index:1,updated:new Date()},Date.now()).length,1);
});

test('Buurtbord renders cached rows immediately and keeps them during a slow or failed background fetch',async()=>{
  const cache=freshCache();await cache.hydrateNearbyCache();cache.rememberNearby(snapshot());
  buurtMode=true;buurtLive={...leeuw,loading:false,errorCode:null,refreshToken:1,requestFresh(){}};
  let reject;nearbyNetwork=()=>new Promise((_resolve,r)=>{reject=r;});boardNetwork=async()=>({departures:[]});
  const componentPath=require.resolve('../app/(tabs)/buurtbord.tsx');delete require.cache[componentPath];
  const Buurtbord=require(componentPath).default,h=new Harness();
  try{
    let tree=h.render(Buurtbord);assert.deepEqual(renderedStopNames(tree),[stop.name]);
    assert.equal(find(tree,'LeafletMap'),null); // Buurtbord now contains only the stop list.
    h.flush();tree=h.render(Buurtbord);assert.match(textOf(tree),/Bijwerken…/);
    assert.deepEqual(renderedStopNames(tree),[stop.name]);assert.equal(find(tree,'NearbySkeleton'),null);
    reject(Error('network request failed'));await new Promise(setImmediate);
    tree=h.render(Buurtbord);assert.deepEqual(renderedStopNames(tree),[stop.name]);
  }finally{h.destroy();buurtMode=false;}
});
test('Buurtbord restores persisted results before GPS completes, with no unrelated map',async()=>{
  const cache=freshCache(JSON.stringify({lastLocation:leeuw,snapshots:[snapshot()]}));
  buurtMode=true;buurtLive={coords:null,bron:null,fixAt:null,loading:true,errorCode:null,refreshToken:0,requestFresh(){}};
  nearbyNetwork=()=>new Promise(()=>{});boardNetwork=async()=>({departures:[]});
  const componentPath=require.resolve('../app/(tabs)/buurtbord.tsx');delete require.cache[componentPath];
  const Buurtbord=require(componentPath).default,h=new Harness();
  try{
    let tree=h.render(Buurtbord);
    assert.equal(find(tree,'LeafletMap'), null); // No unhydrated map before cached location is available.
    h.flush();await new Promise(setImmediate);tree=h.render(Buurtbord);h.flush();tree=h.render(Buurtbord);
    assert.deepEqual(renderedStopNames(tree),[stop.name]);
    assert.equal(find(tree,'LeafletMap'),null);
    assert.equal(find(tree,'NearbySkeleton'),null);
  }finally{h.destroy();buurtMode=false;}
});
test('a late nearby response from the previous city cannot overwrite the current stop list',async()=>{
  const cache=freshCache();await cache.hydrateNearbyCache();cache.rememberNearby(snapshot());
  buurtMode=true;buurtLive={...leeuw,loading:false,errorCode:null,refreshToken:1,requestFresh(){}};
  const pending=[];nearbyNetwork=()=>new Promise(resolve=>pending.push(resolve));boardNetwork=async()=>({departures:[]});
  const componentPath=require.resolve('../app/(tabs)/buurtbord.tsx');delete require.cache[componentPath];
  const Buurtbord=require(componentPath).default,h=new Harness();
  try{
    h.render(Buurtbord);h.flush();await new Promise(setImmediate);h.render(Buurtbord);h.flush();
    buurtLive={...buurtLive,...amsterdam,fixAt:6000,refreshToken:2};
    let tree=h.render(Buurtbord);assert.deepEqual(renderedStopNames(tree),[]);h.flush();
    const newer=pending.at(-1);const a={...stop,id:'A',name:'Amsterdam',lat:52.3676,lon:4.9041};
    newer([a]);await new Promise(setImmediate);
    for(const resolve of pending.slice(0,-1))resolve([stop]);await new Promise(setImmediate);
    tree=h.render(Buurtbord);assert.deepEqual(renderedStopNames(tree),['Amsterdam']);
    assert.equal(find(tree,'LeafletMap'),null);
  }finally{h.destroy();buurtMode=false;}
});

test('Buurtbord searches all haltes and opens a found halte with Buurtbord as its return tab',async()=>{
  const cache=freshCache();await cache.hydrateNearbyCache();cache.rememberNearby(snapshot());
  buurtMode=true;shownStop=null;
  buurtLive={...leeuw,loading:false,errorCode:null,refreshToken:1,requestFresh(){}};
  nearbyNetwork=async()=>[stop];
  boardNetwork=async()=>({departures:[]});
  let querySeen='';
  searchNetwork=async(query)=>{querySeen=query;return [{...stop,id:'S',city:'',name:'Leeuwarden, Uiterdijksterweg'}];};
  const componentPath=require.resolve('../app/(tabs)/buurtbord.tsx');delete require.cache[componentPath];
  const Buurtbord=require(componentPath).default,h=new Harness();
  try{
    let tree=h.render(Buurtbord);
    const searchButton=findLabel(tree,'Halte zoeken');
    assert.ok(searchButton,'a magnifier must be available in Buurtbord');
    searchButton.props.onPress();
    tree=h.render(Buurtbord);h.flush();
    const input=find(tree,'TextInput');
    assert.ok(input,'search opens a field inside Buurtbord');
    input.props.onChangeText('Uiterdijksterweg');
    h.render(Buurtbord);h.flush();
    await new Promise(resolve=>setTimeout(resolve,240));
    await new Promise(setImmediate);
    tree=h.render(Buurtbord);
    assert.equal(querySeen,'Uiterdijksterweg');
    const result=findLabel(tree,'Open halte Leeuwarden, Uiterdijksterweg');
    assert.ok(result,'a remote result should be selectable');
    result.props.onPress();
    assert.equal(shownStop.stop.id,'S');
    assert.equal(shownStop.options.returnTo,'/buurtbord');
  }finally{h.destroy();buurtMode=false;}
});

test.after(()=>{Module._load=load;if(extension)Module._extensions['.ts']=extension;else delete Module._extensions['.ts'];if(jsxExtension)Module._extensions['.tsx']=jsxExtension;else delete Module._extensions['.tsx'];});
