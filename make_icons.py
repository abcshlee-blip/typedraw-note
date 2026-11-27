#!/usr/bin/env python3
"""TypeDraw 노트 PWA 아이콘 생성 (1024 초해상도로 그린 뒤 512/192로 축소)."""
from PIL import Image, ImageDraw, ImageFilter
import math

S = 1024
SS = 3
W = S * SS


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def vertical_gradient(size, top, bottom):
    g = Image.new("RGB", (1, size))
    px = g.load()
    for y in range(size):
        t = y / (size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return g.resize((size, size), Image.BILINEAR)


def draw_art(img, scale=1.0):
    """노트 표지 + 고무줄 밴드 + 라벨(T) 아트를 그린다. scale로 여백 확보."""
    d = ImageDraw.Draw(img, "RGBA")
    cx = W / 2
    cy = W / 2

    def s(v):
        return v * SS * scale

    def box(x0, y0, x1, y1):
        return [cx + (x0 - 512) * SS * scale, cy + (y0 - 512) * SS * scale,
                cx + (x1 - 512) * SS * scale, cy + (y1 - 512) * SS * scale]

    # 그림자
    shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow, "RGBA")
    sd.rounded_rectangle(box(228, 168, 812, 900), radius=s(34), fill=(90, 60, 30, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(s(18)))
    img.alpha_composite(shadow)

    # 종이 결 (오른쪽·아래로 살짝)
    rr(d, box(792, 154, 820, 872), s(8), fill=(250, 244, 230, 255))
    for y in range(int(s(170)), int(s(860)), int(s(8))):
        d.line([box(794, 0, 818, 0)[0], y, box(794, 0, 818, 0)[2], y],
               fill=(230, 219, 195, 255), width=max(1, int(s(1.2))))

    # 표지
    rr(d, box(214, 140, 804, 884), s(30), fill=(140, 74, 63, 255))
    # 표지 결
    for y in range(int(s(150)), int(s(880)), int(s(12))):
        d.line([box(220, 0, 800, 0)[0], y, box(220, 0, 800, 0)[2], y],
               fill=(255, 255, 255, 7), width=max(1, int(s(2))))

    # 책등
    rr(d, box(214, 140, 282, 884), s(30), fill=(112, 58, 49, 255))
    d.line([box(286, 150, 286, 876)[0], box(286, 150, 286, 876)[1],
            box(286, 150, 286, 876)[0], box(286, 150, 286, 876)[3]],
           fill=(255, 255, 255, 28), width=max(1, int(s(3))))
    for x in range(int(s(224)), int(s(276)), int(s(8))):
        d.line([x, box(0, 150, 0, 876)[1], x, box(0, 150, 0, 876)[3]],
               fill=(60, 30, 24, 26), width=max(1, int(s(2))))

    # 라벨
    rr(d, box(300, 232, 568, 556), s(10), fill=(251, 246, 233, 255))

    # 라벨 위 'T'
    terracotta = (140, 74, 63, 255)
    d.rectangle(box(348, 296, 520, 340), fill=terracotta)
    d.rectangle(box(414, 340, 454, 486), fill=terracotta)

    # 밑줄 손그림 느낌
    pts = []
    for i in range(0, 61):
        t = i / 60.0
        x = 348 + (520 - 348) * t
        y = 508 + math.sin(t * math.pi * 2.2) * 7
        pts.append((box(x, 0, x, 0)[0], box(0, y, 0, y)[1]))
    d.line(pts, fill=(176, 137, 104, 255), width=max(2, int(s(9))), joint="curve")

    # 고무줄 밴드
    band = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band, "RGBA")
    bd.rounded_rectangle(box(690, 120, 736, 904), radius=s(14), fill=(96, 48, 42, 255))
    bd.rounded_rectangle(box(697, 128, 707, 896), radius=s(6), fill=(255, 255, 255, 24))
    bd.rounded_rectangle(box(722, 128, 730, 896), radius=s(6), fill=(0, 0, 0, 34))
    img.alpha_composite(band)

    # 밴드 그림자
    bs = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    bsd = ImageDraw.Draw(bs, "RGBA")
    bsd.rounded_rectangle(box(738, 130, 752, 894), radius=s(6), fill=(40, 20, 15, 50))
    bs = bs.filter(ImageFilter.GaussianBlur(s(7)))
    img.alpha_composite(bs)


def make(size, maskable=False):
    if maskable:
        base = vertical_gradient(W, (243, 236, 224), (232, 221, 202)).convert("RGBA")
        draw_art(base, scale=0.78)
    else:
        base = vertical_gradient(W, (250, 244, 232), (231, 220, 200)).convert("RGBA")
        # 모서리를 둥글게 (홈 화면 아이콘)
        draw_art(base, scale=0.94)
    out = base.resize((size, size), Image.LANCZOS)
    return out.convert("RGB")


if __name__ == "__main__":
    make(512).save("icon-512.png")
    make(192).save("icon-192.png")
    make(512, maskable=True).save("icon-maskable-512.png")
    make(180).save("apple-touch-icon.png")
    print("icons written")
