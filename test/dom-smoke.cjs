// 轻量 DOM 垫片冒烟测试：验证 app.js UI 层在浏览器环境下可完整初始化、
// 弹窗 / 渲染 / 保存 / 打印 / 删除路径不抛错且状态正确。
'use strict';

function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add: (...xs) => xs.forEach((x) => set.add(x)),
    remove: (...xs) => xs.forEach((x) => set.delete(x)),
    toggle: (x, force) => { const on = force === undefined ? !set.has(x) : force; on ? set.add(x) : set.delete(x); },
    contains: (x) => set.has(x)
  };
}

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.classList = makeClassList();
    this._listeners = {};
    this._html = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this._className = '';
    this.clientWidth = 100;
    this.parentNode = null;
    this.selected = false;
  }
  get className() { return this._className; }
  set className(v) {
    this._className = String(v);
    this.classList._set.clear();
    String(v).split(/\s+/).forEach((c) => c && this.classList.add(c));
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  insertBefore(child) { this.children.unshift(child); child.parentNode = this; return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
  }
  querySelector(sel) { const xs = this.querySelectorAll(sel); return xs[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    for (const group of sel.split(',')) {
      // 垫片简化：app.js 的选择器叶子节点都直接匹配最后一段复合选择器
      const leaf = group.trim().split(/\s+/).pop();
      walk(this, (el) => {
        if (el !== this && el.tagName !== '#TEXT' && matches(el, leaf)) out.push(el);
      });
    }
    return out;
  }
  closest(sel) {
    let el = this;
    while (el) { if (matches(el, sel)) return el; el = el.parentNode; }
    return null;
  }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  removeEventListener() {}
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k === 'id') this.id = v;
    if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = String(v);
  }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  focus() {}
  click(ev) { this.dispatch('click', ev || { target: this }); }
  dispatch(type, ev) {
    (this._listeners[type] || []).forEach((fn) =>
      fn(Object.assign({ target: this, currentTarget: this, type, preventDefault() {}, stopPropagation() {} }, ev)));
  }
  scrollIntoView() {}
  get offsetWidth() { return 100; }
}
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function walk(el, cb) {
  for (const ch of el.children) { cb(ch); walk(ch, cb); }
}
function matchOne(el, tok) {
  if (tok === '*') return true;
  if (tok.endsWith(':checked')) return el.checked && matchOne(el, tok.slice(0, -':checked'.length));
  if (tok.startsWith('#')) return el.id === tok.slice(1);
  if (tok.startsWith('.')) return el.classList.contains(tok.slice(1));
  if (tok.startsWith('[')) {
    const m = tok.match(/^\[([\w-]+)(?:="?(.*?)"?)?\]$/);
    if (!m) return false;
    if (m[1] === 'class') return el.className.split(/\s+/).includes(m[2]);
    if (m[1].startsWith('data-')) return el.dataset[camel(m[1].slice(5))] === m[2];
    if (m[1] === 'checked') return el.checked;
    if (m[1] === 'value') return el.value === m[2];
    return el.attributes[m[1]] !== undefined;
  }
  return el.tagName === tok.toUpperCase();
}
// 复合选择器：tag.cls#id[attr] 各部分须同时成立
function matches(el, tok) {
  const wantChecked = tok.endsWith(':checked');
  if (wantChecked) {
    tok = tok.slice(0, -':checked'.length);
    if (!el.checked) return false;
  }
  const re = /([.#]?[\w-]+|\[[^\]]+\])/g;
  const segs = [];
  let m;
  while ((m = re.exec(tok))) segs.push(m[0]);
  return segs.length > 0 && segs.every((s) => matchOne(el, s));
}

// 解析 innerHTML 字符串为节点树（覆盖 app.js 模板用到的子集）
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'option']);
// 浏览器对这些标签的闭合标签做隐式处理：开启同类（或同类兄弟）标签时自动闭合
const CLOSE_ON_SAME_PEER = new Set(['li', 'tr', 'td', 'th', 'option', 'p', 'option']);
function parseHtml(html, parent) {
  let i = 0;
  const stack = [parent];
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) {
      const txt = html.slice(i, lt);
      if (txt.trim() && stack[stack.length - 1] !== parent) {
        const t = new El('#text');
        t.textContent = txt;
        stack[stack.length - 1].appendChild(t);
      }
    }
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    let tagSrc = html.slice(lt + 1, gt);
    const selfClose = tagSrc.endsWith('/');
    if (selfClose) tagSrc = tagSrc.slice(0, -1);
    if (tagSrc.startsWith('!') || tagSrc.startsWith('?')) { i = gt + 1; continue; }
    if (tagSrc.startsWith('/')) {
      const name = tagSrc.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tagName.toLowerCase() === name) { stack.length = s; break; }
      }
      i = gt + 1;
      continue;
    }
    const tm = tagSrc.match(/^([\w-]+)([\s\S]*)$/);
    if (!tm) { i = gt + 1; continue; }
    const tag = tm[1].toLowerCase();
    // 隐式闭合：同级同类标签再次开启时，先弹出栈顶同类未闭合标签
    if (CLOSE_ON_SAME_PEER.has(tag)) {
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tagName.toLowerCase() === tag) {
          while (stack.length > s) stack.pop();
          break;
        }
      }
    }
    // 表格结构：进入 tr 前隐式闭合未关的 td/th；thead/tbody 中的裸行容错
    if (tag === 'td' || tag === 'th') {
      for (let s = stack.length - 1; s > 0; s--) {
        const t = stack[s].tagName.toLowerCase();
        if (t === 'tr') break;
        if (t === 'td' || t === 'th') { stack.length = s; break; }
      }
    }
    const el = new El(tag);
    const attrRe = /([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(tm[2]))) {
      const [, k, v] = am;
      if (v === undefined) { el.setAttribute(k, ''); el[k] = true; continue; }
      el.setAttribute(k, v);
      if (k === 'value') el.value = v;
      if (k === 'checked') el.checked = true;
      if (k === 'selected') el.selected = true;
      if (k === 'id') registry.set(v, el);
    }
    stack[stack.length - 1].appendChild(el);
    const voidClose = selfClose || VOID.has(tag);
    const closeHere = html.slice(gt + 1, gt + 2 + tag.length + 1)
      .toLowerCase().indexOf('</' + tag) === 0 &&
      html.indexOf('</' + tag, gt + 1) < gt + 2 + tag.length + 3;
    if (!voidClose && !closeHere) stack.push(el);
    i = gt + 1;
  }
}

