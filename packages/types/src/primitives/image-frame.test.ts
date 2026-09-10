import { describe, expect, it } from 'vitest';
import {
  CROP_CENTER,
  cropTrim,
  FRAME_RATIOS,
  frameKeyForRatio,
  IMAGE_ROLES,
  IMAGE_WIDTHS,
  RATIO_CHAT,
  RATIO_PORTRAIT,
  RATIO_SOURCE,
  RATIO_SQUARE,
  RATIO_WIDE,
  visibleFraction,
} from './image.schema';

/**
 * CDN kadrajı (05.37): CSS'teki odak+zoom kesiminin dört kenar kesri. Sağlama dokümandaki türetimle:
 * `z = 1` ve `Rs = Rf` iken kesim yok; zoom ve odak kesimi yalnız GÖRÜNMEYEN kısma dağıtır.
 */
describe('cropTrim — odak + zoom → Cloudflare trim kesirleri', () => {
  it('kaynak oranı çerçeveyle aynı ve zoom yoksa dört kenar 0', () => {
    expect(cropTrim({ width: 3000, height: 2000 }, RATIO_SOURCE, CROP_CENTER)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('kare kaynak → 3:2 çerçeve: yükseklikten kesilir, odak ortadaysa üst/alt eşit', () => {
    // fh = 1/1.5 → görünmeyen 1/3, odak y=50 → üst 1/6, alt 1/6.
    expect(cropTrim({ width: 1500, height: 1500 }, RATIO_SOURCE, CROP_CENTER)).toEqual({ top: 0.1667, right: 0, bottom: 0.1667, left: 0 });
  });

  it('odak kesimi dağıtır: y=0 (üst) → hiç üstten kesilmez, hepsi alttan', () => {
    expect(cropTrim({ width: 1500, height: 1500 }, RATIO_SOURCE, { x: 50, y: 0, zoom: 100 })).toEqual({ top: 0, right: 0, bottom: 0.3333, left: 0 });
  });

  it('zoom %200: görünen parça yarıya iner, iki eksende de kesilir', () => {
    // Kare kaynak, kare çerçeve, z=2: fw = fh = 0.5 → odak ortada, her kenar 0.25.
    expect(cropTrim({ width: 1000, height: 1000 }, RATIO_SQUARE, { x: 50, y: 50, zoom: 200 })).toEqual({ top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 });
  });

  it('kaynak ölçüsü bilinmiyorsa null — tahmin yok, CSS yolu sürer', () => {
    expect(cropTrim({ width: null, height: null }, RATIO_SOURCE, CROP_CENTER)).toBeNull();
    expect(cropTrim({ width: 1500, height: null }, RATIO_SOURCE, CROP_CENTER)).toBeNull();
  });

  it('visibleFraction zoom tabanının altına inmez (100 = cover)', () => {
    expect(visibleFraction(1, 1, 50)).toEqual({ fw: 1, fh: 1 });
  });
});

describe('çerçeve kümesi ve merdiven', () => {
  it('elle yazılmış oranlar adlı kümeye düşer; sohbet kartı çerçevesi ürün rolünde görünür', () => {
    expect(frameKeyForRatio(1)).toBe('square');
    expect(frameKeyForRatio(3 / 2)).toBe('source');
    expect(frameKeyForRatio(16 / 9)).toBe('band');
    expect(frameKeyForRatio(1.91)).toBe('chat');
    expect(FRAME_RATIOS.chat).toBe(RATIO_CHAT);
    expect(IMAGE_ROLES.product.frames.some((f) => f.ratio === RATIO_CHAT)).toBe(true);
  });

  it('dikey ve geniş kartın kendi çerçevesi var (10.09); web koleksiyon kartı (16:7) geniş çerçeveden', () => {
    expect(frameKeyForRatio(0.79)).toBe('portrait');
    expect(frameKeyForRatio(2.08)).toBe('wide');
    expect(frameKeyForRatio(16 / 7)).toBe('wide');
    expect(FRAME_RATIOS.portrait).toBe(RATIO_PORTRAIT);
    expect(FRAME_RATIOS.wide).toBe(RATIO_WIDE);
  });

  it('önizleme native kutuları da gösteriyor: ürün dikey, paket geniş, koleksiyon daire (10.09)', () => {
    expect(IMAGE_ROLES.product.frames.some((f) => f.ratio === RATIO_PORTRAIT)).toBe(true);
    expect(IMAGE_ROLES.package.frames.some((f) => f.ratio === RATIO_WIDE)).toBe(true);
    expect(IMAGE_ROLES.collection.frames.some((f) => f.circle === true)).toBe(true);
    // Kategori ürünle aynı kaynak beklentisini paylaşıyor ama native keşif kartı yalnız ürünün.
    expect(IMAGE_ROLES.category.frames.some((f) => f.ratio === RATIO_PORTRAIT)).toBe(false);
  });

  it('merdiven artan ve tek yerde', () => {
    expect([...IMAGE_WIDTHS]).toEqual([...IMAGE_WIDTHS].sort((a, b) => a - b));
    expect(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]).toBeGreaterThanOrEqual(1200);
  });
});
