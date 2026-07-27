import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publicImageUrl } from './r2-public';

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
