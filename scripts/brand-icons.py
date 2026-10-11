"""Uygulama ikon ailesini tek kaynak görselden türetir: iOS ikonu, açılış görseli ve Android'in üç katmanı.

Kaynak düz zeminli, katmansız bir PNG'dir. Zemin kenar şeritlerinden ölçülür, zemine uzaklık alfaya çevrilir, çizim
kutusuna kırpılır ve her varlık kendi maskesinin sınırına göre ölçeklenip ortalanır. Ölçek sabit oran değil, mürekkebin
merkezden en uzak noktasıdır: Android ikonu ve açılış görselini daireyle keser.

Kullanım: /usr/bin/python3 scripts/brand-icons.py <kaynak.png> <çıktı klasörü>
Gereken: Pillow + numpy (sistem Python'unda kurulu; depoya bağımlılık eklenmesin diye Node değil).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CANVAS = 1024
NOISE = 12  # zeminin ölçülen en büyük sapması; altı tam saydam
SOLID = 48  # bunun üstü tam opak; arası doğrusal, sert eşik kenarı tırtıklar

# Google: adaptif ikonun 108 dp tuvalinde 66 dp güvenli daire; hiçbir başlatıcı maskesi onu kesmez.
FOREGROUND_RADIUS = 0.305
# Açılış görseli 164 dp çizilir (app.config.ts) ve zeminsiz hâlde 192 dp daireyle kesilir: 96 / 164.
SPLASH_RADIUS = 0.585
SPLASH_SPAN = 0.92
# iOS kavisli kareyle keser, daireden cömert; ikon opak olmalı, saydam ikon mağazada reddedilir.
ICON_SPAN = 0.88


def derive_art(path):
    src = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    edge = np.concatenate([src[:40].reshape(-1, 3), src[-40:].reshape(-1, 3),
                           src[:, :40].reshape(-1, 3), src[:, -40:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    # Uzaklık tek yönlü: zeminden açık piksel zemin sayılır. Kâğıttan beyaz mürekkep yok; kaynaktaki açık leke böyle düşer.
    dist = np.clip(bg - src, 0, None).max(axis=2)
    alpha = np.clip((dist - NOISE) / (SOLID - NOISE), 0.0, 1.0)
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    # Yarı saydam pikselin rengi zeminden arındırılır; zemine yeniden oturunca kaynakla birebir aynı çıkar.
    rgb = np.clip(bg + (src - bg) / safe, 0, 255)
    ys, xs = np.nonzero(alpha > 0)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    rgba = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
    art = Image.fromarray(rgba).crop(box)
    a = np.asarray(art)[..., 3] > 0
    ay, ax = np.nonzero(a)
    cy, cx = (a.shape[0] - 1) / 2, (a.shape[1] - 1) / 2
    radius = np.sqrt((ay - cy) ** 2 + (ax - cx) ** 2).max()
    return art, radius, tuple(int(round(c)) for c in bg)


def place(art, scale):
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    # Ön çarpılmış alfayla küçültülür; yoksa saydam piksellerin rengi kenara sızar.
    small = art.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(small, ((CANVAS - w) // 2, (CANVAS - h) // 2))
    return canvas


def on_ground(img, bg):
    # Expo prebuild yarı saydam pikseli koyulaştırarak küçültüyor; geniş yarı saydam alan gri leke olur.
    # Açılış görseli ve ön katman zaten aynı kremin üstünde çizilir, opak yazılınca görünüm değişmez.
    ground = Image.new("RGBA", img.size, bg + (255,))
    ground.alpha_composite(img)
    return ground.convert("RGB")


def place_within(art, scale, limit):
    # Küçültme kenarı bir iki piksel yayar; sınır çıktıda ölçülerek tutturulur.
    img = place(art, scale)
    while ink_radius(img) > limit:
        scale *= 0.995
        img = place(art, scale)
    return img


def ink_radius(img):
    a = np.asarray(img)[..., 3] > 0
    ys, xs = np.nonzero(a)
    c = (CANVAS - 1) / 2
    return np.sqrt((ys - c) ** 2 + (xs - c) ** 2).max() / CANVAS


def main(source, out_dir):
    out = Path(out_dir)
    art, radius, bg = derive_art(source)
    span = max(art.width, art.height)
    by_radius = lambda limit: limit * CANVAS / radius

    foreground = place_within(art, by_radius(FOREGROUND_RADIUS), FOREGROUND_RADIUS)
    splash = place_within(art, min(by_radius(SPLASH_RADIUS), SPLASH_SPAN * CANVAS / span), SPLASH_RADIUS)
    icon = place(art, ICON_SPAN * CANVAS / span)
    monochrome = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 0))
    monochrome.putalpha(foreground.getchannel("A"))

    on_ground(icon, bg).save(out / "icon.png")
    on_ground(splash, bg).save(out / "splash-icon.png")
    on_ground(foreground, bg).save(out / "android-icon-foreground.png")
    Image.new("RGB", (CANVAS, CANVAS), bg).save(out / "android-icon-background.png")
    monochrome.save(out / "android-icon-monochrome.png")

    print(f"zemin #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X} · çizim {art.width}×{art.height}")
    print(f"ön katman yarıçapı {ink_radius(foreground):.4f} (sınır {FOREGROUND_RADIUS})")
    print(f"açılış yarıçapı {ink_radius(splash):.4f} (sınır {SPLASH_RADIUS})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
