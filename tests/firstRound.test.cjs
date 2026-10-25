const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const originalLoad=Module._load,oldTs=Module._extensions['.ts'],oldTsx=Module._extensions['.tsx'];
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,f);
Module._extensions['.ts']=compile;Module._extensions['.tsx']=compile;global.__DEV__=false;
let harness,app={},favorites={},api={},permission={granted:true},fix=null,cacheModule;
const storageData=new Map();let readStorage=async key=>storageData.get(key)||null;
const storage={getItem:key=>readStorage(key),setItem:async(key,value)=>storageData.set(key,value)};
const listeners=new Set(),smart=[];
const apiProxy=new Proxy({},{get:(_target,key)=>(...args)=>api[key](...args)});
const React={createContext:()=>({Provider:'Provider'}),createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useRef:v=>harness.slot(()=>({current:v})),useState:initial=>{const h=harness,s=h.slot(()=>({value:typeof initial==='function'?initial():initial}));return[s.value,v=>{s.value=typeof v==='function'?v(s.value):v;}];},
 useMemo:(fn,deps)=>harness.memo(fn,deps),useCallback:(fn,deps)=>harness.memo(()=>fn,deps),useEffect:(fn,deps)=>harness.effect(fn,deps)};React.default=React;
const native={StyleSheet:{create:v=>v,hairlineWidth:1},AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}},useWindowDimensions:()=>({fontScale:1}),Keyboard:{dismiss(){}},Linking:{openSettings(){}},View:'View',Text:'Text',Pressable:'Pressable',FlatList:'FlatList',SectionList:'SectionList',RefreshControl:'RefreshControl',TextInput:'TextInput',ActivityIndicator:'ActivityIndicator',ScrollView:'ScrollView',Platform:{OS:'android'},StatusBar:{currentHeight:24},Vibration:{vibrate(){}}};
Module._load=function(request,parent,isMain){
 if(request==='react')return React;if(request==='react-native')return native;
 if(request==='@react-native-async-storage/async-storage')return{default:storage,__esModule:true};
 if(request==='@expo/vector-icons')return{Ionicons:'Ionicons'};
 if(request==='expo-router')return{Stack:{Screen:'Stack.Screen'},useLocalSearchParams:()=>({id:'trip',line:'4',destination:'Nijlân'}),useFocusEffect:callback=>{if(harness)harness.focus=callback;},useRouter:()=>({push(){},navigate(){},back(){},replace(){}})};
 if(request==='expo-status-bar')return{StatusBar:'StatusBar'};
 if(request==='expo-location')return{getForegroundPermissionsAsync:async()=>permission,requestForegroundPermissionsAsync:()=>{throw Error('Advice must never request permission');}};
 if(request==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:24,bottom:8})};
 if(request.endsWith('/context/AppProvider'))return{useApp:()=>app,favoriteJourneyKey:(...args)=>args.join('|')};
 if(request.endsWith('/context/FavoritesLive'))return{useFavoritesLive:()=>favorites};
 if(request.endsWith('/context/FlowNavigation'))return{useFlowNavigation:()=>({screens:[],showStop(){},requestSearch(){},searchRequest:0,homeRequest:0})};
 if(request.endsWith('/lib/api'))return apiProxy;
 if(request.endsWith('/lib/boardCache')&&cacheModule)return cacheModule;
 if(request.endsWith('/lib/useWalkingPosition'))return{useWalkingPosition:()=>null};
 if((request.endsWith('/lib/nearbyCache')||request==='./nearbyCache'))return{hydrateNearbyCache:async()=>{},peekLastLocation:()=>fix,rememberNearby(){},nearbyScope:()=> 'gps'};
 if(request.endsWith('/lib/useSmartRefresh'))return{useSmartRefresh:fn=>smart.push(fn)};
 if(request.endsWith('/lib/useBoardFocusRefresh'))return{useBoardFocusRefresh(){}};
 if(request.endsWith('/lib/useLiveLocation'))return{useLiveLocation:()=>({coords:null,bron:null,loading:true,requestFresh(){}})};
 if(request.endsWith('/lib/useLocationStartup'))return{useLocationStartup:()=>false};
 if(request.endsWith('/lib/activeTripStore'))return{loadActiveTrip:async()=>null,clearActiveTrip:async()=>{},loadTripSnapshot:async()=>null,saveTripSnapshot:async()=>{},saveActiveTrip:async()=>{}};
 if(request.endsWith('/lib/location'))return{MANUAL_CITIES:[],VOORBEELD_LOCATIE_UTRECHT:{latitude:52.09,longitude:5.12}};
 for(const name of ['DepartureLine','StopBoardRow','DepartureSkeleton','NearbySkeleton','FlowWorkspace','FlowLineGroups','LijnBadge'])if(request==='./'+name||request.endsWith('/components/'+name))return{[name]:name,DepartureHeading:'DepartureHeading'};
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
const {departureLineStatus}=require('../lib/departureLine.ts');
const cachePath=require.resolve('../lib/boardCache.ts');
function freshCache(){delete require.cache[cachePath];cacheModule=require(cachePath);return cacheModule;}
const defaults=()=>{app={colors:{},resolvedScheme:'light',recentStops:[],favoriteStops:[],favoriteJourneys:[],favoriteLines:[],manualCity:null,addRecentStop(){},toggleFavoriteStop(){},isFavoriteStop:()=>false,setManualCity(){},toggleFavoriteLine(){},toggleFavoriteJourney(){},isFavoriteJourney:()=>false,getCachedRit:()=>null,setCachedRit(){}};favorites={boards:{},refreshFailure:null,refreshing:false,refresh:async()=>{},stopsKey:''};api={getHalte:async()=>{throw Object.assign(Error('offline'),{name:'RequestFailure',network:true});},getNearby:async()=>[],searchCatalog:async()=>({stops:[],journeys:[]}),searchStops:async()=>[],getStopReliability:async()=>({})};};defaults();

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
 let line=find(list.props.renderItem({item:list.props.data[0],index:0}),'StopBoardRow');assert.equal(line.props.stale,true);assert.match(departureLineStatus(line.props.item,Date.now(),{stale:line.props.stale}).text,/^Laatst bekende tijd/);assert.equal(line.props.detail,undefined);
 api.getHalte=async()=>board(s,[dep('fresh',8,{effectiveAt:new Date(Date.now()+480000).toISOString()})]);list.props.refreshControl.props.onRefresh();await tick();tree=render();const fresh=find(tree,'FlatList');assert.equal(fresh.props.data[0].id,'fresh');assert.equal(find(fresh.props.renderItem({item:fresh.props.data[0],index:0}),'StopBoardRow').props.stale,false);assert.doesNotMatch(text(tree),/Geen verbinding/);
 }finally{h.destroy();}
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

