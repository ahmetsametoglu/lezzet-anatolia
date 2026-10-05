import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  CounterpartyService,
  MoneyMovementService,
  OrderService,
  ProductService,
  StockMovementService,
  StockService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { addDays } from '@lezzet/helper';
import type { Business } from '@lezzet/types';
import { companyPnl, orderProfits, productProfits } from './profit';

/**
 * Kâr raporları işe göre süzülür: satışın işi deposundan, firenin işi düştüğü depodan, genel giderin işi hareketin bağından gelir;
 * süzgeçsiz okuma iki işi birlikte toplar (docs/feature/iki-is.md §2).
 */
const db = serviceDb();
const orders = new OrderService(db);
const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const TODAY = { from: today, to: today };
/** Genel gider kimsenin yazmadığı geçmiş bir güne yazılır ki paylaşılan veritabanında toplam yalnız bu testin hareketlerini görsün. */
const expenseDay = addDays('1970-01-01', stamp % 7000);
const EXPENSE_PERIOD = { from: expenseDay, to: expenseDay };

let lezzetDepo: string;
let qualiteDepo: string;
let lezzetMusteri: string;
let qualiteMusteri: string;
let categoryId: string;
let productId: string;
let variantId: string;
let accountId: string;
let qualiteCari: string;
const siparis: Record<Business, string> = { lezzet: '', qualite: '' };

beforeAll(async () => {
  lezzetDepo = (await createTestWarehouse(db, { label: 'KRL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'KRQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Kârda iş ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Börek ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  const profiles = new UserProfileService(db);
  lezzetMusteri = (await profiles.insert({ name: `Kâr Lezzet ${stamp}` })).id;
  qualiteMusteri = (
    await profiles.insert({ name: `Kâr QUALITE ${stamp}`, type: 'company', companyInfo: { legalName: `SARL Kâr ${stamp}` } })
  ).id;
  await profiles.approveB2b(qualiteMusteri);
  await profiles.update({ id: qualiteMusteri, business: 'qualite' });
  accountId = (await new AccountService(db).insert({ name: `Kârda iş kasası ${stamp}`, type: 'cash' })).id;
  qualiteCari = (await new CounterpartyService(db).insert({ name: `QUALITE carisi ${stamp}`, defaultBusiness: 'qualite' })).id;

  // Satışın partisi yok; kâr okuması onu maliyeti bilinmeyen satış sayar, testin sorusu yalnız satışın hangi işe yazıldığıdır.
  for (const [business, customerId, warehouseId, channel, cents] of [
    ['lezzet', lezzetMusteri, lezzetDepo, 'b2c', 1000],
    ['qualite', qualiteMusteri, qualiteDepo, 'b2b', 2500],
  ] as const) {
    const { order } = await orders.create({ customerId, warehouseId, channel, orderedTotalCents: cents }, [
      { variantId, qty: 1, fulfilledQty: 1, unitPriceCents: cents, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'completed' });
    const { error } = await db
      .from('order_status_log')
      .insert({ order_id: order.id, from_status: 'draft', to_status: 'completed', created_at: `${today}T10:00:00.000Z` });
    if (error) throw error;
    siparis[business] = order.id;
  }

  const stocks = new StockService(db);
  const moves = new StockMovementService(db);
  for (const [warehouseId, qty] of [
    [lezzetDepo, 1],
    [qualiteDepo, 2],
  ] as const) {
    const batch = await stocks.insert({
      warehouseId,
      variantId,
      physicalQty: 10,
      expiryDate: addDays(today, 200),
      purchasePriceCents: 300,
    });
    await moves.adjust({ stockId: batch.id, qty, direction: 'out', kind: 'write_off', reason: 'expired' });
  }

  // QUALITE carisine bağlı gider QUALITE'nin, hiçbir bağı iş söylemeyen gider Lezzet'indir.
  const movements = new MoneyMovementService(db);
  await movements.insert({
    accountId,
    direction: 'out',
    amountCents: 5000,
    type: 'expense',
    valueDate: expenseDay,
    counterpartyId: qualiteCari,
  });
  await movements.insert({ accountId, direction: 'out', amountCents: 2000, type: 'expense', valueDate: expenseDay });
});

afterAll(async () => {
  // Defter ve partiler önce gider; siparişler profillerle, hareketler hesapla birlikte silinir.
  await purgeVariantStock(db, [variantId]);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [lezzetMusteri, qualiteMusteri],
    accountIds: [accountId],
    counterpartyIds: [qualiteCari],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

describe('kâr raporunun iş süzgeci', () => {
  it('satış deposunun işine, fire düştüğü deponun işine yazılır', async () => {
    const satislar = async (business?: Business) => (await orderProfits(TODAY, business)).map((c) => c.orderId);
    const qualite = await satislar('qualite');
    expect(qualite).toContain(siparis.qualite);
    expect(qualite).not.toContain(siparis.lezzet);
    expect(await satislar('lezzet')).not.toContain(siparis.qualite);
    expect(await satislar()).toEqual(expect.arrayContaining([siparis.lezzet, siparis.qualite]));

    const fire = async (business?: Business) => (await productProfits(TODAY, business)).find((p) => p.variantId === variantId)?.lossQty;
    expect([await fire(), await fire('lezzet'), await fire('qualite')]).toEqual([3, 1, 2]);
  });

  it('genel gider hareketin bağından gelen işe yazılır', async () => {
    const gider = async (business?: Business) => (await companyPnl(EXPENSE_PERIOD, business)).overhead;
    expect([await gider(), await gider('lezzet'), await gider('qualite')]).toEqual([70, 20, 50]);
  });
});