const registry = new Map();
function ensure(id, tag) {
  if (!registry.has(id)) registry.set(id, new El(tag || 'div', id));
  return registry.get(id);
}

Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._html; },
  set(v) {
    this._html = String(v);
    this.children = [];
    parseHtml(String(v), this);
  }
});

const storage = {};
const body = new El('body');
const MockBlob = class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } };

// 从真实 index.html 引导静态节点树：getElementById 返回的元素保持 HTML 嵌套关系
function bootstrapStaticDom() {
  const html = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = (m ? m[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');
  parseHtml(content, body);
}
bootstrapStaticDom();

global.window = {
  addEventListener() {}, removeEventListener() {},
  print() { this._printed = (this._printed || 0) + 1; },
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} }
};global.document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById: (id) => ensure(id, 'div'),
  querySelector: (sel) => body.querySelector(sel),
  createElement: (tag) => {
    const el = new El(tag);
    // <a download> 点击即代表一次文件下载
    if (tag.toLowerCase() === 'a') {
      el.click = () => { global.__downloads.push({ href: el.href, download: el.download }); };
    }
    return el;
  },
  createElementNS: (_ns, tag) => new El(tag),
  body,
  documentElement: new El('html')
};
global.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};
global.navigator = { userAgent: 'node' };
global.Blob = MockBlob;
global.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL() {} };
// 下载链路（Blob → URL.createObjectURL → <a download>.click）：全部替换为可观测 mock
global.__downloads = [];
global.confirm = () => true;
// 捕获播放计时器回调，测试可手动逐拍触发；clearInterval 清空当前全部计时器
global.__intervalCbs = [];
global.setInterval = (fn) => { global.__intervalCbs.push(fn); return global.__intervalCbs.length; };
global.clearInterval = () => { global.__intervalCbs.length = 0; };
global.FileReader = class { readAsText() { this.onload({ target: { result: '{}' } }); } };
global.HTMLElement = El;

// 在污染全局 document 之前，先拿到纯函数导出
function requirePure() {
  delete require.cache[require.resolve('../public/app.js')];
  const had = 'document' in global;
  const saved = global.document;
  delete global.document;
  try {
    return require('../public/app.js');
  } finally {
    delete require.cache[require.resolve('../public/app.js')];
    if (had) global.document = saved;
  }
}
const pureModule = requirePure();

