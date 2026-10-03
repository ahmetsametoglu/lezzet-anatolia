import { describe, expect, it } from 'vitest';
import type { CatalogSize } from '@lezzet/types';
import { cardQuantityOf, openingVariantOf, sizeQuantityOf, sizesLabelOf, variantNameOf } from './variant';

const small = { id: 'kucuk' };
const large = { id: 'buyuk' };
const variants = [small, large];

describe('openingVariantOf', () => {
  it('bağlantının istediği boy aktifse sayfa o boyla açılır — paketteki boy en ucuz boy olmayabilir', () => {
    expect(openingVariantOf(variants, 'buyuk', 'kucuk')).toBe(large);
  });

  it('istenen boy ürünün aktif boyları arasında değilse birincil boya düşer', () => {
    expect(openingVariantOf(variants, 'satistan-kalkmis', 'buyuk')).toBe(large);
    expect(openingVariantOf(variants, null, 'buyuk')).toBe(large);
  });

  it('birincil boy da yoksa sıranın ilki; boysuz üründe hiçbiri', () => {
    expect(openingVariantOf(variants, null, null)).toBe(small);
    expect(openingVariantOf([], 'buyuk', 'kucuk')).toBeUndefined();
  });
});

/*
  Kelimeyi porsiyon türü seçer ve yanlış seçilirse müşteri aldığı şeyi yanlış okur: "12 adet cheesecake" 12 pasta demektir. Kart
  satırı da aynı türetmeden geçer; boylardan biri adlandırılamazsa boy sayısına düşmesi seçimi gizlememek içindir.
*/
const boy = (portionKind: CatalogSize['portionKind'], piecesCount: number | null, netQuantity: number | null = 1400): CatalogSize => ({
  piecesCount,
  portionKind,
  netQuantity,
  netUnit: netQuantity === null ? null : 'g',
});

describe('variantNameOf · porsiyon türü kelimeyi seçer', () => {
  it('ayrı parçalar ADET yazar', () => {
    expect(variantNameOf({ ...boy('item', 4), label: 'ham etiket' }, 'tr')).toBe('4 adet · 1,4 kg');
  });

  it('tek gövdenin dilimleri DİLİM yazar — adet deseydi 12 pasta satmış olurduk', () => {
    expect(variantNameOf({ ...boy('slice', 12), label: 'ham etiket' }, 'tr')).toBe('12 dilim · 1,4 kg');
  });

  it('paketlenmiş birimler PAKET yazar', () => {
    expect(variantNameOf({ ...boy('package', 2), label: 'ham etiket' }, 'tr')).toBe('2 paket · 1,4 kg');
  });

  it('türü bilinmeyen çoklu boy adete düşer — kelimesiz kalmaz', () => {
    expect(variantNameOf({ ...boy(null, 3), label: 'ham etiket' }, 'tr')).toBe('3 adet · 1,4 kg');
  });

  it('tek parçada sayı hiç yazılmaz, miktar tek başına konuşur', () => {
    expect(variantNameOf({ ...boy('package', 1), label: 'ham etiket' }, 'tr')).toBe('1,4 kg');
  });

  it('ölçüsüz boy saklı etiketine düşer', () => {
    expect(variantNameOf({ ...boy(null, null, null), label: '4x105g' }, 'tr')).toBe('4x105g');
  });
});

describe('sizeQuantityOf · kartta adet varsa adet, yoksa net miktar', () => {
  it('adetli boyda yalnız adet yazılır, ağırlık yazılmaz', () => {
    expect(sizeQuantityOf(boy('item', 4, 420), 'tr')).toBe('4 adet');
    expect(sizeQuantityOf(boy('slice', 12, 1800), 'tr')).toBe('12 dilim');
  });

  it('1000 ve üstü kesir kısaltılmadan üst birime çıkar — 1250 g "1,3 kg" yazılsaydı 50 g fazla söylenirdi', () => {
    expect(sizeQuantityOf(boy(null, null, 1250), 'tr')).toBe('1,25 kg');
    expect(sizeQuantityOf(boy(null, null, 800), 'tr')).toBe('800 g');
    expect(sizeQuantityOf({ piecesCount: null, portionKind: null, netQuantity: 5000, netUnit: 'ml' }, 'fr')).toBe('5 L');
  });

  it('ölçüsüz boyda null — kart uydurmaz', () => {
    expect(sizeQuantityOf(boy(null, null, null), 'tr')).toBeNull();
  });
});

describe('sizesLabelOf · vitrin kartının satırı yedeksiz', () => {
  it('boylar gelmediyse ya da biri adsızsa satır yok — vitrin kartı bugünkü hâlinde kalır', () => {
    expect(sizesLabelOf(undefined, 'tr')).toBeUndefined();
    expect(sizesLabelOf([], 'tr')).toBeUndefined();
    expect(sizesLabelOf([boy('item', 4, 420), boy(null, null, null)], 'tr')).toBeUndefined();
  });

  it('adlandırılan boylar " · " ile', () => {
    expect(sizesLabelOf([boy('item', 4, 420), boy(null, null, 1250)], 'tr')).toBe('4 adet · 1,25 kg');
  });
});

describe('cardQuantityOf · kartın ikinci satırı', () => {
  const t = { options: '{n} seçenek' };

  it('tek boylu üründe boyun miktarı', () => {
    expect(cardQuantityOf({ sizes: [boy('item', 4, 420)], variantCount: 1 }, t, 'tr')).toBe('4 adet');
  });

  it('çok boylu üründe boylar gelen sırayla — "2 seçenek" yerine', () => {
    const yag = [
      { piecesCount: null, portionKind: null, netQuantity: 750, netUnit: 'ml' as const },
      { piecesCount: null, portionKind: null, netQuantity: 5000, netUnit: 'ml' as const },
    ];
    expect(cardQuantityOf({ sizes: yag, variantCount: 2 }, t, 'tr')).toBe('750 ml · 5 L');
  });

  it('bir boy adlandırılamıyorsa çok boyluda boy sayısı — eksik liste seçimi gizlerdi', () => {
    expect(cardQuantityOf({ sizes: [boy(null, null, 500), boy(null, null, null)], variantCount: 2 }, t, 'tr')).toBe('2 seçenek');
  });

  it('sunucu boyları göndermediyse bugünkü satır: çok boyluda sayı, tek boyluda satır yok', () => {
    expect(cardQuantityOf({ variantCount: 3 }, t, 'tr')).toBe('3 seçenek');
    expect(cardQuantityOf({ variantCount: 1 }, t, 'tr')).toBeUndefined();
  });
});
