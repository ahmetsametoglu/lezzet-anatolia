import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel } from '@lezzet/types';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { UserProfileService } from './user-profile.service';
import { WarehouseService } from './warehouse.service';

/** Sipariş müşterinin işinin deposundan yazılır ve yazılmış siparişin işi değişmez (docs/feature/iki-is.md, karar 7 ve 10). */
const db = serviceDb();
const orders = new OrderService(db);
const profiles = new UserProfileService(db);
const stamp = Date.now();
let lezzetDepo: string;
let qualiteDepo: string;
let lezzetMusteri: string;
let qualiteMusteri: string;
let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  lezzetDepo = (await createTestWarehouse(db, { label: 'ISL' })).id;
  qualiteDepo = (await createTestWarehouse(db, { label: 'ISQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  categoryId = (await new CategoryService(db).create({ name: { tr: `Siparişin işi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Lahmacun ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 adet' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  lezzetMusteri = (await profiles.insert({ name: `Lezzet müşterisi ${stamp}` })).id;
  // QUALITE yalnız onaylı şirkete verilir; onay işten önce gelir.
  qualiteMusteri = (
    await profiles.insert({ name: `QUALITE müşterisi ${stamp}`, type: 'company', companyInfo: { legalName: `SARL İş ${stamp}` } })
  ).id;
  await profiles.approveB2b(qualiteMusteri);
  await profiles.update({ id: qualiteMusteri, business: 'qualite' });
});

afterAll(async () => {
  // Müşterilerin siparişleri profillerle birlikte gider (`purgeTestData`).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [lezzetMusteri, qualiteMusteri],
    warehouseIds: [lezzetDepo, qualiteDepo],
  });
});

const siparis = (customerId: string, warehouseId: string, channel: Channel) =>
  orders.create({ customerId, warehouseId, channel, orderedTotalCents: 1000 }, [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }]);

describe('siparişin işi', () => {
  it('müşteri deponun işinden değilse sipariş yazılmaz, aynı işten olan yazılır', async () => {
    await expect(siparis(lezzetMusteri, qualiteDepo, 'b2c')).rejects.toThrow(/order_business_matches/);
    await expect(siparis(qualiteMusteri, lezzetDepo, 'b2b')).rejects.toThrow(/order_business_matches/);
    expect((await siparis(qualiteMusteri, qualiteDepo, 'b2b')).order.warehouseId).toBe(qualiteDepo);

    const { data } = await db.from('order').select('id').eq('customer_id', lezzetMusteri).eq('warehouse_id', qualiteDepo);
    expect(data).toEqual([]);
  });

  it('yazılmış siparişin deposu öteki işin deposuna taşınamaz', async () => {
    const { order } = await siparis(lezzetMusteri, lezzetDepo, 'b2c');
    await expect(orders.update({ id: order.id, warehouseId: qualiteDepo })).rejects.toThrow(/order_business_matches/);
  });
});
