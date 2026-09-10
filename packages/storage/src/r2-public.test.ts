import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cdnImageUrl, publicImageUrl } from './r2-public';

/**
 * Public okuma URL'i saf mantıktır (ağ yok) → birim test. Önemi: bu birleştirme yanlışsa hata
 * SESSİZDİR — tip denetimi geçer, ekran patlamaz, yalnız bütün görseller 404 olur. Sürüm damgası da
 * aynı şekilde sessiz: eksikse operatör görseli değiştirdiğinde CDN bir yıl eskiyi servis eder.
 */
const ENV_KEYS = ['R2_PUBLIC_BASE_URL', 'R2_PATH_PREFIX'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.R2_PUBLIC_BASE_URL = 'https://pub-test.r2.dev';
  process.env.R2_PATH_PREFIX = 'dev';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const KEY = 'catalog/products/baklava.jpeg';

describe('publicImageUrl', () => {
  it('taban + prefix + anahtarı birleştirir', () => {
    expect(publicImageUrl(KEY)).toBe('https://pub-test.r2.dev/dev/catalog/products/baklava.jpeg');
  });

  it('sürüm damgasını epoch saniye olarak ekler (CDN cache kırma)', () => {
    expect(publicImageUrl(KEY, '2026-07-27T10:00:00.000Z')).toBe(
      'https://pub-test.r2.dev/dev/catalog/products/baklava.jpeg?v=1785146400',
    );
  });

  it('damga bozuksa URL yine üretilir (görsel kaybolmaz, yalnız sürümsüz kalır)', () => {
    expect(publicImageUrl(KEY, 'dün')).toBe('https://pub-test.r2.dev/dev/catalog/products/baklava.jpeg');
  });

  it('anahtar yoksa null (görselsiz varlık)', () => {
    expect(publicImageUrl(null)).toBeNull();
    expect(publicImageUrl(undefined)).toBeNull();
  });

  it('taban adres ayarlı değilse null — ekran görselsiz çalışır, çökmez', () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(publicImageUrl(KEY, '2026-07-27T10:00:00.000Z')).toBeNull();
  });

  it('taban sonundaki ve anahtar başındaki eğik çizgi çift // üretmez', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.lezzet.fr/';
    expect(publicImageUrl('/catalog/products/x.jpeg')).toBe('https://cdn.lezzet.fr/dev/catalog/products/x.jpeg');
  });

  it('prefix boşsa anahtar kök altında çözülür (prod kurulumu)', () => {
    process.env.R2_PATH_PREFIX = '';
    expect(publicImageUrl(KEY)).toBe('https://pub-test.r2.dev/catalog/products/baklava.jpeg');
  });
});

describe('cdnImageUrl — dönüşümlü adres (05.37 · 09.09)', () => {
  it('r2.dev tabanında dönüşüm YOK → null; çağıran özgün adrese düşer', () => {
    expect(cdnImageUrl(KEY, null, { width: 200, format: 'jpeg' })).toBeNull();
  });

  it('özel alan adında `cdn-cgi/image/<seçenekler>/<önek>/<anahtar>`; sürüm damgası da girer', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.lezzetanatolie.com/';
    expect(cdnImageUrl(KEY, '2026-09-08T10:00:00.000Z', { width: 1200, format: 'jpeg' })).toBe(
      `https://cdn.lezzetanatolie.com/cdn-cgi/image/width=1200,fit=scale-down,format=jpeg/dev/catalog/products/baklava.jpeg?v=${Math.floor(Date.parse('2026-09-08T10:00:00.000Z') / 1000)}`,
    );
    expect(cdnImageUrl(KEY, null, { height: 300.4, quality: 80 })).toBe(
      'https://cdn.lezzetanatolie.com/cdn-cgi/image/height=300,fit=scale-down,quality=80/dev/catalog/products/baklava.jpeg',
    );
  });

  it('anahtar ya da taban yoksa null — görselsiz çizilir, çökmez', () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(cdnImageUrl(KEY, null, { width: 200 })).toBeNull();
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.lezzetanatolie.com';
    expect(cdnImageUrl(null, null, { width: 200 })).toBeNull();
  });
});

describe('cdnImageUrl — kadraj (`trim`, 05.37)', () => {
  it('kesir dört kenar üst;sağ;alt;sol sırasıyla ve ölçekten ÖNCE; dört sıfırsa parametre yazılmaz', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.lezzetanatolie.com';
    expect(cdnImageUrl(KEY, null, { width: 800, format: 'jpeg', trim: { top: 0.1667, right: 0, bottom: 0.1667, left: 0 } })).toBe(
      'https://cdn.lezzetanatolie.com/cdn-cgi/image/trim=0.1667;0;0.1667;0,width=800,fit=scale-down,format=jpeg/dev/catalog/products/baklava.jpeg',
    );
    expect(cdnImageUrl(KEY, null, { width: 800, trim: { top: 0, right: 0, bottom: 0, left: 0 } })).toBe(
      'https://cdn.lezzetanatolie.com/cdn-cgi/image/width=800,fit=scale-down/dev/catalog/products/baklava.jpeg',
    );
  });
});
