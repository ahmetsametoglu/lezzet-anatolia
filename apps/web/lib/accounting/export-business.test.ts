import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  CounterpartyService,
  MoneyMovementService,
  OrderService,
  ProductService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { addDays } from '@lezzet/helper';
import type { Business } from '@lezzet/types';
import { buildExport, pendingInvoices } from './export';
import { buildMovementExport } from './movement-export';

/** Muhasebe dosyası, hareket dökümü ve fatura kuyruğu işe göre ayrı alınır; süzgeçsiz okuma iki işi birlikte taşır (docs/feature/iki-is.md, karar 14). */
const db = serviceDb();
const stamp = Date.now();
/** Kimsenin yazmadığı geçmiş bir gün: dosyalar dönemin tamamını okur. */
const day = addDays('1970-01-01', stamp % 7000);
const PERIOD = { from: day, to: day };

let lezzetDepo: string;
let qualiteDepo: string;
let lezzetMusteri: string;
let qualiteMusteri: string;
let categoryId: string;
let productId: string;
let variantId: string;
let accountId: string;
let qualiteCari: string;
const satis: Record<Business, string> = { lezzet: '', qualite: '' };
const hareket: Record<Business, string> = { lezzet: '', qualite: '' };

beforeAll(async () => {
  lezzetDepo = (await createTestWarehouse(db, { label: 'EXL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'EXQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Dosyada iş ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Pide ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 adet' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  const profiles = new UserProfileService(db);
  lezzetMusteri = (await profiles.insert({ name: `Dosya Lezzet ${stamp}` })).id;
  qualiteMusteri = (
    await profiles.insert({ name: `Dosya QUALITE ${stamp}`, type: 'company', companyInfo: { legalName: `SARL Dosya ${stamp}` } })
  ).id;
  await profiles.approveB2b(qualiteMusteri);
  await profiles.update({ id: qualiteMusteri, business: 'qualite' });

  // Satış günü durum kaydının ilk kapanışıdır; kayıt geçmiş güne yazılır ki dosya yalnız bu testin satışlarını görsün.
  const orders = new OrderService(db);
  for (const [business, customerId, warehouseId, channel, cents] of [
    ['lezzet', lezzetMusteri, lezzetDepo, 'b2c', 1200],
    ['qualite', qualiteMusteri, qualiteDepo, 'b2b', 3400],
  ] as const) {
    const { order } = await orders.create({ customerId, warehouseId, channel, orderedTotalCents: cents }, [
      { variantId, qty: 1, fulfilledQty: 1, unitPriceCents: cents, vatRate: 5.5 },
    ]);
    await orders.update({ id: order.id, status: 'completed' });
    const { error } = await db
      .from('order_status_log')
      .insert({ order_id: order.id, from_status: 'draft', to_status: 'completed', created_at: `${day}T10:00:00.000Z` });
    if (error) throw error;
    satis[business] = order.id;
  }

  // QUALITE carisine bağlı hareket QUALITE'nin, hiçbir bağı iş söylemeyen hareket Lezzet'indir.
  accountId = (await new AccountService(db).insert({ name: `Dosyada iş kasası ${stamp}`, type: 'cash' })).id;
  qualiteCari = (await new CounterpartyService(db).insert({ name: `Dosya carisi ${stamp}`, defaultBusiness: 'qualite' })).id;
  const movements = new MoneyMovementService(db);
  hareket.qualite = (
    await movements.insert({ accountId, direction: 'out', amountCents: 5000, type: 'expense', valueDate: day, counterpartyId: qualiteCari })
  ).id;
  hareket.lezzet = (await movements.insert({ accountId, direction: 'out', amountCents: 2000, type: 'expense', valueDate: day })).id;
});

afterAll(async () => {
  // Siparişler profillerle, hareketler hesapla birlikte silinir.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [lezzetMusteri, qualiteMusteri],
    accountIds: [accountId],
    counterpartyIds: [qualiteCari],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

describe('muhasebe dosyalarının iş süzgeci', () => {
  it('satış dosyası seçili işin satışlarını taşır, süzgeçsiz dosya ikisini birlikte', async () => {
    const satislar = async (business?: Business) => (await buildExport(PERIOD, business)).rows.map((row) => row.orderId);
    const qualite = await satislar('qualite');
    expect(qualite).toContain(satis.qualite);
    expect(qualite).not.toContain(satis.lezzet);
    expect(await satislar('lezzet')).not.toContain(satis.qualite);
    expect(await satislar()).toEqual(expect.arrayContaining([satis.lezzet, satis.qualite]));
  });

  it('hareket dökümü seçili işin hareketlerini taşır, süzgeçsiz döküm ikisini birlikte', async () => {
    const hareketler = async (business?: Business) => (await buildMovementExport(PERIOD, business)).rows.map((row) => row.movementId);
    const qualite = await hareketler('qualite');
    expect(qualite).toContain(hareket.qualite);
    expect(qualite).not.toContain(hareket.lezzet);
    expect(await hareketler('lezzet')).not.toContain(hareket.qualite);
    expect(await hareketler()).toEqual(expect.arrayContaining([hareket.lezzet, hareket.qualite]));
  });

  it('fatura kuyruğu seçili işin satışlarını taşır', async () => {
    const kuyruk = async (business: Business) => (await pendingInvoices({ business, limit: 200 })).rows.map((sale) => sale.id);
    const qualite = await kuyruk('qualite');
    expect(qualite).toContain(satis.qualite);
    expect(qualite).not.toContain(satis.lezzet);
    expect(await kuyruk('lezzet')).not.toContain(satis.qualite);
  });
});
