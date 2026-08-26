import { describe, expect, it } from 'vitest';
import type { Order, VatTreatment } from '@lezzet/types';
import { totalsOf } from './order-detail-read';
import type { OrderLineView } from './order-detail-types';

/**
 * Sipariş detayının TOPLAM BLOĞU — saf dönüşüm (DB'siz), `orders-read.test.ts` emsali.
 *
 * ── NEDEN "İÇİNDEKİ KDV" SATIRININ AYRI TESTİ VAR (denetim 26.08) ────────────
 * O satır motorun (`vatSplitOf`) elle yazılmış bir kopyasıydı ve kopyada motorun ÜÇÜNCÜ dalı
 * eksikti: `zeroRated`. Reverse charge siparişinde (VIES ile doğrulanmış vergi numaralı Alman
 * B2B alıcısı) KDV yasal olarak sıfırdır — müşteri kendi ülkesinde beyan eder — ama ekran
 * `addVat(...) − tutar` yazıyordu. Toplamı bozmuyordu (satır `note`), operatörün mutabakat
 * yaparken okuduğu sayı yanlıştı.
 *
 * Aynı karşılaştırma depoda üç ayrı yerde elle yazılıydı; dördüncü okuyan onu sormayı unuttu.
 * Kural artık motorda tek yerde (`isZeroRated`) ve iddialar aşağıda KURALDAN kuruluyor: "reverse
 * charge siparişinde ekranda vergi görünmez", "b2c'de tutarın içinden çıkar", "b2b'de üstüne
 * eklenir" — bugünkü kodun ne yaptığı değil, ne yapması gerektiği.
 */

const line = (over: Partial<OrderLineView> = {}): OrderLineView => ({
  id: 'l1',
  title: 'Mantı · 500 g',
  sub: '500 g',
  imageUrl: null,
  productSlug: null,
  productName: 'Mantı',
  qty: 2,
  fulfilledQty: 2,
  unitPriceCents: 1000,
  lineDiscountCents: 0,
  vatRate: 5.5,
  lineTotalCents: 2000,
  bundleId: null,
  returnDisposition: null,
  defaultsToDiscard: false,
  batchNos: [],
  ...over,
});

const order = (over: Partial<Order> = {}): Order =>
  ({
    channel: 'b2c',
    vatTreatment: 'domestic' as VatTreatment,
    shippingFeeCents: 0,
    discountAmountCents: 0,
    discountLabel: null,
    amountRefundedCents: 0,
    totalCents: 2000,
    ...over,
  }) as Order;

/** Bloktan tek satırı çeker — iddia satırın ADIYLA kurulur, sırasıyla değil. */
const satir = (rows: ReturnType<typeof totalsOf>, label: string) => rows.find((r) => r.label === label);

describe('İçindeki KDV — karar motorun', () => {
  it('reverse charge siparişinde vergi SIFIRDIR — olmayan vergi ekranda yazılmaz', () => {
    const rows = totalsOf(
      order({ channel: 'b2b', vatTreatment: 'intra_eu_b2b_reverse_charge' as VatTreatment }),
      [line()],
      true,
    );

    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(0);
  });

  it('b2c: fiyat KDV DAHİL — vergi tutarın içinden çıkar', () => {
    const rows = totalsOf(order({ channel: 'b2c' }), [line({ lineTotalCents: 2000, vatRate: 5.5 })], true);

    // 20,00 € TTC · %5,5 → HT 18,96 → içindeki KDV 1,04.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(104);
  });

  it('b2b: fiyat KDV HARİÇ — vergi tutarın üstüne eklenir', () => {
    const rows = totalsOf(
      order({ channel: 'b2b', vatTreatment: 'domestic' as VatTreatment }),
      [line({ lineTotalCents: 2000, vatRate: 5.5 })],
      true,
    );

    // 20,00 € HT · %5,5 → 1,10. b2c ile AYNI tutarda farklı sayı çıkması doğru: taban farklı.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(110);
  });

  it('KDV satırı bir DÜŞÜM değil bilgidir — sipariş toplamına dokunmaz', () => {
    const rows = totalsOf(order({ totalCents: 2000 }), [line()], true);

    expect(satir(rows, 'İçindeki KDV')?.kind).toBe('note');
    expect(satir(rows, 'Sipariş toplamı')?.amountCents).toBe(2000);
  });

  it('kalem oranları kalem kalem okunur — karışık sepette tek oran varsayılmaz', () => {
    const rows = totalsOf(order({ channel: 'b2c', totalCents: 4000 }), [
      line({ id: 'a', lineTotalCents: 2000, vatRate: 5.5 }),
      line({ id: 'b', lineTotalCents: 2000, vatRate: 20 }),
    ], true);

    // 104 + 333: iki oranı ortalamak ya da birini ötekine uydurmak sessizce yanlış sayı verirdi.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(104 + 333);
  });
});

describe('karşılanmayan adet satırı', () => {
  it('hazırlık KESİNLEŞMEDİYSE düşüm yazılmaz — 0 karşılanan "hiçbiri gitmedi" demek değildir', () => {
    const rows = totalsOf(order(), [line({ qty: 2, fulfilledQty: 0 })], false);

    expect(satir(rows, 'Karşılanmayan adet')).toBeUndefined();
  });

  it('hazırlık kesinleştiyse eksik adet düşüm olarak görünür', () => {
    const rows = totalsOf(order(), [line({ qty: 2, fulfilledQty: 1 })], true);

    expect(satir(rows, 'Karşılanmayan adet')).toMatchObject({ amountCents: 1000, kind: 'deduction' });
  });
});
