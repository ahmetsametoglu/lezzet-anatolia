import { describe, expect, it } from 'vitest';
import { decideBundleAgainstWarehouse, type BundleItemInput } from './bundle-warehouse';

/** Üç kalemli varsayılan paket; testler yalnız ilgilendikleri sayıyı ezer. */
function kalemler(over: Partial<Record<'a' | 'b' | 'c', Partial<BundleItemInput>>> = {}): BundleItemInput[] {
  const base = (id: string): BundleItemInput => ({ variantId: id, qty: 1, localAvailable: 10, shippingAvailable: 10 });
  return [
    { ...base('a'), ...over.a },
    { ...base('b'), ...over.b },
    { ...base('c'), ...over.c },
  ];
}

describe('decideBundleAgainstWarehouse', () => {
  it('tüm kalemler yereldeyse rota — kargolanabilir olsa bile', () => {
    const d = decideBundleAgainstWarehouse({ items: kalemler(), qty: 2, shippable: true });
    expect(d.route).toBe('local');
    expect(d.fulfillableQty).toBe(2);
  });

  // Talebin çekirdeği: kalemleri iki depoya DAĞILMIŞ paket hiçbir havuzdan tam takım vermez.
  it('kalemler iki depoya dağılmışsa hiçbir yol açılmaz — ağ toplamı yeterli olsa bile', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { localAvailable: 5, shippingAvailable: 0 }, b: { localAvailable: 0, shippingAvailable: 5 } }),
      qty: 1,
      shippable: true,
    });
    expect(d.route).toBe('unavailable');
    expect(d.maxBundles).toBe(0);
  });

  it('yerelde tam takım yoksa ve kargo deposunda varsa kargo', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { localAvailable: 0 } }),
      qty: 3,
      shippable: true,
    });
    expect(d.route).toBe('shipping');
    expect(d.fulfillableQty).toBe(3);
  });

  it('paket kargolanamıyorsa kargo havuzuna HİÇ bakılmaz', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { localAvailable: 0, shippingAvailable: 99 } }),
      qty: 1,
      shippable: false,
    });
    expect(d.route).toBe('not_shippable_here');
    expect(d.maxBundles).toBe(0);
  });

  // Kalem adedi ÇARPAN: 2 baklava kalan stokta 3 paket satılamaz.
  it('tavan en zayıf kalemden ve kalem adedine BÖLÜNEREK doğar', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { qty: 3, localAvailable: 7 }, b: { qty: 1, localAvailable: 10 } }),
      qty: 5,
      shippable: true,
    });
    expect(d.maxBundles).toBe(2); // ⌊7÷3⌋ = 2
    expect(d.fulfillableQty).toBe(2);
  });

  it('kısmi karşılamada yol yine local — kalan için ikinci yol açılmaz', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { localAvailable: 2, shippingAvailable: 99 } }),
      qty: 5,
      shippable: true,
    });
    expect(d.route).toBe('local');
    expect(d.maxBundles).toBe(2);
    expect(d.fulfillableQty).toBe(2);
  });

  it('tek kalem bir eksikse paketin tamamı düşer — "yarısı var" hâli yok', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ c: { qty: 2, localAvailable: 1, shippingAvailable: 1 } }),
      qty: 1,
      shippable: true,
    });
    expect(d.route).toBe('unavailable');
  });

  it('kalemsiz paket satılamaz (boş kümede tavan sonsuz olmamalı)', () => {
    const d = decideBundleAgainstWarehouse({ items: [], qty: 1, shippable: true });
    expect(d.route).toBe('unavailable');
    expect(d.maxBundles).toBe(0);
  });

  it('kalem adedi 0 ise paket satılamaz — veri hatası sınırsız stoğa çevrilmez', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { qty: 0 } }),
      qty: 1,
      shippable: true,
    });
    expect(d.route).toBe('unavailable');
    expect(d.maxBundles).toBe(0);
  });

  it('yerel tam takım varken kargo deposu daha bolsa bile rota kazanır', () => {
    const d = decideBundleAgainstWarehouse({
      items: kalemler({ a: { localAvailable: 1, shippingAvailable: 99 } }),
      qty: 1,
      shippable: true,
    });
    expect(d.route).toBe('local');
    expect(d.maxBundles).toBe(1);
  });
});
