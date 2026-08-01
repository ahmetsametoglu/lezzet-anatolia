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

const BASE_SALE: OrderSale = {
  id: '11111111-1111-1111-1111-111111111111',
  saleDate: '2026-03-14',
  customerId: '22222222-2222-2222-2222-222222222222',
  // Sipariş tek depodan çıkar (DOMAIN §17) — muhasebe hesabını etkilemez ama alan zorunlu.
  warehouseId: '99999999-9999-9999-9999-999999999999',
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
  locale: null,
  referenceNo: 'LA-26-7K4M2P',
  idempotencyKey: null,
  invoiceNo: null,
  deliveryProof: null,
  carrier: null,
  trackingNumber: null,
  shippingFee: 0,
  total: 0,
  discountId: null,
  discountLabel: null,
  discountAmount: 0,
  amountCollected: 0,
  amountRefunded: 0,
  cogsAmount: null,
  deliveryCost: null,
  paymentFee: null,
  packagingCost: null,
  createdAt: '2026-03-12T09:00:00.000Z',
};

type Line = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPrice' | 'lineDiscountAmount' | 'vatRate'>;
const line = (over: Partial<Line> = {}): Line => ({
  qty: 1, fulfilledQty: 1, unitPrice: 10, lineDiscountAmount: 0, vatRate: 5.5, ...over,
});

const sale = (over: Partial<OrderSale> = {}): OrderSale => ({ ...BASE_SALE, ...over });

describe('KDV ayrıştırma — fiyat TTC, muhasebe HT ister', () => {
  it('tek oranlı satış: net + KDV = brüt', () => {
    const row = buildExportRow(sale(), [line({ unitPrice: 21.1, vatRate: 5.5 })]);

    expect(row.gross).toBe(21.1);
    expect(row.net).toBe(20);
    expect(row.vat).toBe(1.1);
    expect(row.vatLines).toEqual([{ vatRate: 5.5, gross: 21.1, net: 20, vat: 1.1 }]);
  });

  it('karışık oranlı satış oran başına ayrışır — beyan bunun üstünde durur', () => {
    const row = buildExportRow(sale(), [
      line({ unitPrice: 21.1, vatRate: 5.5 }), // gıda
      line({ unitPrice: 12, vatRate: 20 }), // gıda dışı
    ]);

    expect(row.vatLines.map((l) => l.vatRate)).toEqual([5.5, 20]);
    expect(row.gross).toBe(33.1);
    expect(row.net + row.vat).toBe(row.gross);
    // Her kova kendi içinde de tutar.
    for (const vatLine of row.vatLines) expect(vatLine.net + vatLine.vat).toBe(vatLine.gross);
  });

  it('adet ve kalem indirimi tutara girer', () => {
    const row = buildExportRow(sale(), [line({ qty: 3, fulfilledQty: 3, unitPrice: 10, lineDiscountAmount: 4.5 })]);
    expect(row.gross).toBe(25.5); // 30 − 4.5
  });

  it('eksik karşılanan kalem TESLİM EDİLEN kadar faturalanır, indirim payı da oransal düşer', () => {
    // 07.8 kısmi karşılamanın muhasebe yüzü: gitmeyen mal faturalanmaz.
    const row = buildExportRow(sale(), [line({ qty: 4, fulfilledQty: 2, unitPrice: 10, lineDiscountAmount: 4 })]);
    expect(row.gross).toBe(18); // 2×10 − (4×2/4)
  });
});

describe('kargo — malın oranını izler', () => {
  it('tek oranlı satışta kargo o orana biner', () => {
    const row = buildExportRow(sale({ shippingFee: 7.9 }), [line({ unitPrice: 21.1, vatRate: 5.5 })]);

    expect(row.gross).toBe(29);
    expect(row.vatLines).toHaveLength(1);
    expect(row.vatLines[0]!.vatRate).toBe(5.5);
  });

  it('karışık oranlı satışta kargo kalemlere ORANSAL dağılır — kuruş kaybolmaz', () => {
    const row = buildExportRow(sale({ shippingFee: 10 }), [
      line({ unitPrice: 30, vatRate: 5.5 }),
      line({ unitPrice: 10, vatRate: 20 }),
    ]);

    // Kargo 3/4–1/4 dağılır: 7.50 + 2.50.
    expect(row.vatLines.find((l) => l.vatRate === 5.5)!.gross).toBe(37.5);
    expect(row.vatLines.find((l) => l.vatRate === 20)!.gross).toBe(12.5);
    expect(row.gross).toBe(50);
  });

  it('dağıtılacak kalem yoksa kargo KENDİ satırını açar — export’tan düşmez', () => {
    // Tamamı hediye (0 fiyatlı) sepet: oransal dağıtım burada 0 döndürür, kargo kaybolurdu.
    const row = buildExportRow(sale({ shippingFee: 6 }), [line({ unitPrice: 0, vatRate: 5.5 })]);

    expect(row.gross).toBe(6);
    expect(row.vatLines).toEqual([{ vatRate: 20, gross: 6, net: 5, vat: 1 }]);
  });
});

