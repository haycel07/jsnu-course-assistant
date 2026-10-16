const { test } = require('node:test');
const assert = require('node:assert/strict');
const create = require('../jsnu-course-assistant.user.js').createNextVideo;

test('selected playback speed applies immediately and survives same-element source resets', () => {
  let rate = 2;
  const s = setup({ getSpeed: () => rate });
  assert.equal(s.media.playbackRate, 2);
  assert.equal(s.media.defaultPlaybackRate, 2);
  rate = 1.25; s.tick();
  assert.equal(s.media.playbackRate, 1.25);
  s.loaded(); s.media.playbackRate = 1; s.media.defaultPlaybackRate = 1; s.tick();
  assert.equal(s.media.playbackRate, 1.25);
  assert.equal(s.media.defaultPlaybackRate, 1.25);
  s.app.stop();
});

function setup(options = {}) {
  let clock = 0;
  const handlers = new Map();
  const inputHandlers = new Map();
  const calls = [];
  const media = {
    parentElement: null, src: 'a.mp4', currentSrc: 'a.mp4', currentTime: 0, duration: 10,
    ended: false, readyState: 4, plays: 0,
    getAttribute() { return this.src; },
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
    play() { this.plays++; return options.play ? options.play() : Promise.resolve(); }
  };
  const vm = {
    $refs: { videoPlayer: media }, model: { id: '1818526985578524674', questionRelaList: [] }, graphId: '2011971101319618562',
    showModal: false,
    treeData: [{ key: 'folder', children: [
      { key: '1818526985578524674', label: '1' },
      { key: '1818526985578524675', label: 1 }
    ] }],
    onSelect(keys, event) { calls.push({ keys, event }); }
  };
  media.parentElement = { __vue__: vm, parentElement: null };
  const win = {
    location: { hostname: 'lsoetp.jsnu.edu.cn', pathname: '/students/courseDetail' },
    timers: 0, setInterval() { this.timers++; return 1; }, clearInterval() { this.timers--; },
    addEventListener() {}, removeEventListener() {}
  };
  const doc = { hidden: false, querySelector: () => media,
    addEventListener(type,fn){inputHandlers.set(type,fn);},
    removeEventListener(type,fn){if(inputHandlers.get(type)===fn)inputHandlers.delete(type);}};
  const app = create({ window: win, document: doc, now: () => clock, getSpeed: options.getSpeed },
    { ui: false, graceMs: 100, loadTimeoutMs: 500 });
  app.start();
  function end(trusted = true) {
    media.ended = true; media.currentTime = 10;
    handlers.get('ended')?.({ target: media, isTrusted: trusted });
  }
  function tick(ms = 100) { clock += ms; app.step(); }
  function loaded(id = '1818526985578524675') {
    vm.model.id = id; vm.model.questionRelaList = []; media.src = 'b.mp4'; media.currentSrc = 'b.mp4';
    media.ended = false; media.currentTime = 0;
  }
  return { media, vm, doc, win, app, calls, handlers, inputHandlers, end, tick, loaded };
}

