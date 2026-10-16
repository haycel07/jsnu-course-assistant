
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp,createPanel,SPEEDS}=require('../jsnu-course-assistant.user.js');
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('controlled checkbox group preserves all answers across asynchronous rerenders',async()=>{
 let clock=0,active,submits=0,resolve,model=[];
 const inputs=new Map();
 const q={title:'多选演示',type:'multiple',root:{},key:'multi',options:['A','B','C','D'].map(letter=>{
  const input={checked:false,disabled:false,click(){
   const next=model.includes(letter)?model.filter(x=>x!==letter):[...model,letter];
   Promise.resolve().then(()=>{model=next;for(const [key,node]of inputs)node.checked=model.includes(key);});
  }};inputs.set(letter,input);return {letter,text:letter,input};
 }),submit:{disabled:false,click(){submits++;assert.deepEqual(model.sort(),['A','C','D']);active=null;}}};
 active=q;
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/courseDetail'},setInterval(){},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const app=createApp({window:win,document:{hidden:false},now:()=>clock,getToken:()=> 'TEST',readQuestion:()=>active,transport:()=>new Promise(r=>resolve=r)},{ui:false,fillDelayMs:1});
 app.start();resolve({code:1,data:{question:q.title,answer:'ACD'}});await flush();
 for(let i=0;i<8;i++){clock+=400;app.step();await flush();}
 assert.deepEqual(model.sort(),['A','C','D']);assert.equal(submits,1);app.stop();
});
test('cancel during sequential filling never clicks later options or submits',async()=>{
 let resolve,clock=0,clicks=0,submits=0;
 const q={title:'题干',type:'multiple',root:{},key:'q',options:['A','B'].map(letter=>({letter,text:letter,input:{checked:false,disabled:false,click(){clicks++;this.checked=true;}}})),submit:{click(){submits++;}}};
 const win={location:{hostname:'lsoetp.jsnu.edu.cn',pathname:'/students/courseDetail'},setInterval(){},clearInterval(){},addEventListener(){},removeEventListener(){}};
 const app=createApp({window:win,document:{hidden:false},now:()=>clock,getToken:()=> 'TEST',readQuestion:()=>q,transport:()=>new Promise(r=>resolve=r)},{ui:false});
 app.start();resolve({code:1,data:{question:q.title,answer:'AB'}});await flush();clock+=400;app.step();app.setEnabled(false);clock+=400;app.step();
 assert.equal(clicks,1);assert.equal(submits,0);app.stop();
});
function fakeDoc(){
 const all=[];const doc={createElement(tag){const e={tag,children:[],style:{},hidden:false,value:'',textContent:'',append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}},setAttribute(k,v){this[k]=v;},remove(){this.removed=true;},attachShadow(){this.shadowRoot=doc.createElement('shadow');return this.shadowRoot;}};all.push(e);return e;}};
 doc.body=doc.createElement('body');return {doc,all};
}
test('one top-left panel provides speed selection and hides token controls after saving',()=>{
 const {doc,all}=fakeDoc();let token='',speed=10,retries=0;
 createPanel({document:doc,getToken:()=>token,saveToken:v=>token=v,getSpeed:()=>speed,setSpeed:v=>speed=v,toggleVideo:()=>false,toggleAnswer:()=>false,retry:()=>retries++});
 assert.equal(doc.body.children.length,1);assert.match(doc.body.children[0].style.cssText,/left:16px;top:16px/);
 const input=all.find(e=>e.tag==='input'),save=all.find(e=>e.textContent==='保存令牌'),manage=all.find(e=>e.textContent==='收起令牌输入');
 assert.equal(input.parent.hidden,false);input.value='TEST';save.onclick();assert.equal(token,'TEST');assert.equal(input.value,'');assert.equal(input.parent.hidden,true);assert.equal(retries,1);
 manage.onclick();assert.equal(input.parent.hidden,false);
 const select=all.find(e=>e.tag==='select');assert.deepEqual(select.children.map(e=>Number(e.value)),SPEEDS);select.value='2';select.onchange();assert.equal(speed,2);
});
test('saved token is hidden on initial panel creation',()=>{
 const {doc,all}=fakeDoc();createPanel({document:doc,getToken:()=> 'TEST',getSpeed:()=>2});assert.equal(all.find(e=>e.tag==='input').parent.hidden,true);
});
