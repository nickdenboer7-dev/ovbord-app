const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
const before=Module._extensions['.ts'];
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {nearbyDistance,nearbyCountText}=require('../lib/nearbyPresentation.ts');
if(before)Module._extensions['.ts']=before;else delete Module._extensions['.ts'];
test('nearby distances use metres below a kilometre and a decimal comma above it',()=>{
 assert.equal(nearbyDistance(165),'165 m');assert.equal(nearbyDistance(0),'0 m');assert.equal(nearbyDistance(999),'999 m');
 assert.equal(nearbyDistance(1000),'1,0 km');assert.equal(nearbyDistance(1250),'1,3 km');
 assert.equal(nearbyDistance(undefined,4),'4 min lopen');assert.equal(nearbyDistance(NaN),'Afstand onbekend');
});
test('nearby count text reports the actual rendered number and correct singular/plural',()=>{
 assert.equal(nearbyCountText(1),'1 halte in deze omgeving');assert.equal(nearbyCountText(7),'7 haltes in deze omgeving');
 assert.equal(nearbyCountText(0),'0 haltes in deze omgeving');
});
