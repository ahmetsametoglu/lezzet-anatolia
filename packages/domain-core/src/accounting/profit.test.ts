import { describe, expect, it } from 'vitest';
import type { OrderSale } from '@lezzet/types';
import { companyProfit, orderContribution, variantProfit, type SoldLine } from './profit';

/**
 * Kârlılık motoru (12.6) — DOMAIN §12. Doğrulanan dört sözleşme:
 * 1. **Kâr HT üstünden** hesaplanır; KDV ciro değildir.
 * 2. **Eksik maliyet 0 SAYILMAZ** — kapanmamış sipariş kârdan düşer ama görünür kalır.
 * 3. **Fire ürün marjından düşülür** ("bu üründen ne kadar çöpe attım" gizlenmez).
 * 4. **Genel gider bir kez**, şirket seviyesinde düşülür; ürüne dağıtılmaz.
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

const satis = (over: Partial<OrderSale> = {}): OrderSale => ({ ...SATIS, ...over });
const kalem = (over: Partial<SoldLine['item']> = {}) => ({
  qty: 1, fulfilledQty: 1, unitPrice: 10, lineDiscountAmount: 0, vatRate: 5.5, ...over,
});

/** Kapanmış sipariş: maliyet kalemleri sabitlenmiş. */
const kapali = (over: Partial<OrderSale> = {}) =>
  satis({ cogsAmount: 0, deliveryCost: 0, paymentFee: 0, packagingCost: 0, ...over });

describe('sipariş katkı payı', () => {
  it('kâr HT üstünden hesaplanır — KDV ciro değildir', () => {
    // 21.10 € TTC @ %5,5 → 20 € HT. Maliyet 8 € → katkı 12 €.
    const k = orderContribution(kapali({ cogsAmount: 8 }), [kalem({ unitPrice: 21.1 })]);

    expect(k.revenue).toBe(20);
    expect(k.contribution).toBe(12);
    expect(k.marginPct).toBe(60);
  });

  it('dört doğrudan gider de düşülür — genel gider karışmaz', () => {
    const k = orderContribution(
      kapali({ cogsAmount: 8, deliveryCost: 2.5, paymentFee: 0.6, packagingCost: 1.2, shippingFee: 0 }),
      [kalem({ unitPrice: 21.1 })],
    );

    expect(k.costs).toEqual({ cogs: 8, delivery: 2.5, paymentFee: 0.6, packaging: 1.2 });
    // 20 − 12.30 = 7.70 TAM. (JS'te `20 - 12.3` 7.699999999999999'dur; motor cent'te hesapladığı
    // için o artığı üretmiyor — beklenti de kayan noktayla yazılmaz.)
    expect(k.contribution).toBe(7.7);
  });

  it('kargo ciroya girer, teslimat maliyeti gidere — ikisi ayrı gerçektir', () => {
    const kargosuz = orderContribution(kapali({ cogsAmount: 8 }), [kalem({ unitPrice: 21.1 })]);
    const kargolu = orderContribution(kapali({ cogsAmount: 8, shippingFee: 7.9, deliveryCost: 6 }), [kalem({ unitPrice: 21.1 })]);

    expect(kargolu.revenue).toBeGreaterThan(kargosuz.revenue);
    // Kargo ücreti teslimat maliyetini karşılamıyorsa katkı payı DÜŞER — rapor bunu göstermeli.
    expect(kargolu.contribution!).toBeLessThan(kargosuz.contribution! + 7.9);
  });

  it('patron ikramı kârda SAYILIR — parayı patron öder', () => {
    const k = orderContribution(kapali({ cogsAmount: 8, isGiftOrder: true }), [kalem({ unitPrice: 21.1 })]);

    expect(k.isGiftOrder).toBe(true);
    expect(k.contribution).toBe(12); // ikram olması kârı değiştirmez
  });
});

describe('eksik maliyet 0 SAYILMAZ', () => {
  it('kapanmamış siparişin kârı hesaplanmaz, cirosu durur', () => {
    // Teslim edilmiş ama `completed` olmamış: `cogs_amount` henüz sabitlenmedi.
    const k = orderContribution(satis({ status: 'delivered' }), [kalem({ unitPrice: 21.1 })]);

    expect(k.costsFixed).toBe(false);
    expect(k.contribution).toBeNull();
    expect(k.marginPct).toBeNull();
    expect(k.revenue).toBe(20); // ciro biliniyor, kâr bilinmiyor
  });

  it('şirket P&L fiyatlanmamışı kârdan düşer ama SAYI ve CİRO olarak gösterir', () => {
    const pl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      orderContribution(kapali({ cogsAmount: 8 }), [kalem({ unitPrice: 21.1 })]),
      orderContribution(satis({ status: 'delivered' }), [kalem({ unitPrice: 21.1 })]),
    ], { lossCost: 0, overhead: 0 });

    expect(pl.orderCount).toBe(1);
    expect(pl.revenue).toBe(20);
    expect(pl.contribution).toBe(12);
    expect(pl.unpricedCount).toBe(1);
    expect(pl.unpricedRevenue).toBe(20);
  });
});