describe('KDV tabanı kanaldan gelir (DOMAIN §5)', () => {
  it('yurtiçi B2B satırında tutar HT\'dir — KDV ÜSTÜNE eklenir, içinden çıkarılmaz', () => {
    // Bu satır bir para hatasının nöbetçisidir: b2b fiyatı KDV hariç saklanır, ama export tek yön
    // varsayıp `removeVat` uyguluyordu. Sonuç, beyan edilen KDV'nin ve cironun her b2b satırında
    // düşük çıkmasıydı — hem muhasebe dosyasında hem kâr raporunda, aynı kökten.
    const row = buildExportRow(sale({ channel: 'b2b' }), [line({ unitPrice: 100, vatRate: 5.5 })]);

    expect(row.net).toBe(100); // tutarın kendisi
    expect(row.vat).toBe(5.5);
    expect(row.gross).toBe(105.5); // müşterinin ödeyeceği
    expect(row.net + row.vat).toBe(row.gross);
  });

  it('aynı sayı B2C\'de TTC okunur — iki kanal aynı satırı farklı böler', () => {
    const b2c = buildExportRow(sale({ channel: 'b2c' }), [line({ unitPrice: 100, vatRate: 5.5 })]);

    expect(b2c.gross).toBe(100);
    expect(b2c.net).toBe(94.79);
    expect(b2c.vat).toBe(5.21);
  });
});

describe('reverse charge', () => {
  it('AB içi B2B satışta KDV yoktur; satır Autoliquidation ibaresi taşır', () => {
    const row = buildExportRow(
      sale({ channel: 'b2b', deliveryCountry: 'DE', vatTreatment: 'intra_eu_b2b_reverse_charge', vatNumberSnapshot: 'DE811907980', shippingFee: 15 }),
      [line({ unitPrice: 200, vatRate: 5.5 })],
    );

    expect(row.vat).toBe(0);
    expect(row.net).toBe(215);
    expect(row.gross).toBe(215);
    expect(row.invoiceNote).toBe('Autoliquidation');
    expect(row.vatNumber).toBe('DE811907980');
    expect(row.vatLines).toEqual([{ vatRate: 0, gross: 215, net: 215, vat: 0 }]);
  });
});

describe('hediye sipariş export dışıdır ama görünür', () => {
  it('patron ikramı yalnız bu filtreyi etkiler', () => {
    expect(exportEligibility({ isGiftOrder: true })).toEqual({ included: false, reason: 'gift_order' });
    expect(exportEligibility({ isGiftOrder: false })).toEqual({ included: true });
  });

  it('hediye satır dosyaya girmez, özet onu SAYI ve TUTAR olarak gösterir', () => {
    const { rows, summary } = buildAccountingExport({ from: '2026-03-01', to: '2026-03-31' }, [
      { sale: sale({ id: BASE_SALE.id }), items: [line({ unitPrice: 21.1 })] },
      { sale: sale({ id: '33333333-3333-3333-3333-333333333333', isGiftOrder: true }), items: [line({ unitPrice: 42.2 })] },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.orderId).toBe(BASE_SALE.id);
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
      { sale: sale({ shippingFee: 7.9 }), items: [line({ unitPrice: 21.1, vatRate: 5.5 })] },
      { sale: sale({ id: '44444444-4444-4444-4444-444444444444' }), items: [line({ unitPrice: 12, vatRate: 20 })] },
      { sale: sale({ id: '55555555-5555-5555-5555-555555555555', discountAmount: 3 }), items: [line({ unitPrice: 30, vatRate: 5.5, lineDiscountAmount: 3 })] },
    ]);

    expect(summary.orderCount).toBe(3);
    expect(summary.gross).toBe(rows.reduce((t, r) => t + r.gross, 0));
    expect(summary.net + summary.vat).toBe(summary.gross);
    expect(summary.shippingFee).toBe(7.9);
    expect(summary.discountAmount).toBe(3);

    const bucketTotal = summary.byVatRate.reduce((t, l) => t + l.gross, 0);
    expect(bucketTotal).toBe(summary.gross);
    for (const vatLine of summary.byVatRate) expect(vatLine.net + vatLine.vat).toBe(vatLine.gross);
  });

  it('satış yoksa özet sıfırdır, dosya yine üretilir', () => {
    const { rows, summary } = buildAccountingExport({ from: '2026-01-01', to: '2026-01-31' }, []);
    expect(rows).toEqual([]);
    expect(summary).toMatchObject({ orderCount: 0, gross: 0, net: 0, vat: 0, byVatRate: [], excludedGiftCount: 0 });
  });
});
