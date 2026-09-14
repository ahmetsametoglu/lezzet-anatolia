import { describe, expect, it } from 'vitest';
import { kunyeGecerli, kunyeKur, kunyeOku } from './image-manifest';

/*
  Sınanan şey künyenin iki sözü: (1) bozuk ya da çelişkili künye SESSİZCE yazılmaz — yanlış sürüm,
  CDN'de yanlış adres demek; (2) künye ancak depodaki dosya aynıysa geçer — yoksa aynı slug'a verilen
  yeni fotoğraf hiç yüklenmezdi.
*/

const SATIR = { imageUpdatedAt: '2026-09-14T12:57:41.558+00:00', imageWidth: null, imageHeight: null };

describe('kunyeOku', () => {
  it('not alanlarını atlar, satırları anahtarıyla döndürür', () => {
    const kunye = kunyeOku({ _not: 'açıklama', 'catalog/products/a.webp': SATIR });
    expect([...kunye.keys()]).toEqual(['catalog/products/a.webp']);
    expect(kunye.get('catalog/products/a.webp')).toEqual(SATIR);
  });

  it('sürümsüz satır geçerli — tarif beslemesi damga yazmıyordu, adresi öyle kalmalı', () => {
    const kunye = kunyeOku({ 'catalog/recipes/r.jpg': { imageUpdatedAt: null, imageWidth: 1600, imageHeight: 1000 } });
    expect(kunye.get('catalog/recipes/r.jpg')).toEqual({ imageUpdatedAt: null, imageWidth: 1600, imageHeight: 1000 });
  });

  it('bozuk satır anahtarının adıyla patlar', () => {
    expect(() => kunyeOku({ 'catalog/products/a.webp': { imageUpdatedAt: 5, imageWidth: null, imageHeight: null } })).toThrow('catalog/products/a.webp');
    // Fazla alan da bozukluktur: künye yalnız satıra yazılan üç alanı taşır.
    expect(() => kunyeOku({ 'catalog/products/a.webp': { ...SATIR, imageKey: 'x' } })).toThrow('catalog/products/a.webp');
    expect(() => kunyeOku({ 'catalog/products/a.webp': { ...SATIR, imageWidth: 0 } })).toThrow('catalog/products/a.webp');
  });
});

describe('kunyeKur', () => {
  it('anahtara göre sıralar ve yalnız üç alanı yazar', () => {
    const kunye = kunyeKur([
      { imageKey: 'catalog/products/b.webp', ...SATIR },
      { imageKey: 'catalog/products/a.webp', ...SATIR, imageWidth: 800, imageHeight: 600 },
    ]);
    expect(Object.keys(kunye)).toEqual(['catalog/products/a.webp', 'catalog/products/b.webp']);
    expect(kunye['catalog/products/a.webp']).toEqual({ imageUpdatedAt: SATIR.imageUpdatedAt, imageWidth: 800, imageHeight: 600 });
  });

  it('aynı anahtar aynı değerle iki kez gelirse tek satır olur', () => {
    const kunye = kunyeKur([
      { imageKey: 'catalog/products/a.webp', ...SATIR },
      { imageKey: 'catalog/products/a.webp', ...SATIR },
    ]);
    expect(Object.keys(kunye)).toEqual(['catalog/products/a.webp']);
  });

  it('aynı anahtar farklı sürümle gelirse patlar — hangisinin geçerli olduğunu künye bilemez', () => {
    expect(() =>
      kunyeKur([
        { imageKey: 'catalog/products/a.webp', ...SATIR },
        { imageKey: 'catalog/products/a.webp', ...SATIR, imageUpdatedAt: null },
      ]),
    ).toThrow('catalog/products/a.webp');
  });

  it('üretecin yazdığını seed aynen okur', () => {
    const yazilan = JSON.parse(JSON.stringify({ _not: 'not', ...kunyeKur([{ imageKey: 'catalog/products/a.webp', ...SATIR }]) }));
    expect(kunyeOku(yazilan).get('catalog/products/a.webp')).toEqual(SATIR);
  });
});

describe('kunyeGecerli', () => {
  it('künyede var ve depodaki içerik aynı — yükleme yok', () => {
    expect(kunyeGecerli(SATIR, 'ab12', 'ab12')).toBe(true);
  });

  it('depodaki içerik farklı — yüklenir (aynı slug, yeni fotoğraf)', () => {
    expect(kunyeGecerli(SATIR, 'ab12', 'cd34')).toBe(false);
  });

  it('depoda yok — yüklenir (başka makine, başka önek)', () => {
    expect(kunyeGecerli(SATIR, null, 'ab12')).toBe(false);
  });

  it('künyede yok — yüklenir, depodaki aynı olsa bile (sabit sürümü yok)', () => {
    expect(kunyeGecerli(undefined, 'ab12', 'ab12')).toBe(false);
  });
});
