#!/usr/bin/env python3
"""合併 tobacco-15day.html + cangjie.html → tobacco-cangjie.html（webapp：底部懸浮 tab bar＋滑動切頁）"""
import re, os, sys, base64, shutil, tempfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_T = os.path.join(BASE_DIR, 'tobacco-15day.html')
SRC_C = os.path.join(BASE_DIR, 'cangjie.html')
OUT   = os.path.join(BASE_DIR, 'dist', 'work-tools', 'index.html')
VER   = 'v2.13'
ICON_PATH = os.path.join(BASE_DIR, 'pwa', 'app-icon-180.png')
ICON_B64 = base64.b64encode(open(ICON_PATH, 'rb').read()).decode()

def extract(path):
    h = open(path, encoding='utf-8').read()
    css = re.search(r'<style>(.*?)</style>', h, re.S).group(1)
    body_all = re.search(r'<body>(.*?)</body>', h, re.S).group(1)
    js = re.search(r'<script>(.*?)</script>', h, re.S).group(1)
    body = re.sub(r'<script>.*?</script>', '', body_all, flags=re.S)
    return css, body, js

def prefix_css(css, ns):
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j == -1:
            out.append(css[i:]); break
        sel = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j+1:k-1]
        if sel.startswith('@media'):
            out.append(sel + '{' + prefix_css(body, ns) + '}')
        elif sel in ('*', ':root'):
            out.append(sel + '{' + body + '}')
        elif sel == 'body':
            out.append(ns + '{' + body + '}')
        else:
            parts = [p.strip() for p in sel.split(',') if p.strip()]
            out.append(','.join(ns + ' ' + p for p in parts) + '{' + body + '}')
        i = k
    return ''.join(out)

t_css, t_body, t_js = extract(SRC_T)
c_css, c_body, c_js = extract(SRC_C)

assert 'id="recv"' in t_body and 'id="grid"' in c_body, 'body 抽取失敗'
assert '</script' not in t_js and '</script' not in c_js, 'script 抽取異常'

