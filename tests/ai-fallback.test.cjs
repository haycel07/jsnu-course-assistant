const {test}=require('node:test');const assert=require('node:assert/strict');
const {createApp,createTransport,resolveAnswer}=require('../jsnu-course-assistant.user.js');
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function setup(){
 let now=0,active,submits=0;const requests=[];
 const q={key:'q',root:{},title:'当前题干',type:'multiple',options:['A','B','C'].map(letter=>({letter,text:'选项'+letter,input:{checked:false,disabled:false,click(){this.checked=true;}}})),submit:{disabled:false,click(){submits++;active=null;}}};active=q;
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/courseDetail'},setInterval(){},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const doc={hidden:false};
 const app=createApp({window:win,document:doc,now:()=>now,getToken:()=> 'TEST',readQuestion:()=>active,transport(question,token,options){let resolve,reject;const p=new Promise((a,b)=>{resolve=a;reject=b;});const r={options,resolve,reject,aborted:false};p.abort=()=>{r.aborted=true;reject(new Error('取消'));};requests.push(r);return p;}},{ui:false,fillDelayMs:1});
 app.start();
 return {app,q,doc,requests,submits:()=>submits,setActive:v=>active=v,tick:async()=>{now+=400;app.step();await flush();}};
}
const reply=(question,answer,ai=false)=>({code:1,data:{question,answer,ai}});
test('mismatched database result triggers official AI, then selects all returned answers',async()=>{
 const s=setup();assert.deepEqual(s.requests[0].options,{localOnly:true});s.requests[0].resolve(reply('别的题目','B'));await flush();assert.equal(s.requests.length,2);assert.deepEqual(s.requests[1].options,{localOnly:false});assert.equal(s.q.options.some(o=>o.input.checked),false);
 s.requests[1].resolve(reply('AI重述的题干','AC',true));await flush();for(let i=0;i<6;i++)await s.tick();assert.deepEqual(s.q.options.filter(o=>o.input.checked).map(o=>o.letter),['A','C']);assert.equal(s.submits(),1);s.app.stop();
});
test('exact database hit never invokes AI',async()=>{
 const s=setup();s.requests[0].resolve(reply(s.q.title,'AC'));await flush();for(let i=0;i<6;i++)await s.tick();assert.equal(s.requests.length,1);assert.equal(s.submits(),1);s.app.stop();
});
test('no database answer also invokes AI exactly once',async()=>{
 const s=setup();s.requests[0].resolve({code:0,data:{answer:'未命中'}});await flush();assert.equal(s.requests.length,2);s.requests[1].resolve(reply('AI','A',true));await flush();for(let i=0;i<5;i++)await s.tick();assert.equal(s.requests.length,2);assert.equal(s.submits(),1);s.app.stop();
});
test('non-AI fallback response is never treated as an AI answer',async()=>{
 const s=setup();s.requests[0].resolve(reply('不匹配','A'));await flush();s.requests[1].resolve(reply('不匹配','A',false));await flush();await s.tick();assert.equal(s.submits(),0);assert.match(s.app.getState().status,/未取得官方 AI/);assert.equal(s.requests.length,2);s.app.stop();
});
test('pause cancels AI request and late answer never writes back',async()=>{
 const s=setup();s.requests[0].resolve(reply('不匹配','A'));await flush();s.app.setEnabled(false);assert.equal(s.requests[1].aborted,true);s.requests[1].resolve(reply('AI','A',true));await flush();assert.equal(s.q.options.some(o=>o.input.checked),false);assert.equal(s.submits(),0);s.app.stop();
});
test('question change or manual selection prevents applying late AI answer',async()=>{
 for(const mode of ['change','manual','hidden']){const s=setup();s.requests[0].resolve(reply('不匹配','A'));await flush();if(mode==='change')s.setActive({...s.q,key:'other'});if(mode==='manual')s.q.options[1].input.checked=true;if(mode==='hidden')s.doc.hidden=true;s.requests[1].resolve(reply('AI','AC',true));await flush();assert.equal(s.q.options[0].input.checked,false);assert.equal(s.submits(),0);s.app.stop();}
});
test('AI mismatched stem acceptance requires both explicit AI context and actual AI flag',()=>{
 const s=setup();assert.throws(()=>resolveAnswer(s.q,reply('另一题','A',true)));assert.throws(()=>resolveAnswer(s.q,reply('另一题','A',false),{fromAI:true}));assert.deepEqual(resolveAnswer(s.q,reply('另一题','AC',true),{fromAI:true}).letters,['A','C']);s.app.stop();
});
test('transport serializes official local-only switch and allows longer AI timeout',async()=>{
 let details;const transport=createTransport(d=>(details=d,{abort(){}}));
 for(const localOnly of [true,false]){const p=transport({title:'测试',type:'single',options:[{text:'A'},{text:'B'}]},'TEST',{localOnly});assert.equal(JSON.parse(details.data).__local_only__,localOnly);assert.equal(details.timeout,localOnly?20000:120000);details.onload({status:200,response:{code:0}});await p;}
});
