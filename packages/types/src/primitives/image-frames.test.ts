import { describe, expect, it } from 'vitest';
import { frameUrlFor, ImageFrameSourcesSchema, srcSetOf, type ImageFrameSources } from './image-frames';
import { FRAME_RATIOS, IMAGE_WIDTHS, type FrameKey } from './image.schema';

/*
  MERKEZİ ÇERÇEVE SEÇİMİ (21.303) — web ve native aynı kapıdan seçer; bu dosya kapının verdiği sözleri
  kilitler: çerçeve kutunun ORANINDAN, basamak kutunun BOYUNDAN gelir ve basamak ASLA aşağı yuvarlanmaz.

  Beklenen basamaklar sabit sayıyla yazılmadı, merdivenden (`IMAGE_WIDTHS`) türetildi: merdivene basamak
  eklendiğinde (ör. 600) test kuralı sınamaya devam etsin, sayıyı değil.
*/

/** Kural "gerekeni karşılayan en küçük basamak, yoksa en büyüğü" — beklentiyi merdivenden kurar. */
function stepFor(requiredPx: number): number {
  return IMAGE_WIDTHS.find((width) => width >= requiredPx) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]!;
}

/**
 * Her çerçeve için merdivenin tamamı. Adres çerçeve adını ve basamağı taşır ki seçim okunur olsun; ve
 * CDN adresinin kendi virgüllerini (`width=…,fit=…`) taşır ki `srcSet` ayracının onlara takılmadığı da
 * sınansın.
 */
function framesOf(): ImageFrameSources {
  return Object.fromEntries(
    (Object.keys(FRAME_RATIOS) as FrameKey[]).map((key) => {
      const entries = IMAGE_WIDTHS.map((width) => ({
        url: `https://cdn.test/cdn-cgi/image/trim=0;0;0;0,width=${width},fit=scale-down,format=auto/${key}.webp`,
        width,
      }));
      return [key, { src: entries[entries.length - 1]!.url, srcSet: srcSetOf(entries) }];
    }),
  ) as ImageFrameSources;
}

const IMAGE = { url: 'https://cdn.test/ozgun.webp', frames: framesOf() };

/** Seçilen adresten çerçeveyi ve basamağı okur. */
function picked(url: string | null): { frame: string; width: number } | null {
  const match = url === null ? null : /width=(\d+),.*\/(\w+)\.webp$/.exec(url);
  return match ? { frame: match[2]!, width: Number(match[1]) } : null;
}