tabs_css = '''
html{-webkit-text-size-adjust:100%;overflow-x:hidden;overflow-x:clip;height:100%;}
body{-webkit-tap-highlight-color:transparent;overscroll-behavior-x:none;margin:0;height:100%;overflow:hidden;}
.tabs{position:fixed;left:12px;right:12px;bottom:calc(60px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;gap:6px;background:#fffdf8;padding:8px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.16);max-width:480px;margin:0 auto;}
.tabs button{flex:1;display:flex;align-items:center;justify-content:center;padding:12px 4px;font-size:15px;font-weight:700;border:none;border-radius:10px;background:transparent;color:#8a8177;cursor:pointer;touch-action:manipulation;}
.tabs button.on{background:#2e2a24;color:#fff;}
.tabs button:active{opacity:.65;}
[hidden]{display:none!important;}
button,input,textarea,select{font-family:inherit;}
#pg-tobacco,#pg-cj{height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:calc(106px + env(safe-area-inset-bottom,0px));touch-action:pan-y;box-sizing:border-box;scrollbar-gutter:stable;}
/* v1.97：scrollbar-gutter:stable——兩頁內容長短唔一，有捲軸嗰頁會窄 ~15px，置中嘅 ai-note 左右走位；預留捲軸位後兩頁內容闊永遠一致 */
.ai-note{padding:8px 12px 6px;text-align:center;
 background:#f4efe3;color:#8a8177;font-size:11px;line-height:1.4;border-top:1px solid #e7ddcc;pointer-events:none;}
/* v1.98：ai-note 由頁頂搬去每頁最底（用戶要求，跟私隱行之後）；不再 sticky，順其自然排喺內容尾 */
#a2hs{position:fixed;left:16px;right:16px;bottom:calc(168px + env(safe-area-inset-bottom,0px));z-index:60;max-width:440px;margin:0 auto;background:#fffdf8;border-radius:18px;box-shadow:0 10px 34px rgba(0,0,0,.18);padding:14px 16px;display:flex;flex-direction:column;gap:8px;}
#a2hs b{font-size:15px;color:#2e2a24;}
#a2hs span{color:#7a7166;font-size:13px;line-height:1.55;}
#a2hs .a2hsRow{display:flex;gap:8px;justify-content:flex-end;}
#a2hs button{border:none;background:#2e2a24;color:#fff;font-size:14px;font-weight:700;padding:8px 18px;border-radius:12px;cursor:pointer;touch-action:manipulation;}
#a2hs button.ghost{background:#eef1f4;color:#555;}
#a2hsModal{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:24px;}
#a2hsModal .box{background:#fffdf8;border-radius:18px;max-width:400px;width:100%;padding:20px 20px 18px;box-shadow:0 12px 40px rgba(0,0,0,.25);}
#a2hsModal h3{margin:0 0 10px;font-size:16px;color:#222;}
#a2hsModal ol{margin:0;padding-left:22px;color:#333;font-size:14px;line-height:1.75;}
#a2hsModal .note{font-size:12.5px;color:#999;line-height:1.6;margin:10px 0 0;}
#a2hsModal #a2hsClose{display:block;margin:14px auto 0;border:none;background:#2e2a24;color:#fff;font-size:14px;font-weight:700;padding:9px 30px;border-radius:12px;cursor:pointer;touch-action:manipulation;}
#a2hsLink{text-align:center;padding:16px 0 4px;}
#a2hsLink a{font-size:13px;color:#2e2a24;text-decoration:none;}
#pg-tobacco.slideL,#pg-cj.slideL{animation:slideL .22s ease;}
#pg-tobacco.slideR,#pg-cj.slideR{animation:slideR .22s ease;}
@keyframes slideL{from{transform:translateX(48px);opacity:.35;}to{transform:none;opacity:1;}}
@keyframes slideR{from{transform:translateX(-48px);opacity:.35;}to{transform:none;opacity:1;}}
#pg-tobacco.slideU,#pg-cj.slideU{animation:slideU .22s ease;}
#pg-tobacco.slideD,#pg-cj.slideD{animation:slideD .22s ease;}
@keyframes slideU{from{transform:translateY(48px);opacity:.35;}to{transform:none;opacity:1;}}
@keyframes slideD{from{transform:translateY(-48px);opacity:.35;}to{transform:none;opacity:1;}}
#pg-cj #toast{bottom:calc(130px + env(safe-area-inset-bottom,0px));}

.tabs{transition:transform .25s linear,opacity .2s ease;transform-origin:100% 0;}
.tabs.hide{transform:scale(.12);opacity:0;pointer-events:none;}
#tabToggle{position:fixed;right:20px;bottom:calc(93px + env(safe-area-inset-bottom,0px));z-index:51;width:54px;height:54px;border-radius:50%;border:1px solid #e7ddcc;background:#fffdf8;color:#8a8177;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.14);touch-action:manipulation;font-family:inherit;}
#tabToggle:active{transform:scale(.92);}
/* v2.10：新版本小 hint（唔打擾：無更新唔出；✕ 後 localStorage 記住，嗰個版本唔再提） */
#verHint{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:12px;z-index:80;display:flex;align-items:center;gap:6px;background:#fffdf8;border:1px solid #e7ddcc;border-radius:16px;padding:6px 4px 6px 10px;font-size:11px;font-weight:700;color:#2e2a24;box-shadow:0 2px 10px rgba(0,0,0,.08);cursor:pointer;white-space:nowrap;}
#verHint .vdot{width:8px;height:8px;border-radius:50%;background:#1e9ab8;flex:none;}
#verHint #verX{border:none;background:transparent;color:#8a8177;font-size:13px;padding:8px 10px;cursor:pointer;font-family:inherit;touch-action:manipulation;line-height:1;}
'''

