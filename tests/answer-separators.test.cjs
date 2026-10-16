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
