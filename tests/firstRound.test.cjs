const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const originalLoad=Module._load,oldTs=Module._extensions['.ts'],oldTsx=Module._extensions['.tsx'];
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText,f);
Module._extensions['.ts']=compile;Module._extensions['.tsx']=compile;global.__DEV__=false;
let harness,app={},favorites={},api={},permission={granted:true},fix=null,cacheModule;
const storageData=new Map();let readStorage=async key=>storageData.get(key)||null;
const storage={getItem:key=>readStorage(key),setItem:async(key,value)=>storageData.set(key,value)};
const listeners=new Set(),smart=[];
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useRef:v=>harness.slot(()=>({current:v})),useState:initial=>{const h=harness,s=h.slot(()=>({value:typeof initial==='function'?initial():initial}));return[s.value,v=>{s.value=typeof v==='function'?v(s.value):v;}];},
 useMemo:(fn,deps)=>harness.memo(fn,deps),useCallback:(fn,deps)=>harness.memo(()=>fn,deps),useEffect:(fn,deps)=>harness.effect(fn,deps)};React.default=React;
const native={StyleSheet:{create:v=>v,hairlineWidth:1},AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}},useWindowDimensions:()=>({fontScale:1}),Keyboard:{dismiss(){}},Linking:{openSettings(){}},View:'View',Text:'Text',Pressable:'Pressable',FlatList:'FlatList',SectionList:'SectionList',RefreshControl:'RefreshControl',TextInput:'TextInput',ActivityIndicator:'ActivityIndicator'};
Module._load=function(request,parent,isMain){
 if(request==='react')return React;if(request==='react-native')return native;
 if(request==='@react-native-async-storage/async-storage')return{default:storage,__esModule:true};
 if(request==='@expo/vector-icons')return{Ionicons:'Ionicons'};
 if(request==='expo-router')return{useFocusEffect(){},useRouter:()=>({push(){},navigate(){}})};
 if(request==='expo-status-bar')return{StatusBar:'StatusBar'};
 if(request==='expo-location')return{getForegroundPermissionsAsync:async()=>permission,requestForegroundPermissionsAsync:()=>{throw Error('Advice must never request permission');}};
 if(request==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:24,bottom:8})};
 if(request.endsWith('/context/AppProvider'))return{useApp:()=>app};
 if(request.endsWith('/context/FavoritesLive'))return{useFavoritesLive:()=>favorites};
 if(request.endsWith('/context/FlowNavigation'))return{useFlowNavigation:()=>({screens:[],showStop(){},requestSearch(){},searchRequest:0,homeRequest:0})};
 if(request.endsWith('/lib/api'))return api;
 if(request.endsWith('/lib/boardCache')&&cacheModule)return cacheModule;
 if(request.endsWith('/lib/useWalkingPosition'))return{useWalkingPosition:()=>null};
 if((request.endsWith('/lib/nearbyCache')||request==='./nearbyCache'))return{hydrateNearbyCache:async()=>{},peekLastLocation:()=>fix,rememberNearby(){},nearbyScope:()=> 'gps'};
 if(request.endsWith('/lib/useSmartRefresh'))return{useSmartRefresh:fn=>smart.push(fn)};
 if(request.endsWith('/lib/useBoardFocusRefresh'))return{useBoardFocusRefresh(){}};
 if(request.endsWith('/lib/useLiveLocation'))return{useLiveLocation:()=>({coords:null,bron:null,loading:true,requestFresh(){}})};
 if(request.endsWith('/lib/useLocationStartup'))return{useLocationStartup:()=>false};
 if(request.endsWith('/lib/activeTripStore'))return{loadActiveTrip:async()=>null,clearActiveTrip:async()=>{}};
 if(request.endsWith('/lib/location'))return{MANUAL_CITIES:[],VOORBEELD_LOCATIE_UTRECHT:{latitude:52.09,longitude:5.12}};
 for(const name of ['DepartureLine','DepartureSkeleton','NearbySkeleton','FlowWorkspace','FlowLineGroups','LijnBadge'])if(request==='./'+name||request.endsWith('/components/'+name))return{[name]:name,DepartureHeading:'DepartureHeading'};
 if(request.endsWith('/OverflowMenu'))return{MenuButton:'MenuButton',OverflowMenu:'OverflowMenu'};
 return originalLoad.call(this,request,parent,isMain);
};
class Harness{
 constructor(){this.slots=[];this.cursor=0;this.pending=[];}
 slot(fn){const i=this.cursor++;return this.slots[i]??(this.slots[i]=fn());}
 memo(fn,deps){const s=this.slot(()=>({}));if(!s.deps||deps.some((d,i)=>d!==s.deps[i])){s.value=fn();s.deps=deps;}return s.value;}
 effect(fn,deps){const s=this.slot(()=>({}));if(!s.deps||deps.some((d,i)=>d!==s.deps[i])){this.pending.push(()=>{s.cleanup?.();s.cleanup=fn();});s.deps=deps;}}
 render(fn){this.cursor=0;harness=this;try{return fn();}finally{harness=null;}}
 flush(){for(const fn of this.pending.splice(0))fn();}
 destroy(){for(const s of this.slots)s?.cleanup?.();}
}
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function findAll(tree,type){if(!tree||typeof tree!=='object')return[];return [...(tree.type===type?[tree]:[]),...(tree.props?.children||[]).flat(Infinity).flatMap(c=>findAll(c,type))];}
const find=(tree,type)=>findAll(tree,type)[0];
const text=tree=>tree==null?'':typeof tree==='string'||typeof tree==='number'?String(tree):(tree.props?.children||[]).flat(Infinity).map(text).join(' ');
const stop=(id,extra={})=>({id,name:'Leeuwarden, Bordineweg',city:'Leeuwarden',mode:'bus',lat:53.19,lon:5.78,lines:[],...extra});
const now=Date.parse('2026-10-24T17:00:00+02:00');
const dep=(id,min,extra={})=>({id,line:'4',carrier:'QBUZZ',destination:'Nijlân',plannedTime:'17:00',effectiveAt:new Date(now+min*60000).toISOString(),isLive:true,...extra});
const board=(s,departures=[])=>({stop:s,departures,arrivals:[],disruptions:[],generatedAt:new Date().toISOString(),feedAgeSeconds:0});
const {walkMinutesTo,walkingDepartureAdvice}=require('../lib/leaveTime.ts');
const {distanceMeters}=require('../lib/boardingMatch.ts');
const {forYouDepartures}=require('../lib/forYou.ts');
const {directionStops,directionDescription}=require('../lib/stopDirections.ts');
const {departureLineStatus}=require('../lib/departureLine.ts');
const cachePath=require.resolve('../lib/boardCache.ts');
function freshCache(){delete require.cache[cachePath];cacheModule=require(cachePath);return cacheModule;}
const defaults=()=>{app={colors:{},resolvedScheme:'light',recentStops:[],favoriteStops:[],favoriteJourneys:[],favoriteLines:[],manualCity:null,addRecentStop(){},toggleFavoriteStop(){},isFavoriteStop:()=>false,setManualCity(){},toggleFavoriteLine(){}};favorites={boards:{},refreshFailure:null,refreshing:false,refresh:async()=>{},stopsKey:''};api={getHalte:async()=>{throw Object.assign(Error('offline'),{name:'RequestFailure',network:true});},getNearby:async()=>[],searchCatalog:async()=>({stops:[],journeys:[]}),searchStops:async()=>[],getStopReliability:async()=>({})};};defaults();