tabs_js = '''
(function(){
  var t=document.getElementById('tabT'),c=document.getElementById('tabC'),
      pt=document.getElementById('pg-tobacco'),pc=document.getElementById('pg-cj'),
      cur='t';
  var store={get:function(k){try{return window.localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{window.localStorage.setItem(k,v)}catch(e){}}};
  function syncAria(){
    var tb=cur==='t';
    t.setAttribute('aria-selected',tb?'true':'false');
    c.setAttribute('aria-selected',tb?'false':'true');
  }
  function show(which,dir,fromPop){
    if(which===cur) return;
    cur=which;
    var tb=which==='t', el=tb?pt:pc;
    pt.hidden=!tb; pc.hidden=tb;
    t.classList.toggle('on',tb); c.classList.toggle('on',!tb);
    syncAria();
    store.set('tc_tab',which);
    el.classList.remove('slideL','slideR','slideU','slideD');
    void el.offsetWidth;
    el.classList.add(dir==='L'?'slideL':dir==='R'?'slideR':dir==='U'?'slideU':'slideD');
    if(!fromPop){
      try{
        if(typeof window !== 'undefined' && window.history && window.history.pushState){
          window.history.pushState({ tab: which }, '');
        }
      }catch(e){}
    }
  }
  t.addEventListener('click',function(){show('t','R');});
  c.addEventListener('click',function(){show('c','L');});
  var tg=document.getElementById('tabToggle'),tabs=document.querySelector('.tabs');
  tg.addEventListener('click',function(){
    var hidden=tabs.classList.toggle('hide');
    tg.textContent=hidden?'顯示':'隱藏';
    store.set('tc_barhide',hidden?'1':'0');
  });
  (function(){
    var sv=store.get('tc_tab');
    if(sv==='t'||sv==='c'){
      cur=sv; var tb=sv==='t';
      pt.hidden=!tb; pc.hidden=tb;
      t.classList.toggle('on',tb); c.classList.toggle('on',!tb);
    }
    if(store.get('tc_barhide')==='1'){tabs.classList.add('hide');tg.textContent='顯示';}
    syncAria();
    try{
      if(typeof window !== 'undefined' && window.addEventListener){
        window.addEventListener('popstate', function(e){
          if(e && e.state && (e.state.tab === 't' || e.state.tab === 'c')){
            show(e.state.tab, e.state.tab === 't' ? 'R' : 'L', true);
          }
        });
        if(window.history && window.history.replaceState && !window.history.state){
          window.history.replaceState({ tab: cur }, '');
        }
      }
    }catch(e){}
  })();
  try{
    if(typeof window !== 'undefined' && window.visualViewport){
      window.visualViewport.addEventListener('resize', function(){
        var isKb = window.visualViewport.height < window.innerHeight * 0.75;
        if(tabs && !tabs.classList.contains('hide')){
          tabs.style.display = isKb ? 'none' : '';
        }
      });
    }
  }catch(e){}
  var sx=null,sy=null;
  document.addEventListener('touchstart',function(e){
    if(e.target.closest && e.target.closest('textarea,input,.tabs')) return;
    var p=e.changedTouches[0]; sx=p.clientX; sy=p.clientY;
  },{passive:true});
  document.addEventListener('touchend',function(e){
    if(sx===null) return;
    var p=e.changedTouches[0], dx=p.clientX-sx, dy=p.clientY-sy; sx=null;
    if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*1.6){show(dx<0?'c':'t',dx<0?'L':'R');return;}
    /* v1.69：直滑換頁已停用（頁頂下拉 v1.68、頁底上滑 v1.69；易誤觸）；只保留橫滑＋分頁按鈕 */
  },{passive:true});
  (function(){
    var A2HS_ON = false; /* v1.55：用戶要求停用（彈框太擋畫面）；markup/CSS 保留，唔顯示 */
    if(!A2HS_ON) return;
  function openA2hsModal(){var m=document.getElementById('a2hsModal');if(m)m.hidden=false;}
  function closeA2hsModal(){var m=document.getElementById('a2hsModal');if(m)m.hidden=true;}
  document.getElementById('a2hsClose').addEventListener('click',closeA2hsModal);
  document.getElementById('a2hsModal').addEventListener('click',function(e){if(e.target===this)closeA2hsModal();});
  document.getElementById('a2hsOpen').addEventListener('click',function(e){e.preventDefault();openA2hsModal();});
  (function(){
    var ua=navigator.userAgent;
    var ios=/iPhone|iPod/.test(ua)||(navigator.maxTouchPoints>1&&/Mac/.test(ua));
    var android=/Android/.test(ua);
    if(!ios&&!android) return;
    var standalone=navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
    if(standalone) return;
    if(android){
      var mol=document.querySelector('#a2hsModal ol');
      if(mol)mol.innerHTML='<li>喺 Chrome 開呢一頁，撳右上角「⋮」選單</li><li>撳「<b>加到主畫面</b>」</li><li>撳「<b>新增</b>」，完成</li>';
      var mnote=document.querySelector('#a2hsModal .note');
      if(mnote)mnote.textContent='註：加到主畫面後桌面會多個圖示，一撳即開。';
      var mh3=document.querySelector('#a2hsModal h3');
      if(mh3)mh3.textContent='加到主畫面（Android）';
    }
    var lk=document.getElementById('a2hsLink');
    if(lk){lk.style.display='block';if(android){var la=document.getElementById('a2hsOpen');if(la)la.textContent='📲 加到主畫面教學（Android）';}}
    var dismissed=false;
    try{dismissed=window.localStorage.getItem('tc_a2hs')==='1';}catch(e){}
    if(dismissed) return;
    var d=document.createElement('div'); d.id='a2hs';
    d.innerHTML=android
      ? '<b>加到主畫面</b><span>喺 Chrome 撳右上角「⋮」→「加到主畫面」，下次直接由桌面開呢個小工具。</span><div class="a2hsRow"><button id="a2hsGuide">睇圖文教學</button><button id="a2hsOk" class="ghost">知道咗</button></div>'
      : '<b>加到 iPhone 主畫面</b><span>喺 Safari 撳「分享」→「加到主畫面」，下次直接由主畫面開呢個小工具。</span><div class="a2hsRow"><button id="a2hsGuide">睇圖文教學</button><button id="a2hsOk" class="ghost">知道咗</button></div>';
    document.body.appendChild(d);
    document.getElementById('a2hsGuide').addEventListener('click',function(){d.hidden=true;openA2hsModal();});
    document.getElementById('a2hsOk').addEventListener('click',function(){
      d.hidden=true;
      try{window.localStorage.setItem('tc_a2hs','1');}catch(e){}
    });
  })();
  })();
})();
/* v2.10：新版本檢查＋小 hint（version.txt 輪詢；無更新／離線／失敗靜默；✕ 後嗰個版本唔再打擾） */
(function(){
  var VER='__APP_VER__';
  var SEEN='tc_ver_dismissed';
  function dismissed(v){try{return localStorage.getItem(SEEN)===v;}catch(e){return false;}}
  function doUpdate(){
    var done=(function(){var r=false;return function(){if(!r){r=true;location.reload();}};})();
    try{
      if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){
        navigator.serviceWorker.getRegistration().then(function(reg){
          if(reg){try{reg.update();}catch(e){}
            try{navigator.serviceWorker.addEventListener('controllerchange',done);}catch(e){}
            setTimeout(done,4000);
          }else done();
        }).catch(done);
      }else done();
    }catch(e){done();}
  }
  function showHint(v){
    if(document.getElementById('verHint'))return;
    if(dismissed(v))return;
    var d=document.createElement('div');
    d.id='verHint';
    d.setAttribute('role','button');
    d.setAttribute('aria-label','有新版本 '+v+'，撳一下更新');
    d.innerHTML='<span class="vdot"></span><span>新版 '+v+'</span><button id="verX" aria-label="唔再提示">✕</button>';
    document.body.appendChild(d);
    d.addEventListener('click',function(e){
      if(e.target&&e.target.id==='verX'){
        try{localStorage.setItem(SEEN,v);}catch(e2){}
        d.remove();
        return;
      }
      doUpdate();
    });
  }
  function check(){
    var url='version.txt?t='+Date.now();
    try{
      fetch(url,{cache:'no-store',credentials:'omit'}).then(function(r){
        if(!r.ok)throw 0;return r.text();
      }).then(function(t){
        t=(t||'').trim();
        if(t&&t!==VER)showHint(t);
      }).catch(function(){});
    }catch(e){}
  }
  setTimeout(check,10000);
  setInterval(check,30*60*1000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});
})();
'''

