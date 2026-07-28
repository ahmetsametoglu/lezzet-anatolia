import { describe, expect, it } from 'vitest';
import type { OrderItem, OrderSale } from '@lezzet/types';
import { buildAccountingExport, buildExportRow, exportEligibility } from './export';

/**
 * Muhasebe export motoru (12.7). Doğrulanan sözleşme üç maddede:
 * 1. `net + vat === gross` — her satırda, her oran kovasında, dönem özetinde.
 * 2. Satış TTC'dir; muhasebeciye giden HT/KDV ondan AYRIŞTIRILIR, ayrıca saklanmaz.
 * 3. Hediye sipariş export'a girmez ama **görünür kalır** — sessiz dışlama dönem farkını
 *    açıklanamaz bırakırdı.
 */

const SATIS: OrderSale = {
  id: '11111111-1111-1111-1111-111111111111',
  saleDate: '2026-03-14',
  customerId: '22222222-2222-2222-2222-222222222222',
  channel: 'b2c',
  orderSource: 'web',
  isGiftOrder: false,
  status: 'completed',
  paymentStatus: 'paid',
  paymentMethod: 'card',
  onAccount: false,
  deliveryType: 'route',
  deliveryZoneId: null,
  deliveryDate: null,
  addressId: null,
  addressSnapshot: null,
  courierId: null,
  deliveryCountry: 'FR',
  vatNumberSnapshot: null,
  vatTreatment: 'domestic',
  referenceNo: 'LA-26-7K4M2P',
  invoiceNo: null,
  deliveryProof: null,
  shippingFee: 0,
  total: 0,
  discountId: null,
  discountAmount: 0,
  amountCollected: 0,
  amountRefunded: 0,
  cogsAmount: null,
  deliveryCost: null,
  paymentFee: null,
  packagingCost: null,
  createdAt: '2026-03-12T09:00:00.000Z',
};

type Kalem = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPrice' | 'lineDiscountAmount' | 'vatRate'>;
const kalem = (over: Partial<Kalem> = {}): Kalem => ({
  qty: 1, fulfilledQty: 1, unitPrice: 10, lineDiscountAmount: 0, vatRate: 5.5, ...over,
});

const satis = (over: Partial<OrderSale> = {}): OrderSale => ({ ...SATIS, ...over });

describe('KDV ayrıştırma — fiyat TTC, muhasebe HT ister', () => {
  it('tek oranlı satış: net + KDV = brüt', () => {
    const satir = buildExportRow(satis(), [kalem({ unitPrice: 21.1, vatRate: 5.5 })]);

    expect(satir.gross).toBe(21.1);
    expect(satir.net).toBe(20);
    expect(satir.vat).toBe(1.1);
    expect(satir.vatLines).toEqual([{ vatRate: 5.5, gross: 21.1, net: 20, vat: 1.1 }]);
  });

  it('karışık oranlı satış oran başına ayrışır — beyan bunun üstünde durur', () => {
    const satir = buildExportRow(satis(), [
      kalem({ unitPrice: 21.1, vatRate: 5.5 }), // gıda
      kalem({ unitPrice: 12, vatRate: 20 }), // gıda dışı
    ]);

    expect(satir.vatLines.map((l) => l.vatRate)).toEqual([5.5, 20]);
    expect(satir.gross).toBe(33.1);
    expect(satir.net + satir.vat).toBe(satir.gross);
    // Her kova kendi içinde de tutar.
    for (const line of satir.vatLines) expect(line.net + line.vat).toBe(line.gross);
  });

  it('adet ve kalem indirimi tutara girer', () => {
    const satir = buildExportRow(satis(), [kalem({ qty: 3, fulfilledQty: 3, unitPrice: 10, lineDiscountAmount: 4.5 })]);
    expect(satir.gross).toBe(25.5); // 30 − 4.5
  });

  it('eksik karşılanan kalem TESLİM EDİLEN kadar faturalanır, indirim payı da oransal düşer', () => {
    // 07.8 kısmi karşılamanın muhasebe yüzü: gitmeyen mal faturalanmaz.
    const satir = buildExportRow(satis(), [kalem({ qty: 4, fulfilledQty: 2, unitPrice: 10, lineDiscountAmount: 4 })]);
    expect(satir.gross).toBe(18); // 2×10 − (4×2/4)
  });
});