test('walking uses 1.3 detour, 4.5 km/h and the actual expected departure, with an exact three-minute safety boundary',()=>{
 const from={lat:53.19,lon:5.78},to={lat:53.192,lon:5.78};
 assert.equal(walkMinutesTo(from,to),Math.ceil(distanceMeters(from,to)*1.3/75));assert.equal(walkMinutesTo(from,to),4);
 assert.deepEqual(walkingDepartureAdvice(dep('a',8),from,to,now),{text:'4 min lopen',tight:false,label:''});
 assert.equal(walkingDepartureAdvice(dep('a',7),from,to,now).label,'');
 assert.equal(walkingDepartureAdvice(dep('a',7),from,to,now+1).label,'Krap');
 assert.equal(walkingDepartureAdvice(dep('a',2,{plannedTime:'17:40'}),from,to,now).label,'Niet haalbaar');
 for(const extra of [{cancelled:true},{departed:true},{liveDataStale:true}])assert.equal(walkingDepartureAdvice(dep('a',8,extra),from,to,now),null);
 assert.equal(walkingDepartureAdvice(dep('a',-1),from,to,now),null);assert.equal(walkingDepartureAdvice(dep('a',8),null,to,now),null);assert.equal(walkMinutesTo(from,{}),null);
});
test('For you mixes favourite stops, favourite carrier lines and saved directions by expected time without duplicate or departed trips',()=>{
 const a=stop('a'),b=stop('b'),c=stop('c');
 const entries={a:{board:board(a,[dep('stop',8),dep('cancel',1,{cancelled:true}),dep('gone',2,{departed:true}),dep('past',-1)])},
 b:{board:board(b,[dep('line',3,{line:'25'}),dep('other',1,{line:'25',carrier:'OTHER'}),dep('unwanted',2)])},
 alias:{board:board(b,[dep('line',3,{line:'25'})])},c:{board:board(c,[dep('journey',5,{destination:'Busstation'}),dep('wrong-way',4)]),stale:true,fetchedAt:now-60000}};
 const rows=forYouDepartures(entries,[a],['25|QBUZZ'],[{line:'4',direction:'Busstation',stop:c}],now);
 assert.deepEqual(rows.map(r=>r.item.id),['line','journey','stop']);assert.equal(rows[1].stale,true);
 assert.deepEqual(forYouDepartures(entries,[],[],[],now),[]);assert.equal(forYouDepartures(entries,[a,b,c],[],[],now,2).length,2);
});
test('direction choice preserves separate stop_ids even at identical coordinates and derives main destinations only from upcoming departures',()=>{
 const a=stop('a'),b=stop('b'),c=stop('c',{name:'Other stop'});const area={...a,variants:[a,b,a]};
 assert.deepEqual(directionStops(a,[area]).map(s=>s.id),['a','b']);assert.deepEqual(directionStops({...a,variants:[a]}).map(s=>s.id),['a']);
 assert.deepEqual(directionStops(a,[{...c,variants:[c]}]).map(s=>s.id),['a']);
 const d=directionDescription(board(a,[dep('1',4),dep('2',8),dep('3',2,{destination:'Busstation'}),dep('4',1,{cancelled:true,destination:'Vervallen'}),dep('5',-2,{destination:'Verleden'})]),now);
 assert.equal(d.label,'Richting Nijlân / Busstation');assert.equal(d.next,'17:02');
 const delayOnly=dep('delayed',8,{effectiveAt:undefined,plannedTime:'17:04',delayMinutes:3});assert.equal(directionDescription(board(a,[delayOnly]),now).next,'17:07');
});
test('last opened boards survive cold restart and retain their real timestamp; corrupt, expired and future snapshots are rejected',async()=>{
 storageData.clear();readStorage=async key=>storageData.get(key)||null;
 let cache=freshCache();const t=Date.now()-90000,b=board(stop('a'),[dep('cached',8)]);cache.rememberBoard(b,t);await tick();
 cache=freshCache();assert.equal(cache.peekBoard('a'),undefined);const saved=await cache.cachedBoard('a');assert.equal(saved.fetchedAt,t);assert.equal(saved.board.stop.id,'a');
 assert.equal(cache.peekBoard('a',t+cache.BOARD_CACHE_MAX_AGE_MS),undefined);
 storageData.set('ovbord.boardSnapshots.v1','{');storageData.set('ovbord.favoriteBoards',JSON.stringify({a:{board:b,fetchedAt:t},bad:{board:b,fetchedAt:Date.now()+60000}}));cache=freshCache();await cache.hydrateBoardCache();assert.equal(cache.peekBoard('a').fetchedAt,t);
 readStorage=async()=>{throw Error('disk unavailable');};cache=freshCache();await cache.hydrateBoardCache();assert.equal(cache.peekBoard('a'),undefined);readStorage=async key=>storageData.get(key)||null;
});
test('slow disk hydration never overwrites a newer live snapshot',async()=>{
 storageData.clear();let release;let count=0;readStorage=key=>key==='ovbord.boardSnapshots.v1'?new Promise(r=>{release=r;}):Promise.resolve(null);
 const cache=freshCache(),pending=cache.hydrateBoardCache(),t=Date.now()-5000;
 cache.rememberBoard(board(stop('a'),[dep('new',8)]),t);release(JSON.stringify({a:{board:board(stop('a'),[dep('old',8)]),fetchedAt:t-10000}}));await pending;await tick();
 assert.equal(cache.peekBoard('a').board.departures[0].id,'new');assert.equal(cache.peekBoard('a').fetchedAt,t);readStorage=async key=>storageData.get(key)||null;
});
test('walking position never requests permission and drops denied, revoked, old and disabled GPS fixes',async()=>{
 const {useWalkingPosition}=require('../lib/useWalkingPosition.ts');const h=new Harness();let enabled=true;
 const render=()=>h.render(()=>useWalkingPosition(enabled));
 try{
 fix={coords:{latitude:53.19,longitude:5.78},fixAt:Date.now()};permission={granted:true};render();h.flush();await tick();assert.deepEqual(render(),{lat:53.19,lon:5.78});
 permission={granted:false};for(const fn of listeners)fn('active');await tick();assert.equal(render(),null);
 permission={granted:true};fix.fixAt=Date.now()-300001;for(const fn of listeners)fn('active');await tick();assert.equal(render(),null);
 fix.fixAt=Date.now();enabled=false;render();h.flush();await tick();assert.equal(render(),null);
 }finally{h.destroy();}
});
test('Start renders For you and Your stops before nearby while GPS is still loading, using the shared row',async()=>{
 defaults();storageData.clear();freshCache();app.favoriteStops=[stop('a')];app.favoriteLines=['25|QBUZZ'];
 favorites.boards={a:{board:board(stop('a'),[dep('fav',Math.ceil((Date.now()-now)/60000)+8)]),fetchedAt:Date.now()}};
 const {FlowHome}=require('../components/FlowHome.tsx');const h=new Harness();
 try{
 let tree=h.render(FlowHome);h.flush();await tick();tree=h.render(FlowHome);const list=find(tree,'SectionList');assert.ok(list);
 const header=list.props.ListHeaderComponent,label=text(header);
 assert.ok(label.indexOf('Voor jou')<label.indexOf('Jouw haltes'));assert.ok(label.indexOf('Jouw haltes')<label.indexOf('Haltes in de buurt'));
 assert.equal(findAll(header,'DepartureLine').length,1);assert.equal(find(header,'DepartureLine').props.item.id,'fav');assert.equal(list.props.ListEmptyComponent.type,'NearbySkeleton');
 }finally{h.destroy();}
});
test('an offline stop board restores cached rows and timestamp, labels each last known, then recovers on refresh',async()=>{
 defaults();storageData.clear();const cache=freshCache(),s=stop('cached-stop'),received=Date.now()-120000;
 cache.rememberBoard(board(s,[dep('cached',8,{effectiveAt:new Date(Date.now()+480000).toISOString()})]),received);await tick();
 const {FlowBoard}=require('../components/FlowBoard.tsx');const h=new Harness();const props={stop:s,onBack(){}};const render=()=>h.render(()=>FlowBoard(props));
 try{
 render();h.flush();await tick();let tree=render();h.flush();await tick();tree=render();const list=find(tree,'FlatList');assert.ok(list);assert.equal(list.props.data[0].id,'cached');
 assert.match(text(tree),/Geen verbinding · laatst bijgewerkt om/);assert.ok(text(tree).includes(new Date(received).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})));
 let line=find(list.props.renderItem({item:list.props.data[0],index:0}),'DepartureLine');assert.equal(line.props.stale,true);assert.match(departureLineStatus(line.props.item,Date.now(),{stale:line.props.stale}).text,/^Laatst bekende tijd/);assert.equal(line.props.detail,undefined);
 api.getHalte=async()=>board(s,[dep('fresh',8,{effectiveAt:new Date(Date.now()+480000).toISOString()})]);list.props.refreshControl.props.onRefresh();await tick();tree=render();const fresh=find(tree,'FlatList');assert.equal(fresh.props.data[0].id,'fresh');assert.equal(find(fresh.props.renderItem({item:fresh.props.data[0],index:0}),'DepartureLine').props.stale,false);assert.doesNotMatch(text(tree),/Geen verbinding/);
 }finally{h.destroy();}
});
test('direction picker skips a single platform and opens the selected exact stop_id among multiple platforms',async()=>{
 defaults();storageData.clear();freshCache();const {StopDirectionPicker}=require('../components/StopDirectionPicker.tsx');let chosen=[];
 const one=stop('one'),h=new Harness();try{h.render(()=>StopDirectionPicker({stop:{...one,variants:[one]},onChoose:(...args)=>chosen.push(args),onBack(){}}));h.flush();await tick();assert.equal(chosen.length,1);assert.equal(chosen[0][0].id,'one');}finally{h.destroy();}
 const a=stop('north'),b=stop('south'),multi={...a,variants:[a,b]},h2=new Harness();chosen=[];
 api.getHalte=async id=>board(stop(id),[dep(id,8,{effectiveAt:new Date(Date.now()+480000).toISOString(),destination:id==='north'?'Nijlân':'Busstation'})]);
 const render=()=>h2.render(()=>StopDirectionPicker({stop:multi,onChoose:(...args)=>chosen.push(args),onBack(){}}));
 try{render();h2.flush();await tick();const tree=render();assert.match(text(tree),/Kies je richting/);const list=find(tree,'FlatList');assert.deepEqual(list.props.data.map(e=>e.stop.id),['north','south']);
 const row=list.props.renderItem({item:list.props.data[1]});assert.match(text(row),/Richting Busstation/);assert.match(text(row),/Eerstvolgende vertrek/);row.props.onPress();assert.equal(chosen[0][0].id,'south');assert.equal(chosen[0][1].stop.id,'south');
 }finally{h2.destroy();}
});

