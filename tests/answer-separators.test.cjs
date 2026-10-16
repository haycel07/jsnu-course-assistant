const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveAnswer}=require('../jsnu-course-assistant.user.js');
const q={title:'请选择符合描述的项目。',type:'multiple',options:[
 {letter:'A',text:'第一项包含甲、乙，以及丙；其余内容保持完整。'},
 {letter:'B',text:'第二项包含丁、戊。'},
 {letter:'C',text:'第三项包含己；庚。'},
 {letter:'D',text:'第四项包含辛，壬。'}
]};
const reply=answer=>({code:1,data:{question:q.title,answer,ai:true}});
test('hash-separated full answer texts preserve internal enumeration and semicolons',()=>{
 for(const separator of ['#','###','####'])assert.deepEqual(resolveAnswer(q,reply(q.options.map(o=>o.text).join(separator))).letters,['A','B','C','D']);
});
test('double-pipe and newline formats preserve punctuation inside each full option',()=>{
 for(const separator of ['||','\n','\r\n'])assert.deepEqual(resolveAnswer(q,reply([q.options[0].text,q.options[2].text].join(separator))).letters,['A','C']);
});
test('hash-separated answers tolerate formatting newline inside an option',()=>{
 const raw=q.options[0].text.replace('以及','\n以及')+'#'+q.options[1].text;assert.deepEqual(resolveAnswer(q,reply(raw)).letters,['A','B']);
});
test('letter answers retain existing comma, whitespace and enumeration support',()=>{
 for(const raw of ['AC','A C','A,C','A，C','A、C','A；C','A;C','A#C'])assert.deepEqual(resolveAnswer(q,reply(raw)).letters,['A','C']);
});
test('ambiguous or altered option text remains rejected',()=>{
 assert.throws(()=>resolveAnswer(q,reply(q.options[0].text+'#不存在的选项')));
 assert.throws(()=>resolveAnswer({...q,type:'single'},reply('A#C')));
 const duplicated={...q,options:[q.options[0],{letter:'B',text:q.options[0].text}]};assert.throws(()=>resolveAnswer(duplicated,reply(q.options[0].text)),/相同/);
});

test('AI may omit sentence-final full stops from hash-separated full answer texts',()=>{
 const raw=q.options.map(o=>o.text.replace(/。$/,'')).join('#');assert.deepEqual(resolveAnswer(q,reply(raw)).letters,['A','B','C','D']);
});
test('full-width and ASCII final stops are compatible while exact text is preferred',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'同一正文。'},{letter:'B',text:'同一正文'}]};
 assert.deepEqual(resolveAnswer(question,reply('同一正文')).letters,['B']);
 const unique={...q,type:'single',options:[{letter:'A',text:'独特正文．'},{letter:'B',text:'其他内容。'}]};assert.deepEqual(resolveAnswer(unique,reply('独特正文.')).letters,['A']);
});
test('terminal punctuation compatibility rejects ambiguous options',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'重复正文。'},{letter:'B',text:'重复正文..'}]};assert.throws(()=>resolveAnswer(question,reply('重复正文')),/多个选项/);
});
test('decimal points, minus signs, internal punctuation and words are not discarded',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'数值1.0，且不低于-2。'},{letter:'B',text:'其他内容。'}]};
 for(const value of ['数值10，且不低于-2','数值1.0，且不低于2','数值1.0且不低于-2','数值1.0，且低于-2'])assert.throws(()=>resolveAnswer(question,reply(value)));
 assert.deepEqual(resolveAnswer(question,reply('数值1.0，且不低于-2')).letters,['A']);
});
test('letter answer punctuation is not reinterpreted as another option literal',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'其他'},{letter:'B',text:'目标'},{letter:'C',text:'B'}]};assert.deepEqual(resolveAnswer(question,reply('B.')).letters,['B']);
});

test('terminal semicolons from the reported emergency-equipment question may be omitted',()=>{
 const question={title:'实验室必备应急装备包括（）。',type:'multiple',options:[
 {letter:'A',text:'急救箱；'},{letter:'B',text:'灭火器和灭火毯；'},
 {letter:'C',text:'防毒面具与消毒设备；'},{letter:'D',text:'常备工具如锤子、斧子、扳手等；'}]};
 const data={code:1,data:{question:question.title,answer:question.options.map(o=>o.text.slice(0,-1)).join('#'),ai:true}};
 assert.deepEqual(resolveAnswer(question,data).letters,['A','B','C','D']);
});
test('terminal prose punctuation and decorative symbols may vary on either side',()=>{
 for(const suffix of ['；',';',',','，','、',':','：','!','！','?','？','…','·','•','★','☆','※','✅','✔️','？！；★']) {
  const question={...q,type:'single',options:[{letter:'A',text:'完整正文'+suffix},{letter:'B',text:'另外正文'}]};
  assert.deepEqual(resolveAnswer(question,reply('完整正文')).letters,['A']);
  assert.deepEqual(resolveAnswer({...question,options:[{letter:'A',text:'完整正文'},{letter:'B',text:'另外正文'}]},reply('完整正文'+suffix)).letters,['A']);
 }
});
test('meaningful terminal units, math symbols and bracket content remain significant',()=>{
 for(const suffix of ['%','℃','°','‰','+','-','−','=','≤','/','_','(甲)','（甲）']) {
  const question={...q,type:'single',options:[{letter:'A',text:'正文'+suffix},{letter:'B',text:'另外正文'}]};
  assert.throws(()=>resolveAnswer(question,reply('正文')));
 }
});
test('decorative terminal compatibility rejects collisions and keeps exact preference',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'正文；'},{letter:'B',text:'正文★'}]};
 assert.throws(()=>resolveAnswer(question,reply('正文')),/多个选项/);
 assert.deepEqual(resolveAnswer(question,reply('正文★')).letters,['B']);
});
test('internal special symbols and enumeration punctuation remain significant',()=>{
 const question={...q,type:'single',options:[{letter:'A',text:'锤子、斧子；以及★工具；'},{letter:'B',text:'另外正文'}]};
 assert.throws(()=>resolveAnswer(question,reply('锤子斧子以及工具')));
 assert.deepEqual(resolveAnswer(question,reply('锤子、斧子；以及★工具')).letters,['A']);
});
