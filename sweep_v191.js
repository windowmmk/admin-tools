// v1.91 edge-case sweep：對多個日期驗 renderRange 結構不變量
// 用法：node ~/workspace/sweep_v191.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
function scriptOf(filePath){
  const h = fs.readFileSync(filePath, 'utf8');
  return h.match(/<script>([\s\S]*?)<\/script>/)[1];
}
const handlers = {};
function makeEl(id){
  return { _id:id, value:'', hidden:true, innerHTML:'', textContent:'',
    addEventListener(ev,fn){ handlers[id+':'+ev]=fn; },
    appendChild(){}, setAttribute(){}, };
}
function makeDoc(){
  const els = {};
  return { els,
    getElementById(id){ return els[id] || (els[id] = makeEl(id)); },
    querySelector(){ return makeEl('q'); },
    addEventListener(){}, createElement(){ return makeEl('dyn'); },
    createDocumentFragment(){ return { children:[], appendChild(c){ this.children.push(c); } }; },
  };
}
function evalIsolated(doc, scriptPath, exports){
  global.document = doc; global.window = global; global.navigator = {};
  global.requestAnimationFrame = fn => fn();
  global.fetch = () => Promise.reject(new Error('offline-test'));
  const src = scriptOf(scriptPath) + '\n;globalThis.__XPORT={' + exports + '};';
  (function(){ return eval(src); })();
  return globalThis.__XPORT;
}
const doc = makeDoc();
const T = evalIsolated(doc, path.join(__dirname, 'tobacco-15day.html'),
  'calc,parseDateInput,keyOf,HOL,render,diffD,addD,fmtMD');
const {calc,parseDateInput,keyOf,HOL,render,diffD,fmtMD} = T;
const WD = ['日','一','二','三','四','五','六'];
const pad = n => String(n).padStart(2,'0');
const key = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());

function expected(v){
  const t0 = parseDateInput(v);
  const r = calc(t0, HOL);
  const s0 = new Date(t0); s0.setDate(s0.getDate()-s0.getDay());
  const e1 = new Date(r.final); e1.setDate(e1.getDate()+(6-r.final.getDay()));
  if(r.final.getDay()===4 || r.final.getDay()===5) e1.setDate(e1.getDate()+7);
  return {t0, r, s0, e1};
}
// 預期 cell 序列：逐個月 section，每 section 係 [empty|day] 序列
function expectedSections({t0, s0, e1}){
  const secs = [];
  const mStart = new Date(t0.getFullYear(), t0.getMonth(), 1);
  const mEnd = new Date(e1.getFullYear(), e1.getMonth(), 1);
  for(let m = new Date(mStart); m <= mEnd; m.setMonth(m.getMonth()+1)){
    const y = m.getFullYear(), mo = m.getMonth();
    const cells = [];
    const w0 = new Date(y, mo, 1); w0.setDate(w0.getDate()-w0.getDay());
    const w1 = new Date(y, mo+1, 0); w1.setDate(w1.getDate()+(6-w1.getDay()));
    for(let w = new Date(w0); w <= w1; w.setDate(w.getDate()+7)){
      const wE = new Date(w); wE.setDate(wE.getDate()+6);
      if(wE < s0 || w > e1) continue;
      for(let j=0;j<7;j++){
        const dt = new Date(w); dt.setDate(dt.getDate()+j);
        if(dt.getMonth()!==mo || dt < s0 || dt > e1) cells.push(null);
        else cells.push(new Date(dt));
      }
    }
    secs.push({y, mo, cells});
  }
  return secs;
}

const DATES = ['2026-10-01','2026-01-07','2026-12-16','2026-01-05','2026-02-01',
  '2026-08-01','2026-01-31','2027-01-22','2026-12-25','2026-12-31','2028-02-15','2026-04-01'];