test('cached perron metadata survives routine API refreshes and the on-disk cache remains bounded',async()=>{
 storageData.clear();freshCache();const a=stop('platform-a'),b=stop('platform-b');
 cacheModule.rememberBoard(board({...a,variants:[a,b]},[dep('one',8)]));await tick();
 cacheModule.rememberBoard(board(a,[dep('two',9)]));await tick();
 assert.deepEqual(cacheModule.peekBoard(a.id).board.stop.variants.map(s=>s.id),[a.id,b.id]);
 for(let i=0;i<48;i++)cacheModule.rememberBoard(board(stop('large-'+i),Array.from({length:100},(_,j)=>dep(String(j),j+1,{destination:'Lange bestemmingsnaam '.repeat(10)}))));
 await tick();const raw=storageData.get('ovbord.boardSnapshots.v1');assert.ok(raw.length<=450000);assert.ok(JSON.parse(raw)['large-47']);assert.equal(JSON.parse(raw)['large-0'],undefined);
});
test('old live feeds on For you cannot offer live walking confidence',()=>{
 const s=stop('a'),old=board(s,[dep('old-live',8)]);old.generatedAt=new Date(now-120000).toISOString();old.feedAgeSeconds=120;
 const [row]=forYouDepartures({a:{board:old,fetchedAt:now}},[s],[],[],now);
 assert.equal(row.item.liveDataStale,true);assert.equal(walkingDepartureAdvice(row.item,{lat:s.lat,lon:s.lon},s,now),null);
});
test('saved line origins survive a restart, normalize old entries and tolerate unavailable storage',async()=>{
 storageData.clear();readStorage=async key=>storageData.get(key)||null;const file=require.resolve('../lib/lineOrigins.ts');delete require.cache[file];let origins=require(file);
 origins.rememberLineOrigin('25|QBUZZ',stop('line-origin'));await tick();delete require.cache[file];origins=require(file);
 assert.equal((await origins.loadLineOrigins())['25|QBUZZ'].id,'line-origin');
 storageData.set('ovbord.favoriteLineOrigins.v1',JSON.stringify({'4|QBUZZ':{id:'old',name:'Bordineweg'},bad:{name:'invalid'}}));delete require.cache[file];origins=require(file);const saved=await origins.loadLineOrigins();assert.deepEqual(saved['4|QBUZZ'].lines,[]);assert.equal(saved.bad,undefined);
 readStorage=async()=>{throw Error('disk unavailable');};delete require.cache[file];assert.deepEqual(await require(file).loadLineOrigins(),{});readStorage=async key=>storageData.get(key)||null;
});
test('a known platform never falls back to another same-name stop on a server failure',async()=>{
 defaults();storageData.clear();freshCache();const a=stop('exact-a'),b=stop('other-b');let searches=0;let remembered;
 app.addRecentStop=s=>{remembered=s;};api.getHalte=async()=>{throw Error('server temporarily unavailable');};api.searchStops=async()=>{searches++;return[b];};
 const {FlowBoard}=require('../components/FlowBoard.tsx'),h=new Harness(),props={stop:{...a,variants:[a,b]},initialBoard:board(a,[dep('x',8,{effectiveAt:new Date(Date.now()+480000).toISOString()})]),onBack(){}};
 try{h.render(()=>FlowBoard(props));h.flush();await tick();assert.equal(searches,0);assert.equal(remembered.id,'exact-a');}finally{h.destroy();}
});

