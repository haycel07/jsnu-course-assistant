const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readQuestion,resolveAnswer,createTransport,createApp}=require('../jsnu-course-assistant.user.js');
const question=(type='single')=>({title:'演示题：请选择合适的项。',type,options:[
 {letter:'A',text:'甲'},{letter:'B',text:'乙'},{letter:'C',text:'丙'},{letter:'D',text:'丁'}]});
const response=(q,answer,extra={})=>({code:1,data:{question:q.title,answer,...extra}});
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('real Ant Design two-Chinese-character button spacing must not hide the submit button',()=>{
 for(const label of ['提交','提 交',' 提\n交 ','提\u00a0交','提\u3000交']){
  const submit={textContent:label};
  const stem={textContent:'(判断题)示例题干',querySelector:()=>({textContent:'(判断题)'})};
  const rows=['A','B'].map((letter,i)=>({querySelector(selector){
   if(selector.includes('input['))return {type:'radio'};
   if(selector==='.letter')return {textContent:letter+':'};
   if(selector==='.option')return {textContent:i?'错误':'正确'};
   return null;
  }}));
  const root={isConnected:true,getClientRects:()=>[{}],ownerDocument:{defaultView:{getComputedStyle:()=>({visibility:'visible',display:'block'})}},
   querySelector(selector){return {'.ant-modal-title':{textContent:'视频习题'},'.sub-title':stem,'.submit-container button':submit}[selector]||null;},
   querySelectorAll:()=>rows};
  const doc={querySelectorAll:selector=>selector==='.exam-modal'?[]:[root],querySelector:()=>null};
  const result=readQuestion(doc);
  assert.equal(result.error,undefined,JSON.stringify(label));
  assert.equal(result.submit,submit);assert.equal(result.type,'judgement');assert.equal(result.title,'示例题干');
 }
});

test('single choice maps answer text to the current letter',()=>{const q=question();assert.deepEqual(resolveAnswer(q,response(q,'乙')).letters,['B']);});
test('multi choice supports text separators and letter strings',()=>{
 const q=question('multiple');for(const answer of ['甲###丙','A、C','AC','A C',['甲','丙']])assert.deepEqual(resolveAnswer(q,response(q,answer)).letters,['A','C']);
});
test('judgement maps true/false aliases to displayed option order',()=>{
 const q={...question('judgement'),options:[{letter:'A',text:'错误'},{letter:'B',text:'正确'}]};
 assert.deepEqual(resolveAnswer(q,response(q,true)).letters,['B']);assert.deepEqual(resolveAnswer(q,response(q,'错')).letters,['A']);
});
test('whole option text containing separators is matched before splitting',()=>{
 const q={...question(),options:[{letter:'A',text:'甲、乙'},{letter:'B',text:'丙'}]};assert.deepEqual(resolveAnswer(q,response(q,'甲、乙')).letters,['A']);
});
test('wrong returned question cannot be applied',()=>{const q=question();assert.throws(()=>resolveAnswer(q,{code:1,data:{question:'另一道题',answer:'A'}}),/题干/);});
test('code zero follows the configured non-answer branch',()=>{const q=question();assert.throws(()=>resolveAnswer(q,{code:0,data:{answer:'Token无效'}}),/未返回/);});
test('out of range, ambiguous text and multiple answers to a radio question are rejected',()=>{
 const q=question();for(const a of ['E','A#B','甲或乙',''])assert.throws(()=>resolveAnswer(q,response(q,a)));
 q.options[1].text='甲';assert.throws(()=>resolveAnswer(q,response(q,'甲')),/相同/);
});
test('AI provenance is retained without claiming answer correctness',()=>{const q=question();assert.equal(resolveAnswer(q,response(q,'A',{ai:true})).ai,true);});
test('malformed responses are rejected',()=>{const q=question();for(const r of [null,{}, {code:1,data:{question:q.title,answer:{x:1}}}])assert.throws(()=>resolveAnswer(q,r));});

test('GM transport serializes the supplied v2 contract over the fixed HTTPS endpoint',async()=>{
 let request;const q=question();const send=createTransport(details=>{request=details;return {abort(){}};});
 const promise=send(q,'DEMO_TEST_TOKEN');const body=JSON.parse(request.data);
 assert.equal(request.url,'https://tk.enncy.cn/query');assert.equal(request.method,'POST');
 assert.equal(request.headers['Content-Type'],'application/json');assert.equal(request.anonymous,true);
 assert.equal(body.type,'single');assert.equal(body.options,'甲\n乙\n丙\n丁');assert.equal(body.v,'2');assert.deepEqual(body.images,[]);
 assert.equal(body.suggestion_title,q.title);assert.equal(body.suggestion_options,body.options);
 request.onload({status:200,responseText:JSON.stringify(response(q,'B')),finalUrl:request.url});
 assert.equal((await promise).data.answer,'B');
});
test('GM HTTP errors, malformed JSON, and redirects to a different host fail',async()=>{
 for(const reply of [{status:403},{status:200,responseText:'oops'},{status:200,finalUrl:'https://other.invalid/',response:{code:1}}]){
  let request;const send=createTransport(d=>{request=d;return {abort(){}};});const p=send(question(),'TEST');
  request.onload(reply);await assert.rejects(p);
 }
});
test('GM request can be aborted and manually times out even if fetch ignores timeout',async()=>{
 let timeout,aborts=0;const send=createTransport(()=>({abort(){aborts++;}}),{setTimeout:fn=>(timeout=fn,1),clearTimeout(){}});
 let p=send(question(),'TEST');p.abort();await assert.rejects(p,/取消/);assert.equal(aborts,1);
 p=send(question(),'TEST');timeout();await assert.rejects(p,/超时/);assert.equal(aborts,2);
});

