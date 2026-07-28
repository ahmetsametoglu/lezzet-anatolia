import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService,
  StockAdjustmentService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { quickSale } from '../order/quick-sale';
import { companyPnl, orderProfits, productProfits } from './profit';

/**
 * Kârlılık (12.6) — DB üstünde. Doğrulanan şey toplama değil, **maliyetin nereden geldiği**:
 * - ürün maliyeti siparişin toplamından pay edilmez, kalemin GERÇEK partilerinden okunur,
 * - fire ürünün marjından düşer,
 * - stok alımı genel gidere ikinci kez yazılmaz (COGS'ta zaten var),
 * - patron ikramı kârda sayılır.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const movements = new MoneyMovementService(db);

const damga = Date.now();
let customerId: string;
let ucuzVariant: string;
let pahaliVariant: string;
let productId: string;
let categoryId: string;
let kasa: string;
const acilanProfiller: string[] = [];

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const BUGUN = { from: gun(0), to: gun(0) };
const euro = (v: number) => Math.round(v * 100) / 100;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kâr testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sarma ${damga}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500gr' } }, { label: { tr: '1kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  ucuzVariant = variants[0]!.id;
  pahaliVariant = variants[1]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kâr müşterisi ${damga}` })).id;
  acilanProfiller.push(customerId);
  kasa = (await new AccountService(db).insert({ name: `Kâr kasası ${damga}`, type: 'cash' })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', kasa);
  await db.from('order').delete().eq('customer_id', customerId);
  for (const v of [ucuzVariant, pahaliVariant]) {
    await db.from('stock_adjustment').delete().in('stock_id', (await stocks.listByVariant(v)).map((s) => s.id));
    await db.from('stock').delete().eq('variant_id', v);
  }
  await db.from('account').delete().eq('id', kasa);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: acilanProfiller });
});

/** Kapıda satış: tek adımda kapanır, maliyet kalemleri sabitlenir, partiler yazılır. */
async function sat(variantId: string, qty: number, unitPrice: number, opts: { hediye?: boolean } = {}) {
  const { order } = await orders.create(
    { customerId, channel: 'b2c', orderSource: 'door', isGiftOrder: opts.hediye ?? false, total: qty * unitPrice },
    [{ variantId, qty, unitPrice, vatRate: 5.5 }],
  );
  const sonuc = await quickSale({ orderId: order.id, paymentMethod: 'cash', paymentAccountId: kasa });
  expect(sonuc.status).toBe('ok');
  return order;
}

describe('ürün kârlılığı GERÇEK partiden hesaplanır', () => {
  it('aynı üründen ucuz ve pahalı parti çıkarsa maliyet ayrışır', async () => {
    // İki ayrı varyant, iki ayrı alış: pay etseydik ikisi de ortalamayı gösterirdi.
    await stocks.insert({ variantId: ucuzVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 2 });
    await stocks.insert({ variantId: pahaliVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 8 });

    await sat(ucuzVariant, 2, 21.1); // 40 € HT ciro, 4 € maliyet
    await sat(pahaliVariant, 2, 21.1); // 40 € HT ciro, 16 € maliyet

    const urunler = await productProfits(BUGUN);
    const ucuz = urunler.find((u) => u.variantId === ucuzVariant)!;
    const pahali = urunler.find((u) => u.variantId === pahaliVariant)!;

    expect(ucuz).toMatchObject({ qty: 2, revenue: 40, cogs: 4, grossProfit: 36 });
    expect(pahali).toMatchObject({ qty: 2, revenue: 40, cogs: 16, grossProfit: 24 });
    // Rapor kârlıyı öne alır — ucuz parti daha çok kazandırdı.
    expect(urunler.findIndex((u) => u.variantId === ucuzVariant)).toBeLessThan(
      urunler.findIndex((u) => u.variantId === pahaliVariant),
    );
  });

  it('fire ürünün marjından düşer — çöpe giden mal gizlenmez', async () => {
    const parti = await stocks.insert({ variantId: ucuzVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 2 });
    await sat(ucuzVariant, 2, 21.1);
    const oncekiler = await productProfits(BUGUN);
    const once = oncekiler.find((u) => u.variantId === ucuzVariant)!;

    // 3 adet DLC imhası → 6 € kayıp.
    await new StockAdjustmentService(db).adjust({ stockId: parti.id, qty: 3, reason: 'expired', note: 'DLC geçti' });

    const sonra = (await productProfits(BUGUN)).find((u) => u.variantId === ucuzVariant)!;
    expect(sonra.lossQty).toBe(3);
    expect(sonra.lossCost).toBe(6);
    expect(sonra.grossProfit).toBe(once.grossProfit); // brüt marj değişmez
    expect(sonra.netProfit).toBe(euro(once.grossProfit - 6)); // net marj fireyi taşır
  });
});