describe('kargo — malın oranını izler', () => {
  it('tek oranlı satışta kargo o orana biner', () => {
    const satir = buildExportRow(satis({ shippingFee: 7.9 }), [kalem({ unitPrice: 21.1, vatRate: 5.5 })]);

    expect(satir.gross).toBe(29);
    expect(satir.vatLines).toHaveLength(1);
    expect(satir.vatLines[0]!.vatRate).toBe(5.5);
  });

  it('karışık oranlı satışta kargo kalemlere ORANSAL dağılır — kuruş kaybolmaz', () => {
    const satir = buildExportRow(satis({ shippingFee: 10 }), [
      kalem({ unitPrice: 30, vatRate: 5.5 }),
      kalem({ unitPrice: 10, vatRate: 20 }),
    ]);

    // Kargo 3/4–1/4 dağılır: 7.50 + 2.50.
    expect(satir.vatLines.find((l) => l.vatRate === 5.5)!.gross).toBe(37.5);
    expect(satir.vatLines.find((l) => l.vatRate === 20)!.gross).toBe(12.5);
    expect(satir.gross).toBe(50);
  });

  it('dağıtılacak kalem yoksa kargo KENDİ satırını açar — export’tan düşmez', () => {
    // Tamamı hediye (0 fiyatlı) sepet: oransal dağıtım burada 0 döndürür, kargo kaybolurdu.
    const satir = buildExportRow(satis({ shippingFee: 6 }), [kalem({ unitPrice: 0, vatRate: 5.5 })]);

    expect(satir.gross).toBe(6);
    expect(satir.vatLines).toEqual([{ vatRate: 20, gross: 6, net: 5, vat: 1 }]);
  });
});

describe('reverse charge', () => {
  it('AB içi B2B satışta KDV yoktur; satır Autoliquidation ibaresi taşır', () => {
    const satir = buildExportRow(
      satis({ channel: 'b2b', deliveryCountry: 'DE', vatTreatment: 'intra_eu_b2b_reverse_charge', vatNumberSnapshot: 'DE811907980', shippingFee: 15 }),
      [kalem({ unitPrice: 200, vatRate: 5.5 })],
    );

    expect(satir.vat).toBe(0);
    expect(satir.net).toBe(215);
    expect(satir.gross).toBe(215);
    expect(satir.invoiceNote).toBe('Autoliquidation');
    expect(satir.vatNumber).toBe('DE811907980');
    expect(satir.vatLines).toEqual([{ vatRate: 0, gross: 215, net: 215, vat: 0 }]);
  });
});

describe('hediye sipariş export dışıdır ama görünür', () => {
  it('patron ikramı yalnız bu filtreyi etkiler', () => {
    expect(exportEligibility({ isGiftOrder: true })).toEqual({ included: false, reason: 'gift_order' });
    expect(exportEligibility({ isGiftOrder: false })).toEqual({ included: true });
  });

  it('hediye satır dosyaya girmez, özet onu SAYI ve TUTAR olarak gösterir', () => {
    const { rows, summary } = buildAccountingExport({ from: '2026-03-01', to: '2026-03-31' }, [
      { sale: satis({ id: SATIS.id }), items: [kalem({ unitPrice: 21.1 })] },
      { sale: satis({ id: '33333333-3333-3333-3333-333333333333', isGiftOrder: true }), items: [kalem({ unitPrice: 42.2 })] },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.orderId).toBe(SATIS.id);
    expect(summary.orderCount).toBe(1);
    expect(summary.gross).toBe(21.1);
    // Dışlanan tutar açıkça duruyor: dönem cirosu ile export toplamı arasındaki fark açıklanabilir.
    expect(summary.excludedGiftCount).toBe(1);
    expect(summary.excludedGiftGross).toBe(42.2);
  });
});

describe('dönem özeti satırlardan TÜRETİLİR', () => {
  it('toplamlar satırların toplamıdır ve oran kovaları da tutar', () => {
    const { rows, summary } = buildAccountingExport({ from: '2026-03-01', to: '2026-03-31' }, [
      { sale: satis({ shippingFee: 7.9 }), items: [kalem({ unitPrice: 21.1, vatRate: 5.5 })] },
      { sale: satis({ id: '44444444-4444-4444-4444-444444444444' }), items: [kalem({ unitPrice: 12, vatRate: 20 })] },
      { sale: satis({ id: '55555555-5555-5555-5555-555555555555', discountAmount: 3 }), items: [kalem({ unitPrice: 30, vatRate: 5.5, lineDiscountAmount: 3 })] },
    ]);

    expect(summary.orderCount).toBe(3);
    expect(summary.gross).toBe(rows.reduce((t, r) => t + r.gross, 0));
    expect(summary.net + summary.vat).toBe(summary.gross);
    expect(summary.shippingFee).toBe(7.9);
    expect(summary.discountAmount).toBe(3);

    const kovaToplam = summary.byVatRate.reduce((t, l) => t + l.gross, 0);
    expect(kovaToplam).toBe(summary.gross);
    for (const line of summary.byVatRate) expect(line.net + line.vat).toBe(line.gross);
  });

  it('satış yoksa özet sıfırdır, dosya yine üretilir', () => {
    const { rows, summary } = buildAccountingExport({ from: '2026-01-01', to: '2026-01-31' }, []);
    expect(rows).toEqual([]);
    expect(summary).toMatchObject({ orderCount: 0, gross: 0, net: 0, vat: 0, byVatRate: [], excludedGiftCount: 0 });
  });
});