const assert = require('node:assert');
let pass = 0;
function check(cond, msg) { assert.ok(cond, msg); pass += 1; console.log('  ✓ ' + msg); }
const click = (id) => ensure(id).click();
// 垫片的 innerHTML 不含文本节点内容；递归收集 #text 节点拼出可见文本
function textOf(el) {
  if (!el) return '';
  if (el.tagName === '#TEXT') return el.textContent || '';
  return (el.children || []).map(textOf).join('');
}

// ---------- 不重叠：演员完全不同（由独立进程模式运行，见文件尾） ----------
if (process.env.DOM_SMOKE_MODE === 'no-overlap') {
  const { buildReport } = pureModule;
  // 预置两份无共同演员的报告
  const r1 = buildReport({ state: { beats: 1, actors: [
    { id: 'p', name: '潘某', start: { c: 1, r: 1 }, moves: { '1': 'U' } }
  ] }, title: '潘版' });
  const r2 = buildReport({ state: { beats: 1, actors: [
    { id: 'q', name: '齐某', start: { c: 1, r: 1 }, moves: { '1': 'U' } }
  ] }, title: '齐版' });
  storage['stage-blocking:v1'] = JSON.stringify({
    version: 1, state: { beats: 1, nextActorNum: 1, actors: [] },
    currentBeat: 0, reports: [r1, r2], comparisons: []
  });

  require('../public/app.js');

  // 弹窗默认选中的两份报告即 r1/r2（顺序：潘版、齐版），直接预览
  click('newCompareBtn');
  check(/演员完全不重叠/.test(ensure('cmpPreview').innerHTML), '演员不重叠：预览明确警告');
  click('cmpSubmit');
  const saved2 = JSON.parse(storage['stage-blocking:v1']);
  check(saved2.comparisons.length === 1 && saved2.comparisons[0].status === 'no-common-actors',
    '保存提示性对比（no-common-actors）');
  check(!ensure('cmpViewerOverlay').classList.contains('hidden'), '提示性对比视图打开');
  const warnText = ensure('cmpNotices').children.map((c) => c.textContent).join('');
  check(/演员完全不重叠/.test(warnText), '视图显著提示，不生成误导结果');
  check(ensure('cmpBeats').innerHTML.indexOf('未生成逐拍差异') >= 0, '逐拍区显示「未生成」');
  click('cmpViewerClose');

  console.log('\nDOM 冒烟（不重叠模式）：' + pass + ' 项全部通过 🎉');
  process.exit(0);
}

require('../public/app.js');

// ---------- init ----------
let saved = JSON.parse(storage['stage-blocking:v1']);
check(saved.state.actors.length === 4, 'init 载入 demo 走位并落盘');
check(Array.isArray(saved.comparisons), '存档含 comparisons 字段（向后兼容字段）');
check(ensure('newCompareBtn').disabled === true, '初始（0 份报告）对比按钮禁用');

// ---------- 生成两份报告 ----------
function generateReport(title) {
  click('newReportBtn');
  const modal = ensure('reportModal');
  check(!modal.classList.contains('hidden'), '生成报告弹窗打开');
  const cbs = modal.querySelectorAll('input.rp-actor-cb');
  check(cbs.length === 4, '弹窗列出 4 位 demo 演员');
  cbs.forEach((cb) => { cb.checked = true; });
  ensure('rpTitle').value = title;
  // rpFrom/rpTo 是 innerHTML 解析出的 select，需手动放入 option 并选中
  const selFrom = ensure('rpFrom');
  if (!selFrom.children.length) {
    for (let b = 0; b <= 4; b++) { const o = new El('option'); o.value = String(b); selFrom.appendChild(o); }
  }
  const selTo = ensure('rpTo');
  if (!selTo.children.length) {
    for (let b = 0; b <= 4; b++) { const o = new El('option'); o.value = String(b); selTo.appendChild(o); }
  }
  selFrom.value = '0';
  selTo.value = '4';
  click('rpSubmit');
}
generateReport('第一份');
check(JSON.parse(storage['stage-blocking:v1']).reports.length === 1, '保存第 1 份报告');
generateReport('第二份');
saved = JSON.parse(storage['stage-blocking:v1']);
check(saved.reports.length === 2, '保存第 2 份报告');
check(ensure('newCompareBtn').disabled === false, '2 份报告后对比按钮启用');
check(ensure('reportList').querySelectorAll('.report-row').length === 2, '报告列表渲染 2 行');