describe('ürün kârlılığı — fire düşülmüş net marj', () => {
  const satir = (variantId: string, over: Partial<SoldLine> = {}): SoldLine => ({
    variantId,
    item: kalem({ unitPrice: 21.1 }),
    costCents: 800,
    ...over,
  });

  it('varyant bazında toplanır; kargo/komisyon GİRMEZ (onlar siparişin gideri)', () => {
    const [urun] = variantProfit([satir('v1'), satir('v1')]);

    expect(urun).toMatchObject({ variantId: 'v1', qty: 2, revenue: 40, cogs: 16, grossProfit: 24 });
  });

  it('fire maliyeti brüt marjdan düşer — "ne kazandım" değil "ne kaldı"', () => {
    const [urun] = variantProfit([satir('v1')], [{ variantId: 'v1', qty: 2, costCents: 900 }]);

    expect(urun).toMatchObject({ grossProfit: 12, lossQty: 2, lossCost: 9, netProfit: 3 });
    expect(urun!.marginPct).toBe(15); // 3 / 20
  });

  it('hiç satılmadan çöpe giden ürün de raporlanır — en pahalı kayıp odur', () => {
    const satirlar = variantProfit([], [{ variantId: 'v9', qty: 5, costCents: 2000 }]);

    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({ variantId: 'v9', qty: 0, revenue: 0, lossCost: 20, netProfit: -20 });
    expect(satirlar[0]!.marginPct).toBeNull(); // ciro yok, marj hesaplanamaz
  });

  it('maliyeti bilinmeyen kalem cirosuyla birlikte DIŞLANIR — eksiği 0 saymak marjı şişirir', () => {
    const satirlar = variantProfit([satir('v1'), satir('v1', { costCents: null })]);

    expect(satirlar[0]).toMatchObject({ qty: 1, revenue: 20, cogs: 8 });
  });

  it('net kâra göre sıralanır — en çok kazandıran başta', () => {
    const satirlar = variantProfit([
      satir('dusuk', { costCents: 1800 }),
      satir('yuksek', { costCents: 200 }),
    ]);

    expect(satirlar.map((s) => s.variantId)).toEqual(['yuksek', 'dusuk']);
  });
});

describe('şirket kârlılığı — tam P&L', () => {
  const katki = (channel: 'b2c' | 'b2b', cogs: number, fiyat: number) =>
    orderContribution(kapali({ channel, cogsAmount: cogs }), [kalem({ unitPrice: fiyat })]);

  it('genel gider ve fire BİR KEZ düşülür, ürüne dağıtılmaz', () => {
    const pl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      katki('b2c', 8, 21.1), // 20 HT − 8 = 12
      katki('b2b', 30, 105.5), // 100 HT − 30 = 70
    ], { lossCost: 15, overhead: 50 });

    expect(pl.revenue).toBe(120);
    expect(pl.directCosts).toBe(38);
    expect(pl.contribution).toBe(82);
    expect(pl.netProfit).toBe(82 - 15 - 50);
  });

  it('kanal kırılımı katkı payı seviyesindedir — genel gider kanala dağıtılmaz', () => {
    const pl = companyProfit({ from: '2026-03-01', to: '2026-03-31' }, [
      katki('b2c', 8, 21.1),
      katki('b2b', 30, 105.5),
    ], { lossCost: 0, overhead: 500 });

    const b2b = pl.byChannel.find((c) => c.channel === 'b2b')!;
    expect(b2b).toMatchObject({ orderCount: 1, revenue: 100, contribution: 70, marginPct: 70 });
    // Genel gider şirketi zarara soksa bile kanalın katkı payı POZİTİF kalır — karar temiz kalsın.
    expect(pl.netProfit).toBeLessThan(0);
    expect(b2b.contribution).toBeGreaterThan(0);
  });

  it('satışsız dönem sıfır döner, çökmez', () => {
    const pl = companyProfit({ from: '2026-01-01', to: '2026-01-31' }, [], { lossCost: 0, overhead: 900 });

    expect(pl).toMatchObject({ revenue: 0, contribution: 0, netProfit: -900, orderCount: 0, byChannel: [] });
  });
});
