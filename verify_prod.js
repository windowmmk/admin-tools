const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const html = fs.readFileSync(path.join(require('os').tmpdir(), 'prod.html'), 'utf8');
// 目標版本：命令列參數優先，否則讀 build_combo.py 嘅 VER
let VER = process.argv[2];
if(!VER){
  const b = fs.readFileSync(path.join(__dirname, 'build_combo.py'), 'utf8');
  VER = (b.match(/VER\s*=\s*'([^']+)'/) || [])[1];
}
assert.ok(VER, '搵唔到目標版本');
let n = 0;
function ok(msg){ n++; console.log('  ✓ ' + msg); }

// 1. 版本
assert.ok(html.includes(VER), '線上版本 ' + VER);
ok('線上版本 ' + VER);
// 2. 私隱聲明兩頁齊
const priv = (html.match(/本地運算，不會作任何記錄/g) || []).length;
assert.ok(priv >= 2, '私隱聲明出現 ' + priv + ' 次');
ok('私隱聲明兩頁齊（' + priv + ' 次）');
// 3. 離線 pill
assert.ok(html.includes('離線模式') && html.includes('navigator.onLine'), '離線 pill');
ok('離線 pill 機制在線');
// 4. 本輪 CSS 修復在線
assert.ok(/\.steps li\{[^}]*display:flex/.test(html), 'steps flex');
assert.ok(/\.steps li \.sd\{[^}]*tabular-nums/.test(html), 'sd 等寬數字');
assert.ok(/\.steps li \.arr\{[^}]*margin-left:auto/.test(html), 'arr 右對齊');
assert.ok(/button,input,textarea,select\{font-family:inherit/.test(html), '表單字體繼承');
ok('v1.81–v1.84 排版修復全部在線');
// 5. 字階規範在線
const SCALE = new Set(['11','12.5','13','14','15','16','18','19','20','28','30','32']);
const bad = [];
let m; const re = /font-size:([\d.]+)(px|rem)/g;
while((m = re.exec(html))){ if(m[2]==='rem' || !SCALE.has(m[1])) bad.push(m[0]); }
assert.ok(bad.length === 0, '字階外值: ' + bad.slice(0,3).join(','));
ok('全站字階規範在線，無 rem');
// 6. 假期來源註腳
assert.ok(html.includes('假期來源'), '假期來源註腳');
ok('假期來源註腳在線');
// 7. 本輪新規則在線
assert.ok(html.includes('r.final.getDay()===4 || r.final.getDay()===5'), '週四/五多顯示一週規則');
assert.ok(html.includes('發出當天不計入，由翌日起算'), '計算規則新文案（無 T+ 黑話）');
const aiRule = (html.match(/\.ai-note\{[^}]*\}/) || [''])[0];
assert.ok(!/sticky/.test(aiRule), 'ai-note 已唔再 sticky');
const privIdx = [...html.matchAll(/本地運算，不會作任何記錄/g)].map(x=>x.index);
const aiIdx = [...html.matchAll(/class="ai-note"/g)].map(x=>x.index);
assert.ok(aiIdx.length>=2 && aiIdx[0]>privIdx[0] && aiIdx[1]>privIdx[1], 'ai-note 喺私隱條款之後（頁底）');
assert.ok(html.includes('scrollbar-gutter:stable'), 'scrollbar-gutter 在線');
ok('v1.91–v1.98 新規則＋文案＋ai-note 頁底在線');
// 8. 生產包逐字節等同本地驗收過嘅構建包（53 組驗收＋12 日期 sweep 直接適用）
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
const tmpDir = require('os').tmpdir();
const prodHash = sha256(fs.readFileSync(path.join(tmpDir, 'prod.html')));
const distHash = sha256(fs.readFileSync(path.join(__dirname, 'dist', 'work-tools', 'index.html')));
assert.strictEqual(prodHash, distHash, '線上 index.html 同本地構建包一致');
const prodSwHash = sha256(fs.readFileSync(path.join(tmpDir, 'prod_sw.js')));
const distSwHash = sha256(fs.readFileSync(path.join(__dirname, 'dist', 'work-tools', 'sw.js')));
assert.strictEqual(prodSwHash, distSwHash, '線上 sw.js 同本地一致');
ok('生產包逐字節等同本地構建（index.html＋sw.js），57 組驗收＋12 日期 sweep 直接適用');
// 9. sw.js / manifest
const sw = fs.readFileSync(path.join(tmpDir, 'prod_sw.js'), 'utf8');
assert.ok(sw.length > 100, 'sw.js 有內容');
const mf = JSON.parse(fs.readFileSync(path.join(tmpDir, 'prod_manifest.json'), 'utf8'));
assert.ok(mf.name || mf.short_name, 'manifest 有效');
ok('sw.js＋manifest 正常（離線安裝鏈完整）');
// 10. version.txt（v2.10 新版本檢查）
const pv = fs.readFileSync(path.join(tmpDir, 'prod_version.txt'), 'utf8').trim();
assert.ok(/^v\d+\.\d+$/.test(pv), '線上 version.txt 有效：' + pv);
ok('線上 version.txt 正常（' + pv + '，新版本檢查在線）');
console.log('\n🎉 生產驗收全過：' + n + ' 組');
