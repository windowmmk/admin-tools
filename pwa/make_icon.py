#!/usr/bin/env python3
"""小工具 logo 生成器 —— D1 淺底徽章：米色圓底＋深主色圓環框（框外淺色）＋內嵌日曆圓。
用法：python3 make_icon.py   （輸出 180/192/512/maskable-512）
改設計只改 draw()／make()。"""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = os.path.dirname(os.path.abspath(__file__))
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
CARD_IN = (242, 240, 235)
SLATE   = (95, 112, 137)
INK     = (74, 85, 104)
LINE    = (216, 213, 206)
WHITE   = (255, 255, 255)
SCALE = 0.88   # 徽章佔比：留少少透明邊沿
INNER = 0.94   # 內圓佔徽章比例（框＝(1-INNER)/2＝3%）
SS = 4         # 超採樣倍數：抗鋸齒去毛刺

def center_text(d, txt, fnt, cx, cy, fill):
    bb = d.textbbox((0, 0), txt, font=fnt)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), txt, font=fnt, fill=fill)

def draw(S):
    """日曆卡：頂欄「小工具」＋掛圈，左「15」右「倉頡」"""
    FNT = lambda sz: ImageFont.truetype(FONT, sz, index=1)
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, S, S], fill=CARD_IN + (255,))
    hh = int(S * 0.30)
    d.rectangle([0, 0, S, hh], fill=SLATE + (255,))
    r = max(6, int(S * 0.028))
    for rx in (S * 0.32, S * 0.68):
        d.ellipse([rx - r, hh - r, rx + r, hh + r], fill=CARD_IN + (255,))
    center_text(d, '小工具', FNT(int(S * 0.14)), S / 2, hh * 0.60, WHITE)
    cyy = hh + (S - hh) * 0.42
    d.line([S / 2, hh + S * 0.04, S / 2, S - S * 0.04], fill=LINE + (255,), width=max(2, int(S * 0.008)))
    center_text(d, '15', FNT(int(S * 0.30)), S * 0.30, cyy, INK)
    center_text(d, '倉', FNT(int(S * 0.19)), S * 0.70, cyy - S * 0.125, INK)
    center_text(d, '頡', FNT(int(S * 0.19)), S * 0.70, cyy + S * 0.125, INK)
    return img

def circle_mask(M):
    mask = Image.new('L', (M, M), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, M, M], fill=255)
    return mask

def make(S, scale, bg=None):
    """D1 淺底徽章：米色圓底＋深主色圓環框（框外淺色）＋內嵌日曆圓"""
    C = int(S * scale)
    B = C * SS
    badge = Image.new('RGBA', (B, B), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse([0, 0, B, B], fill=CARD_IN + (255,))
    M = int(B * 0.88)
    card = Image.composite(draw(M), Image.new('RGBA', (M, M), (0, 0, 0, 0)), circle_mask(M))
    badge.alpha_composite(card, ((B - M) // 2, (B - M) // 2))
    # 框：深主色圓環 3%，框外留淺色
    d = ImageDraw.Draw(badge)
    w = int(B * 0.03)
    rd = int(B * 0.94)
    o = (B - rd) // 2
    d.ellipse([o, o, o + rd, o + rd], outline=INK + (255,), width=w)
    badge = badge.resize((C, C), Image.LANCZOS)
    canvas = Image.new('RGBA', (S, S), (bg + (255,)) if bg else (0, 0, 0, 0))
    canvas.alpha_composite(badge, ((S - C) // 2, (S - C) // 2))
    return canvas

if __name__ == '__main__':
    make(180, SCALE).save(os.path.expanduser('~/workspace/your_files/app-icon-180.png'))  # apple-touch-icon 來源
    make(192, SCALE).save(os.path.join(BASE, 'icon-192.png'))
    make(512, SCALE).save(os.path.join(BASE, 'icon-512.png'))
    make(512, 0.76, bg=CARD_IN).convert('RGB').save(os.path.join(BASE, 'icon-maskable-512.png'))  # maskable：米色實底＋安全區
    print('icons done')
