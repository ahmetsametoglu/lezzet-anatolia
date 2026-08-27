import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderService, ProductService,
  StockMovementService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { quickSale } from '@lezzet/application';
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

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let cheapVariant: string;
let costlyVariant: string;
let productId: string;
let categoryId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const TODAY = { from: dayOffset(0), to: dayOffset(0) };
const round2 = (v: number) => Math.round(v * 100) / 100;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kâr testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sarma ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500gr' } }, { label: { tr: '1kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  cheapVariant = variants[0]!.id;
  costlyVariant = variants[1]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kâr müşterisi ${stamp}` })).id;
  createdProfiles.push(customerId);
  cashAccount = (await new AccountService(db).insert({ name: `Kâr kasası ${stamp}`, type: 'cash' })).id;
});

afterAll(async () => {
  // **SIRA: defter → parti → sipariş** (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  //
  // Burada eskiden `stock_adjustment` siliniyordu; o tablo artık YOK ve satır sessizce başarısız
  // oluyordu (`delete()` hatayı yutuyor). Görünmemesinin sebebi buydu: kapı satışı deftere
  // `counter_sale` yazıyor, o satır hem partiyi hem siparişi `restrict` ile tutuyor, yani ikisi de
  // silinemiyordu ve teardown her koşuda yarım kalıyordu.
  await purgeVariantStock(db, [cheapVariant, costlyVariant]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [cashAccount],
    warehouseIds: [warehouseId],
  });
});

/** Kapıda satış: tek adımda kapanır, maliyet kalemleri sabitlenir, partiler yazılır. */
async function sell(variantId: string, qty: number, unitPriceCents: number, opts: { gift?: boolean } = {}) {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'door', isGiftOrder: opts.gift ?? false, totalCents: qty * unitPriceCents },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5 }],
  );
  const result = await quickSale(db, { orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });
  expect(result.status).toBe('ok');
  return order;
}

describe('ürün kârlılığı GERÇEK partiden hesaplanır', () => {
  it('aynı üründen cheap ve pahalı batch çıkarsa maliyet ayrışır', async () => {
    // İki ayrı varyant, iki ayrı alış: pay etseydik ikisi de ortalamayı gösterirdi.
    await stocks.insert({ warehouseId, variantId: cheapVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 200 });
    await stocks.insert({ warehouseId, variantId: costlyVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 800 });

    await sell(cheapVariant, 2, 2110); // 40 € HT ciro, 4 € maliyet
    await sell(costlyVariant, 2, 2110); // 40 € HT ciro, 16 € maliyet

    const products = await productProfits(TODAY);
    const cheap = products.find((u) => u.variantId === cheapVariant)!;
    const costly = products.find((u) => u.variantId === costlyVariant)!;

    expect(cheap).toMatchObject({ qty: 2, revenue: 40, cogs: 4, grossProfit: 36 });
    expect(costly).toMatchObject({ qty: 2, revenue: 40, cogs: 16, grossProfit: 24 });
    // Rapor kârlıyı öne alır — ucuz parti daha çok kazandırdı.
    expect(products.findIndex((u) => u.variantId === cheapVariant)).toBeLessThan(
      products.findIndex((u) => u.variantId === costlyVariant),
    );
  });

  it('fire ürünün marjından düşer — çöpe giden mal gizlenmez', async () => {
    const batch = await stocks.insert({ warehouseId, variantId: cheapVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 200 });
    await sell(cheapVariant, 2, 2110);
    const beforeRows = await productProfits(TODAY);
    const before = beforeRows.find((u) => u.variantId === cheapVariant)!;

    // 3 adet DLC imhası → 6 € kayıp.
    await new StockMovementService(db).adjust({
      stockId: batch.id,
      qty: 3,
      direction: 'out',
      kind: 'write_off',
      reason: 'expired',
      note: 'DLC geçti',
    });

    const after = (await productProfits(TODAY)).find((u) => u.variantId === cheapVariant)!;
    expect(after.lossQty).toBe(3);
    expect(after.lossCost).toBe(6);
    expect(after.grossProfit).toBe(before.grossProfit); // brüt marj değişmez
    expect(after.netProfit).toBe(round2(before.grossProfit - 6)); // net marj fireyi taşır
  });
});

describe('şirket P&L', () => {
  it('genel gider ve fire bir kez düşülür; STOK ALIMI ikinci kez gider yazılmaz', async () => {
    await stocks.insert({ warehouseId, variantId: costlyVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 800 });
    const before = await companyPnl(TODAY);

    await sell(costlyVariant, 1, 2110); // 20 € HT ciro, 8 € COGS

    // Genel gider: kira. Stok alımı: aynı dönemde 500 € — COGS'ta zaten sayıldığı için P&L'e
    // İKİNCİ KEZ girmemeli.
    await movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 12_000, type: 'expense', category: 'kira' });
    const purchase = await movements.insert({ accountId: cashAccount, direction: 'out', amountCents: 50_000, type: 'purchase', description: 'Mal alımı' });
    expect(purchase.amountCents).toBe(50_000); // alım gerçekten yazıldı — testin iddiası boşa düşmesin

    const after = await companyPnl(TODAY);
    expect(round2(after.revenue - before.revenue)).toBe(20);
    expect(round2(after.directCosts - before.directCosts)).toBeGreaterThanOrEqual(8);
    // Genel gider farkı YALNIZ kira kadar — 500 €'luk stok alımı girmedi.
    expect(round2(after.overhead - before.overhead)).toBe(120);
  });

  it('kanal kırılımı katkı payı seviyesindedir', async () => {
    await stocks.insert({ warehouseId, variantId: cheapVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 200 });
    await sell(cheapVariant, 1, 2110);

    const pnl = await companyPnl(TODAY);
    const b2c = pnl.byChannel.find((c) => c.channel === 'b2c');
    expect(b2c).toBeDefined();
    expect(b2c!.contribution).toBeLessThanOrEqual(b2c!.revenue);
    // Net kâr katkı payından fire ve genel gider kadar düşüktür — eşit olamaz.
    expect(pnl.netProfit).toBe(round2(pnl.contribution - pnl.lossCost - pnl.overhead));
  });

  it('patron ikramı kârda SAYILIR — yalnız export dışıdır', async () => {
    await stocks.insert({ warehouseId, variantId: costlyVariant, physicalQty: 10, expiryDate: dayOffset(200), purchasePriceCents: 800 });
    const before = await companyPnl(TODAY);

    const gift = await sell(costlyVariant, 1, 2110, { gift: true });

    const after = await companyPnl(TODAY);
    expect(round2(after.revenue - before.revenue)).toBe(20);
    expect(after.orderCount - before.orderCount).toBe(1);

    const giftContribution = (await orderProfits(TODAY)).find((c) => c.orderId === gift.id)!;
    expect(giftContribution.isGiftOrder).toBe(true);
    expect(giftContribution.contribution).toBe(12); // 20 HT − 8 COGS
  });
});

describe('eksik maliyet kârı şişirmez', () => {
  it('kapanmamış sipariş kârdan düşer ama cirosuyla görünür', async () => {
    const before = await companyPnl(TODAY);

    // Teslim edilmiş ama kapanmamış sipariş: `cogs_amount` henüz sabitlenmedi.
    const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', totalCents: 2110 }, [
      { variantId: cheapVariant, qty: 1, fulfilledQty: 1, unitPriceCents: 2110, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'delivered', referenceNo: `LA-KR-${stamp}` });
    await db.from('order_status_log').insert({ order_id: order.id, from_status: 'out_for_delivery', to_status: 'delivered' });

    const after = await companyPnl(TODAY);
    expect(after.orderCount).toBe(before.orderCount); // kâra girmedi
    expect(after.unpricedCount - before.unpricedCount).toBe(1);
    expect(round2(after.unpricedRevenue - before.unpricedRevenue)).toBe(20); // ama cirosu görünüyor
  });
});
