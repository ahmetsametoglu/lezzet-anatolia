import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, settingsSnapshot } from '@lezzet/database/testing';
import { DISTANCE_SALE_SETTINGS } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import type { OrderStatus, VatTreatment } from '@lezzet/types';
import { notifyDistanceSaleThreshold } from '../notification/staff-events';
import { readDistanceSaleThreshold } from './distance-sale-threshold';

/**
 * Eşik okumasının kablosu: iki yılın uzaktan satış siparişleri, kalemleri ve ayarlar doğru birleşiyor mu. Siparişler 2030 ve 2031'e
 * yazılır, çünkü toplam bütün uzaktan satışlardır ve paylaşılan veritabanında başka testlerin siparişleri bugünkü yılı kirletirdi.
 */
const db = serviceDb();
const orders = new OrderService(db);
const settings = settingsSnapshot(db);
const stamp = Date.now();
const created = {
  orderIds: [] as string[],
  productIds: [] as string[],
  categoryIds: [] as string[],
  warehouseIds: [] as string[],
  profileIds: [] as string[],
};
let warehouseId: string;
let variantId: string;
let customerId: string;

beforeAll(async () => {
  // Eşik küçültülür ki birkaç sipariş aşsın; açılış tutarları sıfırlanır ki toplam yalnız testin siparişleri olsun.
  await settings.override(DISTANCE_SALE_SETTINGS.thresholdCents.key, 2_500);
  await settings.override(DISTANCE_SALE_SETTINGS.openingCents.key, 0);
  await settings.override(DISTANCE_SALE_SETTINGS.openingPreviousCents.key, 0);
  warehouseId = (await createTestWarehouse(db, { label: 'ESIK' })).id;
  created.warehouseIds.push(warehouseId);
  const category = await new CategoryService(db).create({ name: { tr: `Eşik testi ${stamp}` } });
  created.categoryIds.push(category.id);
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Lokum ${stamp}` }, categoryId: category.id });
  created.productIds.push(product.id);
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Eşik müşterisi ${stamp}`, country: 'DE' })).id;
  created.profileIds.push(customerId);
});

afterAll(async () => {
  await settings.restore();
  await mustDelete(db, 'notification', (q) => q.eq('kind', 'distance_sale_threshold').like('dedupe_key', 'distance-sale-threshold:2031%'));
  await purgeTestData(db, created);
});

/** Birim 10,55 € TTC (%5,5), yani KDV hariç 10 €; durum ve yazılma anı elle verilir, çünkü servis tarihi geriye alamaz. */
async function siparis(g: { createdAt: string; vatTreatment: VatTreatment; status: OrderStatus; qty?: number; fulfilledQty?: number }) {
  const qty = g.qty ?? 1;
  const { order } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      orderedTotalCents: qty * 1055,
      pricesIncludeVat: true,
      deliveryCountry: 'DE',
      vatTreatment: g.vatTreatment,
    },
    [{ variantId, qty, fulfilledQty: g.fulfilledQty ?? qty, unitPriceCents: 1055, vatRate: 5.5 }],
  );
  created.orderIds.push(order.id);
  const referenceNo = `LA-ESIK-${stamp}-${created.orderIds.length}`;
  await orders.update({ id: order.id, status: g.status, referenceNo });
  const { error } = await db.from('order').update({ created_at: g.createdAt }).eq('id', order.id);
  if (error) throw error;
  return { id: order.id, referenceNo };
}

describe('uzaktan satış eşiği okuması', () => {
  it('iki yılın toplamı, uyarı ve eşiği aşan sipariş; iptal ve yurt içi sipariş girmez, iade düşer', async () => {
    await siparis({ createdAt: '2030-06-01T10:00:00Z', vatTreatment: 'intra_eu_distance_origin', status: 'delivered' });
    await siparis({ createdAt: '2031-02-01T10:00:00Z', vatTreatment: 'intra_eu_distance_origin', status: 'delivered', qty: 2 });
    await siparis({ createdAt: '2031-02-15T10:00:00Z', vatTreatment: 'domestic', status: 'delivered', qty: 7 });
    const asan = await siparis({ createdAt: '2031-02-28T23:30:00Z', vatTreatment: 'intra_eu_distance_oss', status: 'delivered' });
    await siparis({ createdAt: '2031-03-05T10:00:00Z', vatTreatment: 'intra_eu_distance_origin', status: 'cancelled', qty: 5 });
    await siparis({
      createdAt: '2031-04-01T10:00:00Z',
      vatTreatment: 'intra_eu_distance_oss',
      status: 'delivered',
      qty: 2,
      fulfilledQty: 1,
    });

    const durum = await readDistanceSaleThreshold(db, new Date('2031-06-15T12:00:00Z'));

    expect(durum).toEqual({
      year: 2031,
      thresholdCents: 2_500,
      yearTotalCents: 4_000,
      previousYearTotalCents: 1_000,
      yearSystemCents: 4_000,
      yearOpeningCents: 0,
      previousYearSystemCents: 1_000,
      previousYearOpeningCents: 0,
      warning: 'exceeded',
      destinationTaxation: true,
      sincePreviousYear: false,
      // 28 Şubat 23:30 UTC Paris'te 1 Mart'tır.
      crossingOrder: { id: asan.id, referenceNo: asan.referenceNo, day: '2031-03-01' },
      notifiedOn: { first: null, second: null, exceeded: null },
    });
  });

  // Açılış tutarı sistem toplamından ayrılmazsa kart iki kaynağı karıştırır; haber günü anahtardan okunmazsa kart seviyenin
  // duyurulduğunu söyleyemez; kırmızıya döner.
  it('sistem ve açılış toplamı ayrı okunur; seviyenin haber günü tekilleştirme anahtarından gelir', async () => {
    await settings.override(DISTANCE_SALE_SETTINGS.openingYear.key, 2031);
    await settings.override(DISTANCE_SALE_SETTINGS.openingCents.key, 500);
    await settings.override(DISTANCE_SALE_SETTINGS.openingPreviousCents.key, 300);
    await notifyDistanceSaleThreshold(db, {
      year: 2031,
      warning: 'first',
      yearTotalCents: 4_500,
      thresholdCents: 2_500,
      sincePreviousYear: false,
    });

    const durum = await readDistanceSaleThreshold(db, new Date('2031-06-15T12:00:00Z'));

    expect(durum).toMatchObject({
      yearTotalCents: 4_500,
      yearSystemCents: 4_000,
      yearOpeningCents: 500,
      previousYearTotalCents: 1_300,
      previousYearSystemCents: 1_000,
      previousYearOpeningCents: 300,
      notifiedOn: { first: parisDateOf(new Date()), second: null, exceeded: null },
    });
  });
});