test.after(()=>{Module._load=originalLoad;if(oldTs)Module._extensions['.ts']=oldTs;else delete Module._extensions['.ts'];if(oldTsx)Module._extensions['.tsx']=oldTsx;else delete Module._extensions['.tsx'];});

test('OTA 1.0.4: walking remains local, hides beyond 2 km, and has exact margin bands',()=>{
 const from={lat:53.19,lon:5.78},close={lat:53.192,lon:5.78},far={lat:53.22,lon:5.78};
 assert.equal(walkMinutesTo(from,far),null);
 assert.equal(walkingDepartureAdvice(dep('far',5),from,far,now),null);
 assert.equal(walkMinutesTo(from,close),4);
 assert.deepEqual(walkingDepartureAdvice(dep('ok',7),from,close,now),{text:'4 min lopen',tight:false,label:''});
 assert.deepEqual(walkingDepartureAdvice(dep('tight',6),from,close,now),{text:'4 min lopen',tight:true,label:'Krap'});
 assert.deepEqual(walkingDepartureAdvice(dep('zero',4),from,close,now),{text:'4 min lopen',tight:true,label:'Krap'});
 assert.deepEqual(walkingDepartureAdvice(dep('impossible',3),from,close,now),{text:'4 min lopen',tight:true,label:'Niet haalbaar'});
 assert.equal(departureLineStatus(dep('live',8),now,{note:'4 min lopen'}).text,'Live · over 8 min · 4 min lopen');
});
