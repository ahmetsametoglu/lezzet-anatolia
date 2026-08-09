import { describe, expect, it } from 'vitest';
import type { CartLineRoute } from '@lezzet/domain-core';
import { EMPTY_CART, shippingGroupFee, splitByRoute, type CartLine, type CartView } from './cart-types';
import { diffCartByPlace } from './place-change';

/**
 * Sepetin YER ekseni — grup ayrımı, kargo ücreti ve yer değişiminin farkı (19.7).
 *
 * Üçü de saf: karar motorda (`decideCartAgainstWarehouse`, `resolveShippingFee`), burada sınanan
 * şey ekranın o karara **ne yaptığı**. Bu yüzden DB'ye vurmuyorlar; dosya yine de entegrasyon
 * kökünde (`packages/application/src`) çünkü sınır dizinle çiziliyor (`vitest.config` künyesi).
 *
 * Terfiyle birlikte web'den geldi (aşama 1/3); web'deki nüsha KÖPRÜYÜ sınamaya devam ediyor.
 */

let counter = 0;

function line(over: Partial<CartLine> & { route: CartLineRoute | null }): CartLine {
  counter += 1;
  return {
    kind: 'variant',
    variantId: `v${counter}`,
    stockId: null,
    qty: 1,
    slug: `urun-${counter}`,
    name: `Ürün ${counter}`,
    image: { url: '', crop: null },
    unitLabel: '',
    unitPriceCents: 1_000,
    limitCap: null,
    lineTotalCents: 1_000,
    blocked: false,
    contents: [],
    shippable: true,
    vatRate: 5.5,
    availableHere: null,
    ...over,
  } as CartLine;
}

const viewOf = (lines: CartLine[], over: Partial<CartView> = {}): CartView => ({
  ...EMPTY_CART,
  lines,
  ...over,
});

describe('splitByRoute — grup ayrımı tek yerde', () => {
  it('kargo grubuna YALNIZ motorun oraya koyduğu kalem girer', () => {
    const local = line({ route: 'local' });
    const shipped = line({ route: 'shipping' });
    const groups = splitByRoute([local, shipped]);
    expect(groups.shipping).toEqual([shipped]);
    expect(groups.route).toEqual([local]);
  });

  it('yolu bilinmeyen satır ANA grupta kalır — siparişten sessizce düşmez', () => {
    // `route: null` iki hâlden doğar: yer sorulmamış ya da satır bir paket (paket bölünmez).
    const unknown = line({ route: null });
    const pack = line({ kind: 'bundle', bundleId: 'b1', variantId: undefined, stockId: undefined, route: null });
    const groups = splitByRoute([unknown, pack]);
    expect(groups.route).toHaveLength(2);
    expect(groups.shipping).toHaveLength(0);
  });

  it('karşılanamayan kalem de ana grupta kalır — çıkışını kısıt bloğu verir, grup değil', () => {
    const cold = line({ route: 'not_shippable_here', shippable: false });
    expect(splitByRoute([cold]).route).toEqual([cold]);
  });
});

describe('shippingGroupFee — eşik KARGO grubunun tutarından (K37)', () => {
  it('grup eşiğin altındaysa ücret doğar ve kalan söylenir', () => {
    const fee = shippingGroupFee({ shippingSubtotalCents: 3_000, freeShippingCents: 6_000, shippingTariffCents: 790 });
    expect(fee.feeCents).toBe(790);
    expect(fee.remainingForFreeCents).toBe(3_000);
  });

  it('grup eşiği geçtiyse ücret düşer', () => {
    const fee = shippingGroupFee({ shippingSubtotalCents: 6_000, freeShippingCents: 6_000, shippingTariffCents: 790 });
    expect(fee.feeCents).toBe(0);
    expect(fee.remainingForFreeCents).toBe(0);
  });

  it('kargo grubu YOKKEN ücret de yok — boş grup eşiğin altı sayılmaz', () => {
    const fee = shippingGroupFee({ shippingSubtotalCents: 0, freeShippingCents: 6_000, shippingTariffCents: 790 });
    expect(fee.feeCents).toBe(0);
  });
});

describe('diffCartByPlace — sessiz daralma yok', () => {
  it('kapıdan kargoya düşen kalem bildirilir', () => {
    const before = line({ route: 'local', name: 'Baklava' });
    const after = { ...before, route: 'shipping' as const };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([{ kind: 'to_shipping', name: 'Baklava' }]);
  });

  it('kargodan kapıya çıkan kalem de bildirilir — değişim tek yönlü değil', () => {
    const before = line({ route: 'shipping', name: 'Mantı' });
    const after = { ...before, route: 'local' as const };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([{ kind: 'to_route', name: 'Mantı' }]);
  });

  it('yeni yerde karşılanamayan kalem "alınamıyor" olarak bildirilir', () => {
    const before = line({ route: 'local', name: 'İçli Köfte', shippable: false });
    const after = { ...before, route: 'not_shippable_here' as const };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([{ kind: 'unavailable', name: 'İçli Köfte' }]);
  });

  it('adet daralması "alınamıyor" DEĞİL kendi hâliyle bildirilir', () => {
    const before = line({ route: 'local', name: 'Mantı', qty: 5, availableHere: 9 });
    const after = { ...before, availableHere: 2 };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([
      { kind: 'reduced', name: 'Mantı', qty: 5, availableHere: 2 },
    ]);
  });

  it('zaten tavanın üstündeyse yer değişimi bunu YENİ haber gibi söylemez', () => {
    // Satırın kendi düğmesi bunu zaten söylüyor; kartın işi DEĞİŞENİ bildirmek.
    const before = line({ route: 'local', qty: 5, availableHere: 2 });
    const after = { ...before, availableHere: 3 };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([]);
  });

  it('adet yetiyorsa sessiz kalınır — tavan var diye uyarı üretilmez', () => {
    const before = line({ route: 'local', qty: 2, availableHere: 9 });
    const after = { ...before, availableHere: 4 };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([]);
  });

  it('teklif fiyatı yere bağlıdır: fiyat değişimi de bildirilir', () => {
    const before = line({ route: 'local', name: 'Gözleme', unitPriceCents: 590 });
    const after = { ...before, unitPriceCents: 790 };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([
      { kind: 'price', name: 'Gözleme', fromCents: 590, toCents: 790 },
    ]);
  });

  it('yol DEĞİŞİMİ fiyat farkını yutar — aynı olay iki satırda anlatılmaz', () => {
    const before = line({ route: 'local', name: 'Baklava', unitPriceCents: 590 });
    const after = { ...before, route: 'shipping' as const, unitPriceCents: 790 };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([{ kind: 'to_shipping', name: 'Baklava' }]);
  });

  it('fiyatı çözülemeyen satır "bedavaya düştü" diye okunmaz', () => {
    const before = line({ route: 'local', unitPriceCents: 1_000 });
    const after = { ...before, unitPriceCents: null, lineTotalCents: null, blocked: true };
    expect(diffCartByPlace(viewOf([before]), viewOf([after]))).toEqual([]);
  });

  it('hiçbir şey değişmediyse fark BOŞ — olmayan olay haber yapılmaz', () => {
    const same = line({ route: 'local' });
    expect(diffCartByPlace(viewOf([same]), viewOf([same]))).toEqual([]);
  });

  it('yeni eklenen satırın "değişimi" yoktur — kıyaslanacak önceki hâli yok', () => {
    const before = line({ route: 'local' });
    const fresh = line({ route: 'shipping' });
    expect(diffCartByPlace(viewOf([before]), viewOf([before, fresh]))).toEqual([]);
  });
});