const {journeyStopClock,expectedTimelineLocation,timelineDisplayProgress}=require('../lib/timelineProgress.ts');
const stopAt=(id,time,extra={})=>({id,name:id,plannedTime:time,state:'upcoming',...extra});
test('timeline uses expected arrivals, ignores schedule-derived states and moves exactly when the next expected time arrives',()=>{
 const rows=[stopAt('A','16:40',{expectedTime:'16:48',state:'upcoming'}),stopAt('B','16:55',{expectedTime:'17:03',state:'passed'}),stopAt('C','17:03',{expectedTime:'17:11'})];
 assert.deepEqual(expectedTimelineLocation(rows,now),{kind:'at',index:0});assert.deepEqual(expectedTimelineLocation(rows,now+180000),{kind:'at',index:1});
 const p=timelineDisplayProgress(rows,null,now+180000);assert.equal(p.estimated,true);assert.equal(p.passed(0),true);assert.equal(p.passed(1),false);assert.equal(p.passed(2),false);
 assert.equal(expectedTimelineLocation(rows,now-20*60000),null);assert.equal(expectedTimelineLocation([stopAt('X','--:--')],now),null);assert.equal(journeyStopClock(stopAt('X','--:--')),'\u2014');
 assert.equal(journeyStopClock(stopAt('X','16:55',{delayMinutes:7})),'17:02');assert.equal(journeyStopClock(stopAt('X','16:55',{expectedTime:'17:08',actualKnown:true,actualTime:'17:09'})),'17:08');
});
test('timeline handles midnight and live GPS always outranks the clock; old GPS is not a confirmed position',()=>{
 const midnight=Date.parse('2026-10-25T00:03:00+02:00'),rows=[stopAt('A','23:58'),stopAt('B','00:01'),stopAt('C','00:06')];
 assert.deepEqual(expectedTimelineLocation(rows,midnight),{kind:'at',index:1});
 const gps={kind:'between',index:0};let p=timelineDisplayProgress(rows,gps,midnight);assert.equal(p.estimated,false);assert.equal(p.location,gps);assert.equal(p.passed(0),true);assert.equal(p.passed(1),false);
 p=timelineDisplayProgress(rows,gps,midnight,{lastKnown:true});assert.equal(p.estimated,true);assert.deepEqual(p.location,{kind:'at',index:1});
 p=timelineDisplayProgress(rows,{kind:'at',index:99},midnight);assert.equal(p.estimated,true);assert.equal(p.location.index,1);
 p=timelineDisplayProgress(rows,null,midnight,{ended:true});assert.equal(p.location,null);assert.ok(rows.every((_,i)=>p.passed(i)));
 p=timelineDisplayProgress(rows,null,midnight,{cancelled:true});assert.equal(p.location,null);assert.ok(rows.every((_,i)=>!p.passed(i)));
});
test('Start without favourites has one instruction and no empty personal blocks; favourites retain their departure rows',()=>{
 defaults();const {FlowHome}=require('../components/FlowHome.tsx'),h=new Harness();
 try{const header=find(h.render(FlowHome),'SectionList').props.ListHeaderComponent,label=text(header);assert.equal(label.split('Tik op de ster bij een halte of lijn, dan staat die hier').length-1,1);assert.doesNotMatch(label,/Voor jou|Jouw haltes|Je bewaarde haltes verschijnen|Nog geen komende vertrekken/);assert.match(label,/Haltes in de buurt/);}finally{h.destroy();}
});
test('opening any stop immediately creates a board screen with all platform variants, without a direction chooser',()=>{
 defaults();const {FlowNavigationProvider}=require('../context/FlowNavigation.tsx'),h=new Harness(),s=stop('area',{variants:[stop('A'),stop('B')]});
 try{let view=h.render(()=>FlowNavigationProvider({children:null}));view.props.value.showStop(s);view=h.render(()=>FlowNavigationProvider({children:null}));const screen=view.props.value.screens[0];assert.equal(screen.stop,s);assert.equal(screen.choosing,undefined);assert.equal(screen.stop.variants.length,2);assert.equal(view.props.value.chooseStop,undefined);}finally{h.destroy();}
 assert.equal(fs.existsSync(require('node:path').join(__dirname,'../components/StopDirectionPicker.tsx')),false);
});
test('the joint stop board retains all departures and each feed-provided platform',async()=>{
 defaults();storageData.clear();freshCache();const s=stop('area'),live=Date.now();const departures=[dep('metro1',8,{platform:'1',line:'51',mode:'metro',effectiveAt:new Date(live+480000).toISOString()}),dep('metro2',9,{platform:'2',line:'54',mode:'metro',effectiveAt:new Date(live+540000).toISOString()}),dep('tram',10,{line:'1',mode:'tram',platform:'A',effectiveAt:new Date(live+600000).toISOString()})];
 api.getHalte=async()=>board(s,departures);const {FlowBoard}=require('../components/FlowBoard.tsx'),h=new Harness();
 try{h.render(()=>FlowBoard({stop:s,onBack(){}}));h.flush();await tick();const list=find(h.render(()=>FlowBoard({stop:s,onBack(){}})),'FlatList');assert.equal(list.props.data.length,3);assert.deepEqual(list.props.data.map(r=>r.platform),['1','2','A']);for(const item of list.props.data)assert.match(departureLineStatus(item,live).text,/perron [12A]/);}finally{h.destroy();}
});
function tripModule(){
 const path=require('node:path'),file=path.resolve(__dirname,'../app/rit/[id].tsx'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText+'\nexports.testTimeLine=TimeLine;exports.testStyles=makeStyles;';
 m._compile(source,file);return m.exports;
}
test('timeline renders grey past stops and one Nu hier tag from expected time, with no repeated unconfirmed-position labels',()=>{
 defaults();const {testTimeLine:TimeLine,testStyles}=tripModule(),h=new Harness();const {ritColors}=require('../lib/ritTheme.ts');const styles=testStyles(ritColors.light);
 const journey={id:'trip',line:'4',destination:'C',mode:'bus',polyline:[],stops:[stopAt('A','16:50'),stopAt('B','16:59'),stopAt('C','17:08')]};
 try{const tree=h.render(()=>TimeLine({journey,lineColor:'#0863b5',nowMs:now,liveLocation:null,boarding:{},alightIndex:0,onOpenStop(){}})),rows=findAll(tree,'Pressable').filter(r=>r.props.accessibilityLabel?.endsWith('. Vertrekbord openen'));
 assert.equal(rows.length,3);assert.equal(text(tree).split('Nu hier').length-1,1);assert.doesNotMatch(text(tree),/Positie niet bevestigd/);
 assert.equal(findAll(rows[0],'Text').find(n=>text(n)==='A').props.style.filter(Boolean).at(-1).color,ritColors.light.passedName);
 assert.equal(findAll(rows[0],'Text').find(n=>text(n)==='16:50').props.style.filter(Boolean).at(-1).color,ritColors.light.passedText);
 assert.match(text(rows[1]),/Nu hier/);assert.equal(findAll(rows[1],'Text').find(n=>text(n)==='Nu hier').props.onPress,undefined);assert.equal(styles.header.flexShrink,0);assert.equal(styles.header.backgroundColor,'#185c98');assert.equal(styles.headerStatus.flexDirection,'row');
 }finally{h.destroy();}
});
test('the trip page displays unconfirmed position once inside its blue header',async()=>{
 defaults();const {default:RitPage}=tripModule(),h=new Harness();const clock=minutes=>new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Date.now()+minutes*60000));
 api.getRit=async()=>({id:'trip',line:'4',destination:'Nijlân',mode:'bus',live:true,polyline:[],stops:[stopAt('A',clock(-5)),stopAt('B',clock(-1)),stopAt('C',clock(8))]});
 try{h.render(RitPage);h.flush();await tick();let tree=h.render(RitPage);h.flush();await tick();tree=h.render(RitPage);
 assert.equal(text(tree).split('Positie niet bevestigd').length-1,1);const scroll=find(tree,'ScrollView');assert.ok(scroll);assert.doesNotMatch(text(scroll),/Positie niet bevestigd/);
 const children=tree.props.children.flat(Infinity).filter(x=>x&&typeof x==='object'),headerIndex=children.findIndex(x=>x.type==='View'&&findAll(x,'Text').some(t=>text(t).includes('Nijlân'))),scrollIndex=children.indexOf(scroll);
 assert.ok(headerIndex>=0&&headerIndex<scrollIndex);const status=findAll(children[headerIndex],'Text').find(t=>text(t)==='Positie niet bevestigd');
 assert.ok(status);assert.equal(status.props.numberOfLines,1);
 }finally{h.destroy();}
});

