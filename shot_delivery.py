#!/usr/bin/env python3
"""交付截圖 v2：直接載入源文件（獨立頁），經 CDP 設值，橫拼一張。"""
import base64, json, os, subprocess, time, urllib.request, tempfile
import websocket
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get('CHROME_PATH', '/opt/meta-chromium/chrome')
SRC_T = os.path.join(BASE_DIR, 'tobacco-15day.html')
SRC_C = os.path.join(BASE_DIR, 'cangjie.html')
OUT = os.path.join(tempfile.gettempdir(), 'shots2')
PORT = 9600 + (os.getpid() % 300)
W, H, DSF = 390, 844, 2

os.makedirs(OUT, exist_ok=True)
subprocess.run(['pkill', '-f', 'remote-debugging-port=9'], capture_output=True)
time.sleep(1)

proc = subprocess.Popen(
    [CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
     '--disable-dev-shm-usage', '--remote-allow-origins=*',
     f'--remote-debugging-port={PORT}', 'about:blank'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(15):
    time.sleep(1.0)
    try:
        urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=3)
        break
    except Exception:
        pass
else:
    raise RuntimeError('chrome 起唔到，port ' + str(PORT))

def cdp(method, params=None, timeout=30):
    global _id
    _id += 1
    ws.send(json.dumps({'id': _id, 'method': method, 'params': params or {}}))
    end = time.time() + timeout
    while time.time() < end:
        msg = json.loads(ws.recv())
        if msg.get('id') == _id:
            return msg.get('result', {})
    raise RuntimeError('cdp timeout ' + method)

targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
wsurl = next(t['webSocketDebuggerUrl'] for t in targets if t['type'] == 'page')
ws = websocket.create_connection(wsurl)
_id = 0

cdp('Page.enable')
cdp('Emulation.setDeviceMetricsOverride',
    {'width': W, 'height': H, 'deviceScaleFactor': DSF, 'mobile': True})

jobs = [
    ('s1', SRC_T, None),
    ('s2', SRC_T, "var r=document.getElementById('recv');r.value='2026-12-16';r.dispatchEvent(new Event('input',{bubbles:true}));"),
    ('s3', SRC_C, None),
    ('s4', SRC_C, "var t=document.getElementById('in');t.value='倉頡碼';t.dispatchEvent(new Event('input',{bubbles:true}));"),
]
pngs = []
try:
    for name, src, js in jobs:
        cdp('Page.navigate', {'url': 'file://' + src})
        time.sleep(7)
        if js:
            cdp('Runtime.evaluate', {'expression': js, 'returnByValue': True})
            time.sleep(2)
        shot = cdp('Page.captureScreenshot', {'format': 'png'})
        p = os.path.join(OUT, name + '.png')
        open(p, 'wb').write(base64.b64decode(shot['data']))
        pngs.append(p)
        print('shot', p, len(shot['data']))
finally:
    ws.close()
    proc.terminate()

ims = [Image.open(p) for p in pngs]
gap = 8
# 2×2 佈局
w2 = ims[0].width * 2 + gap
h2 = ims[0].height * 2 + gap
combo = Image.new('RGB', (w2, h2), 'white')
positions = [(0, 0), (ims[0].width + gap, 0),
             (0, ims[0].height + gap), (ims[0].width + gap, ims[0].height + gap)]
for im, (x, y) in zip(ims, positions):
    combo.paste(im, (x, y))
outp = os.path.join(OUT, 'delivery.png')
combo.save(outp)
print('combo', outp, combo.size)