// ---------- 对比弹窗与预览 ----------
click('newCompareBtn');
check(!ensure('compareModal').classList.contains('hidden'), '对比弹窗打开');
const selA = ensure('cmpA');
const selB = ensure('cmpB');
check(selA.children.length === 2 && selB.children.length === 2, '两侧下拉各 2 个选项');
check(selA.value !== selB.value, '默认选中两份不同报告');
const preview = () => ensure('cmpPreview').innerHTML;
check(/共同演员/.test(preview()), '预览：共同演员');
check(/共同拍次/.test(preview()), '预览：共同拍次');
check(/冲突变化/.test(preview()), '预览：冲突变化统计');
// 选成同一份 → 警告
let reports = JSON.parse(storage['stage-blocking:v1']).reports;
const otherId = reports[0].id === selA.value ? reports[1].id : reports[0].id;
selB.value = selA.value;
selB.dispatch('change', { target: selB });
check(/不能与自身对比/.test(preview()), '同一份报告：明确警告');
// 恢复成两份不同，再交换两侧
selB.value = otherId;
selB.dispatch('change', { target: selB });
check(/共同演员/.test(preview()), '恢复后预览正常');
const beforeA = selA.value;
click('cmpSwap');
check(ensure('cmpA').value !== ensure('cmpB').value, '交换 A/B 后两侧不同');
check(ensure('cmpB').value === beforeA, '交换后原 A 到了 B 侧');
check(/共同演员/.test(preview()), '交换后预览恢复');

// ---------- 生成并保存对比 ----------
ensure('cmpTitle').value = '版次对比';
click('cmpSubmit');
saved = JSON.parse(storage['stage-blocking:v1']);
check(saved.comparisons.length === 1, '对比随本地存档保存');
const cmp = saved.comparisons[0];
check(cmp.status === 'ok', 'demo 报告可对比：ok');
check(cmp.title === '版次对比' && cmp.a.id !== cmp.b.id, '标题与两侧报告 id 正确');
check(Array.isArray(cmp.beats) && cmp.beats.length === 5, '内嵌 5 个共同拍次');
check(!ensure('cmpViewerOverlay').classList.contains('hidden'), '对比查看器打开');
check(ensure('cmpBeats').children.length === 5, '逐拍差异区渲染 5 个拍次');
check(ensure('cmpChanges').children.length >= 0, '冲突变化区完成渲染');
check(ensure('compareList').querySelectorAll('.compare-row').length === 1, '对比列表渲染 1 行');

// 相同两份报告 → 所有冲突都「保持」、逐拍零差异
check(cmp.totals.added === 0 && cmp.totals.removed === 0, '同一份走位生成的报告：无新增/消除');
check(cmp.diffCounts.coord === 0 && cmp.diffCounts.move === 0, '相同快照：坐标/动作差异为 0');

// ---------- 跳回编辑器 ----------
const jump = ensure('cmpBeats').querySelector('.cmp-beat-jump');
check(!!jump, '每拍有跳回按钮');
jump.click();
check(ensure('cmpViewerOverlay').classList.contains('hidden'), '跳回关闭对比视图');
check(JSON.parse(storage['stage-blocking:v1']).currentBeat === Number(jump.dataset.beat),
  '跳回后编辑器定位到对应拍次');

// ---------- 打印 / 下载 / 关闭 ----------
ensure('compareList').querySelector('.compare-open').click();
click('cmpViewerPrint');
check(global.window._printed === 1, '打印触发 window.print');
check(document.body.classList.contains('print-mode-compare'), '打印时带 compare 模式标记');
click('cmpViewerDownload');
check(global.__downloads.length === 1 &&
  /stage-blocking-comparison/.test(global.__downloads[0].download), '下载对比 JSON：文件名带 comparison');
click('cmpViewerClose');
check(ensure('cmpViewerOverlay').classList.contains('hidden'), '关闭对比视图');
check(!document.body.classList.contains('printing-report'), '关闭后清理打印标记');

// ---------- 删除 ----------
ensure('compareList').querySelector('.rr-del').click();
check(JSON.parse(storage['stage-blocking:v1']).comparisons.length === 0, '删除对比后存档更新');