const {stopBoardTiming,stopBoardBadge,stopBoardHeader,stopBoardModes,STOP_BOARD_BLUE}=require('../lib/stopBoardDesign.ts');
test('stop-board clock and minutes share the expected instant with the exact 30-minute boundary',()=>{
 assert.deepEqual(stopBoardTiming(dep('a',8),now),{primary:'8 min',secondary:'17:08',clock:'17:08'});
 assert.equal(stopBoardTiming(dep('a',0),now).primary,'0 min');
 assert.equal(stopBoardTiming(dep('a',30),now).primary,'30 min');assert.equal(stopBoardTiming(dep('a',30.001),now).primary,'17:30');
 assert.deepEqual(stopBoardTiming(dep('a',31),now),{primary:'17:31',secondary:'',clock:'17:31'});
 assert.equal(stopBoardTiming(dep('a',8,{plannedTime:'16:58',delayMinutes:10}),now).primary,'8 min');
 for(const flags of [{departed:true},{cancelled:true},{liveDataStale:true}])assert.equal(stopBoardTiming(dep('a',8,flags),now).primary,'17:08');
 assert.equal(stopBoardTiming(dep('a',8),now,true).primary,'17:08');assert.equal(stopBoardTiming(dep('a',-2),now).primary,'16:58');
});
test('stop-board badges use map route colours before carrier colours and preserve the prescribed text colour',()=>{
 assert.deepEqual(stopBoardBadge(dep('a',8,{carrier:'GVB',mode:'tram'})),{bg:'#0863b5',text:'#ffffff'});
 assert.deepEqual(stopBoardBadge(dep('a',8,{carrier:'NS',mode:'train',line:'IC'})),{bg:'#ffc917',text:'#003082'});
 assert.deepEqual(stopBoardBadge(dep('a',8,{carrier:'EBS',routeColor:'112233',routeTextColor:'#aabbcc'})),{bg:'#112233',text:'#aabbcc'});
 assert.deepEqual(stopBoardBadge(dep('a',8,{carrier:'ALLGO',routeId:'134842',line:'326',mode:'bus'})),{bg:'#e00713',text:'#ffffff'});
 assert.notEqual(stopBoardBadge(dep('a',8,{carrier:'GVB',routeId:'134842',line:'1',mode:'tram'})).bg,'#e00713');
 assert.equal(stopBoardBadge(dep('a',8,{carrier:'GVB',routeColor:'javascript:bad'})).bg,'#0863b5');
});
test('header removes only a duplicated city prefix and counts distinct modes/lines from complete stop metadata',()=>{
 const s=stop('s',{name:'Amsterdam, Bilderdijkstraat',city:'Amsterdam',lineCount:6,modes:['bus','tram'],lines:[{line:'1',mode:'tram'},{line:'1',mode:'tram'}]});
 const b=board(s,[dep('a',8,{line:'1',mode:'tram'}),dep('b',9,{line:'1',mode:'bus'})]);
 assert.deepEqual(stopBoardHeader(s,b),{title:'Bilderdijkstraat',city:'Amsterdam',count:6});assert.deepEqual(stopBoardModes(s,b),['tram','bus']);
 assert.equal(stopBoardHeader({...s,name:'Amsterdam Centraal'}).title,'Amsterdam Centraal');
 assert.equal(stopBoardHeader({...s,name:'Amsterdam, Amsterdamlaan',city:''}).title,'Amsterdamlaan');
 assert.equal(stopBoardHeader(stop('s',{name:'Leeuwarden',city:'Leeuwarden'})).title,'Leeuwarden');
});
test('the new row is 52px at default size, caps fonts, keeps delay colours and marks departed trips blue',()=>{
 defaults();app.colors=require('../constants/colors.ts').themes.light;const {StopBoardRow,StopBoardBadge}=require('../components/StopBoardRow.tsx');const badgeView=StopBoardBadge({item:dep('badge',8,{carrier:'GVB'})});assert.equal(badgeView.props.style[1].backgroundColor,'#0863b5');assert.equal(badgeView.props.style[0].width,44);assert.equal(find(badgeView,'Text').props.maxFontSizeMultiplier,1.3);
 let row=StopBoardRow({item:dep('r',8,{mode:'tram',platform:'A',delayMinutes:4}),nowMs:now,onPress(){}});
 assert.equal(row.props.style({pressed:false})[0].minHeight,52);assert.match(row.props.accessibilityLabel,/perron A/i);
 let primary=findAll(row,'Text').find(n=>text(n)==='8 min');assert.equal(primary.props.maxFontSizeMultiplier,1.3);assert.equal(primary.props.style[0].fontSize,17);assert.deepEqual(primary.props.style[0].fontVariant,['tabular-nums']);
 let delay=findAll(row,'Text').find(n=>text(n)==='+4');assert.equal(delay.props.style.color,app.colors.delayWarning);
 row=StopBoardRow({item:dep('r',31,{mode:'tram',platform:'A',delayMinutes:5}),nowMs:now});delay=findAll(row,'Text').find(n=>text(n)==='+5');assert.equal(delay.props.style.color,app.colors.danger);assert.ok(findAll(row,'Text').some(n=>text(n)==='17:31'));
 row=StopBoardRow({item:dep('r',8,{departed:true}),nowMs:now,onPress(){}});assert.equal(row.props.disabled,true);const departed=findAll(row,'Text').find(n=>text(n)==='Vertrokken');assert.equal(departed.props.style.backgroundColor,STOP_BOARD_BLUE);assert.doesNotMatch(text(row),/8 min/);
 row=StopBoardRow({item:dep('r',8),nowMs:now,stale:true});assert.match(text(row),/Laatst bekende tijd/);assert.doesNotMatch(text(row),/8 min/);
});
test('grouped planned stop-board row shows the first full clock, later times and blue background',()=>{
 defaults();app.colors=require('../constants/colors.ts').themes.light;
 const {StopBoardRow}=require('../components/StopBoardRow.tsx');
 const row=StopBoardRow({item:dep('planned',8,{isLive:false,expectedTime:'17:08'}),nowMs:now,
   laterTimes:['17:24','17:40','17:56'],onPress(){}});
 assert.equal(row.props.style({pressed:false})[1].backgroundColor,'#EEF4FF');
 assert.ok(findAll(row,'Text').some(n=>text(n)==='17:08'&&n.props.style[1].fontSize===21));
 assert.ok(findAll(row,'Text').some(n=>text(n)==='daarna 17:24 · 17:40 · 17:56'));
 assert.match(row.props.accessibilityLabel,/daarna 17:24 · 17:40 · 17:56/);
 assert.doesNotMatch(text(row),/8 min/);
});
test('FlowBoard shows a day divider and groups only adjacent planned trips after filtering',()=>{
 defaults();const h=new Harness(),s=stop('night');
 const timed=(id,min,flags={})=>dep(id,min,{isLive:false,effectiveAt:new Date(Date.now()+min*60000).toISOString(),...flags});
 const b=board(s,[timed('live-before',5,{isLive:true}),timed('first',320),timed('second',340),
   timed('third',360),timed('fourth',380),timed('live-after',390,{isLive:true})]);
 const {FlowBoard}=require('../components/FlowBoard.tsx');
 try{
  const tree=h.render(()=>FlowBoard({stop:s,initialBoard:b,onBack(){}}));const list=find(tree,'FlatList');
  assert.deepEqual(list.props.data.map(r=>r.id),['live-before','first','live-after']);
  assert.equal(list.props.data[1].groupedTimes.length,3);assert.ok(list.props.data[1].gapStartClock);
  const groupView=list.props.renderItem({item:list.props.data[1],index:1});
  assert.match(text(groupView),/Volgende vertrekken vanaf/);
  assert.equal(find(groupView,'StopBoardRow').props.laterTimes.length,3);
  assert.equal(find(list.props.renderItem({item:list.props.data[2],index:2}),'StopBoardRow').props.laterTimes,undefined);
 }finally{h.destroy();}
});
test('stop-board mode buttons and Lijnen actually filter the mixed stop, and Alle clears the filters',()=>{
 defaults();const h=new Harness(),s=stop('mix',{name:'Amsterdam, Test',city:'Amsterdam',modes:['bus','tram']}),b=board(s,[dep('bus',8,{mode:'bus',effectiveAt:new Date(Date.now()+480000).toISOString()}),dep('tram',9,{mode:'tram',line:'1',effectiveAt:new Date(Date.now()+540000).toISOString()})]);
 const {FlowBoard}=require('../components/FlowBoard.tsx'),props={stop:s,initialBoard:b,onBack(){}};const render=()=>h.render(()=>FlowBoard(props));
 try{let tree=render();assert.deepEqual(find(tree,'FlatList').props.data.map(d=>d.id),['bus','tram']);assert.equal(findAll(tree,'Pressable').some(p=>p.props.accessibilityLabel==='Metro filter'),false);
 findAll(tree,'Pressable').find(p=>p.props.accessibilityLabel==='Tram filter').props.onPress();tree=render();assert.deepEqual(find(tree,'FlatList').props.data.map(d=>d.id),['tram']);
 findAll(tree,'Pressable').find(p=>p.props.accessibilityLabel==='Lijnen op deze halte').props.onPress();tree=render();assert.deepEqual(find(tree,'FlowLineGroups').props.departures.map(d=>d.id),['tram']);
 findAll(tree,'Pressable').find(p=>p.props.accessibilityLabel==='Alle vertrekken').props.onPress();tree=render();assert.deepEqual(find(tree,'FlatList').props.data.map(d=>d.id),['bus','tram']);
 const title=findAll(tree,'Text').find(t=>t.props.accessibilityRole==='header');assert.equal(text(title),'Test');assert.equal(title.props.numberOfLines,1);assert.equal(title.props.maxFontSizeMultiplier,1.3);
 }finally{h.destroy();}
});
test('existing arrivals stay reachable from the stop menu while tabs are removed',()=>{
 defaults();const h=new Harness(),s=stop('arrivals'),b={...board(s,[dep('out',8)]),arrivals:[dep('in',9)]},props={stop:s,initialBoard:b,onBack(){}};const {FlowBoard}=require('../components/FlowBoard.tsx');
 try{let tree=h.render(()=>FlowBoard(props));const option=find(tree,'OverflowMenu').props.items.find(i=>i.key==='arrivals');assert.ok(option);option.onPress();tree=h.render(()=>FlowBoard(props));assert.deepEqual(find(tree,'FlatList').props.data.map(d=>d.id),['in']);assert.equal(findAll(tree,'View').some(v=>v.props.accessibilityRole==='tablist'),false);}finally{h.destroy();}
});
test('API retains feed-provided route colours and counts for the new stop board without changing time normalization',async()=>{
 defaults();storageData.clear();freshCache();const {getHalte}=require('../lib/api.ts'),before=global.fetch;
 try{global.fetch=async()=>({ok:true,json:async()=>({name:'Amsterdam, Test',line_count:6,departures:[{id:'x',line:'1',carrier:'GVB',mode:'tram',planned_time:'17:00',expected_time:'17:03',route_id:'route',route_color:'#abcdef',route_text_color:'112233'}]})});
 const result=await getHalte('test');assert.equal(result.stop.lineCount,6);assert.equal(result.departures[0].routeId,'route');assert.equal(result.departures[0].routeColor,'#abcdef');assert.equal(result.departures[0].routeTextColor,'112233');assert.equal(result.departures[0].expectedTime,'17:03');
 }finally{global.fetch=before;}
});

test('the blue stop-board status bar is removed on blur and on hidden boards, preserving other screens',()=>{
 defaults();const h=new Harness(),{FlowBoard}=require('../components/FlowBoard.tsx'),s=stop('focus'),b=board(s,[]);let visible=true;
 const render=()=>h.render(()=>FlowBoard({stop:s,initialBoard:b,visible,onBack(){}}));
 try{let tree=render();assert.equal(find(tree,'StatusBar'),undefined);let blur=h.focus();tree=render();assert.equal(find(tree,'StatusBar').props.style,'light');blur();assert.equal(find(render(),'StatusBar'),undefined);
 blur=h.focus();visible=false;assert.equal(find(render(),'StatusBar'),undefined);blur();}finally{h.destroy();}
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
