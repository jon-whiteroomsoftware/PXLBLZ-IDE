const fs=require('fs');const vm=require('vm');const assert=require('assert/strict');
const p=require('path').resolve(__dirname,'../docs/plans/agent-drawer-prototype.html');
const html=fs.readFileSync(p,'utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
const start=script.indexOf('const AgentModel');const end=script.indexOf('/* ═',start+1);
const model=vm.runInNewContext(script.slice(start,end)+'\nAgentModel');
const sceneStart=script.indexOf('const SCEN =');const sceneEnd=script.indexOf('let sc=null',sceneStart);
const scenes=vm.runInNewContext(script.slice(sceneStart,sceneEnd)+'\nSCEN');
const reduce=(s,a)=>model.reduce(s,a);const step=(s,t,extra={})=>reduce(s,{type:t,...extra});
const setup=kind=>step(step(model.initial(),'drawer',{mode:'open'}),kind==='builtin'?'chooseBuiltin':'agentBinds');
const applied=kind=>step(step(setup(kind),'beginEdit',{edit:'tighten'}),'commit');
let s=step(applied('builtin'),'saveFailed');const failed=s.stream.find(l=>l.state==='failed');const rev=s.revision;
let dismissed=step(s,'dismiss',{op:failed.op});assert.equal(dismissed.stream.find(l=>l.op===failed.op).state,'failed');assert.equal(dismissed.save,'failed');assert.equal(dismissed.revision,rev);
s=step(s,'manualEdit',{clip:'cme2'});const clips=JSON.stringify(s.clips);s=step(s,'retry',{op:failed.op});assert.equal(JSON.stringify(s.clips),clips);assert.equal(s.plannedRevision,s.revision);assert.notEqual(s.request.id,failed.op);assert.equal(s.request.retryOf,failed.op);assert.equal(s.stream.find(l=>l.op===failed.op).state,'failed');s=step(s,'commit');assert.equal(s.save,'saving');
let ext=step(applied('external'),'saveFailed');assert.equal(JSON.stringify(step(ext,'retry')),JSON.stringify(ext));
s=step(setup('external'),'beginEdit',{edit:'tighten'});const request=JSON.stringify(s.request);s=step(s,'drop');assert.equal(JSON.stringify(s.request),request);s=step(s,'reattach');assert.equal(JSON.stringify(s.request),request);
s=step(applied('external'),'drop');s=step(s,'saved');const saved=JSON.stringify(s.stream.find(l=>l.kind==='act'));s=step(s,'reattach');assert.equal(JSON.stringify(s.stream.find(l=>l.kind==='act')),saved);assert.equal(s.writes,1);assert.equal(s.history.length,1);
const wait=()=>step(step(step(setup('external'),'beginEdit',{edit:'balance'}),'gestureStart',{clip:'cme2'}),'commit');
assert.equal(step(wait(),'gestureCancel').save,'saving');assert.equal(step(wait(),'gestureEnd').stream.find(l=>l.kind==='act').state,'refused');
s=step(setup('external'),'drawer',{mode:'tucked'});s=step(s,'reading');s=step(s,'beginEdit',{edit:'tighten'});assert.equal(s.unread,0);s=step(s,'commit');assert.equal(s.unread,1);s=step(s,'drawer',{mode:'open'});s=step(s,'drawer',{mode:'tucked'});s=step(s,'saveFailed');assert.equal(s.unread,1);
const failures=[];
function check(name, fn){try { fn(); console.log('PASS: '+name); } catch(error){failures.push(name);console.error('FAIL: '+name+' — '+error.message);}}
for(const kind of ['manualEdit','gestureEnd']) check('save failure after '+kind+' preserves newer document/history',()=>{
  let state=applied('external');const op=state.stream.find(l=>l.kind==='act').op;
  if(kind==='gestureEnd') state=step(state,'gestureStart',{clip:'cme2'});
  state=step(state,kind,{clip:'cme2'});
  const before={clips:JSON.stringify(state.clips),history:JSON.stringify(state.history),revision:state.revision};
  state=step(state,'saveFailed');
  assert.equal(JSON.stringify(state.clips),before.clips);assert.equal(JSON.stringify(state.history),before.history);assert.equal(state.revision,before.revision);
  assert.equal(state.stream.find(l=>l.op===op).state,'superseded');assert.equal(state.save,'saving');
});
for(const kind of ['disconnect','forget','outcomeUnknown']) check(kind+' with no pending operation leaves previous stream outcomes unchanged',()=>{
  let state=step(applied('external'),'saved');state=step(state,'drawer',{mode:'tucked'});
  const previous=JSON.stringify(state.stream);const count=state.stream.length;
  state=step(state,kind);assert.equal(JSON.stringify(state.stream.slice(0,count)),previous);assert.equal(state.unread,0);
});
check('tucked refusal dot is red',()=>{
  let state=step(setup('external'),'beginEdit',{edit:'nudge'});state=step(state,'manualEdit',{clip:'cme2'});state=step(state,'commit');state=step(state,'drawer',{mode:'tucked'});
  const code=script.slice(script.indexOf('function edgeState(){'),script.indexOf('function renderEdge(){'));
  const edge=vm.runInNewContext(code+'\nedgeState()',{S:state});assert.equal(edge.dot,'bad');
});
check('manual Undo restores the previous clip record',()=>{
  let state=setup('builtin');const before=JSON.stringify(state.clips);state=step(state,'manualEdit',{clip:'cme2'});state=step(state,'undo');assert.equal(JSON.stringify(state.clips),before);
});
if(failures.length){console.error(failures.length+' corrective checks failed');process.exitCode=1;}
for(const scenario of scenes){s=model.initial();for(const [,actions] of scenario.steps)for(const action of Array.isArray(actions)?actions:[actions])s=reduce(s,action);console.log(scenario.n+': '+(s.stream.filter(l=>l.kind==='act').map(l=>l.state).join(', ')||'no edit'));}
if(!failures.length) console.log('PASS: syntax, retry/dismiss, external no-dispatch, lost-contact identity/save, gesture branches, unread outcomes, '+scenes.length+' scripted walkthroughs. Pure-model evidence only; no browser or production qualification.');