describe('şirket P&L', () => {
  it('genel gider ve fire bir kez düşülür; STOK ALIMI ikinci kez gider yazılmaz', async () => {
    await stocks.insert({ variantId: pahaliVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 8 });
    const once = await companyPnl(BUGUN);

    await sat(pahaliVariant, 1, 21.1); // 20 € HT ciro, 8 € COGS

    // Genel gider: kira. Stok alımı: aynı dönemde 500 € — COGS'ta zaten sayıldığı için P&L'e
    // İKİNCİ KEZ girmemeli.
    await movements.insert({ accountId: kasa, direction: 'out', amount: 120, type: 'expense', category: 'kira' });
    const alim = await movements.insert({ accountId: kasa, direction: 'out', amount: 500, type: 'purchase', description: 'Mal alımı' });
    expect(alim.amount).toBe(500); // alım gerçekten yazıldı — testin iddiası boşa düşmesin

    const sonra = await companyPnl(BUGUN);
    expect(euro(sonra.revenue - once.revenue)).toBe(20);
    expect(euro(sonra.directCosts - once.directCosts)).toBeGreaterThanOrEqual(8);
    // Genel gider farkı YALNIZ kira kadar — 500 €'luk stok alımı girmedi.
    expect(euro(sonra.overhead - once.overhead)).toBe(120);
  });

  it('kanal kırılımı katkı payı seviyesindedir', async () => {
    await stocks.insert({ variantId: ucuzVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 2 });
    await sat(ucuzVariant, 1, 21.1);

    const pl = await companyPnl(BUGUN);
    const b2c = pl.byChannel.find((c) => c.channel === 'b2c');
    expect(b2c).toBeDefined();
    expect(b2c!.contribution).toBeLessThanOrEqual(b2c!.revenue);
    // Net kâr katkı payından fire ve genel gider kadar düşüktür — eşit olamaz.
    expect(pl.netProfit).toBe(euro(pl.contribution - pl.lossCost - pl.overhead));
  });

  it('patron ikramı kârda SAYILIR — yalnız export dışıdır', async () => {
    await stocks.insert({ variantId: pahaliVariant, physicalQty: 10, expiryDate: gun(200), purchasePrice: 8 });
    const once = await companyPnl(BUGUN);

    const hediye = await sat(pahaliVariant, 1, 21.1, { hediye: true });

    const sonra = await companyPnl(BUGUN);
    expect(euro(sonra.revenue - once.revenue)).toBe(20);
    expect(sonra.orderCount - once.orderCount).toBe(1);

    const katki = (await orderProfits(BUGUN)).find((k) => k.orderId === hediye.id)!;
    expect(katki.isGiftOrder).toBe(true);
    expect(katki.contribution).toBe(12); // 20 HT − 8 COGS
  });
});

describe('eksik maliyet kârı şişirmez', () => {
  it('kapanmamış sipariş kârdan düşer ama cirosuyla görünür', async () => {
    const once = await companyPnl(BUGUN);

    // Teslim edilmiş ama kapanmamış sipariş: `cogs_amount` henüz sabitlenmedi.
    const { order } = await orders.create({ customerId, channel: 'b2c', total: 21.1 }, [
      { variantId: ucuzVariant, qty: 1, fulfilledQty: 1, unitPrice: 21.1, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'delivered', referenceNo: `LA-KR-${damga}` });
    await db.from('order_status_log').insert({ order_id: order.id, from_status: 'out_for_delivery', to_status: 'delivered' });

    const sonra = await companyPnl(BUGUN);
    expect(sonra.orderCount).toBe(once.orderCount); // kâra girmedi
    expect(sonra.unpricedCount - once.unpricedCount).toBe(1);
    expect(euro(sonra.unpricedRevenue - once.unpricedRevenue)).toBe(20); // ama cirosu görünüyor
  });
});
