// ==UserScript==
// @name         江苏师大实验室课程：言溪题库自动答题 + 视频自动下一节
// @namespace    local.jsnu.question-bank
// @version      1.5.5
// @description  左上角统一面板，可选倍速、视频习题与题库试卷逐题作答、末题提交。
// @match        http://lsoetp.jsnu.edu.cn/students/*
// @match        https://lsoetp.jsnu.edu.cn/students/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      tk.enncy.cn
// @noframes
// @run-at       document-idle
// ==/UserScript==
(function () {
  'use strict';
function createNextVideo(env, options) {
  'use strict';
  options = options || {};
  const win = env.window;
  const doc = env.document;
  const now = env.now || Date.now;
  const config = { pollMs: 400, graceMs: 1500, loadTimeoutMs: 15000, ui: true, ...options };
  let running = false;
  let enabled = true;
  let interval = null;
  let video = null;
  let job = null;
  let status = '';
  let host = null;
  let label = null;
  let toggle = null;

  function inCourse() {
    return win.location.hostname === 'lsoetp.jsnu.edu.cn' &&
      win.location.pathname.replace(/\/$/, '') === '/students/courseDetail';
  }

  function source(media) {
    // The src attribute changes before currentSrc during a Vue render.
    return media?.getAttribute('src') || media?.currentSrc || '';
  }

  function owner(media) {
    for (let el = media, depth = 0; el && depth < 16; el = el.parentElement, depth++) {
      let vm = el.__vue__;
      for (let level = 0; vm && level < 12; vm = vm.$parent, level++) {
        if (vm.$refs?.videoPlayer === media && Array.isArray(vm.treeData) &&
            vm.model?.id != null && vm.graphId != null && typeof vm.onSelect === 'function') {
          return vm;
        }
      }
    }
    return null;
  }

  function leaves(nodes, result = []) {
    for (const item of nodes) {
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item.children) && item.children.length) leaves(item.children, result);
      else if (String(item.label) === '1' && item.key != null) result.push(item);
    }
    return result;
  }

  function identity(vm, media) {
    return JSON.stringify([String(vm.graphId), String(vm.model.id), source(media)]);
  }

  function setStatus(text) {
    status = text;
    if (label) label.textContent = '自动下一节：' + text;
    env.onStatus?.(text);
  }

  function mountPanel() {}

  function fail(message) {
    job = null;
    setStatus(message);
  }

  function ended(event) {
    if (!enabled || job || !inCourse() || event.target !== video || event.isTrusted !== true) return;
    if (!video.ended || !Number.isFinite(video.duration) || video.duration <= 0 ||
        video.currentTime < video.duration - 0.25) return;
    const vm = owner(video);
    if (!vm) return fail('页面结构不兼容，请手动切换');
    job = { phase: 'grace', media: video, vm, identity: identity(vm, video),
      oldId: String(vm.model.id), oldSrc: source(video), graphId: String(vm.graphId),
      readyAt: now() + config.graceMs };
    setStatus('本节已结束，等待页面处理后切换');
  }

  function unbind() {
    video?.removeEventListener('ended', ended);
    video = null;
    job = null;
  }

  function step() {
    if (!running) return;
    env.onVisibility?.(inCourse());
    if (!inCourse()) {
      unbind();
      if (host) host.style.display = 'none';
      return;
    }
    mountPanel();
    if (host) host.style.display = '';
    const current = doc.querySelector('.right video');
    if (current !== video) {
      unbind();
      video = current;
      video?.addEventListener('ended', ended);
      setStatus(video ? '等待视频自然结束' : '等待课程视频加载');
    }
    // Reapply after media loads or a same-element source change.
    // Leave seeking, course progress and quiz handling to the website.
    if (video) {
      try {
        const rate = Number(env.getSpeed?.() ?? 10);
        if (video.defaultPlaybackRate !== rate) video.defaultPlaybackRate = rate;
        if (video.playbackRate !== rate) video.playbackRate = rate;
      } catch (_) {
        setStatus('浏览器未能设置所选倍速，请手动检查');
      }
    }
    if (!enabled || !job) return;
    const task = job;
    const vm = owner(video);
    if (video !== task.media || vm !== task.vm || String(vm?.graphId) !== task.graphId) {
      return fail('课程页面已变化，等待当前视频自然结束');
    }
    if (task.phase === 'grace') {
      if (identity(vm, video) !== task.identity || !video.ended) {
        return fail('当前课程已变化，等待视频自然结束');
      }
      if (vm.showModal !== false) return fail('请先手动完成视频习题');
      if (doc.hidden) return setStatus('本节已结束，返回此页面后切换');
      if (now() < task.readyAt) return;
      const items = leaves(vm.treeData);
      const index = items.findIndex(item => String(item.key) === task.oldId);
      if (index < 0 || items.filter(item => String(item.key) === task.oldId).length !== 1) {
        return fail('无法确定当前课程位置，请手动切换');
      }
      const next = items[index + 1];
      if (!next) return fail('已到最后一个视频');
      if (String(next.key) === task.oldId ||
          items.filter(item => String(item.key) === String(next.key)).length !== 1) {
        return fail('课程编号重复，请手动切换');
      }
      task.phase = 'loading';
      task.nextId = String(next.key);
      task.oldQuestions = vm.model.questionRelaList;
      task.deadline = now() + config.loadTimeoutMs;
      setStatus('正在切换到下一节');
      // Use the exact onSelect contract observed in the shipped courseDetail bundle.
      // The website retains its own membership checks, resource loading and requests.
      try {
        const result = vm.onSelect([next.key], { node: { label: next.label, eventKey: next.key } });
        if (result?.catch) result.catch(() => { if (job === task) fail('网站切换失败，请手动选择下一节'); });
      } catch (_) {
        fail('网站切换失败，请手动选择下一节');
      }
      return;
    }
    if (task.phase === 'loading') {
      const id = String(vm.model.id);
      if (id !== task.oldId && id !== task.nextId) return fail('检测到手动换课，已取消自动切换');
      if (now() >= task.deadline) return fail('下一节加载超时，请手动检查；不会重复切换');
      if (id !== task.nextId || source(video) === task.oldSrc || video.readyState < 2 || video.ended) return;
      // onSelect loads the new media and question list in independent requests.
      // Starting before both complete could leave the previous lesson's questions active.
      if (!Array.isArray(vm.model.questionRelaList) || vm.model.questionRelaList === task.oldQuestions) return;
      if (vm.showModal !== false) return fail('下一节存在习题，请手动处理');
      if (doc.hidden) return setStatus('已切换，返回此页面后开始播放');
      task.phase = 'playing';
      const selectedSource = source(video);
      task.playSrc = selectedSource;
      const target = video;
      const stillSelected = () => running && job === task && inCourse() && video === target &&
        owner(target) === vm && String(vm.model.id) === task.nextId && source(target) === selectedSource;
      // One attempt only; do not retry around browser autoplay restrictions.
      try {
        Promise.resolve(target.play()).then(() => {
          if (stillSelected()) fail('已切换并开始播放，等待本节结束');
        }, () => {
          if (stillSelected()) fail('已切换；浏览器要求你手动点击播放');
        });
      } catch (_) {
        if (stillSelected()) fail('已切换，请手动点击播放');
      }
    }
    if (task.phase === 'playing') {
      if (String(vm.model.id) !== task.nextId || source(video) !== task.playSrc) {
        return fail('当前课程已变化，等待视频自然结束');
      }
      if (now() >= task.deadline) fail('已切换；播放尚未就绪，请手动点击播放');
    }
  }

  function start() {
    if (running) return;
    running = true;
    win.addEventListener('pagehide', stop);
    interval = win.setInterval(step, config.pollMs);
    step();
  }

  function stop() {
    running = false;
    win.clearInterval(interval);
    interval = null;
    win.removeEventListener('pagehide', stop);
    unbind();
    host?.remove();
    host = label = toggle = null;
  }

  function setEnabled(value) {
    enabled = !!value; job = null;
    setStatus(enabled ? '已启用，等待视频自然结束' : '已暂停');
  }
  return { start, stop, step, setEnabled, getState: () => ({ running, enabled, phase: job?.phase || null, status }) };
}
  const questionApi=(function(){
  const endpoint = 'https://tk.enncy.cn/query';
  const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
  const text = el => (el?.textContent || '').trim();
  const targetPage = win => win.location.hostname === 'lsoetp.jsnu.edu.cn' &&
    ['/students/courseDetail','/students/questionList'].includes(win.location.pathname.replace(/\/$/, ''));

  function visible(el) {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }


  function readPaperQuestion(doc) {
    const roots=Array.from(doc.querySelectorAll('.exam-modal')).filter(visible);
    if(!roots.length)return null;
    if(roots.length!==1)return {error:'检测到多个试卷区域，请手动处理'};
    const root=roots[0],stem=root.querySelector('.can-scroll .stem');
    const typeLabel=text(stem?.querySelector('.grey'));
    const numbered=text(stem).match(/^第\s*(\d+)\s*题\s*[:：]\s*([\s\S]*)$/);
    const totalMatch=text(root.querySelector('.remark')).match(/共\s*(\d+)\s*题/);
    if(!numbered||!totalMatch)return {error:'试卷题号或总题数未知，未自动作答'};
    const index=Number(numbered[1]),total=Number(totalMatch[1]);
    const title=numbered[2].replace(typeLabel,'').trim();
    const nodes=Array.from(root.querySelectorAll('.grid-con .index-num'));
    if(!title||index<1||index>total||nodes.length!==total)return {error:'试卷编号与题目列表不一致'};
    const options=Array.from(root.querySelectorAll('.can-scroll input[type="radio"], .can-scroll input[type="checkbox"]')).map(input=>{
      const row=input.closest('.ant-form-item-children');
      return {letter:String(input.value||'').toUpperCase(),text:text(row?.querySelector('.ml6')),input,image:!!row?.querySelector('img')};
    });
    if(options.length<2||options.some(o=>!o.text||o.image||!/^[A-D]$/.test(o.letter)))return {error:'试卷包含图片或不支持的选项结构，请手动处理'};
    if(root.querySelector('.can-scroll img, .can-scroll video'))return {error:'多媒体试题暂不自动回答'};
    if(new Set(options.map(o=>o.letter)).size!==options.length||new Set(options.map(o=>o.input.type)).size!==1)return {error:'试卷选项类型或编号不明确'};
    const type=options[0].input.type==='checkbox'?'multiple':/判断/.test(typeLabel)?'judgement':'single';
    const buttons=Array.from(root.querySelectorAll('.custom-btn button')).filter(visible);
    const nexts=buttons.filter(b=>normalize(text(b))==='下一题');
    const submits=buttons.filter(b=>normalize(text(b))==='提交');
    if(nexts.length>1||submits.length!==1)return {error:'试卷导航按钮不明确'};
    if(!nexts.length&&index!==total)return {error:'尚未到最后一题，等待下一题按钮恢复'};
    const next=nexts[0]||null;
    if(next&&index===total)return {error:'题号与下一题按钮状态不一致'};
    const unanswered=nodes.map((node,i)=>node.querySelector('.ant-badge-status-success')?null:i+1).filter(i=>i!==null);
    const key=JSON.stringify(['paper',total,index,normalize(title),type,options.map(o=>[o.letter,normalize(o.text)])]);
    return {mode:'paper',root,title,type,options,key,index,total,unanswered,next,submit:next||submits[0]};
  }

  function readSubmitConfirmation(doc) {
    const roots=Array.from(doc.querySelectorAll('.ant-modal-confirm')).filter(visible).filter(root=>
      normalize(text(root.querySelector('.ant-modal-confirm-title')))==='是否提交'&&
      normalize(text(root.querySelector('.ant-modal-confirm-content'))).replace(/[?？]/g,'')==='确认提交试卷');
    if(roots.length!==1)return null;
    const buttons=Array.from(roots[0].querySelectorAll('.ant-modal-confirm-btns button')).filter(visible).filter(button=>['确定','确认'].includes(normalize(text(button))));
    return buttons.length===1?buttons[0]:null;
  }

  function readQuestion(doc) {
    const paper=readPaperQuestion(doc);
    if(paper)return paper;

    const roots = Array.from(doc.querySelectorAll('.ant-modal-content')).filter(root =>
      visible(root) && text(root.querySelector('.ant-modal-title')) === '视频习题');
    if (!roots.length) return null;
    if (roots.length !== 1) return { error: '检测到多个习题弹窗，请手动处理' };
    const root = roots[0];
    const stem = root.querySelector('.sub-title');
    const typeLabel = text(stem?.querySelector('.type'));
    const title = text(stem).replace(typeLabel, '').trim();
    const rows = Array.from(root.querySelectorAll('.can-scroll .mb-12'));
    const options = rows.map(row => {
      const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
      return { letter: text(row.querySelector('.letter')).replace(/[:：\s]/g, '').toUpperCase(),
        text: text(row.querySelector('.option')), input,
        image: !!row.querySelector('img') };
    });
    if (!title || options.length < 2 || options.some(o => !o.input || !/^[A-D]$/.test(o.letter))) {
      return { error: '题目结构暂不支持，请手动回答' };
    }
    if (options.some(o => o.image || !o.text)) return { error: '图片选项暂不自动作答，请手动回答' };
    if (new Set(options.map(o => o.letter)).size !== options.length) return { error: '选项编号重复，请手动回答' };
    const inputTypes = new Set(options.map(o => o.input.type));
    if (inputTypes.size !== 1) return { error: '题型结构不明确，请手动回答' };
    const type = options[0].input.type === 'checkbox' ? 'multiple' :
      /判断/.test(typeLabel) ? 'judgement' : 'single';
    const media = doc.querySelector('.right video');
    const lesson = [text(doc.querySelector('.right .title')), media?.getAttribute('src') || ''];
    const key = JSON.stringify([lesson, normalize(title), type, options.map(o => [o.letter, normalize(o.text)])]);
    const submit = root.querySelector('.submit-container button');
    // Ant Design inserts a space between two Chinese characters: "提 交".
    // Match normalized text so DOM spacing is not mistaken for a missing button.
    if (!submit || normalize(text(submit)) !== '提交') return { error: '未找到原页面的提交按钮' };
    return { root, title, type, options, key, submit };
  }

  function resolveAnswer(question, response, context = {}) {
    if (!response || response.code == null || !Number.isFinite(Number(response.code))) throw new Error('题库返回格式不正确');
    // This follows the user's OCS wrapper: code=0 is the non-answer branch.
    if (Number(response.code) === 0) throw Object.assign(new Error('题库未返回可用答案，请检查命中情况或令牌额度'), {code:'NO_ANSWER'});
    const data = response.data;
    if (!data || typeof data.question !== 'string' || normalize(data.question) !== normalize(question.title)) {
      if (!(context.fromAI === true && data?.ai === true)) {
        throw Object.assign(new Error('题库题干与当前题目不一致'), {code:'QUESTION_MISMATCH'});
      }
    }
    const raw = data.answer;
    if (!['string', 'boolean', 'number'].includes(typeof raw) && !Array.isArray(raw)) throw new Error('题库答案格式不支持');
    const truth = value => {
      const n = normalize(value).toLowerCase();
      if (['true', '正确', '对', '是', '√', '✓'].includes(n)) return true;
      if (['false', '错误', '错', '否', '×', '✗'].includes(n)) return false;
      return null;
    };
    function one(value) {
      const clean = String(value).trim().replace(/^(?:答案|正确答案)\s*[:：]\s*/, '');
      const n = normalize(clean);
      const byText = question.options.filter(o => normalize(o.text) === n);
      if (byText.length === 1) return byText[0].letter;
      if (byText.length > 1) throw new Error('多个选项文字相同，无法确定答案');
      // Ignore terminal prose punctuation and decorative marks, retaining the option body.
      // Keep internal punctuation and explicit letter-answer syntax unchanged.
      if (!/^[（(]?[A-D][)）.、:：]?$/i.test(clean)) {
        const withoutFinalStop = value => normalize(value).replace(/[。.,，;；、:：!！?？…·•★☆※✓✔✅❌✗✘\uFE0F]+$/u, '');
        const body = withoutFinalStop(clean);
        const byFinalStop = body ? question.options.filter(o => withoutFinalStop(o.text) === body) : [];
        if (byFinalStop.length === 1) return byFinalStop[0].letter;
        if (byFinalStop.length > 1) throw new Error('忽略末尾标点或装饰符号后多个选项相同，无法确定答案');
      }
      if (question.type === 'judgement' && truth(clean) !== null) {
        const matching = question.options.filter(o => truth(o.text) === truth(clean));
        if (matching.length === 1) return matching[0].letter;
      }
      const letter = clean.toUpperCase().replace(/^[（(]?([A-D])[)）.、:：]?$/, '$1');
      if (/^[A-D]$/.test(letter) && question.options.some(o => o.letter === letter)) return letter;
      throw new Error('答案无法唯一映射到当前选项，未自动作答');
    }
    const values = Array.isArray(raw) ? raw : [raw];
    const letters = [];
    for (const value of values) {
      if (!['string', 'boolean', 'number'].includes(typeof value)) throw new Error('题库答案格式不支持');
      try { letters.push(one(value)); }
      catch (wholeError) {
        const cleaned = String(value).trim().replace(/^(?:答案|正确答案)\s*[:：]\s*/, '');
        // A full option may itself contain enumeration punctuation or newlines.
        // Try structural answer separators first, preserving punctuation inside each option.
        let mapped = null;
        for (const separator of [/#{1,}/, /\|\|/, /\r?\n/, /[、；;]/]) {
          const parts = cleaned.split(separator).map(s => s.trim()).filter(Boolean);
          if (parts.length < 2) continue;
          try { mapped = parts.map(one); break; } catch (_) { /* Try the next format. */ }
        }
        if (!mapped && /^(?:[A-D][,，\s]*){2,}$/i.test(cleaned)) {
          mapped = cleaned.toUpperCase().match(/[A-D]/g).map(one);
        }
        if (!mapped) throw wholeError;
        letters.push(...mapped);
      }
    }
    const unique = Array.from(new Set(letters)).sort();
    if (!unique.length || (question.type !== 'multiple' && unique.length !== 1)) throw new Error('题库答案数量与题型不符');
    return { letters: unique, ai: !!data.ai };
  }

  function createTransport(request, timers = {}) {
    const later = timers.setTimeout || setTimeout;
    const clear = timers.clearTimeout || clearTimeout;
    return function query(question, token, options = {}) {
      const localOnly = options.localOnly !== false;
      const timeoutMs = localOnly ? 20000 : 120000;
      let xhr, timer, done = false, rejectPending;
      const promise = new Promise((resolve, reject) => {
        rejectPending = reject;
        const finish = (error, value) => {
          if (done) return;
          done = true; clear(timer);
          if (error) reject(new Error(error)); else resolve(value);
        };
        // anonymous may use fetch in some managers; enforce our own timeout too.
        timer = later(() => { finish(localOnly ? '题库查询超时，请手动重试' : '官方 AI 查询超时，请手动重试'); xhr?.abort?.(); }, timeoutMs);
        const joined = question.options.map(o => o.text).join('\n');
        try {
          xhr = request({ url: endpoint, method: 'POST', anonymous: true, timeout: timeoutMs,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ token, title: question.title, options: joined, type: question.type,
              images: [], v: '2', __local_only__: localOnly,
              suggestion_title: question.title, suggestion_options: joined }),
            onload: response => {
              if (response.status !== 200) return finish('题库网络错误（HTTP ' + response.status + '）');
              try { if (response.finalUrl && new URL(response.finalUrl).origin !== 'https://tk.enncy.cn') return finish('题库响应来源不符'); }
              catch (_) { return finish('题库响应地址格式不正确'); }
              try { finish(null, typeof response.response === 'object' && response.response !== null ? response.response : JSON.parse(response.responseText)); }
              catch (_) { finish('题库返回的内容不是有效 JSON'); }
            },
            onerror: () => finish('题库连接失败，请检查网络或扩展授权'),
            ontimeout: () => finish('题库查询超时，请手动重试'),
            onabort: () => finish('查询已取消') });
        } catch (_) { finish('题库请求无法启动，请检查脚本管理器'); }
      });
      promise.abort = () => {
        if (done) return;
        done = true; clear(timer); rejectPending(new Error('查询已取消')); xhr?.abort?.();
      };
      return promise;
    };
  }

  function createApp(env, options = {}) {
    const win = env.window, doc = env.document, now = env.now || Date.now;
    const config = { ui: true, pollMs: 400, fillDelayMs: 250, submitTimeoutMs: 12000, ...options };
    const read = env.readQuestion || (() => readQuestion(doc));
    let running = false, enabled = true, timer = null, task = null, lastKey = null, handled = false;
    let status = '', host, statusNode, pauseButton, tokenInput, tokenHint;
    let lastRequestAt = -Infinity, autoRetryCount = 0;
    const cache = new Map();
    function say(message) { status = message; if (statusNode) statusNode.textContent = message; env.onStatus?.(message); }
    function cancel() { const old = task; task = null; old?.query?.abort?.(); }
    function selected(q) { return q.options.filter(o => o.input.checked).map(o => o.letter).sort(); }
    function current(t) {
      if (!running || !enabled || task !== t || !targetPage(win)) return null;
      const q = read();
      return q && !q.error && q.key === t.key && q.root === t.root ? q : null;
    }
    function halt(message) { cancel(); say(message); }
    function retry() { cancel(); handled = false; autoRetryCount = 0; cache.delete(lastKey); say('已准备重试当前题目'); }
    function setEnabled(value) { enabled = value; cancel(); handled = false; say(value ? '已启用，等待视频习题' : '自动答题已暂停'); }
    function mount() {}

    function step() {
      if (!running) return;
      if (!targetPage(win)) { cancel();lastKey=null;handled=false;if(host)host.style.display='none';return; }
      mount();if(host)host.style.display='';
      const q=read();
      if (!q) {
        if(task?.phase==='submitted') say(task.mode==='paper'?'试卷区域已关闭，请核对网站提交结果':'习题弹窗已关闭，等待下一道题（正确性以网站结果为准）');
        else if(enabled&&(lastKey!==null||task))say('当前没有可识别题目，等待下一道题');
        cancel();lastKey=null;handled=false;autoRetryCount=0;return;
      }
      if(q.error){cancel();lastKey=null;handled=false;say(q.error);return;}
      if(q.key!==lastKey){cancel();lastKey=q.key;handled=false;autoRetryCount=0;}
      if(!enabled)return;
      if(task){
        if(!current(task))return halt('题目已变化，旧结果已取消');

        if(task.phase==='requery'){
          if(doc.hidden)return;
          if(JSON.stringify(selected(q))!==JSON.stringify(task.initialSelection))return halt('检测到手动选择，未覆盖你的答案');
          if(now()<task.readyAt)return;
          cache.delete(q.key);cancel();handled=false;
          say('正在重新识别当前题目并重新查询');
          return;
        }

        if(task.phase==='confirming'){
          if(now()>=task.deadline)return halt('未找到明确的交卷确认框，请手动检查；不会重复提交');
          if(doc.hidden)return;
          const confirm=(env.readSubmitConfirmation||(()=>readSubmitConfirmation(doc)))();
          if(!confirm||confirm.disabled)return;
          task.phase='submitted';task.deadline=now()+config.submitTimeoutMs;
          say('正在确认提交试卷');
          try{confirm.click();}catch(_){halt('交卷确认按钮不可用，请手动处理');}
          return;
        }
        if(task.phase==='navigating'){
          if(now()>=task.deadline)halt('点击下一题后题号未变化，已停止；不会重复点击');
          return;
        }
        if(task.phase==='filling'){

          if(now()>=task.deadline)return halt('多选状态未稳定，请手动检查；不会提交不完整答案');
          if(doc.hidden)return;
          const actual=selected(q);
          if(task.pendingSelection){
            const expected=task.pendingSelection.after;
            if(JSON.stringify(actual)!==JSON.stringify(expected)){
              // Allow the controlled checkbox component to finish its render.
              if(JSON.stringify(actual)===JSON.stringify(task.pendingSelection.before))return;
              return halt('选中状态与预期不符，已停止自动提交');
            }
            task.confirmed=expected;task.pendingSelection=null;
          }
          if(JSON.stringify(actual)!==JSON.stringify(task.confirmed))return halt('检测到选择状态变化，请手动确认');
          const extra=q.type==='multiple'?task.confirmed.find(letter=>!task.letters.includes(letter)):null;
          const next=extra||task.letters.find(letter=>!task.confirmed.includes(letter));
          if(next){
            const option=q.options.find(o=>o.letter===next);
            if(!option||option.input.disabled)return;
            const after=q.type!=='multiple'?[next]:extra?
              task.confirmed.filter(letter=>letter!==next):[...task.confirmed,next].sort();
            task.pendingSelection={before:[...task.confirmed],after};
            try{option.input.click();}catch(_){return halt('选项无法点击，请手动处理');}
            say(extra?'正在取消残留选项 '+extra:'正在核对并选择答案 '+task.letters.join('、'));
            return;
          }
          task.phase='filled';task.readyAt=now()+config.fillDelayMs;
          say('已确认全部答案 '+task.letters.join('、')+'，准备提交');
          return;
        }
        if(task.phase==='filled' && now()>=task.readyAt){
          if(now()>=task.deadline)return halt('选项或提交按钮未就绪，请手动检查');
          if(doc.hidden)return;
          if(JSON.stringify(selected(q))!==JSON.stringify(task.letters))return halt('选择状态已变化，请手动确认');
          if(q.submit.disabled)return;

          if(q.mode==='paper'&&!q.next){
            if(q.index!==q.total)return halt('尚未到最后一题，已停止交卷');
            if(q.unanswered.length){
              if(q.unanswered.every(i=>i===q.index))return;
              return halt('试卷仍有未答题（'+q.unanswered.slice(0,8).join('、')+'），未交卷');
            }
          }
          task.phase=q.mode==='paper'?(q.next?'navigating':'confirming'):'submitted';
          task.deadline=now()+config.submitTimeoutMs;
          say(q.mode==='paper'?(q.next?'第 '+q.index+'/'+q.total+' 题已完成，正在点击下一题':'最后一题已完成，正在提交试卷'):
            '已选择 '+task.letters.join('、')+'，正在提交'+(task.ai?'（题库 AI 建议）':''));

          try{q.submit.click();}catch(_){halt('提交按钮不可用，请手动提交');}
        }else if(task.phase==='submitted'&&now()>=task.deadline)halt('提交后弹窗仍未关闭，请手动检查；不会重复提交');
        return;
      }
      if(handled||doc.hidden)return;
      const token=env.getToken?.();
      if(!token){say('请先保存言溪题库令牌');return;}
      if(q.options.some(o=>o.input.disabled)){say('选项暂不可用，等待页面就绪');return;}
      if(now()-lastRequestAt<1500)return;
      handled=true;
      const t={key:q.key,root:q.root,mode:q.mode,phase:'query',initialSelection:selected(q)};task=t;
      say('已识别'+({single:'单选',multiple:'多选',judgement:'判断'}[q.type]||'未知类型')+'题，正在查询言溪题库');
      let query;
      try{
        if(cache.has(q.key))query=Promise.resolve(cache.get(q.key));
        else {lastRequestAt=now();query=env.transport(q,token,{localOnly:true});}
        t.query=query;
        Promise.resolve(query).then(async response=>{
          let latest=current(t);if(!latest)return;
          if(doc.hidden)return halt('页面在后台，已停止填答；返回后可重试');
          if(JSON.stringify(selected(latest))!==JSON.stringify(t.initialSelection))return halt('检测到手动选择，未覆盖你的答案');
          let result,fromAI=false;
          try { result=resolveAnswer(latest,response); }
          catch(error){
            if(!['QUESTION_MISMATCH','NO_ANSWER'].includes(error.code))throw error;
            t.phase='query-ai';
            say('题库未命中当前题干，正在转用言溪官方 AI');
            lastRequestAt=now();
            t.query=env.transport(latest,token,{localOnly:false});
            const aiResponse=await t.query;
            latest=current(t);if(!latest)return;
            if(doc.hidden)return halt('页面在后台，AI 结果未填入；返回后可重试');
            if(JSON.stringify(selected(latest))!==JSON.stringify(t.initialSelection))return halt('检测到手动选择，未覆盖你的答案');
            if(aiResponse?.data?.ai!==true)throw Object.assign(new Error('未取得官方 AI 结果'),{code:'AI_UNAVAILABLE'});
            result=resolveAnswer(latest,aiResponse,{fromAI:true});fromAI=true;
          }
          if(!fromAI&&!cache.has(q.key)){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(q.key,response);}
          t.letters=result.letters;t.ai=result.ai;
          t.phase='filling';t.confirmed=selected(latest);t.pendingSelection=null;
          t.deadline=now()+config.submitTimeoutMs;
          say((fromAI?'官方 AI 答案 ':'已匹配答案 ')+result.letters.join('、')+'，准备逐项选择');
        }).catch(error=>{
          if(task!==t)return;
          if(error?.code==='AI_UNAVAILABLE'&&current(t)&&autoRetryCount<1){
            autoRetryCount++;cache.delete(t.key);t.phase='requery';t.readyAt=now()+3000;
            say('未取得官方 AI 结果，3 秒后重新识别并查询本题（自动重试 1/1）');
            return;
          }
          halt(error?.code==='AI_UNAVAILABLE'?'重新识别查询后仍未取得官方 AI 结果，请检查言溪 AI 设置或额度；可点击重试本题':error?.message || '题库查询失败，请手动回答或重试');
        });
      }catch(_){halt('题库请求无法启动，请检查配置');}
    }
    function start(){if(running)return;running=true;win.addEventListener('pagehide',stop);timer=win.setInterval(step,config.pollMs);say('等待视频习题');step();}
    function stop(){running=false;cancel();win.clearInterval(timer);win.removeEventListener('pagehide',stop);host?.remove();host=statusNode=null;}
    return {start,stop,step,retry,setEnabled,getState:()=>({running,enabled,status,phase:task?.phase||null})};
  }
  return {readQuestion,readPaperQuestion,readSubmitConfirmation,resolveAnswer,createTransport,createApp,normalize};
  })();

  const SPEEDS = [1, 1.25, 1.5, 2, 3, 4, 5, 8, 10];
  function createPanel(env) {
    const doc=env.document;
    const host=doc.createElement('div');host.id='jsnu-course-assistant-panel';
    host.style.cssText='position:fixed;left:16px;top:16px;z-index:2147483646;width:300px;max-width:calc(100vw - 32px)';
    const shadow=host.attachShadow({mode:'open'});
    const style=doc.createElement('style');
    style.textContent=':host{font:13px/1.6 system-ui,sans-serif;color:#173540}*{box-sizing:border-box}[hidden]{display:none!important}.box{padding:12px;background:#f5fffc;border:1px solid #8ab9a8;border-radius:9px;box-shadow:0 3px 14px #0002;max-height:calc(100vh - 32px);overflow:auto}header{display:flex;justify-content:space-between;align-items:center;gap:8px}h4{margin:0}button,select{padding:4px 7px;margin:5px 4px 0 0;background:white;border:1px solid #89a99e;border-radius:5px;color:inherit;cursor:pointer}header button{margin:0}input{width:100%;margin-top:7px;padding:7px;border:1px solid #aaa;border-radius:4px}small{display:block;color:#51675e}.status{margin:6px 0;overflow-wrap:anywhere}.row{margin-top:7px;padding-top:6px;border-top:1px solid #d6e8e0}label{margin-right:7px}';
    const make=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
    const box=make('section');box.className='box';
    const header=make('header'),title=make('h4','江苏师大课程助手 v1.5.5'),fold=make('button','收起');
    fold.type='button';header.append(title,fold);
    const body=make('div');
    fold.onclick=()=>{body.hidden=!body.hidden;fold.textContent=body.hidden?'展开':'收起';};
    const speedRow=make('div');const speedLabel=make('label','播放速度');speedLabel.htmlFor='jsnu-speed';
    const speed=make('select');speed.id='jsnu-speed';speed.setAttribute('aria-label','播放速度');
    SPEEDS.forEach(rate=>{const option=make('option',rate+' 倍');option.value=String(rate);speed.append(option);});
    speed.value=String(env.getSpeed());speed.onchange=()=>{env.setSpeed(Number(speed.value));};speedRow.append(speedLabel,speed);
    const videoStatus=make('div'),quizStatus=make('div');
    for(const status of [videoStatus,quizStatus]){status.className='status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');}
    const next=make('button','暂停自动切换'),answer=make('button','暂停答题'),retry=make('button','重试本题');
    next.onclick=()=>{const enabled=env.toggleVideo();next.textContent=enabled?'暂停自动切换':'启用自动切换';};
    answer.onclick=()=>{const enabled=env.toggleAnswer();answer.textContent=enabled?'暂停答题':'启用答题';};
    retry.onclick=()=>env.retry();
    const controls=make('div');controls.append(next,answer,retry);
    const tokenRow=make('div');tokenRow.className='row';
    const tokenHint=make('small'),manage=make('button','管理令牌'),tokenArea=make('div');
    const tokenInput=make('input');tokenInput.type='password';tokenInput.autocomplete='off';tokenInput.placeholder='粘贴言溪 Token';tokenInput.setAttribute('aria-label','言溪题库令牌');
    const save=make('button','保存令牌'),clear=make('button','清除令牌');
    function syncToken(){const saved=!!env.getToken();tokenHint.textContent=saved?'令牌已保存 · 匹配后自动提交':'请先保存言溪题库令牌';tokenArea.hidden=saved;manage.textContent=saved?'管理令牌':'收起令牌输入';}
    manage.onclick=()=>{tokenArea.hidden=!tokenArea.hidden;tokenInput.value='';manage.textContent=tokenArea.hidden?'管理令牌':'收起令牌输入';};
    save.onclick=()=>{const value=tokenInput.value.trim();if(!value){quizStatus.textContent='请输入令牌';return;}try{env.saveToken(value);tokenInput.value='';syncToken();env.retry();}catch(_){quizStatus.textContent='令牌保存失败，请检查脚本管理器';}};
    clear.onclick=()=>{env.saveToken('');tokenInput.value='';syncToken();env.retry();};
    tokenArea.append(tokenInput,save,clear);tokenRow.append(tokenHint,manage,tokenArea);syncToken();
    body.append(speedRow,videoStatus,quizStatus,controls,tokenRow);box.append(header,body);shadow.append(style,box);
    (doc.body||doc.documentElement).append(host);
    return {setVideo:text=>{videoStatus.textContent='自动下一节：'+text;},setQuiz:text=>{quizStatus.textContent='题库：'+text;},setVisible:value=>{host.hidden=!value;},destroy:()=>host.remove()};
  }

  function bootstrap() {
    const slot='__jsnuCourseAssistant_v1__';
    window[slot]?.dispose();window.__jsnuNextVideo_v1__?.dispose();
    let speed=Number(GM_getValue('jsnu-playback-rate',10));
    if(!SPEEDS.includes(speed))speed=10;
    let videoApp,questionApp;
    const panel=createPanel({document,getToken:()=>GM_getValue('enncy-token',''),saveToken:value=>GM_setValue('enncy-token',value),
      getSpeed:()=>speed,setSpeed:value=>{if(SPEEDS.includes(value)){GM_setValue('jsnu-playback-rate',value);speed=value;videoApp?.step();}},
      toggleVideo:()=>{const enabled=!videoApp.getState().enabled;videoApp.setEnabled(enabled);return enabled;},
      toggleAnswer:()=>{const enabled=!questionApp.getState().enabled;questionApp.setEnabled(enabled);return enabled;},retry:()=>questionApp.retry()});
    videoApp=createNextVideo({window,document,getSpeed:()=>speed,onStatus:panel.setVideo,onVisibility:()=>{const practice=window.location.pathname.replace(/\/$/,'')==='/students/questionList';panel.setVisible(practice||window.location.pathname.replace(/\/$/,'')==='/students/courseDetail');if(practice)panel.setVideo('当前为试卷答题页');}},{ui:false});
    questionApp=questionApi.createApp({window,document,transport:questionApi.createTransport(GM_xmlhttpRequest),
      getToken:()=>GM_getValue('enncy-token',''),saveToken:value=>GM_setValue('enncy-token',value),onStatus:panel.setQuiz},{ui:false});
    const dispose=()=>{videoApp.stop();questionApp.stop();panel.destroy();window.removeEventListener('pagehide',dispose);};
    window[slot]={version:'1.5.5',dispose};window.addEventListener('pagehide',dispose);
    videoApp.start();questionApp.start();
  }

  if(typeof module==='object' && module.exports){module.exports={createNextVideo,...questionApi,createPanel,SPEEDS};return;}
  bootstrap();
})();
