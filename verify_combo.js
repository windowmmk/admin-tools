// 工作小工具 verify_combo.js —— v1.50 全流程驗收套件
// 做法：抽兩個源檔嘅真 <script> 出嚟，經隔離 eval＋DOM stub 跑真碼（唔係重寫邏輯）。
// 用法：node ~/workspace/verify_combo.js   （exit 0 = 全過）
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BASE_DIR = __dirname;
const SRC_T = path.join(BASE_DIR, 'tobacco-15day.html');
const SRC_C = path.join(BASE_DIR, 'cangjie.html');
const BUILD_PY = path.join(BASE_DIR, 'build_combo.py');
const DIST_DIR = path.join(BASE_DIR, 'dist', 'work-tools');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const DIST_SW = path.join(DIST_DIR, 'sw.js');
let PASS = 0;
function ok(){ PASS++; }
function section(t){ console.log('\n== ' + t + ' =='); }

function scriptOf(path){
  const h = fs.readFileSync(path, 'utf8');
  return h.match(/<script>([\s\S]*?)<\/script>/)[1];
}

// ---------- DOM stub ----------
const handlers = {};
function makeEl(id){
  const el = {
    _id:id, value:'', hidden:true, innerHTML:'', textContent:'',
    title:'', className:'', style:{}, dataset:{}, frag:null,
    scrollTop:0, clientHeight:0, scrollHeight:0,
    classList:{ _s:new Set(),
      add(c){this._s.add(c);}, remove(...a){a.forEach(c=>this._s.delete(c));},
      toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f; },
      contains(c){return this._s.has(c);} },
    setAttribute(){},
    addEventListener(ev,fn){ handlers[id+':'+ev]=fn; },
    appendChild(c){ if(c && c.children) el.frag = c; },
    removeChild(){}, select(){}, closest(){ return null; },
  };
  return el;
}
function makeDoc(){
  const els = {};
  return {
    els,
    getElementById(id){ return els[id] || (els[id] = makeEl(id)); },
    querySelector(){ return makeEl('q'); },
    addEventListener(ev,fn){ handlers['doc:'+ev]=fn; },
    createElement(){ return makeEl('dyn'); },
    createDocumentFragment(){ return { children:[], appendChild(c){ this.children.push(c); } }; },
    body: makeEl('body'),
    execCommand(){ return false; },
  };
}
function baseGlobals(doc){
  global.document = doc;
  global.window = global;
  global.navigator = {};
  global.requestAnimationFrame = fn => fn();
  global.fetch = () => Promise.reject(new Error('offline-test'));
}
// 隔離 eval：包喺 IIFE 入面，唔同外面嘅 const 撞名；用 __T 導出要測嘅真函數
function evalIsolated(doc, path, exports){
  baseGlobals(doc);
  const src = scriptOf(path) + '\n;globalThis.__XPORT={' + exports + '};';
  (function(){ return eval(src); })();
  return globalThis.__XPORT;
}

// ================= A. 15日計算 golden cases（人手驗算） =================
section('A. 15日計算 golden cases（人手驗算）');
const docA = makeDoc();
const TA = evalIsolated(docA, SRC_T,
  'calc,parseDateInput,blockReason,diffD,addD,keyOf,coverageMiss,HOL,HOLIDAYS_FALLBACK');
{
  const iso = d => TA.keyOf(d);
  const doCalc = (s) => TA.calc(TA.parseDateInput(s), TA.HOL);
  const goldens = [
    // [接獲, 預期final, 預期steps, 預期miss, 備註]
    ['2027-12-20', '2028-01-04', 0, ['2028'], '跨年：base 1/4 Mon 無阻擋，觸發假期不足警告'],
    ['2026-12-04', '2026-12-23', 4, [], '週末＋補假＋冬至：12/19六 12/20日 12/21補假 12/22冬至'],
    ['2026-09-17', '2026-10-05', 3, [], '國慶：10/02翌日 10/03六 10/04日'],
    ['2026-02-02', '2026-02-20', 3, [], '農曆新年：02/17初一 02/18初二 02/19初三'],
    ['2028-02-14', '2028-02-29', 0, ['2028'], '閏年 2/29 日期運算'],
    ['2026-01-05', '2026-01-20', 0, [], '年初平日無阻擋'],
  ];
  for (const [v, fExp, sExp, mExp, note] of goldens){
    const r = doCalc(v);
    assert.strictEqual(iso(r.final), fExp, v+' final');
    assert.strictEqual(r.steps.length, sExp, v+' steps');
    assert.strictEqual(iso(r.t1), iso(TA.addD(r.t0,1)), v+' t1=t0+1');
    assert.strictEqual(iso(r.base), iso(TA.addD(r.t0,15)), v+' base=t0+15');
    assert.deepStrictEqual(TA.coverageMiss(v), mExp, v+' miss');
    r.steps.forEach((s,i)=>{
      assert.strictEqual(iso(s.date), iso(TA.addD(r.base,i)), v+' step連續');
      assert.ok(TA.blockReason(s.date, TA.HOL), v+' step被阻擋:'+iso(s.date));
      assert.ok(s.reason, v+' step有原因');
    });
    assert.ok(TA.diffD(r.final, r.base) === r.steps.length, v+' final=base+steps');
    assert.strictEqual(TA.blockReason(r.final, TA.HOL), null, v+' final係工作天');
    ok(); console.log('  ✓', v, '→', fExp, '| steps', sExp, '| miss', JSON.stringify(mExp), '—', note);
  }
  const r2 = doCalc('2026-12-04');
  const reasons = r2.steps.map(s=>s.reason);
  assert.ok(reasons[0]==='星期六', '週末原因');
  assert.ok(reasons[1]==='澳門特別行政區成立紀念日', '正日撞星期日：假期名優先');
  assert.ok(reasons[2].includes('補假') && reasons[3]==='冬至', '假期原因');
  ok(); console.log('  ✓ 順延原因：'+reasons.join(' → '));
  // v1.60：原生控件 YYYY-MM-DD 解析
  const dISO = TA.parseDateInput('2026-12-04');
  assert.strictEqual(iso(dISO), '2026-12-04', 'YYYY-MM-DD 解析');
  assert.strictEqual(iso(TA.calc(dISO, TA.HOL).final), '2026-12-23', '計出同一個 final');
  assert.ok(isNaN(TA.parseDateInput('').getTime()), '空值唔算有效日期');
  ok(); console.log('  ✓ 原生 date 控件解析＋計算正常（2026-12-04 → 2026-12-23）');
}