describe('frameUrlFor — basamak kutunun boyundan', () => {
  it('küçük daire (48 dp, @3x) merdivenin ilk yeten basamağını alır', () => {
    expect(picked(frameUrlFor(IMAGE, { width: 48, height: 48 }, 3))).toEqual({ frame: 'square', width: stepFor(144) });
  });

  it('basamak ASLA aşağı yuvarlanmaz — 146 dp @3x = 438 px, altındaki basamak değil üstündeki', () => {
    const got = picked(frameUrlFor(IMAGE, { width: 146, height: 146 }, 3));
    expect(got?.width).toBe(stepFor(438));
    expect(got!.width).toBeGreaterThanOrEqual(438);
  });

  it('gereken tam bir basamağa denk gelirse o basamak alınır — fazlası istenmez', () => {
    expect(picked(frameUrlFor(IMAGE, { width: IMAGE_WIDTHS[1], height: IMAGE_WIDTHS[1] }, 1))?.width).toBe(IMAGE_WIDTHS[1]);
  });

  it('merdiveni aşan kutu en büyük basamağı alır — adressiz kalmaz', () => {
    expect(picked(frameUrlFor(IMAGE, { width: 2000, height: 2000 }, 3))?.width).toBe(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
  });

  it('kutu çerçeveden DARsa yükseklik bağlar: gereken = yükseklik × çerçeve oranı', () => {
    // 90×100 kutu (0,9) en yakın `square`a düşer; gereken max(90, 100 × 1) × 2 = 200 — genişliğin
    // söylediği 180 değil. (1,2'lik bir kutu seçilseydi en yakın çerçeve 1,3'lük `illustration` olurdu.)
    const got = picked(frameUrlFor(IMAGE, { width: 90, height: 100 }, 2));
    expect(got).toEqual({ frame: 'square', width: stepFor(200) });
  });
});

describe('frameUrlFor — çerçeve kutunun oranından', () => {
  it('kare kutu kare türevi, 3:2 kutu nesne türevi, 16:9 kutu bant türevi alır', () => {
    expect(picked(frameUrlFor(IMAGE, { width: 100, height: 100 }, 1))?.frame).toBe('square');
    expect(picked(frameUrlFor(IMAGE, { width: 300, height: 200 }, 1))?.frame).toBe('source');
    expect(picked(frameUrlFor(IMAGE, { width: 390, height: 219 }, 1))?.frame).toBe('band');
  });

  /*
    NATIVE KUTULARI YENİ ÇERÇEVELERİNDE (21.303 · `bd1545c6`). Dikey 4:5 ve geniş 2:1 gelmeden tarif rafı
    kareyi, tarif listesi ve vitrin paket kartı sohbet çerçevesini (1,91) alıp aradaki farkı `cover` ile
    kesiyordu. Ölçüler ekranların kendi kutuları (21.303 görev satırı).
  */
  it('tarif rafı (220 × 280) dikey türevi, tarif listesi (350 × 168) ve paket kartı (350 × 172) geniş türevi alır', () => {
    expect(picked(frameUrlFor(IMAGE, { width: 220, height: 280 }, 3))?.frame).toBe('portrait');
    expect(picked(frameUrlFor(IMAGE, { width: 350, height: 168 }, 3))?.frame).toBe('wide');
    expect(picked(frameUrlFor(IMAGE, { width: 350, height: 172 }, 3))?.frame).toBe('wide');
  });

  it('keşif kartı ekranı dolduran dikey kart — iPhone 17 Pro\'da ~366 × 429 → dikey türev', () => {
    // Ölçü simülatör görüntüsünden (10.09): kart ekranın eni eksi iki yan dolgu, yüksekliği ekranın
    // kalanı. Oran 0,85 — kareye (1) değil dikeye (0,8) yakın; eskiden kareyi alıyordu.
    expect(picked(frameUrlFor(IMAGE, { width: 366, height: 429 }, 3))?.frame).toBe('portrait');
  });
});

describe('frameUrlFor — yedek yollar', () => {
  it('CDN türevi yoksa özgün adres — kutu ölçülmemiş olsa bile', () => {
    expect(frameUrlFor({ url: 'https://cdn.test/ozgun.webp', frames: null }, { width: 0, height: 0 }, 3)).toBe('https://cdn.test/ozgun.webp');
  });

  it('görsel hiç yoksa null — yer tutucu çağıranın işi', () => {
    expect(frameUrlFor({ url: null, frames: null }, { width: 48, height: 48 }, 3)).toBeNull();
  });

  it('türev var ama kutu henüz ölçülmedi → null: yanlış basamak istemektense ölçümü bekler', () => {
    expect(frameUrlFor(IMAGE, { width: 0, height: 48 }, 3)).toBeNull();
    expect(frameUrlFor(IMAGE, { width: 48, height: 0 }, 3)).toBeNull();
  });
});

describe('ImageFrameSourcesSchema', () => {
  it('her adlı çerçeveyi ister — eksik çerçeveli küme geçmez', () => {
    const eksik = Object.fromEntries(Object.entries(framesOf()).filter(([key]) => key !== 'square'));
    expect(ImageFrameSourcesSchema.safeParse(framesOf()).success).toBe(true);
    expect(ImageFrameSourcesSchema.safeParse(eksik).success).toBe(false);
  });

  it('çerçeve kümesi FRAME_RATIOS ile aynı — şema elle yazılmış ikinci bir liste taşımaz', () => {
    expect(Object.keys(ImageFrameSourcesSchema.shape).sort()).toEqual(Object.keys(FRAME_RATIOS).sort());
  });
});
