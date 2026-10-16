const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readPaperQuestion,createApp,readSubmitConfirmation}=require('../jsnu-course-assistant.user.js');
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function visible(node){return Object.assign(node,{isConnected:true,getClientRects:()=>[{}],ownerDocument:{defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})}}});}
function dom({index=1,total=2,next=true,kind='多选题',answered=[]}={}){
 const nextButton=visible({textContent:'下一题'}),submitButton=visible({textContent:'提 交'});
 const stem={textContent:`第${index}题：(${kind}) 测试题干`,querySelector:()=>({textContent:`(${kind})`})};
 const inputs=['A','B','C','D'].map(letter=>({value:letter,type:kind==='多选题'?'checkbox':'radio',closest:()=>({querySelector:selector=>selector==='.ml6'?{textContent:'选项'+letter}:null})}));
 const root=visible({querySelector(selector){return {'.can-scroll .stem':stem,'.remark':{textContent:`共${total}题。 倒计时：80:00`}}[selector]||null;},querySelectorAll(selector){
  if(selector==='.grid-con .index-num')return Array.from({length:total},(_,i)=>({querySelector:()=>answered.includes(i+1)?{}:null}));
  if(selector.includes('input[type='))return inputs;
  if(selector==='.custom-btn button')return next?[nextButton,submitButton]:[submitButton];return [];
 }});
 return {doc:{querySelectorAll:()=>[root]},root,nextButton,submitButton};
}
test('real questionList selectors read numbered stem, multiple choices and next action',()=>{
 const d=dom();const q=readPaperQuestion(d.doc);assert.equal(q.mode,'paper');assert.equal(q.index,1);assert.equal(q.total,2);assert.equal(q.title,'测试题干');assert.equal(q.type,'multiple');assert.equal(q.submit,d.nextButton);assert.equal(q.options[2].text,'选项C');
});
test('last question uses final submit only when numbering agrees',()=>{
 const d=dom({index:2,total:2,next:false,answered:[1]});const q=readPaperQuestion(d.doc);assert.equal(q.next,null);assert.equal(q.submit,d.submitButton);assert.deepEqual(q.unanswered,[2]);
 assert.match(readPaperQuestion(dom({index:1,total:2,next:false}).doc).error,/尚未到最后/);
 assert.match(readPaperQuestion(dom({index:2,total:2,next:true}).doc).error,/不一致/);
});
function controller({start=1,total=3,unansweredBefore=false,existing=[]}={}){
 let clock=0,active,requests=0,nexts=0,submits=0,confirms=0,confirmation=false;
 const root={};const selectedAnswers=new Map();
 function setQuestion(index){
  active={mode:'paper',root,key:'paper'+index,index,total,title:'题干'+index,type:'multiple',unanswered:[],options:['A','B','C'].map(letter=>({letter,text:letter,input:{checked:existing.includes(letter),disabled:false,click(){this.checked=true;}}}))};
  active.next=index<total?{disabled:false}:null;
  active.submit={disabled:false,click(){
   selectedAnswers.set(index,active.options.filter(o=>o.input.checked).map(o=>o.letter));
   if(index<total){nexts++;setQuestion(index+1);}else{submits++;confirmation=true;}
  }};
  if(unansweredBefore)active.unanswered=[1];
 }
 setQuestion(start);
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/questionList'},setInterval(){},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const doc={hidden:false};
 const app=createApp({window:win,document:doc,now:()=>clock,getToken:()=> 'TEST',readQuestion:()=>active,
  readSubmitConfirmation:()=>confirmation?{disabled:false,click(){confirms++;active=null;confirmation=false;}}:null,
  transport(q){requests++;return Promise.resolve({code:1,data:{question:q.title,answer:'AC'}});}}, {ui:false,fillDelayMs:1,submitTimeoutMs:1000});
 app.start();
 return {app,doc,selectedAnswers,step:async()=>{clock+=40;app.step();await flush();},stats:()=>({requests,nexts,submits,confirms}),setActive:v=>active=v};
}
test('complete paper advances one by one, then final submits and confirms exactly once',async()=>{
 const c=controller();for(let i=0;i<120;i++)await c.step();assert.deepEqual(c.stats(),{requests:3,nexts:2,submits:1,confirms:1});for(const chosen of c.selectedAnswers.values())assert.deepEqual(chosen,['A','C']);c.app.stop();
});
test('last question never submits with earlier unanswered questions',async()=>{
 const c=controller({start:3,unansweredBefore:true});for(let i=0;i<15;i++)await c.step();assert.equal(c.stats().submits,0);assert.match(c.app.getState().status,/仍有未答题/);c.app.stop();
});
test('preselected subset is preserved and completed before next action',async()=>{
 const c=controller({start:3,existing:['A']});for(let i=0;i<15;i++)await c.step();assert.deepEqual(c.selectedAnswers.get(3),['A','C']);assert.equal(c.stats().confirms,1);c.app.stop();
});
test('conflicting existing answer is not overwritten or submitted',async()=>{
 const c=controller({start:3,existing:['B']});for(let i=0;i<15;i++)await c.step();assert.equal(c.stats().submits,0);assert.match(c.app.getState().status,/已有选择/);c.app.stop();
});
test('submit confirmation reader only accepts explicit paper submission dialog',()=>{
 const button=visible({textContent:'确 定'});const root=visible({querySelector:s=>({textContent:s.includes('title')?'是否提交':'确认提交试卷?'}),querySelectorAll:()=>[button]});assert.equal(readSubmitConfirmation({querySelectorAll:()=>[root]}),button);
 root.querySelector=()=>({textContent:'其他确认'});assert.equal(readSubmitConfirmation({querySelectorAll:()=>[root]}),null);
});