// ================= B. property tests（日期不變式） =================
section('B. property tests（日期不變式）');
{
  const iso = d => TA.keyOf(d);
  let n = 0;
  const dates = [];
  for (let d = new Date(2026,0,6); d <= new Date(2027,11,28); d.setDate(d.getDate()+7))
    dates.push(iso(d));
  dates.push('2026-01-01','2027-12-31','2028-02-29','2028-12-31','2027-02-28');
  for (const v of dates){
    const t0 = TA.parseDateInput(v);
    const r = TA.calc(t0, TA.HOL);
    assert.strictEqual(iso(r.t1), iso(TA.addD(t0,1)), v+' t1');
    assert.strictEqual(iso(r.base), iso(TA.addD(t0,15)), v+' base');
    assert.ok(TA.diffD(r.final, r.base) >= 0, v+' final>=base');
    assert.strictEqual(TA.blockReason(r.final, TA.HOL), null, v+' final工作天');
    assert.strictEqual(TA.diffD(r.final, r.base), r.steps.length, v+' 步數連續');
    r.steps.forEach((s,i)=>{
      assert.strictEqual(iso(s.date), iso(TA.addD(r.base,i)), v+' step'+i);
      assert.ok(TA.blockReason(s.date, TA.HOL), v+' step阻擋');
    });
    const y0 = r.t0.getFullYear(), y1 = r.final.getFullYear();
    const need = []; for(let y=y0;y<=y1;y++) need.push(String(y));
    const uncovered = need.filter(y=>!Object.keys(TA.HOL).some(k=>k.indexOf(y+'-')===0));
    assert.deepStrictEqual(TA.coverageMiss(v).sort(), uncovered.sort(), v+' miss自洽');
    n++;
  }
  ok(); console.log('  ✓', n, '個日期全部通過不變式（t1/base/final/steps/miss）');
}

// ================= C. 警告橫幅＋彈窗接線 =================
section('C. 警告橫幅＋彈窗（真 render 接線）');
{
  const doc = makeDoc();
  const T = evalIsolated(doc, SRC_T,
    'render,coverageMiss,showHolModal,missText');
  doc.els['recv'] = makeEl('recv'); doc.els['recv'].value = '2027-12-20';
  T.render();
  const wb = doc.els['warnBox'].innerHTML;
  assert.ok(wb.includes('warn'), 'warnBox有警告');
  assert.ok(wb.includes('2028'), 'warnBox提到2028');
  ok(); console.log('  ✓ 接獲 2027-12-20 → warnBox 出現紅色警告（含 2028）');
  doc.els['recv'].value = '2026-10-01'; T.render();
  assert.strictEqual(doc.els['warnBox'].innerHTML, '', '一般日期無警告');
  ok(); console.log('  ✓ 接獲 2026-10-01 → warnBox 為空');
  const modal = doc.els['holModal'];
  T.showHolModal(['2028']);
  const body = doc.els['holModalBody'];
  assert.strictEqual(modal.hidden, false, '彈窗彈起');
  assert.ok(body.innerHTML.includes('2028'), '彈窗文案有2028');
  ok(); console.log('  ✓ showHolModal → 彈窗顯示，文案含 2028');
  handlers['holOk:click']();
  assert.strictEqual(modal.hidden, true, '知道了關閉');
  T.showHolModal(['2028']);
  handlers['holModal:click'].call(modal, {target: modal});
  assert.strictEqual(modal.hidden, true, '背景關閉');
  ok(); console.log('  ✓ 「知道了」＋點背景都關到彈窗');
  doc.els['recv'].value = '2027-12-31';
  handlers['recv:change'].call(doc.els['recv']);
  assert.strictEqual(modal.hidden, false, 'change超範圍彈窗');
  handlers['holOk:click']();
  handlers['recv:change'].call(doc.els['recv']);
  assert.strictEqual(modal.hidden, true, '同日期唔重彈');
  doc.els['recv'].value = '2026-10-01';
  handlers['recv:change'].call(doc.els['recv']);
  assert.strictEqual(modal.hidden, true, '一般日期唔彈');
  ok(); console.log('  ✓ change 事件：超範圍彈、一般唔彈、同日期唔重彈');
  assert.deepStrictEqual(T.coverageMiss(''), [], '空值');
  assert.deepStrictEqual(T.coverageMiss(null), [], 'null');
  ok(); console.log('  ✓ 空值／null 安全');
}

// ================= D. 倉頡 =================
section('D. 倉頡查詢');
{
  const doc = makeDoc();
  const C = evalIsolated(doc, SRC_C,
    'CJ,ensureCJ,T2S_M,S2T_M,toS,toT,roots,uni,rowHtml,render');
  assert.strictEqual(Object.keys(C.CJ).length, 0, 'v1.56 載入時唔建表（首頁先行）');
  ok(); console.log('  ✓ 載入時 CJ 係空：首頁唔等 7 萬字碼表');
  C.ensureCJ();
  assert.ok(Object.keys(C.CJ).length > 70000, 'ensureCJ 建表');
  ok(); console.log('  ✓ ensureCJ() 即時建表（首次用倉頡頁／閒時觸發）');
  const cjN = Object.keys(C.CJ).length;
  console.log('  · 倉頡表', cjN, '字｜繁簡對照', C.T2S_M.size, '/', C.S2T_M.size, '組');
  assert.ok(cjN > 70000, '倉頡表量級');
  assert.ok(C.T2S_M.size > 4000 && C.S2T_M.size > 4000, '對照表量級');
  ok();
  const pairs = [['歡','欢'],['體','体'],['國','国'],['學','学'],['發','发'],['們','们'],['龍','龙']];
  for (const [t,s] of pairs) assert.strictEqual(C.toS(t), s, 'toS '+t);
  for (const [t,s] of pairs) assert.strictEqual(C.toT(s), t, 'toT '+s);
  assert.strictEqual(C.toS('hello 中 123'), 'hello 中 123', '無對照不變');
  assert.strictEqual(C.toT('中'), '中', '中恆等');
  ok(); console.log('  ✓ 繁簡轉換：含 歡→欢 回歸，7 組全對，雜項不變');
  assert.strictEqual(C.roots('oiar'), '人戈日口');
  assert.strictEqual(C.roots('x'), '難');
  assert.strictEqual(C.roots('z'), 'z', '特殊碼原樣');
  ok(); console.log('  ✓ roots：oiar→人戈日口，x=難');
  assert.ok(Array.isArray(C.CJ['體']) && C.CJ['體'].length>0, '體有碼');
  console.log('  · 體 =', C.CJ['體'].join(','));
  const multi = Object.keys(C.CJ).find(k=>C.CJ[k].length>1);
  assert.ok(multi, '有多重碼嘅字'); console.log('  · 多重碼例：'+multi+' = '+C.CJ[multi].join(','));
  ok();
  const ext = Object.keys(C.CJ).find(k=>k.length===2);
  assert.ok(ext, '有擴展區字');
  assert.ok(C.CJ[ext].length>0, '擴展區查到碼');
  assert.strictEqual(C.uni(ext), 'U+'+ext.codePointAt(0).toString(16).toUpperCase(), 'uni碼點正確');
  C.toS(ext); C.toT(ext);
  ok(); console.log('  ✓ 擴展區字 '+ext+'（'+C.uni(ext)+'）查碼＋轉換正常');
  // v2.01：一字一卡（全闊列表）；卡入面繁體行＋簡體行；無速成
  const rh = C.rowHtml('體', C.CJ['體'], '');
  assert.ok(rh.includes('class="glyph">體<'), '繁體行大字');
  assert.ok(rh.includes('class="code">' + C.CJ['體'][0] + '<'), '主碼');
  assert.ok(rh.includes('class="roots"'), '字根保留');
  assert.ok(!rh.includes('速成'), '無速成');
  const rhMiss = C.rowHtml('\ue000', null, '查無此字');
  assert.ok(rhMiss.includes('查無此字'), '無碼行');
  ok(); console.log('  ✓ rowHtml：字＋碼＋字根，無速成');
  const noCode = '';
  assert.strictEqual(C.CJ[noCode], undefined, '測試字確實無碼');
  doc.els['in'].value = '體中' + noCode;
  C.render();
  const cards = doc.els['grid'].frag.children;
  assert.strictEqual(cards.length, 3, '三張卡');
  // v2.01：一字一卡；簡體行喺同一張卡入面繁體下面；無「簡體」二字、無 U+ 碼點、無速成
  assert.ok(cards[0].innerHTML.includes('>體<') && cards[0].innerHTML.includes('>体<'), '體卡：繁＋簡同卡');
  assert.ok(cards[0].innerHTML.includes('row simp'), '簡體行有 simp 分隔');
  assert.ok(!cards[0].innerHTML.includes('簡體'), '無「簡體」二字');
  assert.ok(cards[1].innerHTML.includes('class="glyph">中') && !cards[1].innerHTML.includes('row simp'), '中卡無簡體行');
  assert.ok(cards[2].innerHTML.includes('查無此字'), '無碼卡');
  for (let ri = 0; ri < cards.length; ri++) assert.ok(!cards[ri].innerHTML.includes('速成'), '無速成顯示');
  assert.ok(cards[0].dataset.code === C.CJ['體'][0], 'dataset.code 供複製');
  assert.ok(doc.els['stats'].textContent.includes('共 3 字'), 'stats');
  assert.ok(C.uni('體')==='U+9AD4', 'uni 函數保留');
  ok(); console.log('  ✓ render：一字一卡（體卡含簡體行／中卡／無碼卡）＋stats＋dataset.code');
  doc.els['in'].value = '繁體中文';
  handlers['t2s:click']();
  assert.strictEqual(doc.els['in'].value, '繁体中文', '轉簡體');
  handlers['s2t:click']();
  assert.strictEqual(doc.els['in'].value, '繁體中文', '轉繁體');
  doc.els['in'].value = 'abc';
  handlers['t2s:click']();
  assert.ok(doc.els['toast'].textContent.includes('無需轉換'), '無需轉換提示');
  ok(); console.log('  ✓ 轉簡體／轉繁體掣＋無需轉換提示');
}

