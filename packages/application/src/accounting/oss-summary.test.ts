import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { VatTreatment } from '@lezzet/types';
import { readOssSummary } from './oss-summary';

/**
 * OSS özeti okumasının kablosu: dönem, KDV türü ve kalem bağı doğru süzülüyor mu. Satışlar 2031'e yazılır, çünkü özet dönemin bütün
 * uzaktan satışlarıdır ve paylaşılan veritabanında başka testlerin satışları bugünkü dönemi kirletirdi.
 */
const db = serviceDb();
const orders = new OrderService(db);
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
  warehouseId = (await createTestWarehouse(db, { label: 'OSS' })).id;
  created.warehouseIds.push(warehouseId);
  const category = await new CategoryService(db).create({ name: { tr: `OSS testi ${stamp}` } });
  created.categoryIds.push(category.id);
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Lokum ${stamp}` }, categoryId: category.id });
  created.productIds.push(product.id);
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `OSS müşterisi ${stamp}`, country: 'DE' })).id;
  created.profileIds.push(customerId);
});

afterAll(async () => {
  await purgeTestData(db, created);
});

/** KDV hariç tam 10 € olan birimler: %7'de 10,70 €, %19'da 11,90 €, %5,5'te 10,55 €. */
const BIRIM: Record<number, number> = { 7: 1070, 19: 1190, 5.5: 1055 };

/** Teslim edilmiş satış; satış günü durum kaydından türediği için kayıt elle yazılır. */
async function satis(g: { soldOn: string; vatTreatment: VatTreatment; rates: number[]; isGiftOrder?: boolean }) {
  const { order } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      orderedTotalCents: g.rates.reduce((sum, rate) => sum + BIRIM[rate]!, 0),
      pricesIncludeVat: true,
      deliveryCountry: g.vatTreatment === 'domestic' ? 'FR' : 'DE',
      vatTreatment: g.vatTreatment,
      isGiftOrder: g.isGiftOrder,
    },
    g.rates.map((rate) => ({ variantId, qty: 1, fulfilledQty: 1, unitPriceCents: BIRIM[rate]!, vatRate: rate })),
  );
  created.orderIds.push(order.id);
  await orders.update({ id: order.id, status: 'delivered', referenceNo: `LA-OSS-${stamp}-${created.orderIds.length}` });
  const { error } = await db
    .from('order_status_log')
    .insert({ order_id: order.id, from_status: 'draft', to_status: 'delivered', created_at: `${g.soldOn}T10:00:00.000Z` });
  if (error) throw error;
}

describe('OSS özeti okuması', () => {
  it("dönemin varış KDV'li satışları çeyrek × ülke × oran; eşik öncesi ayrı toplam, öteki satışlar girmez", async () => {
    await satis({ soldOn: '2031-02-10', vatTreatment: 'intra_eu_distance_oss', rates: [7] });
    await satis({ soldOn: '2031-04-02', vatTreatment: 'intra_eu_distance_oss', rates: [7, 19] });
    await satis({ soldOn: '2031-03-01', vatTreatment: 'intra_eu_distance_origin', rates: [5.5] });
    await satis({ soldOn: '2031-03-01', vatTreatment: 'domestic', rates: [5.5] });
    await satis({ soldOn: '2031-02-11', vatTreatment: 'intra_eu_distance_oss', rates: [7], isGiftOrder: true });
    await satis({ soldOn: '2031-07-01', vatTreatment: 'intra_eu_distance_oss', rates: [19] });

    expect(await readOssSummary(db, { from: '2031-01-01', to: '2031-06-30' })).toEqual({
      lines: [
        { year: 2031, quarter: 1, country: 'DE', vatRate: 7, netCents: 1_000, vatCents: 70, orderCount: 1 },
        { year: 2031, quarter: 2, country: 'DE', vatRate: 7, netCents: 1_000, vatCents: 70, orderCount: 1 },
        { year: 2031, quarter: 2, country: 'DE', vatRate: 19, netCents: 1_000, vatCents: 190, orderCount: 1 },
      ],
      originTotal: { netCents: 1_000, vatCents: 55 },
    });
  });
});