test('natural end selects next via the native contract exactly once, retaining long string IDs', async () => {
  const s = setup(); s.end(); s.end(); s.tick(); s.tick();
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.calls[0], { keys: ['1818526985578524675'],
    event: { node: { label: 1, eventKey: '1818526985578524675' } } });
  s.loaded(); s.tick(); await Promise.resolve();
  assert.equal(s.media.plays, 1);
  assert.match(s.app.getState().status, /开始播放/);
  s.end(); s.tick();
  assert.equal(s.calls.length, 1);
  assert.match(s.app.getState().status, /最后/);
});
test('synthetic ended events do not switch', () => {
  const s = setup(); s.end(false); s.tick(); assert.equal(s.calls.length, 0);
});
test('an ended event without actual end position is ignored', () => {
  const s = setup(); s.media.ended = true; s.media.currentTime = 2;
  s.handlers.get('ended')({ target: s.media, isTrusted: true }); s.tick();
  assert.equal(s.calls.length, 0);
});
test('quiz dialog prevents navigation', () => {
  const s = setup(); s.vm.showModal = true; s.end(); s.tick();
  assert.equal(s.calls.length, 0); assert.match(s.app.getState().status, /习题/);
});
test('missing Vue owner fails visibly without selecting', () => {
  const s = setup(); s.media.parentElement = null; s.end(); s.tick();
  assert.equal(s.calls.length, 0); assert.match(s.app.getState().status, /结构不兼容/);
});
test('URL initial ID is not used after same-page course selection', () => {
  const s = setup(); s.vm.model.id = '1818526985578524675'; s.end(); s.tick();
  assert.equal(s.calls.length, 0); assert.match(s.app.getState().status, /最后/);
});
test('manual course change during grace cancels navigation', () => {
  const s = setup(); s.end(); s.loaded(); s.tick(); assert.equal(s.calls.length, 0);
});
test('duplicate target IDs and unknown current course do not navigate', () => {
  const s = setup(); s.vm.treeData[0].children.push({key:'1818526985578524675',label:1});
  s.end(); s.tick(); assert.equal(s.calls.length, 0);
  s.vm.model.id = 'unknown'; s.end(); s.tick(); assert.equal(s.calls.length, 0);
});
test('loading timeout does not issue another selection', () => {
  const s = setup(); s.end(); s.tick(); s.tick(600); s.tick(600);
  assert.equal(s.calls.length, 1); assert.match(s.app.getState().status, /超时/);
});
test('autoplay rejection requests a manual click and does not loop', async () => {
  const s = setup({ play: () => Promise.reject(new Error('NotAllowedError')) });
  s.end(); s.tick(); s.loaded(); s.tick(); await Promise.resolve(); s.tick();
  assert.equal(s.media.plays, 1); assert.equal(s.calls.length, 1);
  assert.match(s.app.getState().status, /手动点击播放/);
});
test('background page waits until visible before selecting', () => {
  const s = setup(); s.doc.hidden = true; s.end(); s.tick();
  assert.equal(s.calls.length, 0); s.doc.hidden = false; s.tick(); assert.equal(s.calls.length, 1);
});
test('route leave clears listeners and pending navigation; reentry rebinds once', () => {
  const s = setup(); s.end(); s.win.location.pathname = '/students/myCourse'; s.tick();
  assert.equal(s.handlers.size, 0); assert.equal(s.calls.length, 0);
  s.win.location.pathname = '/students/courseDetail'; s.tick();
  assert.equal(s.handlers.size, 3); s.end(); s.tick(); assert.equal(s.calls.length, 1);
});
test('other hosts are not activated', () => {
  const s = setup(); s.win.location.hostname = 'example.com'; s.tick();
  assert.equal(s.handlers.size, 0); s.end(); s.tick(); assert.equal(s.calls.length, 0);
});
test('stop releases timers and handlers even during a pending switch', () => {
  const s = setup(); s.end(); s.app.stop(); s.tick();
  assert.equal(s.win.timers, 0); assert.equal(s.handlers.size, 0); assert.equal(s.calls.length, 0);
});
test('same video element reused with another source is cancelled during grace', () => {
  const s = setup(); s.end(); s.media.src = 'other.mp4'; s.tick(); assert.equal(s.calls.length, 0);
});
test('a late play promise cannot update a different manually selected course', async () => {
  let resolvePlay;
  const s = setup({play: () => new Promise(resolve => { resolvePlay = resolve; })});
  s.end(); s.tick(); s.loaded(); s.tick();
  s.vm.model.id = 'manual'; s.media.src = 'manual.mp4'; s.tick();
  resolvePlay(); await Promise.resolve();
  assert.match(s.app.getState().status, /课程已变化/);
  assert.equal(s.app.getState().phase, null);
});
test('media readiness alone does not start playback before the next question list arrives', async () => {
  const s = setup(); s.end(); s.tick();
  const previousQuestions = s.vm.model.questionRelaList;
  s.loaded(); s.vm.model.questionRelaList = previousQuestions; s.tick();
  assert.equal(s.media.plays, 0);
  s.vm.model.questionRelaList = []; s.tick(); await Promise.resolve();
  assert.equal(s.media.plays, 1);
});


