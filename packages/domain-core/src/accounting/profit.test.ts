import { describe, expect, it } from 'vitest';
import { toCents } from '@lezzet/helper';
import type { OrderSale } from '@lezzet/types';
import { companyProfit, orderContribution, variantProfit, type SoldLine } from './profit';

/**
 * Kârlılık motoru (12.6) — DOMAIN §12. Doğrulanan dört sözleşme:
 * 1. **Kâr HT üstünden** hesaplanır; KDV ciro değildir.
 * 2. **Eksik maliyet 0 SAYILMAZ** — kapanmamış sipariş kârdan düşer ama görünür kalır.
 * 3. **Fire ürün marjından düşülür** ("bu üründen ne kadar çöpe attım" gizlenmez).
 * 4. **Genel gider bir kez**, şirket seviyesinde düşülür; ürüne dağıtılmaz.
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
  // Tamamlanmış satışta iptal sebebi yoktur (07.14) — `null` "iptal edilmedi" demek.
  cancelReason: null,
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
  shippingFeeCents: 0,
  totalCents: 0,
  discountId: null,
  discountLabel: null,
  discountAmountCents: 0,
  amountCollectedCents: 0,
  amountRefundedCents: 0,
  cogsAmountCents: null,
  deliveryCostCents: null,
  paymentFeeCents: null,
  packagingCostCents: null,
  createdAt: '2026-03-12T09:00:00.000Z',
};

const sale = (over: Partial<OrderSale> = {}): OrderSale => ({ ...BASE_SALE, ...over });
const line = (over: Partial<SoldLine['item']> = {}) => ({
  qty: 1, fulfilledQty: 1, unitPriceCents: 1000, lineDiscountAmountCents: 0, vatRate: 5.5, ...over,
});

/** Kapanmış sipariş: maliyet kalemleri sabitlenmiş. */
const closed = (over: Partial<OrderSale> = {}) =>
  sale({ cogsAmountCents: 0, deliveryCostCents: 0, paymentFeeCents: 0, packagingCostCents: 0, ...over });

describe('sipariş katkı payı', () => {
  it('kâr HT üstünden hesaplanır — KDV ciro değildir', () => {
    // 21.10 € TTC @ %5,5 → 20 € HT. Maliyet 8 € → katkı 12 €.
    const result = orderContribution(closed({ cogsAmountCents: 800 }), [line({ unitPriceCents: 2110 })]);

    expect(result.revenue).toBe(20);
    expect(result.contribution).toBe(12);
    expect(result.marginPct).toBe(60);
  });

  it('dört doğrudan gider de düşülür — genel gider karışmaz', () => {
    const result = orderContribution(
      closed({ cogsAmountCents: 800, deliveryCostCents: 250, paymentFeeCents: 60, packagingCostCents: 120, shippingFeeCents: 0 }),
      [line({ unitPriceCents: 2110 })],
    );

    expect(result.costs).toEqual({ cogs: 8, delivery: 2.5, paymentFee: 0.6, packaging: 1.2 });
    // 20 − 12.30 = 7.70 TAM. (JS'te `20 - 12.3` 7.699999999999999'dur; motor cent'te hesapladığı
    // için o artığı üretmiyor — beklenti de kayan noktayla yazılmaz.)
    expect(result.contribution).toBe(7.7);
  });

  it('kargo ciroya girer, teslimat maliyeti gidere — ikisi ayrı gerçektir', () => {
    const withoutShipping = orderContribution(closed({ cogsAmountCents: 800 }), [line({ unitPriceCents: 2110 })]);
    const withShipping = orderContribution(closed({ cogsAmountCents: 800, shippingFeeCents: 790, deliveryCostCents: 600 }), [line({ unitPriceCents: 2110 })]);

    expect(withShipping.revenue).toBeGreaterThan(withoutShipping.revenue);
    // Kargo ücreti teslimat maliyetini karşılamıyorsa katkı payı DÜŞER — rapor bunu göstermeli.
    expect(withShipping.contribution!).toBeLessThan(withoutShipping.contribution! + 7.9);
  });

  it('B2B fiyatı ZATEN HT\'dir — KDV bir daha çıkarılmaz', () => {
    // DOMAIN §5: `Price.amount` kanalın tabanında saklanır — b2c TTC, b2b HT. Aynı sayı (100 €)
    // iki kanalda iki ayrı şey demektir: b2c'de 94,79 HT, b2b'de 100 HT. Tek yön varsayıldığında
    // b2b cirosu her satırda %5,5 eriyordu ve aynı hata muhasebe dosyasına da geçiyordu.
    const b2b = orderContribution(closed({ channel: 'b2b', cogsAmountCents: 6000 }), [line({ unitPriceCents: 10_000 })]);
    const b2c = orderContribution(closed({ channel: 'b2c', cogsAmountCents: 6000 }), [line({ unitPriceCents: 10_000 })]);

    expect(b2b.revenue).toBe(100);
    expect(b2b.contribution).toBe(40);
    expect(b2c.revenue).toBe(94.79);
    expect(b2c.revenue).toBeLessThan(b2b.revenue);
  });

  it('reverse charge\'da KDV yoktur — tutar olduğu gibi cirodur', () => {
    const result = orderContribution(
      closed({ channel: 'b2b', vatTreatment: 'intra_eu_b2b_reverse_charge', deliveryCountry: 'DE', cogsAmountCents: 6000 }),
      [line({ unitPriceCents: 10_000 })],
    );

    expect(result.revenue).toBe(100);
  });

  it('patron ikramı kârda SAYILIR — parayı patron öder', () => {
    const result = orderContribution(closed({ cogsAmountCents: 800, isGiftOrder: true }), [line({ unitPriceCents: 2110 })]);

    expect(result.isGiftOrder).toBe(true);
    expect(result.contribution).toBe(12); // ikram olması kârı değiştirmez
  });
});

