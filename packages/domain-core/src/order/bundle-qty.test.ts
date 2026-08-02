import { describe, expect, it } from 'vitest';
import { bundleQtyOf } from './bundle-qty';

/**
 * Paket adedinin türetilmesi (denetim A3). İki app kopyası olarak yaşarken hiç testi yoktu —
 * kopyalardan biri gerekçesini kaybetmişti ve kimse fark etmemişti. Motora taşınınca sınanabilir
 * oldu; sınanan asıl şey **bozuk oranda ne olduğu**, çünkü asıl karar orada.
 */
describe('bundleQtyOf', () => {
  const icerik = [
    { variantId: 'a', qty: 2 },
    { variantId: 'b', qty: 3 },
  ];

  it('tam bölünen oranda paket adedini verir', () => {
    // 3 paket × (2 adet A) = 6
    expect(bundleQtyOf(icerik, [{ variantId: 'a', qty: 6 }])).toBe(3);
  });

  it('tek paketlik siparişte 1 döner', () => {
    expect(bundleQtyOf(icerik, [{ variantId: 'a', qty: 2 }])).toBe(1);
  });

  it('oran BOZUKSA 1e düşer — fazla eklemektense az eklemek', () => {
    // Paket içeriği sipariş verildikten sonra değişmiş: 5, 2'ye tam bölünmüyor.
    // Fazla yazmak müşterinin fark etmeden fazla ödemesi olurdu; az yazmayı sepette görüp
    // artırabilir.
    expect(bundleQtyOf(icerik, [{ variantId: 'a', qty: 5 }])).toBe(1);
  });

  it('içerikte olmayan varyantı yok sayar, sonrakine bakar', () => {
    expect(
      bundleQtyOf(icerik, [
        { variantId: 'yok', qty: 9 },
        { variantId: 'b', qty: 9 },
      ]),
    ).toBe(3);
  });

  it('içerik adedi sıfırsa bölme YAPILMAZ — 1 döner', () => {
    // Sıfıra bölme değil, veri arızası: sıfır adetli bir paket kalemi anlamsızdır ve o satırdan
    // adet türetmek uydurma olurdu.
    expect(bundleQtyOf([{ variantId: 'a', qty: 0 }], [{ variantId: 'a', qty: 4 }])).toBe(1);
  });

  it('kalem yoksa 1 döner', () => {
    expect(bundleQtyOf(icerik, [])).toBe(1);
  });
});