function playbackStarted(s){s.media.paused=false;s.handlers.get('playing')({target:s.media});}
function playbackPaused(s){s.media.paused=true;s.handlers.get('pause')({target:s.media});}
const settled=async()=>{await Promise.resolve();await Promise.resolve();};
test('non-user pause of previously playing video resumes once after grace',async()=>{
 const s=setup();playbackStarted(s);playbackPaused(s);s.tick(1000);assert.equal(s.media.plays,0);
 s.media.play=()=>{s.media.plays++;s.media.paused=false;return Promise.resolve();};s.tick(600);await settled();
 assert.equal(s.media.plays,1);assert.match(s.app.getState().status,/已恢复播放/);s.tick(5000);assert.equal(s.media.plays,1);s.app.stop();
});
test('trusted pointer pause remains paused until a later manual play',async()=>{
 const s=setup();playbackStarted(s);s.inputHandlers.get('pointerdown')({type:'pointerdown',isTrusted:true,target:s.media});playbackPaused(s);s.tick(5000);assert.equal(s.media.plays,0);
 playbackStarted(s);playbackPaused(s);s.media.play=()=>{s.media.plays++;s.media.paused=false;return Promise.resolve();};s.tick(1600);await settled();assert.equal(s.media.plays,1);s.app.stop();
});
test('keyboard pause and media pause keys are preserved',()=>{
 for(const key of [' ','k','Enter','MediaPlayPause','MediaPause']){const s=setup();playbackStarted(s);s.inputHandlers.get('keydown')({type:'keydown',key,isTrusted:true,target:{tagName:'VIDEO'}});playbackPaused(s);s.tick(5000);assert.equal(s.media.plays,0);s.app.stop();}
});
test('typing and untrusted input do not masquerade as manual media pause',async()=>{
 for(const input of [{type:'keydown',key:' ',isTrusted:true,target:{tagName:'INPUT'}},{type:'pointerdown',isTrusted:false}]){const s=setup();playbackStarted(s);s.inputHandlers.get(input.type)({...input,target:input.target||s.media});playbackPaused(s);s.media.play=()=>{s.media.plays++;s.media.paused=false;return Promise.resolve();};s.tick(1600);await settled();assert.equal(s.media.plays,1);s.app.stop();}
});
test('quiz and hidden page defer recovery until both blockers clear',async()=>{
 const s=setup();playbackStarted(s);playbackPaused(s);s.vm.showModal=true;s.tick(2000);assert.equal(s.media.plays,0);s.vm.showModal=false;s.doc.hidden=true;s.tick(2000);assert.equal(s.media.plays,0);
 s.doc.hidden=false;s.media.play=()=>{s.media.plays++;s.media.paused=false;return Promise.resolve();};s.tick();await settled();assert.equal(s.media.plays,1);s.app.stop();
});
test('initially paused, ended, seeking, errored and disabled video are not resumed',()=>{
 for(const mode of ['initial','ended','seeking','error','disabled','loading']){const s=setup();if(mode!=='initial')playbackStarted(s);playbackPaused(s);if(mode==='ended')s.media.ended=true;if(mode==='seeking')s.media.seeking=true;if(mode==='error')s.media.error={};if(mode==='disabled')s.app.setEnabled(false);if(mode==='loading')s.media.readyState=1;s.tick(5000);assert.equal(s.media.plays,0);s.app.stop();}
});
test('resume rejection does not loop and stop removes input listeners',async()=>{
 const s=setup({play:()=>Promise.reject(new Error('blocked'))});playbackStarted(s);playbackPaused(s);s.tick(1600);await settled();s.tick(5000);assert.equal(s.media.plays,1);assert.match(s.app.getState().status,/手动点击播放/);s.app.stop();assert.equal(s.inputHandlers.size,0);assert.equal(s.handlers.size,0);
});
test('same-element source replacement cancels old recovery and late promise status',async()=>{
 let finish;const s=setup({play:()=>new Promise(resolve=>finish=resolve)});playbackStarted(s);playbackPaused(s);s.tick(1600);assert.equal(s.media.plays,1);s.loaded();s.tick(2000);const status=s.app.getState().status;finish();await settled();assert.equal(s.app.getState().status,status);assert.equal(s.media.plays,1);s.app.stop();
});