describe('eksik maliyet 0 SAYILMAZ', () => {
  it('kapanmamış siparişin kârı hesaplanmaz, cirosu durur', () => {
    // Teslim edilmiş ama `completed` olmamış: `cogs_amount` henüz sabitlenmedi.
    const result = orderContribution(sale({ status: 'delivered' }), [line({ unitPriceCents: 2110 })]);

    expect(result.costsFixed).toBe(false);
    expect(result.contribution).toBeNull();
    expect(result.marginPct).toBeNull();
    expect(result.revenue).toBe(20); // ciro biliniyor, kâr bilinmiyor
  });

  it('şirket P&L fiyatlanmamışı kârdan düşer ama SAYI ve CİRO olarak gösterir', () => {
    const pnl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      orderContribution(closed({ cogsAmountCents: 800 }), [line({ unitPriceCents: 2110 })]),
      orderContribution(sale({ status: 'delivered' }), [line({ unitPriceCents: 2110 })]),
    ], { lossCost: 0, overhead: 0 });

    expect(pnl.orderCount).toBe(1);
    expect(pnl.revenue).toBe(20);
    expect(pnl.contribution).toBe(12);
    expect(pnl.unpricedCount).toBe(1);
    expect(pnl.unpricedRevenue).toBe(20);
  });
});

describe('ürün kârlılığı — fire düşülmüş net marj', () => {
  const soldLine = (variantId: string, over: Partial<SoldLine> = {}): SoldLine => ({
    variantId,
    item: line({ unitPriceCents: 2110 }),
    channel: 'b2c',
    costCents: 800,
    ...over,
  });

  it('varyant bazında toplanır; kargo/komisyon GİRMEZ (onlar siparişin gideri)', () => {
    const [product] = variantProfit([soldLine('v1'), soldLine('v1')]);

    expect(product).toMatchObject({ variantId: 'v1', qty: 2, revenue: 40, cogs: 16, grossProfit: 24 });
  });

  it('fire maliyeti brüt marjdan düşer — "ne kazandım" değil "ne kaldı"', () => {
    const [product] = variantProfit([soldLine('v1')], [{ variantId: 'v1', qty: 2, costCents: 900 }]);

    expect(product).toMatchObject({ grossProfit: 12, lossQty: 2, lossCost: 9, netProfit: 3 });
    expect(product!.marginPct).toBe(15); // 3 / 20
  });

  it('hiç satılmadan çöpe giden ürün de raporlanır — en pahalı kayıp odur', () => {
    const rows = variantProfit([], [{ variantId: 'v9', qty: 5, costCents: 2000 }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId: 'v9', qty: 0, revenue: 0, lossCost: 20, netProfit: -20 });
    expect(rows[0]!.marginPct).toBeNull(); // ciro yok, marj hesaplanamaz
  });

  it('maliyeti bilinmeyen kalem cirosuyla birlikte DIŞLANIR — eksiği 0 saymak marjı şişirir', () => {
    const rows = variantProfit([soldLine('v1'), soldLine('v1', { costCents: null })]);

    expect(rows[0]).toMatchObject({ qty: 1, revenue: 20, cogs: 8 });
  });

  it('net kâra göre sıralanır — en çok kazandıran başta', () => {
    const rows = variantProfit([
      soldLine('low', { costCents: 1800 }),
      soldLine('high', { costCents: 200 }),
    ]);

    expect(rows.map((s) => s.variantId)).toEqual(['high', 'low']);
  });
});

describe('şirket kârlılığı — tam P&L', () => {
  // Girdiler EURO okunur (testin okunurluğu için), cent'e burada inilir — sayıların 21,1 kalması
  // "20 HT − 8 = 12" gibi yorumların satırla aynı dili konuşmasını sağlıyor.
  const contribution = (channel: 'b2c' | 'b2b', cogsEuro: number, unitPriceEuro: number) =>
    orderContribution(closed({ channel, cogsAmountCents: toCents(cogsEuro) }), [line({ unitPriceCents: toCents(unitPriceEuro) })]);

  it('genel gider ve fire BİR KEZ düşülür, ürüne dağıtılmaz', () => {
    const pnl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      contribution('b2c', 8, 21.1), // 20 HT − 8 = 12
      contribution('b2b', 30, 100), // b2b fiyatı HT: 100 − 30 = 70
    ], { lossCost: 15, overhead: 50 });

    expect(pnl.revenue).toBe(120);
    expect(pnl.directCosts).toBe(38);
    expect(pnl.contribution).toBe(82);
    expect(pnl.netProfit).toBe(82 - 15 - 50);
  });

  it('kanal kırılımı katkı payı seviyesindedir — genel gider kanala dağıtılmaz', () => {
    const pnl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      contribution('b2c', 8, 21.1),
      contribution('b2b', 30, 100),
    ], { lossCost: 0, overhead: 500 });

    const b2b = pnl.byChannel.find((c) => c.channel === 'b2b')!;
    expect(b2b).toMatchObject({ orderCount: 1, revenue: 100, contribution: 70, marginPct: 70 });
    // Genel gider şirketi zarara soksa bile kanalın katkı payı POZİTİF kalır — karar temiz kalsın.
    expect(pnl.netProfit).toBeLessThan(0);
    expect(b2b.contribution).toBeGreaterThan(0);
  });

  it('satışsız dönem sıfır döner, çökmez', () => {
    const pnl = companyProfit({ from: '2026-01-01', to: '2026-01-31' }, [], { lossCost: 0, overhead: 900 });

    expect(pnl).toMatchObject({ revenue: 0, contribution: 0, netProfit: -900, orderCount: 0, byChannel: [] });
  });
});
