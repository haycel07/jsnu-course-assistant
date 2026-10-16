const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../jsnu-course-assistant.user.js');
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function setup({initial=[],answer='AC',type='multiple',asynchronous=false,close=true}={}){
 let clock=0,active,resolve,requests=0,submits=0;
 const clicks=[],submitted=[];
 const q={key:'q1',root:{},title:'当前题目',type,options:['A','B','C','D'].map(letter=>({letter,text:letter,input:{checked:initial.includes(letter),disabled:false,
  click(){clicks.push(letter);const before=q.options.filter(o=>o.input.checked).map(o=>o.letter);const expected=type==='multiple'?(before.includes(letter)?before.filter(x=>x!==letter):[...before,letter]):[letter];const render=()=>q.options.forEach(o=>o.input.checked=expected.includes(o.letter));if(asynchronous)Promise.resolve().then(render);else render();}
 }})),submit:{disabled:false,click(){submits++;submitted.push(q.options.filter(o=>o.input.checked).map(o=>o.letter));if(close)active=null;}}};active=q;
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/courseDetail'},setInterval(){},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const doc={hidden:false};
 const app=createApp({window:win,document:doc,now:()=>clock,getToken:()=> 'TEST',readQuestion:()=>active,
  transport(){requests++;return new Promise(r=>resolve=r);}}, {ui:false,fillDelayMs:1});app.start();
 return {app,q,doc,clicks,submitted,requests:()=>requests,submits:()=>submits,
  answer:async value=>{resolve({code:1,data:{question:q.title,answer:value??answer}});await flush();},
  step:async()=>{clock+=400;app.step();await flush();},newQuestion:()=>{q.key='q2';q.title='下一道题';active=q;},resolveReady:()=>!!resolve};
}
async function run(s,count=12){for(let i=0;i<count;i++)await s.step();}
test('existing complete selection still queries and submits without toggling correct choices',async()=>{
 const s=setup({initial:['A','B','C','D'],answer:'ABCD'});assert.equal(s.requests(),1);await s.answer();await run(s);assert.equal(s.submits(),1);assert.deepEqual(s.clicks,[]);assert.deepEqual(s.submitted,[['A','B','C','D']]);s.app.stop();
});
test('preselected subset is completed on video questions',async()=>{
 const s=setup({initial:['A']});await s.answer();await run(s);assert.deepEqual(s.clicks,['C']);assert.deepEqual(s.submitted,[['A','C']]);s.app.stop();
});
test('stale extra checkbox choices are removed while correct ones remain checked',async()=>{
 const s=setup({initial:['A','B','C','D'],asynchronous:true});await s.answer();await run(s);assert.deepEqual(s.clicks,['B','D']);assert.deepEqual(s.submitted,[['A','C']]);s.app.stop();
});
test('entirely stale selection is cleared and replaced across asynchronous renders',async()=>{
 const s=setup({initial:['A','D'],answer:'BC',asynchronous:true});await s.answer();await run(s);assert.deepEqual(s.clicks,['A','D','B','C']);assert.deepEqual(s.submitted,[['B','C']]);s.app.stop();
});
test('radio and judgement choices use native exclusive selection instead of checkbox toggles',async()=>{
 for(const type of ['single','judgement']){const s=setup({initial:['A'],answer:'B',type,asynchronous:true});await s.answer();await run(s);assert.deepEqual(s.clicks,['B']);assert.deepEqual(s.submitted,[['B']]);s.app.stop();}
});
test('website carrying prior checked values to next video question does not block lookup',async()=>{
 const s=setup({answer:'ABCD'});await s.answer();await run(s);assert.deepEqual(s.submitted,[['A','B','C','D']]);s.newQuestion();await s.step();assert.equal(s.requests(),2);await s.answer('AC');await run(s);assert.deepEqual(s.submitted,[['A','B','C','D'],['A','C']]);s.app.stop();
});
test('manual changes during lookup remain protected after allowing initial selections',async()=>{
 const s=setup({initial:['A']});s.q.options[1].input.checked=true;await s.answer();await run(s);assert.equal(s.submits(),0);assert.deepEqual(s.clicks,[]);assert.match(s.app.getState().status,/手动选择/);s.app.stop();
});
test('disabled extra checkbox cannot cause submission with incomplete reconciliation',async()=>{
 const s=setup({initial:['A','B','C']});await s.answer();s.q.options[1].input.disabled=true;await run(s,40);assert.equal(s.submits(),0);assert.deepEqual(s.clicks,[]);assert.match(s.app.getState().status,/未稳定/);s.app.stop();
});
