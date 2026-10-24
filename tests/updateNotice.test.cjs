const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const load=Module._load,ext=Module._extensions['.ts'],tsx=Module._extensions['.tsx'];
const compile=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText,file);
Module._extensions['.ts']=compile;Module._extensions['.tsx']=compile;
let h,status={},enabled=true,reloads=0,reload=async()=>{reloads++;},alerts=0;
const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useRef:v=>h.slot(()=>({current:v})),useState:v=>{const s=h.slot(()=>({value:v}));return [s.value,v=>{s.value=v;}];},useEffect:(fn,deps)=>{const s=h.slot(()=>({}));if(!s.deps){h.effects.push(()=>{s.cleanup=fn();});s.deps=deps;}}};React.default=React;
const updates={get isEnabled(){return enabled;},useUpdates:()=>status,reloadAsync:()=>reload(),checkForUpdateAsync:async()=>({isAvailable:false}),fetchUpdateAsync:async()=>({isNew:false})};
Module._load=function(request,parent,isMain){
 if(request==='react')return React;
 if(request==='expo-updates')return updates;
 if(request==='react-native')return {Alert:{alert(){alerts++;}},AppState:{currentState:'background',addEventListener:()=>({remove(){}})},StyleSheet:{create:v=>v,hairlineWidth:1},View:'View',Text:'Text',Pressable:'Pressable'};
 if(request==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({bottom:24})};
 if(request.endsWith('/context/AppProvider'))return {useApp:()=>({colors:{}})};
 return load.call(this,request,parent,isMain);
};
const {createUpdatePoller}=require('../lib/updateAvailability.ts');
const {AppUpdateNotice}=require('../components/AppUpdateNotice.tsx');
class Harness{constructor(){this.slots=[];this.effects=[];}slot(make){const i=this.cursor++;return this.slots[i]??(this.slots[i]=make());}render(){this.cursor=0;h=this;return AppUpdateNotice();}flush(){this.effects.splice(0).forEach(fn=>fn());}destroy(){this.slots.forEach(s=>s.cleanup?.());}}
function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;for(const c of(tree.props?.children||[]).flat(Infinity)){const found=find(c,type);if(found)return found;}return null;}
const text=tree=>typeof tree==='string'?tree:(tree?.props?.children||[]).flat(Infinity).map(text).join(' ');

test('only a fully downloaded native update displays Update klaar; available alone stays hidden',()=>{
 const a=new Harness();try{enabled=true;status={isUpdateAvailable:true,isUpdatePending:false};assert.equal(a.render(),null);a.flush();status={isUpdatePending:true,isRestarting:false};const tree=a.render();assert.match(text(tree),/Update klaar/);assert.match(text(tree),/Opnieuw starten/);assert.equal(find(tree,'Pressable').props.disabled,false);enabled=false;assert.equal(a.render(),null);}finally{enabled=true;a.destroy();}
});
test('restart applies the downloaded update immediately, once, without a confirmation',async()=>{
 const a=new Harness();reloads=0;alerts=0;status={isUpdatePending:true,isRestarting:false};reload=async()=>{reloads++;};
 try{const button=find(a.render(),'Pressable');button.props.onPress();button.props.onPress();await new Promise(setImmediate);assert.equal(reloads,1);assert.equal(alerts,0);assert.equal(find(a.render(),'Pressable').props.disabled,true);}finally{a.destroy();}
});
test('failed native reload keeps the notice and lets the user retry',async()=>{
 const a=new Harness();reloads=0;alerts=0;status={isUpdatePending:true,isRestarting:false};reload=async()=>{reloads++;throw Error('native reload failed');};
 try{find(a.render(),'Pressable').props.onPress();await new Promise(setImmediate);assert.equal(alerts,1);assert.equal(find(a.render(),'Pressable').props.disabled,false);find(a.render(),'Pressable').props.onPress();await new Promise(setImmediate);assert.equal(reloads,2);}finally{a.destroy();}
});
test('checks coalesce, download only available updates, and retry after five minutes',async()=>{
 let now=0,checks=0,downloads=0,finish;const poll=createUpdatePoller({enabled:true,busy:()=>false,pending:()=>false,now:()=>now,check:()=>{checks++;return new Promise(resolve=>{finish=resolve;});},download:async()=>{downloads++;}});
 const first=poll();await poll();assert.equal(checks,1);finish({isAvailable:true});await first;assert.equal(downloads,1);now=299999;await poll();assert.equal(checks,1);now=300000;const second=poll();finish({isAvailable:false});await second;assert.equal(checks,2);assert.equal(downloads,1);
});
test('pending updates, native startup work and disabled runtimes do not start extra downloads',async()=>{
 let calls=0;const options={enabled:true,busy:()=>false,pending:()=>false,check:async()=>{calls++;return {isAvailable:true};},download:async()=>{calls++;}};
 await createUpdatePoller({...options,enabled:false})();await createUpdatePoller({...options,busy:()=>true})();await createUpdatePoller({...options,pending:()=>true})();assert.equal(calls,0);
});
test('offline errors and failed downloads do not block a subsequent check',async()=>{
 let now=0,checks=0,downloads=0;const poll=createUpdatePoller({enabled:true,busy:()=>false,pending:()=>false,now:()=>now,check:async()=>{if(++checks===1)throw Error('offline');return {isAvailable:true};},download:async()=>{if(++downloads===1)throw Error('download interrupted');}});
 await poll();now=300000;await poll();now=600000;await poll();assert.equal(checks,3);assert.equal(downloads,2);
});
test.after(()=>{Module._load=load;if(ext)Module._extensions['.ts']=ext;else delete Module._extensions['.ts'];if(tsx)Module._extensions['.tsx']=tsx;else delete Module._extensions['.tsx'];});