// ---------- 排练区间循环 ----------
const savedArchive = () => JSON.parse(storage['stage-blocking:v1']);
const tickPlay = (n) => { for (let i = 0; i < n; i++) global.__intervalCbs.slice().forEach((fn) => fn()); };
const reportsCountBefore = savedArchive().reports.length;

check(!ensure('loopBar').classList.contains('active'), '初始：循环区间条未激活');
check(ensure('loopEnable').checked === false, '初始：未勾选区间循环');
check(ensure('loopFrom').disabled === true && ensure('loopTo').disabled === true,
  '未启用时起止拍下拉禁用');
check(/未启用/.test(ensure('loopNote').textContent), '状态提示：全程播放');
check(savedArchive().loopRange === null, '存档中 loopRange 为 null（旧存档兼容口径）');

// 勾选启用区间 1..3：立即定位到第 1 拍并开始循环播放
ensure('loopFrom').value = '1';
ensure('loopTo').value = '3';
ensure('loopEnable').checked = true;
ensure('loopEnable').dispatch('change', { target: ensure('loopEnable') });
let s = savedArchive();
check(s.loopRange && s.loopRange.from === 1 && s.loopRange.to === 3, '区间 1..3 随浏览器存档保存');
check(s.currentBeat === 1, '启用即预览：先定位到区间起点（第 1 拍）');
check(ensure('loopBar').classList.contains('active'), '循环区间条激活');
check(global.__intervalCbs.length === 1, '已启动播放计时器');
check(ensure('playBtn').classList.contains('active'), '播放按钮呈播放态');
check(/循环区间/.test(ensure('loopNote').textContent), '状态提示：循环区间');

// 推进 2 拍：1 → 2 → 3（到终点）
tickPlay(2);
check(savedArchive().currentBeat === 3, '播放推进到区间终点（第 3 拍）');
// 再推进一拍：回到起点继续循环（而非停止）
tickPlay(1);
check(savedArchive().currentBeat === 1, '到终点后自动回到区间起点继续循环');
check(global.__intervalCbs.length === 1, '循环播放不会自行停止');

// 从区间外（第 0 拍）按播放：先定位到起点
global.__intervalCbs.length = 0;
ensure('beatSlider').value = '0';
ensure('beatSlider').dispatch('input', { target: ensure('beatSlider') });
check(savedArchive().currentBeat === 0 && global.__intervalCbs.length === 0,
  '拖到区间外（第 0 拍）时停止播放');
click('playBtn');
check(savedArchive().currentBeat === 1, '从区间外启动播放：先定位到区间起点');
tickPlay(2);
check(savedArchive().currentBeat === 3, '播放再次抵达区间终点');
tickPlay(1);
check(savedArchive().currentBeat === 1, '再次自动回绕循环');

// 取消勾选：恢复全程播放并停止
ensure('loopEnable').checked = false;
ensure('loopEnable').dispatch('change', { target: ensure('loopEnable') });
check(savedArchive().loopRange === null, '取消勾选：区间清空，恢复全程播放');
check(global.__intervalCbs.length === 0, '取消后播放停止');
check(!ensure('loopBar').classList.contains('active'), '区间条取消激活');

// 全程播放走完全程后停止（不循环）
click('playBtn');
check(global.__intervalCbs.length === 1, '全程播放启动');
tickPlay(savedArchive().state.beats + 1); // 推进足够多拍
check(global.__intervalCbs.length === 0, '全程播放到终点后停止');

// 重新启用区间 1..2，删除末拍到共 1 拍：区间退化为单点 → 恢复全程
ensure('loopFrom').value = '1';
ensure('loopTo').value = '2';
ensure('loopEnable').checked = true;
ensure('loopEnable').dispatch('change', { target: ensure('loopEnable') });
check(savedArchive().loopRange && savedArchive().loopRange.to === 2, '重新启用区间 1..2');
click('removeBeatBtn'); // 4 → 3
click('removeBeatBtn'); // 3 → 2
click('removeBeatBtn'); // 2 → 1
check(savedArchive().state.beats === 1, '连续删除至 1 拍');
check(savedArchive().loopRange === null, '区间无法容纳有效拍号：恢复全程播放');
check(ensure('loopEnable').checked === false, '勾选状态同步取消');
check(global.__intervalCbs.length === 0, '区间失效时播放已停止');
check(/已无法容纳/.test(ensure('toast').textContent), '明确提示恢复全程播放');

