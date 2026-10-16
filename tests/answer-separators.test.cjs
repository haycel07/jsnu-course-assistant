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