function setup(options={}){
 let clock=0,requests=0,submits=0,answerResolve,aborts=0,active,token=options.token??'DEMO_TEST_TOKEN';
 const root={};const q={...question(options.type||'single'),root,key:'q1'};
 q.options.forEach(o=>{o.input={checked:false,disabled:false,click(){if(q.type!=='multiple')q.options.forEach(x=>x.input.checked=false);this.checked=!this.checked;}};});
 q.submit={disabled:false,click(){submits++;if(options.closeOnSubmit)active=null;}};
 active=q;
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/courseDetail'},setInterval(){return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const doc={hidden:false};
 const app=createApp({window:win,document:doc,now:()=>clock,getToken:()=>token,readQuestion:()=>active,
  transport(){requests++;const p=new Promise(resolve=>{answerResolve=resolve;});p.abort=()=>{aborts++;};return p;}},
  {ui:false,fillDelayMs:10,submitTimeoutMs:100});
 app.start();
 return {app,win,doc,q,resolve:answer=>answerResolve(response(q,answer)),tick(ms=20){clock+=ms;app.step();},
 setActive:v=>{active=v;},setToken:v=>{token=v;},stats:()=>({requests,submits,aborts})};
}
test('controller detects once, fills, verifies, submits once and observes dialog closure',async()=>{
 const s=setup({closeOnSubmit:true});s.tick();s.resolve('B');await flush();s.tick();s.tick();s.tick();s.tick();
 assert.equal(s.q.options[1].input.checked,true);assert.equal(s.stats().requests,1);assert.equal(s.stats().submits,1);
 assert.match(s.app.getState().status,/弹窗已关闭/);
});
test('multiple-choice controller selects the full answer set',async()=>{
 const s=setup({type:'multiple'});s.resolve('A#C');await flush();s.tick();s.tick();s.tick();s.tick();s.tick();
 assert.deepEqual(s.q.options.filter(o=>o.input.checked).map(o=>o.letter),['A','C']);assert.equal(s.stats().submits,1);
});
test('late result after a question/lesson change is ignored',async()=>{
 const s=setup();s.setActive({...s.q,key:'new-lesson'});s.resolve('B');await flush();s.tick();s.tick();
 assert.equal(s.q.options.some(o=>o.input.checked),false);assert.equal(s.stats().submits,0);
});
test('manual choice made during lookup is preserved',async()=>{
 const s=setup();s.q.options[0].input.checked=true;s.resolve('B');await flush();s.tick();s.tick();s.tick();
 assert.equal(s.q.options[0].input.checked,true);assert.equal(s.q.options[1].input.checked,false);assert.equal(s.stats().submits,0);
});
test('manual changes after filling prevent automatic submission',async()=>{
 const s=setup();s.resolve('B');await flush();s.tick();s.tick();s.q.options[1].input.checked=false;s.q.options[0].input.checked=true;s.tick();assert.equal(s.stats().submits,0);
});
test('no token never sends a request',()=>{const s=setup({token:''});s.tick();assert.equal(s.stats().requests,0);assert.match(s.app.getState().status,/令牌/);});
test('disabled or hidden page does not apply a result',async()=>{
 const s=setup();s.doc.hidden=true;s.resolve('B');await flush();s.tick();s.tick();assert.equal(s.stats().submits,0);assert.equal(s.q.options.some(o=>o.input.checked),false);
});
test('a failed submission is not retried by the timer',async()=>{
 const s=setup();s.resolve('B');await flush();s.tick();s.tick();s.tick();s.tick(101);s.tick(200);
 assert.equal(s.stats().submits,1);assert.match(s.app.getState().status,/不会重复提交/);
});
test('a disabled submit button times out without clicking',async()=>{
 const s=setup();s.resolve('B');await flush();s.tick();s.tick();s.q.submit.disabled=true;s.tick(101);assert.equal(s.stats().submits,0);assert.match(s.app.getState().status,/未就绪/);
});
test('pause and stop invalidate in-flight requests',async()=>{
 const s=setup();s.app.setEnabled(false);s.resolve('B');await flush();s.tick();s.tick();s.tick();assert.equal(s.stats().submits,0);assert.equal(s.stats().aborts,1);
 s.app.stop();assert.equal(s.app.getState().running,false);
});
test('leaving the route cancels the old request',async()=>{
 const s=setup();s.win.location.pathname='/students/myCourse';s.tick();s.resolve('B');await flush();s.tick();s.tick();assert.equal(s.stats().submits,0);assert.equal(s.stats().aborts,1);
});
test('same question key on a replaced modal cannot receive an old result',async()=>{
 const s=setup();s.setActive({...s.q,root:{}});s.resolve('B');await flush();s.tick();s.tick();assert.equal(s.q.options.some(o=>o.input.checked),false);
});