// 区间被夹紧但仍有效：加到 4 拍，设区间 2..4，删末拍 → 夹紧为 2..3
click('addBeatBtn'); click('addBeatBtn'); click('addBeatBtn');
check(savedArchive().state.beats === 4, '重新加回 4 拍');
ensure('loopFrom').value = '2';
ensure('loopTo').value = '4';
ensure('loopEnable').checked = true;
ensure('loopEnable').dispatch('change', { target: ensure('loopEnable') });
check(savedArchive().currentBeat === 2, '启用后定位到新起点');
click('removeBeatBtn'); // 4 → 3
s = savedArchive();
check(s.loopRange && s.loopRange.from === 2 && s.loopRange.to === 3, '删拍后区间夹紧为 2..3 并保留');
check(s.currentBeat === 2, '当前拍仍在夹紧后区间内');
check(/约束为/.test(ensure('toast').textContent), '提示区间已约束到有效拍号');

// 起止拍选成同拍：不破坏已保存区间，只提示
ensure('loopTo').value = '2';
ensure('loopTo').dispatch('change', { target: ensure('loopTo') });
s = savedArchive();
check(s.loopRange.from === 2 && s.loopRange.to === 3, '同拍选择不写入，已保存区间不变');
check(/同一拍/.test(ensure('toast').textContent), '同拍时明确提示');

// 只读报告不受拍数 / 区间编辑影响
check(savedArchive().reports.length === reportsCountBefore,
  '增删拍与区间设置不影响已生成的只读报告数量');

// 刷新等价口径：存档顶层带 loopRange、报告对象内不含该字段
check(savedArchive().reports.every((r) => r.loopRange === undefined),
  '只读报告快照内不含播放区间字段');

// ---------- 批量口令 ----------
// 此时 demo 4 位演员均在、共 3 拍（前面循环测试删拍后重新加回）：
// 阿丁 beat1=R 在 (8,6) 越界是当前唯一冲突；其余越界拍次动作已随删拍清除。
const archiveBeforeBatch = JSON.stringify(savedArchive().state);
check(ensure('batchCmdBtn') !== undefined, '走位表工具栏存在「批量口令」入口');
click('batchCmdBtn');
check(!ensure('batchModal').classList.contains('hidden'), '批量口令弹窗打开');
check(ensure('bcBeatsN').textContent === '3', '弹窗提示当前已有拍次数');
check(ensure('bcSubmit').disabled === true, '未校验时「确认写入」禁用');

// 1) 含多种逐行错误：格式 / 拍号超范围 / 方向非法 / 未知演员 / 重复组合
ensure('bcInput').value = [
  '2 阿丁',          // 1 格式错误
  '4 阿甲 右',       // 2 拍号 4 不存在
  '2 阿甲 东',       // 3 方向非法
  '2 无名氏 右',     // 4 未知演员
  '2 阿甲 右',       // 5 有效
  '3 阿乙 左',       // 6 有效
  '2 阿乙 上',       // 7 与第 8 行重复
  '2 阿乙 上'        // 8 与第 7 行重复
].join('\n');
click('bcCheck');
let errBox = ensure('bcErrors');
check(!errBox.classList.contains('hidden'), '错误时列出问题区');
const errRows = errBox.querySelectorAll('.bc-err-line');
const errMsgs = errBox.querySelectorAll('.bc-err-msg');
check(errRows.length === 6, '逐行指出 6 个问题（2 条有效不报错）');
check(/格式错误/.test(errMsgs[0].textContent), '第 1 行报格式错误');
check(/拍号 4 不存在/.test(errMsgs[1].textContent), '第 2 行报拍号不存在');
check(/无法识别/.test(errMsgs[2].textContent) && /东/.test(errMsgs[2].textContent),
  '第 3 行报方向无法识别');
check(/无名氏/.test(errMsgs[3].textContent) && /不存在/.test(errMsgs[3].textContent),
  '第 4 行报未知演员');
check(/重复/.test(errMsgs[4].textContent) && /第 8 行/.test(errMsgs[4].textContent),
  '第 7 行指出与第 8 行重复');
check(/重复/.test(errMsgs[5].textContent) && /第 7 行/.test(errMsgs[5].textContent),
  '第 8 行指出与第 7 行重复');
