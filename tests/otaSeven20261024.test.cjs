const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
test('OTA preview 1.0.4: fresh fixes only and local 2 km walking',()=>{
 assert.match(read('lib/useWalkingPosition.ts'),/Date\.now\(\)-fix\.fixAt<300000/);
 assert.match(read('lib/leaveTime.ts'),/MAX_WALK_DISTANCE_METERS = 2000/);
 assert.match(read('lib/leaveTime.ts'),/margin<0\?"Niet haalbaar":margin<3\?"Krap":""/);
 assert.doesNotMatch(read('components/DepartureLine.tsx'),/· schatting/);
});
test('OTA preview 1.0.4: one joined status with delay right, search icon on board',()=>{
 const row=read('components/DepartureLine.tsx'),board=read('components/FlowBoard.tsx');
 assert.match(row,/note: \[note,walkText\]\.filter\(Boolean\)\.join\(" · "\)/);
 assert.match(row,/visibleDetail\?\.label/);
 assert.match(row,/clockDelay/);
 assert.match(board,/onPress=\{requestSearch\} accessibilityRole="button" accessibilityLabel="Zoek halte, lijn of plaats"/);
 assert.doesNotMatch(board,/style=\{\[styles\.searchBar,/);
});
test('OTA preview 1.0.4: stop switching never leaves prior board visible',()=>{
 const workspace=read('components/FlowWorkspace.tsx'),board=read('components/FlowBoard.tsx');
 assert.match(workspace,/pendingStopName \? \(/);
 assert.match(workspace,/styles\.pendingScreen/);
 assert.match(workspace,/key=\{screen\.stop\.id\}/);
 assert.match(workspace,/<DepartureSkeleton \/>/);
 assert.match(board,/\{stop\.name\}<\/Text>/);
});
test('OTA preview 1.0.4: compact expandable disruptions and timeline skeleton',()=>{
 const board=read('components/FlowBoard.tsx'),rit=read('app/rit/[id].tsx'),skel=read('components/JourneySkeleton.tsx');
 assert.match(board,/setNoticesExpanded\(v => !v\)/);
 assert.match(board,/tik voor meer/);
 assert.match(rit,/loading && !journey \? <JourneySkeleton \/>/);
 assert.match(skel,/styles\.track/);
 assert.match(skel,/styles\.dot/);
 assert.doesNotMatch(rit,/ActivityIndicator color=\{c\.green\}/);
});