html = '''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2e2a24">
<meta name="color-scheme" content="light">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="行政小工具">
<link rel="apple-touch-icon" href="data:image/png;base64,''' + ICON_B64 + '''">
<meta name="description" content="15天工作日計算與倉頡碼查詢，完全離線可用">
<title>行政小工具(15天/倉頡碼)</title>
<style>
''' + prefix_css(t_css, '#pg-tobacco') + prefix_css(c_css, '#pg-cj') + tabs_css + '''
</style>
</head>
<body>
<noscript><div style="padding:20px;text-align:center;">需要啟用 JavaScript 才能使用此工具</div></noscript>
<div id="pg-tobacco">
''' + t_body + '''
<div id="a2hsLink" style="display:none"><a href="#" id="a2hsOpen">📲 加到 iPhone 主畫面教學</a></div>
<div class="ai-note">本工具由 AI 生成，內容未經審核，請注意分辨 · ''' + VER + '''</div>
</div>
<div id="pg-cj" hidden>
''' + c_body + '''
<div class="ai-note">本工具由 AI 生成，內容未經審核，請注意分辨 · ''' + VER + '''</div>
</div>
<button id="tabToggle" aria-label="隱藏/顯示選單">隱藏</button>
<nav class="tabs" role="tablist" aria-label="頁面切換">
<button id="tabT" class="on" role="tab" aria-selected="true">15天</button>
<button id="tabC" role="tab" aria-selected="false">倉頡碼</button>
</nav>
<div id="a2hsModal" hidden>
  <div class="box" role="dialog" aria-label="加到主畫面教學">
    <h3>加到 iPhone 主畫面</h3>
    <ol>
      <li>喺 Safari 開呢一頁，撳底部工具列嘅「分享」圖示 <svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:-3px"><g fill="none" stroke="#2e2a24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></g></svg></li>
      <li>喺分享選單向下滑，撳「<b>加到主畫面</b>」</li>
      <li>撳右上角「<b>新增</b>」，完成</li>
    </ol>
    <p class="note">註：加入後會以全螢幕開啟，效果等同 App。</p>
    <button id="a2hsClose">知道了</button>
  </div>
</div>
<script>
(function(){
''' + t_js + '''
})();
(function(){
''' + c_js + '''
})();
''' + tabs_js.replace('__APP_VER__', VER) + '''
</script>
<script>
/* PWA：service worker 註冊（失敗唔影響主功能，單檔／muse.ai 分享照用） */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(function(){});
}
</script>
</body>
</html>
'''