// ================= E. 合併成品靜態檢查 =================
section('E. 合併成品靜態檢查');
{
  const h = fs.readFileSync(DIST_INDEX,'utf8');
  const verSrc = fs.readFileSync(BUILD_PY,'utf8');
  const ver = (verSrc.match(/^VER\s*=\s*'([^']+)'/m)||[])[1];
  assert.ok(ver && h.includes('請注意分辨 · '+ver), '版本併入頂部聲明列（v1.58 不再漂浮）' + ver);
  assert.ok(!h.includes('class="ver"'), '漂浮版本掣已移除');
  assert.ok(h.includes('viewport-fit=cover'), 'viewport-fit');
  const sa = (h.match(/env\(safe-area-inset/g)||[]).length;
  assert.ok(sa >= 5, '安全區規則');
  assert.ok(h.includes('r=calc(vd, HOL)'), 'v1.45 fix 入咗成品');
  assert.ok(h.includes('while(diffD(d, r.final)<=0)'), 'loop 方向啱');
  // v2.01：卡片＋行樣式在線（一字一卡，卡入面 flex 橫排行）
  const m = h.match(/#pg-cj \.row\{([^}]*)\}/)[1];
  assert.ok(/display:flex/.test(m) && /align-items:center/.test(m), 'row 橫排置中');
  assert.ok(h.includes('id="pg-tobacco"') && h.includes('id="pg-cj"'), '兩頁容器');
  assert.ok(h.includes('id="holModal"') && h.includes('id="warnBox"'), '警告＋彈窗');
  assert.ok(Buffer.byteLength(h,'utf8') > 800000, '檔案完整（800KB+）');
  assert.ok(h.includes('id="a2hsModal"') && h.includes('id="a2hsOpen"') && h.includes('id="a2hsClose"'), '主畫面教學 modal＋重開連結');
  assert.ok(h.includes('id="a2hsGuide"'), '提示卡有圖文教學掣');
  assert.ok(!h.includes('冇瀏覽器工具列'), '舊過度承諾文案已刪');
  assert.ok(h.includes('rel="apple-touch-icon"') && h.includes('data:image/png;base64,'), 'apple-touch-icon（data URI）');
  assert.ok(h.includes('apple-mobile-web-app-title'), 'app title meta');
  assert.ok(h.includes('A2HS_ON = false'), '主畫面引導已停用（v1.55 用戶要求，彈框太擋畫面）');
  assert.ok(h.includes('class="ai-note"') && h.includes('本工具由 AI 生成，內容未經審核，請注意分辨'), 'v1.57 頂部 AI 生成聲明');
  assert.ok(h.includes('requestIdleCallback') && h.includes('function ensureCJ()'), 'v1.56 碼表延遲載入（閒時／首次用先建表）');
  assert.ok(h.includes('/Android/.test(ua)'), 'A2HS 支援 Android（v1.54，現已停用但代碼保留）');
  assert.ok(h.includes('@keyframes slideU') && h.includes('@keyframes slideD'), '上下滑動畫');
  assert.ok(!h.includes("Math.abs(dy)>80"), '直滑換頁已移除（v1.69；只保留橫滑）');
  // v1.58：假期說明＋狀態列成組移除（用戶：呢啲字唔要）
  assert.ok(!h.includes('內建版本') && !h.includes('來源 gov.mo') && !h.includes('開頁自動即時讀取') && !h.includes('id="status"'), '假期說明／狀態列已移除');
  assert.ok(h.includes('<summary>計算規則</summary>') && !h.includes('計算規則與資料來源'), '詳情標題同步簡化');
  assert.ok(h.includes('假期類型（紅字）') && !h.includes('假期（紅字為類型）'), '圖例文案');
  assert.ok(h.includes("'（'+WD[r.final.getDay()]+'）'") && !h.includes("'星期'+WD[r.final.getDay()]"), 'hero 星期劃一（（三））');
  // v1.58 倉頡頁：說明三行成組移除（用戶：呢啲文字都唔要）
  assert.ok(!h.includes('點擊卡片可複製倉頡碼') && !h.includes('輸入文字即時查倉頡碼與速成碼') && !h.includes('碼表：RIME'), '倉頡頁說明三行已移除');
  // v2.01 倉頡頁：一字一卡列表，唔顯示速成（placeholder 例句「倉頡碼速成」唔計）
  assert.ok(!h.includes('速成<b>') && !h.includes("class=\"quick\""), '無速成顯示');
  assert.ok(h.includes('#pg-cj .row{') && h.includes("closest('.card')"), '一字一卡列表在線');
  // v1.52 去敏感字：唔再出現繳款／繳付／罰款／執法部門
  assert.ok(!/繳款|繳付|罰款|執法部門/.test(h), '成品無敏感字眼');
  // v1.51 標題簡化：唔再提控煙法
  assert.ok(h.includes('<title>行政小工具(15天/倉頡碼)</title>') || h.includes('<title>小工具(15天/倉頡碼)</title>'), '標題在線');
  // v1.60：日期轉返原生控件（用戶：唔要手工輸入）
  assert.ok(h.includes('type="date" id="recv"'), '日期用返原生 date 控件');
  assert.ok(!h.includes('placeholder="DD/MM/YYYY"') && !h.includes('inputmode="numeric" id="recv"'), '手工輸入已移除');
  // v1.58：月曆字體收窄（用戶：大細差太多睇到辛苦）；v1.70：ctag/pill 劃一 12.5px（v1.58 漏咗 ctag，用戶再投訴）
  const pillRule = (h.match(/#pg-tobacco \.cell \.pill\{([^}]*)\}/)||[])[1] || '';
  const ctagRule = (h.match(/#pg-tobacco \.cell \.ctag\{([^}]*)\}/)||[])[1] || '';
  const htypeRule = (h.match(/#pg-tobacco \.cell \.htype\{([^}]*)\}/)||[])[1] || '';
  const dnumRule = (h.match(/#pg-tobacco \.cell \.dnum\{([^}]*)\}/)||[])[1] || '';
  assert.ok(/font-size:12\.5px/.test(pillRule) && /font-size:12\.5px/.test(ctagRule) && /font-size:11px/.test(htypeRule) && /font-size:16px/.test(dnumRule), '月曆字體統一（ctag/pill 12.5px，htype 11px，日期 16px）');
  // v1.71：月曆每格內容左右置中（用戶要求）
  const cellRule = (h.match(/#pg-tobacco \.cell\{([^}]*)\}/)||[])[1] || '';
  assert.ok(/text-align:center/.test(cellRule), '月曆格內容左右置中');
  // v1.76：格仔標籤縮到2字（用戶：換行唔舒服；符號太省、直書唔要，折衷2字）；假期清單照用全名
  assert.ok(h.includes("n===15?'15天':'順延'"), '順延格第15天→15天');
  assert.ok(h.includes('pill">發出<') && h.includes('pill">期限<'), '發出日→發出，期限2字');
  assert.ok(h.includes('holTypeShort(h)'), '格仔用短版假期名');
  assert.ok(h.includes('holType(it.name)'), '假期清單照用 holType 全名');
  assert.ok(/return '假期';/.test(h) && /return '補假';/.test(h) && /return '豁免';/.test(h), '短版：假期／補假／豁免');
  // v2.02 台灣雜誌配色：第1-14天芥末高亮（暖紙底）
  const cntRule = (h.match(/#pg-tobacco \.cell\.cnt\{([^}]*)\}/)||[])[1] || '';
  assert.ok(/background:#f6eeda/.test(cntRule), '第1-14天芥末高亮');
  assert.ok(h.includes("cls += ' cnt'") && h.includes('n >= 1 && n <= 14'), '第1-14天格加 cnt class');
  ok(); console.log('  ✓ 第1-14天淺藍高亮（v2.01）');
  // v1.59：PWA 三件套（用戶：唔滿足條件加唔到去首頁）
  assert.ok(h.includes('<link rel="manifest" href="manifest.webmanifest">'), 'manifest 連結');
  assert.ok(h.includes('<meta name="theme-color" content="#2e2a24">'), 'theme-color 墨色');
  // v2.02 台灣雜誌配色（v2.05 墨綠轉墨色）：暖紙底＋墨色主色＋磚紅期限＋赭石順延
  assert.ok(h.includes('background:#faf6ee'), '暖紙底');
  assert.ok(h.includes('--acc:#2e2a24'), '倉頡主色墨色');
  assert.ok(h.includes('.cell.fin{border:2px solid #b0523f'), '期限磚紅');
  assert.ok(h.includes('.cell.def{border:2px dashed #c07f2e'), '順延赭石');
  assert.ok(h.includes('.cell.t0{border:2px solid #1e9ab8'), '發出日水藍');
  ok(); console.log('  ✓ 雜誌配色在線（v2.05 墨色）');
  // v2.04：去雙線＋hero 實色焦點（可用性優先：答案一眼見到）
  assert.ok(!h.includes('3px double'), '無雙線');
  assert.ok(h.includes('.hero{background:#fdf3dc'), 'hero 淺暖焦點（唔用深色底）');
  assert.ok(h.includes('<div class="sec" id="stepsCard">'), '順延明細去卡片化');
  assert.ok(h.includes('<div class="kicker">日曆</div>') && h.includes('<div class="kicker">本期涉及假期</div>'), '小標');
  assert.ok(!h.includes('<div class="inrow">') && !h.includes('<h2 class="hh">'), '舊結構已清');
  ok(); console.log('  ✓ v2.04 版式在線（去雙線＋實色焦點）');
  // div 平衡：兩頁 body 唔可以有未閂嘅 div（v2.03 白屏教訓：pg-cj 俾吞入 pg-tobacco）
  for (const [nm, p] of [['15天', SRC_T], ['倉頡', SRC_C]]) {
    const src = fs.readFileSync(p, 'utf8');
    const bm = src.match(/<body>([\s\S]*)<\/body>/);
    const b = bm[1].replace(/<script>[\s\S]*?<\/script>/g, '');
    const opens = (b.match(/<div\b/g) || []).length, closes = (b.match(/<\/div>/g) || []).length;
    assert.strictEqual(opens, closes, nm + ' div 平衡（開' + opens+'／閂'+closes+'）');
  }
  ok(); console.log('  ✓ div 平衡');
  // v2.10：新版本檢查＋提示刷新
  const VER = (fs.readFileSync(BUILD_PY, 'utf8').match(/VER\s*=\s*'([^']+)'/) || [])[1];
  assert.ok(h.includes("var VER='"+VER+"'"), '版本常量注入（'+VER+'）');
  assert.ok(h.includes('version.txt?t='), 'version.txt 輪詢');
  assert.ok(h.includes("id='verHint'") || h.includes('id="verHint"'), '新版本小 hint');
  assert.ok(h.includes('tc_ver_dismissed'), '✕ 後永久唔再打擾（localStorage）');
  assert.ok(h.includes('controllerchange'), 'SW 更新後刷新');
  const DISTV = (DIST_DIR + path.sep);
  assert.ok(fs.existsSync(DISTV+'version.txt'), 'dist 有 version.txt');
  assert.strictEqual(fs.readFileSync(DISTV+'version.txt','utf8').trim(), VER, 'version.txt 版本正確');
  const swjs = fs.readFileSync(DISTV+'sw.js','utf8');
  assert.ok(swjs.includes("endsWith('version.txt')"), 'SW 豁免 version.txt 緩存');
  ok(); console.log('  ✓ 新版本檢查在線（'+VER+'）');
  // v2.11：設計語言一致性（色／線）
  assert.ok(!h.includes('#147a96'), '無深水藍（資訊藍統一 #1e9ab8）');
  assert.ok(!h.includes('#e03131'), '無亮紅框（錯誤紅統一 #a61e1e）');
  assert.ok(!/#b00\b/.test(h), '無 #b00（錯誤紅統一 #a61e1e）');
  assert.ok(!h.includes('#ece4d4') && !h.includes('#efe7d6'), '分隔線統一 #e7ddcc');
  assert.ok(h.includes('color:#1e9ab8;background:#e8f4f8'), '離線 pill 用資訊藍');
  ok(); console.log('  ✓ 設計語言一致（v2.11）');
  // v2.12：觸控反饋（focus／active 態）
  assert.ok(h.includes('#recv:focus'), '發出日期輸入框有 focus 態');
  assert.ok(h.includes('textarea:focus'), '倉頡輸入框有 focus 態');
  assert.ok(h.includes('.tabs button:active'), 'tab 按鈕有 active 態');
  assert.ok(h.includes('#tabToggle:active'), '隱藏按鈕有 active 態');
  assert.ok(h.includes('button:active'), '轉換按鈕有 active 態');
  ok(); console.log('  ✓ 觸控反饋在線（v2.12）');
  // v2.13：午夜翻轉（用戶冇手動改過先自動跟今日）
  assert.ok(h.includes('checkRollover'), '有翻轉檢查函數');
  assert.ok(h.includes('autoDate'), '追蹤系統自動設的日期');
  assert.ok(/r\.value === autoDate/.test(h), '只喺用戶冇手動改過先更新');
  ok(); console.log('  ✓ 午夜翻轉在線（v2.13）');
  // v2.13：深色模式鎖淺色
  assert.ok(h.includes('name="color-scheme" content="light"'), 'color-scheme 鎖 light，夜間模式唔影響顯示');
  ok(); console.log('  ✓ 深色模式鎖定（v2.13）');
  assert.ok(h.includes("navigator.serviceWorker.register('sw.js'"), 'SW 註冊碼');
  const DIST = (DIST_DIR + path.sep);
  assert.ok(fs.existsSync(DIST+'index.html') && fs.existsSync(DIST+'manifest.webmanifest') && fs.existsSync(DIST+'sw.js'), 'dist 三件套齊');
  for (const ic of ['icon-192.png','icon-512.png','icon-maskable-512.png']) assert.ok(fs.existsSync(DIST+ic), 'dist '+ic);
  const mf = JSON.parse(fs.readFileSync(DIST+'manifest.webmanifest','utf8'));
  assert.ok(mf.name.includes('行政小工具') || mf.name.includes('小工具'), 'manifest 名');
  assert.ok(mf.short_name === '行政小工具' || mf.short_name === '小工具', 'manifest 短名');
  assert.ok(['standalone','fullscreen','minimal-ui'].includes(mf.display), 'display 獨立');
  assert.ok(mf.start_url && mf.icons.some(i=>i.sizes==='192x192') && mf.icons.some(i=>i.sizes==='512x512'), 'start_url＋192/512 icons');
  assert.ok(mf.icons.some(i=>i.purpose==='maskable'), 'maskable icon');
  const swj = fs.readFileSync(DIST+'sw.js','utf8');
  assert.ok(swj.includes("addEventListener('fetch'") && swj.includes('work-tools-'+ver), 'SW 有 fetch 處理＋版本化快取');
  assert.ok(!swj.includes('__CACHE_VERSION__'), 'SW 版本號已注入');
  ok(); console.log('  ✓ '+ver+' PWA：manifest＋SW＋icons（小工具(15天/倉頡碼)／低飽和logo）');
  ok(); console.log('  ✓ '+ver+' 版本入頂欄／viewport-fit／安全區×'+sa+'／兩頁／警告彈窗／simp乾淨／主畫面引導已停用／碼表延遲載入／AI聲明／橫滑換頁／icon／文案打磨／倉頡簡化／體積正常／標題無控煙法');
}

// ================= F. 滑動換頁（真 touch 事件；直滑已停用） =================
section('F. 滑動換頁');
{
  const doc = makeDoc();
  doc.getElementById('pg-tobacco').hidden = false; // 真 HTML：pg-tobacco 冇 hidden，pg-cj 有
  baseGlobals(doc);
  const comboScript = (fs.readFileSync(DIST_INDEX, 'utf8').match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  (function(){ return eval(comboScript); })();
  const pgT = doc.els['pg-tobacco'], pgC = doc.els['pg-cj'];
  for (const pg of [pgT, pgC]){ pg.clientHeight=600; pg.scrollHeight=1600; }
  assert.strictEqual(pgT.hidden, false, '初始15天頁');
  const tgt = {closest(){return null;}};
  const swipe = (x0,y0,x1,y1,pg,st)=>{
    pg.scrollTop = st;
    handlers['doc:touchstart']({target:tgt, changedTouches:[{clientX:x0,clientY:y0}]});
    handlers['doc:touchend']({changedTouches:[{clientX:x1,clientY:y1}]});
  };
  const onT = ()=> pgT.hidden===false && pgC.hidden===true;
  const onC = ()=> pgC.hidden===false && pgT.hidden===true;
  swipe(100,500,100,380,pgT,1000); assert.ok(onT(), '頁底上滑已停用（唔換頁）');
  handlers['tabT:click']();
  swipe(100,500,100,380,pgT,500);  assert.ok(onT(), '頁中上滑唔換頁');
  handlers['tabC:click'](); assert.ok(onC());
  swipe(100,300,100,430,pgC,0);    assert.ok(onC(), '頁頂下拉已停用（唔換頁）');
  handlers['tabT:click'](); assert.ok(onT());
  swipe(100,300,100,430,pgT,0);    assert.ok(onT(), '第一頁頂下拉唔換');
  handlers['tabC:click']();
  swipe(100,500,100,380,pgC,1000);  assert.ok(onC(), '最尾頁底上滑唔換');
  handlers['tabT:click']();
  swipe(300,400,180,400,pgT,0);    assert.ok(onC(), '橫滑（左滑）照舊');
  handlers['tabT:click']();
  swipe(100,500,160,440,pgT,1000);  assert.ok(onT(), '斜滑唔換頁');
  swipe(100,500,100,450,pgT,1000);  assert.ok(onT(), '細幅度上滑唔換');
  ok(); console.log('  ✓ 直滑換頁已停用；橫滑照舊；頁中／斜滑／細幅唔換');
}

// ================= G. 安全加固（v1.77；工程驗收角度：魯棒＋安全，唔加功能） =================
section('G. 安全加固');
{
  const srcT = fs.readFileSync(SRC_T,'utf8');
  const srcC = fs.readFileSync(SRC_C,'utf8');
  const scriptsOf = (src)=> (src.match(/<script>([\s\S]*?)<\/script>/g)||[]).join('\n');
  const jsT = scriptsOf(srcT), jsC = scriptsOf(srcC);
  // 無 eval／new Function（只查源檔，唔查驗收 harness 本身）
  for (const [nm, js] of [['tobacco',jsT],['cangjie',jsC]]){
    assert.ok(!/[^a-zA-Z_$]eval\s*\(/.test(js), nm+' 無 eval(');
    assert.ok(!/new\s+Function\s*\(/.test(js), nm+' 無 new Function');
  }
  // 無外部 script／stylesheet（離線完整性；gov.mo iCal 係 fetch，非引用）
  for (const [nm, src] of [['tobacco',srcT],['cangjie',srcC]]){
    assert.ok(!/<script[^>]+src\s*=\s*["']https?:/.test(src), nm+' 無外部 script');
    assert.ok(!/<link[^>]+href\s*=\s*["']https?:/.test(src), nm+' 無外部 stylesheet');
  }
  // esc 覆蓋：兩頁都有定義；倉頡 render／rowHtml 用 esc 包用戶字元（縱深防禦）
  assert.ok(/function esc\(/.test(jsT) && /function esc\(/.test(jsC), '兩頁都有 esc()');
  assert.ok(jsC.includes('\'<span class="glyph">\' + esc(ch)'), '倉頡列表大字經 esc');
  assert.ok(jsC.includes("rowHtml(s, CJ[s]"), '簡體行經 rowHtml（esc 覆蓋）');
  // 15天頁外部數據（iCal 假期名／順延原因）經 esc 先入 innerHTML
  assert.ok(jsT.includes('esc(s.reason)') && jsT.includes('esc(it.name)'), '外部假期數據經 esc');
  // SW：navigate 降級＋舊快取清理（離線魯棒）
  const swj = fs.readFileSync(DIST_SW,'utf8');
  assert.ok(swj.includes("caches.match('index.html')"), 'SW navigate 降級到 index.html');
  assert.ok(swj.includes('caches.delete'), 'SW 清理舊版本快取');
  ok(); console.log('  ✓ 無eval／無外部資源／esc覆蓋用戶輸入＋外部數據／SW降級＋清舊快取');
}

// ================= H. 正確性（v1.78；最高優先：計錯工具就無意義） =================
section('H. 正確性');
{
  // H1：parseICS live 路徑單元測試（之前零覆蓋；2026-10-01 已用真 gov.mo iCal 驗過 56/56 同內建表一致）
  const docH = makeDoc();
  const TH = evalIsolated(docH, SRC_T, 'parseICS,pad');
  const ICS =
    'BEGIN:VCALENDAR\r\n' +
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261225\r\nSUMMARY:聖誕節 (公眾假期)\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20261223T160000Z\r\nSUMMARY:平安夜測試\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20261231T160000Z\r\nSUMMARY:跨年測試\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART:20261231T150000Z\r\nSUMMARY:除夕 (豁免上班)\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270102\r\nSUMMARY:測試日\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nSUMMARY:壞資料無DTSTART\r\nEND:VEVENT\r\n' +
    'END:VCALENDAR';
  const pm = {};
  assert.strictEqual(TH.parseICS(ICS, pm), 5, 'parseICS 解析 5 項、壞資料跳過');
  assert.strictEqual(pm['2026-12-25'], '聖誕節', 'DATE 型＋括號類型剝離');
  assert.strictEqual(pm['2026-12-24'], '平安夜測試', 'UTC 16:00→澳門+8 唔跨日');
  assert.strictEqual(pm['2027-01-01'], '跨年測試', 'UTC 16:00→澳門+8 跨日');
  assert.strictEqual(pm['2026-12-31'], '除夕（下午豁免）', '豁免上班轉下午豁免');
  assert.strictEqual(pm['2027-01-02'], '測試日', 'DATE 型 2027');
  ok(); console.log('  ✓ parseICS：DATE／UTC+8跨日／類型剝離／豁免／壞資料跳過');
  // H2：內建 fallback 表鎖定（56 項、全部有效日期、只含 2026–2027、有名）
  const fbKeys = Object.keys(TA.HOLIDAYS_FALLBACK);
  assert.strictEqual(fbKeys.length, 56, '內建表 56 項');
  for (const k of fbKeys){
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k), '鍵格式 '+k);
    const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10));
    assert.ok(!isNaN(d.getTime()) && TA.keyOf(d) === k, '有效日期 '+k);
    assert.ok(k.slice(0,4)==='2026' || k.slice(0,4)==='2027', '年份範圍 '+k);
    assert.ok(TA.HOLIDAYS_FALLBACK[k].length > 0, '有名 '+k);
  }
  ok(); console.log('  ✓ 內建 56 項全有效日期、2026–2027、非空名');
  // H3：下午豁免 golden（人手驗算：接獲 2026-02-01 日→base 02-16 除夕豁免→連初一二三→final 02-20）
  const rE = TA.calc(TA.parseDateInput('2026-02-01'), TA.HOL);
  assert.strictEqual(TA.keyOf(rE.final), '2026-02-20', '豁免 golden final');
  assert.strictEqual(rE.steps.length, 4, '豁免 golden steps');
  assert.ok(rE.steps[0].reason.includes('豁免'), '首步原因係豁免');
  ok(); console.log('  ✓ 下午豁免 golden：2026-02-01 → 2026-02-20（4 步）');
  // H4：parseDateInput 嚴格校驗（v1.80 查缺補漏：唔畀 02-30 自動滾到 03-02）
  assert.ok(isNaN(TA.parseDateInput('2026-02-30').getTime()), '拒絕 2026-02-30');
  assert.ok(isNaN(TA.parseDateInput('2026-13-01').getTime()), '拒絕 13 月');
  assert.ok(isNaN(TA.parseDateInput('').getTime()), '拒絕空字串');
  assert.strictEqual(TA.keyOf(TA.parseDateInput('2026-02-28')), '2026-02-28', '正常日期照收');
  ok(); console.log('  ✓ parseDateInput 嚴格：非法日期拒收（唔自動滾月）');
}

// ================= I. 私隱＋完全離線（v1.78） =================
section('I. 私隱＋完全離線');
{
  const srcT = fs.readFileSync(SRC_T,'utf8');
  const srcC = fs.readFileSync(SRC_C,'utf8');
  const scriptsOf = (src)=> (src.match(/<script>([\s\S]*?)<\/script>/g)||[]).join('\n');
  const jsT = scriptsOf(srcT), jsC = scriptsOf(srcC);
  // 零記錄：無任何本地儲存／cookie
  for (const [nm, js] of [['tobacco',jsT],['cangjie',jsC]]){
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js), nm+' 零本地記錄');
    assert.ok(!/sendBeacon/.test(js), nm+' 無信標追蹤');
    assert.ok(!/new\s+Image\s*\(/.test(js), nm+' 無追蹤像素');
  }
  // 唯一網絡請求：取 gov.mo 公眾假期（GET 常量 URL，唔帶用戶數據）；無其他外部 URL
  assert.strictEqual((jsT.match(/[^a-zA-Z_$]fetch\s*\(/g)||[]).length, 1, 'tobacco 唯一 fetch');
  assert.ok(!/[^a-zA-Z_$]fetch\s*\(/.test(jsC), 'cangjie 零 fetch');
  assert.ok(!/https?:\/\/(?!www\.gov\.mo\/)/.test(jsT + jsC), '無其他外部 URL');
  assert.ok(jsT.includes("credentials:'omit'"), 'fetch 唔帶憑證');
  assert.ok(jsT.includes("referrerPolicy:'no-referrer'"), 'fetch 唔帶 referrer');
  ok(); console.log('  ✓ 零記錄／零追蹤／唯一請求假期iCal（唔帶用戶數據、唔帶憑證/referrer）');
  // 完全離線：SW CORE 冚晒 dist 檔案（sw.js 本身唔使緩存）；斷網開站 fallback 到緩存 index.html（G 組已斷言）
  const DIST2 = (DIST_DIR + path.sep);
  const swj2 = fs.readFileSync(DIST2+'sw.js','utf8');
  const core = [...swj2.matchAll(/'([^']+)'/g)].map(m=>m[1]).filter(s=>/\.(html|webmanifest|png)$/.test(s));
  const distFiles = fs.readdirSync(DIST2).filter(f=>f!=='sw.js'&&f!=='version.txt'); /* version.txt 永不緩存（v2.10） */
  assert.ok(distFiles.length > 0, 'dist 有檔案');
  for (const f of distFiles) assert.ok(core.includes(f), 'SW 緩存冚 '+f);
  ok(); console.log('  ✓ SW 緩存冚晒 '+distFiles.length+' 個 dist 檔案，worker 上靠緩存完全離線行');
}

// ================= J. 私隱／離線前端傳達（v1.79） =================
section('J. 私隱／離線前端傳達');
{
  const html = fs.readFileSync(DIST_INDEX,'utf8');
  const privCount = (html.match(/本地運算，不會作任何記錄，離線可用/g)||[]).length;
  assert.ok(privCount >= 2, '兩頁私隱行 ×'+privCount);
  const pillCount = (html.match(/class="offpill"/g)||[]).length;
  assert.ok(pillCount >= 2, '兩頁離線 pill ×'+pillCount);
  assert.ok(html.includes('navigator.onLine'), '讀 onLine 狀態');
  assert.ok(html.includes("addEventListener('offline'"), '監聽 offline');
  assert.ok(html.includes('假期來源：政府 iCal，載入失敗用內建表'), '假期來源註腳');
  ok(); console.log('  ✓ 私隱行／離線pill／假期來源註腳齊');
}

// ================= K. 順延行垂直對齊（v1.81） =================
section('K. 順延行對齊');
{
  const tSrc = fs.readFileSync(SRC_T,'utf8');
  assert.ok(/\.steps li\{[^}]*display:flex/.test(tSrc), 'steps li 用 flex 排');
  assert.ok(/\.steps li \.arr\{[^}]*margin-left:auto/.test(tSrc), '.arr 推到右邊對齊');
  // v1.82：日期用等寬數字，唔同日期闊度一致，假期名首字垂直對齊
  assert.ok(tSrc.includes('<span class="sd">'), '日期包咗 .sd span');
  assert.ok(/\.steps li \.sd\{[^}]*tabular-nums/.test(tSrc), '.sd 用 tabular-nums 等寬數字');
  ok(); console.log('  ✓ 順延行：原因長短唔同，「→ 順延一天」都右對齊；日期等寬，假期名首字對齊');
}

// ================= L. 字體統一（v1.83） =================
section('L. 字體統一');
{
  const buildSrc = fs.readFileSync(BUILD_PY,'utf8');
  assert.ok(/button,input,textarea,select\{font-family:inherit;?\}/.test(buildSrc), '表單掣繼承 body 字體');
  ok(); console.log('  ✓ 按鈕／輸入框／文字區統一用頁面字體（唔再係瀏覽器預設）');
}

// ================= M. 字階規範（v1.84） =================
section('M. 字階規範');
{
  const SCALE = new Set(['11','12.5','13','14','15','16','18','19','20','28','30','32']);
  const srcs = [
    fs.readFileSync(SRC_T,'utf8'),
    fs.readFileSync(SRC_C,'utf8'),
    fs.readFileSync(BUILD_PY,'utf8')
  ];
  const bad = [];
  srcs.forEach(function(s, i){
    let m; const re = /font-size:([\d.]+)(px|rem)/g;
    while((m = re.exec(s))){ if(m[2]==='rem' || !SCALE.has(m[1])) bad.push('src'+i+':'+m[0]); }
  });
  assert.ok(bad.length===0, '字階外值: '+(bad.slice(0,5).join(', ')||'無'));
  ok(); console.log('  ✓ 全站字階只用 11/12.5/13/14/15/16/18/19/20/28/30/32，無 rem 殘留');
}

// ================= N. 月曆格固定高度（v1.86） =================
section('N. 月曆格固定高度');
{
  const s = fs.readFileSync(SRC_T,'utf8');
  const m1 = s.match(/\.cell\{[^}]*\}/);
  assert.ok(m1 && /height:80px/.test(m1[0]), '手機 .cell 高度 80px');
  assert.ok(m1 && !/min-height/.test(m1[0]), '.cell 無 min-height 殘留');
  ok(); console.log('  ✓ 手機 .cell 固定 80px（最高內容約 75px，唔裁）');
  const m560 = s.match(/@media\(min-width:560px\)\{[\s\S]*?\.cell\{height:88px/);
  assert.ok(m560, '560px .cell 固定 88px');
  ok(); console.log('  ✓ 560px+ .cell 固定 88px');
  const m760 = s.match(/@media\(min-width:760px\)\{[\s\S]*?\.cell\{height:92px/);
  assert.ok(m760, '760px .cell 固定 92px');
  ok(); console.log('  ✓ 760px+ .cell 固定 92px');
  assert.ok(/\.cell\.empty\{[^}]*background:transparent/.test(s), '.cell.empty 返嚟（月份前導空白格，透明）');
  ok(); console.log('  ✓ 前導空白格透明，唔搶眼');
}

// ================= Q. 月份分開＋只畫有用週（v1.89） =================
section('Q. 月份分開＋有用週');
{
  const s = fs.readFileSync(SRC_T,'utf8');
  assert.ok(!/function renderStrip\(/.test(s), 'renderStrip 已刪');
  assert.ok(!/function renderMonth\(/.test(s), 'renderMonth 已刪');
  assert.ok(/function renderRange\(/.test(s), 'renderRange 在');
  assert.ok(!/getElementById\('cal1'\)/.test(s), 'cal1 已刪（單一 cal0 畫晒）');
  assert.ok(/id="stepsCard"/.test(s), 'stepsCard 在');
  const distHtml = fs.readFileSync(DIST_INDEX,'utf8');
  assert.ok(!/\.ai-note\{[^}]*position:sticky/.test(distHtml), 'ai-note 不再釘頂');
  const tbSeg = distHtml.slice(distHtml.indexOf('id="pg-tobacco"'), distHtml.indexOf('id="pg-cj"'));
  const cjSeg = distHtml.slice(distHtml.indexOf('id="pg-cj"'));
  for (const [nm, seg] of [['15天頁', tbSeg], ['倉頡頁', cjSeg]]) {
    assert.ok(seg.indexOf('class="ai-note"') > seg.indexOf('privfoot'), nm + ' ai-note 在頁尾最底（私隱行之後）');
  }
  assert.ok(/#pg-tobacco,#pg-cj\{[^}]*scrollbar-gutter:stable/.test(distHtml), '兩頁預留捲軸位（左右唔走位）');
  assert.strictEqual((distHtml.match(/<div class="ai-note">/g)||[]).length, 2, '兩頁各有一行 ai-note');
  assert.ok(s.includes('發出當天不計入，由翌日起算'), '計算規則無 T+ 黑話');
  assert.ok(!/T\+0（不計入）/.test(s), '舊 T+0 文案已刪');
  ok(); console.log('  ✓ renderRange 就位，單 cal0 畫多個月 section');

  const docQ = makeDoc();
  const TQ = evalIsolated(docQ, SRC_T,
    'calc,parseDateInput,keyOf,HOL,render');
  const drive = v => { docQ.getElementById('recv').value = v; TQ.render(); return docQ.els; };
  // v1.93：hero 日期＋星期同一行（2026-11-01 日 → 期限 2026-11-16 一，零順延）
  const elsV = drive('2026-11-01');
  assert.strictEqual(elsV.kFinal.textContent, '2026年11月16日（一）', 'hero 一行：日期＋星期');
  assert.ok(!docQ.els.kFinalW, 'kFinalW 已刪');
  // v1.94：假期表跟實際顯示範圍（2026-10-02 五 → 期限 10/20 二，3 步；9/28 唔顯示就唔列）
  const elsH = drive('2026-10-02');
  assert.strictEqual(elsH.kFinal.textContent, '2026年10月20日（二）', 'hero');
  assert.ok(!elsH.holList.innerHTML.includes('28/09'), '9/28 唔喺假期表');
  assert.ok(elsH.holList.innerHTML.includes('18/10'), '10/18 重陽節喺假期表');
  assert.ok(elsH.holList.innerHTML.includes('19/10'), '10/19 補假喺假期表');

  // 跨月 case：2026-12-16（三）→ 期限 2027-01-04（一），4 步順延
  // 範圍：12/13（發出嗰個星期日）→ 1/9（期限嗰個星期六）
  let els = drive('2026-12-16');
  const h3s = [...els.cal0.innerHTML.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
  assert.deepStrictEqual(h3s, ['2026年12月','2027年1月'], '兩個月 section 標題');
  ok(); console.log('  ✓ 月份分開：2026年12月／2027年1月');
  const cells = (els.cal0.innerHTML.match(/class="cell/g) || []).length;
  const empty = (els.cal0.innerHTML.match(/class="cell empty"/g) || []).length;
  assert.strictEqual(cells, 35, '共 35 格（12月21＋1月14）');
  assert.strictEqual(empty, 7, '7 個透明空白格（轉月邊界）');
  ok(); console.log('  ✓ 35 格：12月 3 行、1月 2 行，無用嘅行唔畫');
  const dnums = [...els.cal0.innerHTML.matchAll(/<div class="dnum">(\d+)<\/div>/g)].map(m => m[1]);
  assert.strictEqual(dnums[0], '13', '12月由 13 號（星期日）起，唔係 1 號');
  assert.strictEqual(dnums[dnums.length-1], '9', '1月到 9 號（星期六）止');
  assert.ok(!dnums.slice(0,12).includes('1'), '12月無 1–12 號');
  ok(); console.log('  ✓ 範圍 12/13→1/9：之前之後嘅行唔顯示');
  assert.ok(els.cal0.innerHTML.includes('>發出</span>'), '發出 pill 在');
  assert.ok(els.cal0.innerHTML.includes('>15天</span>'), '12/31 有 15天 pill');
  assert.ok(els.cal0.innerHTML.includes('>順延</span>'), '順延 pill 在');
  assert.ok(els.cal0.innerHTML.includes('>期限</span>'), '1/4 有期限 pill');
  ok(); console.log('  ✓ 發出／15天／順延／期限 pill 齊');
  assert.ok(/^原15天 /.test(els.kSub.textContent) && /順延 4 天/.test(els.kSub.textContent),
    'kSub：'+els.kSub.textContent);
  assert.strictEqual(els.stepsCard.hidden, false, '有順延明細卡顯示');
  ok(); console.log('  ✓ 副行：「'+els.kSub.textContent+'」，明細卡顯示');
  assert.ok(els.holList.innerHTML.includes('除夕'), '有 12/31 除夕');
  assert.ok(!els.holList.innerHTML.includes('12/08'), '12/08（範圍外）唔列');
  assert.ok(!/\/11（/.test(els.holList.innerHTML), '唔列 11 月');
  ok(); console.log('  ✓ 假期表只列 12/13→1/9 範圍');

  // 同月無順延：2026-01-05 → 2026-01-20；範圍 1/4（日）→1/24（六），只得一個月
  els = drive('2026-01-05');
  const h3s2 = [...els.cal0.innerHTML.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
  assert.deepStrictEqual(h3s2, ['2026年1月'], '只得一個月 section');
  const cells2 = (els.cal0.innerHTML.match(/class="cell/g) || []).length;
  assert.strictEqual(cells2, 21, '3 行 × 7 格');
  const d2 = [...els.cal0.innerHTML.matchAll(/<div class="dnum">(\d+)<\/div>/g)].map(m => m[1]);
  assert.strictEqual(d2[0], '4', '由 1/4（星期日）起');
  assert.strictEqual(d2[d2.length-1], '24', '到 1/24（星期六）止');
  assert.strictEqual(els.kSub.hidden, true, '無順延副行收起');
  assert.strictEqual(els.stepsCard.hidden, true, '無順延明細卡收起');
  ok(); console.log('  ✓ 同月：1月 3 行（1/4→1/24），副行＋明細卡收起');
  // 10/1 case：發出星期日（9/27）喺上個月 → 9月唔顯示，由 10月開始
  els = drive('2026-10-01');
  const h3s3 = [...els.cal0.innerHTML.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
  assert.deepStrictEqual(h3s3, ['2026年10月'], '9月唔出，只得 10月');
  const cells3 = (els.cal0.innerHTML.match(/class="cell/g) || []).length;
  assert.strictEqual(cells3, 28, '4 行 × 7 格（期限週五，多顯示一週）');
  const d3 = [...els.cal0.innerHTML.matchAll(/<div class="dnum">(\d+)<\/div>/g)].map(m => m[1]);
  assert.strictEqual(d3[0], '1', '由 10/1 開始（9/27–9/30 唔顯示）');
  assert.strictEqual(d3[d3.length-1], '24', '到 10/24（多一週）止');
  assert.strictEqual(els.kSub.hidden, true, '無順延副行收起');
  assert.strictEqual(els.stepsCard.hidden, true, '無順延明細卡收起');
  ok(); console.log('  ✓ 10/1：9月唔顯示，10月 4 行（10/1→10/24，期限週五多一週）');
  // 週四期限：2026-01-07（三）→ 期限 2026-01-22（四），零順延 → 多顯示一週
  els = drive('2026-01-07');
  const h3s4 = [...els.cal0.innerHTML.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
  assert.deepStrictEqual(h3s4, ['2026年1月'], '只得 1月');
  const cells4 = (els.cal0.innerHTML.match(/class="cell/g) || []).length;
  assert.strictEqual(cells4, 28, '4 行 × 7 格（期限週四，多顯示一週）');
  const d4 = [...els.cal0.innerHTML.matchAll(/<div class="dnum">(\d+)<\/div>/g)].map(m => m[1]);
  assert.strictEqual(d4[0], '4', '由 1/4（星期日）起');
  assert.strictEqual(d4[d4.length-1], '31', '到 1/31（多一週）止');
  assert.ok(els.cal0.innerHTML.includes('>期限</span>'), '1/22 有期限 pill');
  ok(); console.log('  ✓ 週四期限：1月 4 行（1/4→1/31），多顯示一週');
}

console.log('\n🎉 驗收全過：' + PASS + ' 組');
process.exit(0);