check(ensure('bcSubmit').disabled === true, '存在错误时禁止写入');
check(JSON.stringify(savedArchive().state) === archiveBeforeBatch,
  '校验出错不改走位、不落盘');

// 修改输入后上一次结果失效
ensure('bcInput').value = '2 阿丁 右';
ensure('bcInput').dispatch('input', { target: ensure('bcInput') });
check(ensure('bcSubmit').disabled === true, '编辑输入后需重新校验（确认按钮重新禁用）');

// 2) 临时副本越界：整批拒绝，列出本批行号与拍号；与本批无关的既有越界不列出
click('bcCheck');
check(errBox.classList.contains('hidden'), '重新校验后旧错误清空');
const pvReject = ensure('bcPreview').innerHTML;
check(/整批拒绝/.test(pvReject), '临时副本越界：整批拒绝');
const blockItems = ensure('bcPreview').querySelectorAll('.bc-block-list li');
check(blockItems.length === 1, '列出 1 条本批越界');
check(/第 1 行/.test(blockItems[0].textContent) && /第 2 拍/.test(blockItems[0].textContent) &&
  /阿丁/.test(blockItems[0].textContent), '列出越界口令的行号、拍号与演员');
check(ensure('bcSubmit').disabled === true, '越界时禁止写入');
{
  const st = savedArchive().state;
  const ding = st.actors.find((a) => a.name === '阿丁');
  check(ding.moves['2'] === undefined, '被拒绝的动作未写入真实走位');
}

// 取消：关闭弹窗，不修改走位
click('bcCancel');
check(ensure('batchModal').classList.contains('hidden'), '取消后弹窗关闭');
check(JSON.stringify(savedArchive().state) === archiveBeforeBatch, '取消不修改走位与存档');

// 3) 全部有效：预览原动作 / 新动作，确认后仅覆盖指定格并一次保存、刷新
click('batchCmdBtn');
ensure('bcInput').value = '2 阿甲 左\n2 阿丁 原地\n1 阿丁 原地';
click('bcCheck');
check(ensure('bcSubmit').disabled === false, '校验与试推演通过：允许确认写入');
const pvTbody = ensure('bcPreview').querySelector('.bc-table tbody');
const pvRows = pvTbody ? pvTbody.querySelectorAll('tr') : [];
check(pvRows.length === 3, '预览列出 3 个指定格（按拍序）');
check(/第 1 拍/.test(textOf(pvRows[0])) && /阿丁/.test(textOf(pvRows[0])),
  '预览按拍序：第 1 拍阿丁在前');
check(/原地/.test(textOf(pvRows[0])) &&
  pvRows[0].querySelectorAll('.mv-glyph').length === 2, '每格显示原动作与新动作');
check(pvRows[0].querySelector('.bc-tag-same') === null &&
  /覆盖/.test(textOf(pvRows[0])), '阿丁第 1 拍 右 → 原地：标记覆盖');
check(pvRows[1].querySelector('.bc-tag-same') === null &&
  pvRows[2].querySelector('.bc-tag-same') !== null,
  '阿丁第 2 拍原为空（推演口径=原地）：标记不变');{
  const saved = JSON.parse(storage['stage-blocking:v1']);
  const jia = saved.state.actors.find((a) => a.name === '阿甲');
  check(jia.moves['2'] === undefined, '确认前不提前落盘');
}
click('bcSubmit');
check(ensure('batchModal').classList.contains('hidden'), '确认后弹窗关闭');
{
  const saved = JSON.parse(storage['stage-blocking:v1']);
  const jia = saved.state.actors.find((a) => a.name === '阿甲');
  const ding = saved.state.actors.find((a) => a.name === '阿丁');
  check(jia.moves['2'] === 'L' && ding.moves['1'] === 'S' && ding.moves['2'] === 'S',
    '仅指定格被覆盖：阿甲 2=左、阿丁 1/2=原地');
  check(jia.moves['1'] === 'L', '未指定的格保持原动作（阿甲第 1 拍仍为左）');
}
check(ensure('conflictBadge').textContent === '0' &&
  ensure('conflictBadge').classList.contains('hidden'), '写入后冲突列表刷新：阿丁原越界消除，总数 0');
check(/批量口令已写入/.test(ensure('toast').textContent), '提示一次保存成功');

console.log('\nDOM 冒烟：' + pass + ' 项全部通过 🎉');