DIST = os.path.join(BASE_DIR, 'dist', 'work-tools')
os.makedirs(DIST, exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(html)
print('written bytes:', os.path.getsize(OUT))

m = re.search(r'<script>(.*?)</script>', html, re.S)
if m:
    combo_tmp = os.path.join(tempfile.gettempdir(), 'combo.js')
    open(combo_tmp, 'w', encoding='utf-8').write(m.group(1))
print('checks: viewport-fit=%s safe-area=%d' % ('viewport-fit=cover' in html, html.count('safe-area-inset-bottom')))

# ---- PWA 發佈包：dist/work-tools/（index.html＋manifest＋sw＋icons） ----
shutil.copy(os.path.join(BASE_DIR, 'pwa', 'manifest.webmanifest'), os.path.join(DIST, 'manifest.webmanifest'))
sw = open(os.path.join(BASE_DIR, 'pwa', 'sw.js'), encoding='utf-8').read().replace('__CACHE_VERSION__', 'work-tools-' + VER)
open(os.path.join(DIST, 'sw.js'), 'w', encoding='utf-8').write(sw)
open(os.path.join(DIST, 'version.txt'), 'w', encoding='utf-8').write(VER + '\n')
for ic in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png'):
    shutil.copy(os.path.join(BASE_DIR, 'pwa', ic), os.path.join(DIST, ic))
print('dist:', sorted(os.listdir(DIST)))
