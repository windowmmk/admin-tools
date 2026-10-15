/* 工作小工具 PWA service worker —— 版本號由 build_combo.py 寫入（CACHE） */
var CACHE = '__CACHE_VERSION__';
var CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(CORE); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url;
  try { url = new URL(e.request.url); } catch(err){ return; }
  if(e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if(url.pathname.endsWith('version.txt')) return; /* 版本檢查：永不緩存，直接行 network */
  e.respondWith(
    caches.match(e.request).then(function(hit){
      if(hit) return hit;
      return fetch(e.request).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      }).catch(function(err){
        if(e.request.mode === 'navigate') return caches.match('index.html');
        throw err;
      });
    })
  );
});
