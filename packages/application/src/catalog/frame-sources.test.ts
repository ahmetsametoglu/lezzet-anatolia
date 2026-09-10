import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CROP_FIELDS, type ImageMeta } from '@lezzet/types';
import { frameSourcesOf, imageOf, thumbnailImageUrl } from './map';

/**
 * CDN çerçeve kaynakları ve küçük resim (05.37) — saf adres kurucular, ağ ve DB yok.
 *
 * Sınanan iki söz de SESSİZ kırılır: küçük resim kare@200 basamağından ayrışırsa Cloudflare aynı
 * görsel için ikinci bir dönüşüm sayar (fatura), kadrajlı küçük resim ile `frames` birbirinden
 * ayrışırsa `FramedImage` önceden kesilmiş dosyayı CSS ile ikinci kez keser. İkisi de ekranda hata
 * vermez.
 */
const ENV_KEYS = ['R2_PUBLIC_BASE_URL', 'R2_PATH_PREFIX'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.test';
  process.env.R2_PATH_PREFIX = 'dev';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ROW: ImageMeta = {
  imageKey: 'catalog/products/baklava.webp',
  imageAlt: null,
  imageUpdatedAt: null,
  ...DEFAULT_CROP_FIELDS,
  imageWidth: 1500,
  imageHeight: 1500,
};

describe('frameSourcesOf — çerçevenin tek adresi', () => {
  it('sohbet · bant · geniş çerçeveler 1200, ötekiler 800 basamağından; küme her çerçevede beş basamak', () => {
    const f = frameSourcesOf(ROW)!;
    expect(f.chat.src).toContain('width=1200,');
    expect(f.band.src).toContain('width=1200,');
    expect(f.wide.src).toContain('width=1200,');
    expect(f.portrait.src).toContain('width=800,');
    expect(f.source.src).toContain('width=800,');
    expect(f.square.src).toContain('width=800,');
    expect(f.illustration.src).toContain('width=800,');
    expect(f.square.srcSet.split(', ')).toHaveLength(5);
  });
});

describe('thumbnailImageUrl — küçük resim', () => {
  it("kare çerçevenin 200 basamağının BİREBİR aynısı: ayrı dönüşüm doğmaz", () => {
    const thumb = thumbnailImageUrl(ROW);
    expect(thumb).toContain('/cdn-cgi/image/');
    expect(frameSourcesOf(ROW)!.square.srcSet.split(', ')[0]).toBe(`${thumb} 200w`);
  });

  it('kaynak ölçüsü yoksa özgün dosyaya düşer ve `frames` da null — ikisi aynı koşulla ayrışır', () => {
    const olcusuz: ImageMeta = { ...ROW, imageWidth: null, imageHeight: null };
    expect(frameSourcesOf(olcusuz)).toBeNull();
    expect(thumbnailImageUrl(olcusuz)).toBe(imageOf(olcusuz).url);
  });

  it('r2.dev tabanında dönüşüm yok: küçük resim özgün adres, `frames` null', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://pub-test.r2.dev';
    expect(frameSourcesOf(ROW)).toBeNull();
    expect(thumbnailImageUrl(ROW)).toBe('https://pub-test.r2.dev/dev/catalog/products/baklava.webp');
  });

  it('görselsiz satırda null — yer tutucu çizilir', () => {
    expect(thumbnailImageUrl({ ...ROW, imageKey: null })).toBeNull();
  });
});