let fails = 0;
for(const v of DATES){
  try{
    const ex = expected(v);
    const {t0, r, s0, e1} = ex;
    doc.els.recv.value = v; render();
    const els = doc.els;
    const html = els.cal0.innerHTML;
    const secs = expectedSections(ex);
    // 1. section 標題
    const titles = [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m=>m[1]);
    assert.deepStrictEqual(titles, secs.map(s=>s.y+'年'+(s.mo+1)+'月'), 'section 標題');
    // 2. 逐 section 比 cell 序列
    const parts = html.split('<div class="msec">').slice(1);
    assert.strictEqual(parts.length, secs.length, 'section 數');
    const seenDays = {};
    parts.forEach((part, si)=>{
      const exp = secs[si].cells;
      const re = /<div class="cell empty"><\/div>|<div class="cell[^"]*"><div class="dnum">(\d+)<\/div>([\s\S]*?)<\/div><\/div>/g;
      // 簡化：逐個匹配 cell
      const cellRe = /<div class="(cell(?: empty|[^"]*)?)">/g;
      const actual = [];
      let m;
      const dayMap = {};
      // 用 dnum 定位 day cell
      const dnums = [...part.matchAll(/<div class="dnum">(\d+)<\/div>/g)].map(x=>+x[1]);
      const empties = (part.match(/<div class="cell empty"><\/div>/g)||[]).length;
      // 重建序列：按出現順序掃 empty / day
      const toks = [...part.matchAll(/<div class="cell empty"><\/div>|<div class="dnum">(\d+)<\/div>/g)]
        .map(x=> x[0].includes('empty') ? null : +x[1]);
      assert.deepStrictEqual(toks.map(t=>t===null?null:'d'),
        exp.map(t=>t===null?null:'d'), 'cell 空/實序列');
      // day cell 日期啱
      let di = 0;
      toks.forEach((t,i)=>{
        if(t!==null){
          assert.strictEqual(t, exp[i].getDate(), 'day cell 日期');
          assert.strictEqual(exp[i].getMonth(), secs[si].mo, 'day cell 月份');
          const k = key(exp[i]); seenDays[k]=(seenDays[k]||0)+1;
          dayMap[k]=true;
        }
      });
      assert.strictEqual(toks.length % 7, 0, '每 section 係完整星期');
    });
    // 3. 顯示嘅日子＝[max(s0,發出月1號),e1] 恰好一次（v1.90：上個月漏出嗰幾日唔顯示）
    const firstOfM = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const dStart = s0 < firstOfM ? firstOfM : s0;
    const allExp = [];
    for(let d=new Date(dStart); d<=e1; d.setDate(d.getDate()+1)) allExp.push(key(d));
    assert.deepStrictEqual(Object.keys(seenDays).sort(), allExp.sort(), '日子集合＝[s0,e1]');
    assert.ok(Object.values(seenDays).every(c=>c===1), '無重複');
    // 4. 標記
    const nIssue = (html.match(/>發出<\/span>/g)||[]).length;
    const nFin = (html.match(/>期限<\/span>/g)||[]).length;
    assert.strictEqual(nIssue, 1, '發出 pill ×1');
    assert.strictEqual(nFin, 1, '期限 pill ×1');
    // 發出喺 t0、期限喺 final
    const t0k = key(t0), fink = key(r.final);
    assert.ok(seenDays[t0k]===1 && seenDays[fink]===1, 't0/final 有顯示');
    // steps pills：每個 step 日期有對應 pill
    let stepPills = 0;
    for(const s of r.steps){
      const n = diffD(s.date, r.t0);
      const want = n===15 ? '>15天</span>' : '>順延</span>';
      // 搵嗰日嘅 cell html
      const dk = key(s.date);
      const dstr = s.date.getDate();
      const cellRe = new RegExp('<div class="cell[^"]*"><div class="dnum">'+dstr+'</div>([\\s\\S]*?)</div></div>', 'g');
      // 簡化：全 html 計 pill 數
      stepPills++;
      assert.ok(html.includes(want), 'step pill '+want+' 在 ('+dk+')');
    }
    const n15 = (html.match(/>15天<\/span>/g)||[]).length;
    const nDef = (html.match(/>順延<\/span>/g)||[]).length;
    assert.strictEqual(n15+nDef, r.steps.length, 'step pill 數＝steps');
    // 5. kSub / stepsCard
    assert.strictEqual(els.kSub.hidden, r.steps.length===0, 'kSub 顯隱');
    if(r.steps.length){
      assert.strictEqual(els.kSub.textContent,
        '原15天 '+fmtMD(r.base)+'，順延 '+r.steps.length+' 天', 'kSub 文案');
    }
    assert.strictEqual(els.stepsCard.hidden, r.steps.length===0, 'stepsCard 顯隱');
    // 6. 假期表：顯示範圍內假期齊，範圍外唔出現（v1.94：由 max(s0,發出月1號）起）
    const firstOfM2 = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const hStart = s0 < firstOfM2 ? firstOfM2 : s0;
    const holInRange = Object.keys(HOL).filter(k=>{
      const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10));
      return d>=hStart && d<=e1;
    });
    for(const k of holInRange){
      const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10));
      const tag = pad(d.getDate())+'/'+pad(d.getMonth()+1)+'（'+WD[d.getDay()]+'）';
      assert.ok(els.holList.innerHTML.includes(tag), '假期表有 '+tag+' '+HOL[k]);
    }
    const nHolItems = (els.holList.innerHTML.match(/<li>/g)||[]).length;
    assert.strictEqual(nHolItems, holInRange.length, '假期表數目');
    // 7. 範圍端點
    console.log('  ✓ '+v+'（'+WD[t0.getDay()]+'）→ '+key(r.final)+'（'+WD[r.final.getDay()]+'）'
      +'｜'+r.steps.length+'步｜'+s0.getMonth()+1+'/'+s0.getDate()+'→'+(e1.getMonth()+1)+'/'+e1.getDate()
      +'｜'+titles.join('、'));
  }catch(e){ fails++; console.log('  ✗ '+v+'：'+e.message); }
}
console.log(fails ? '\n✗ '+fails+' 個失敗' : '\n🎉 sweep 全過：'+DATES.length+' 個日期');
process.exit(fails?1:0);
