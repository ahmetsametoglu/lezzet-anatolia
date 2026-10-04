import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CartService, CategoryService, OrderService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { createSignedInUser } from '../../lib/testing';

/*
  Tekrar sipariş sepete yazan bir kanaldır: uç siparişi numarayla adresler, sahipliği kapı sorar ve eklenebilen kalemler sunucu
  sepetine bugünkü fiyatla yazılır. Planın kuralları web testinde (`lib/order/reorder.test.ts`); burada taşıma sınanır.
*/

const db = serviceDb();
const stamp = Date.now();
const authUserIds: string[] = [];
const profileIds: string[] = [];
const orderIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let musteriId: string;
let musteriToken: string;
let musteriReferansi: string;
let otekiReferansi: string;

const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function reorder(orderReference: string) {
  return app.request('/api/v1/me/cart/reorder?locale=tr', {
    method: 'POST',
    headers: { authorization: `Bearer ${musteriToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ orderReference }),
  });
}

/** Siparişin referansı sonradan yazılır, çünkü `create` onu almaz ve referanssız sipariş numarayla bulunamaz. */
async function siparis(customerId: string, referans: string): Promise<void> {
  const { order } = await new OrderService(db).create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'shipping', orderedTotalCents: 2000 },
    [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await db.from('order').update({ reference_no: referans, status: 'confirmed' }).eq('id', order.id);
  orderIds.push(order.id);
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'TKS' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tekrar sipariş ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Tekrar böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 1250 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 100, expiryDate: ileriGun(60), purchasePriceCents: 400 });

  const musteri = await createSignedInUser({ prefix: 'cart-reorder', label: 'musteri' });
  const oteki = await createSignedInUser({ prefix: 'cart-reorder', label: 'oteki' });
  authUserIds.push(musteri.authUserId, oteki.authUserId);
  profileIds.push(musteri.profileId, oteki.profileId);
  musteriId = musteri.profileId;
  musteriToken = musteri.token;

  musteriReferansi = `LZR-${stamp}`;
  otekiReferansi = `LZO-${stamp}`;
  await siparis(musteri.profileId, musteriReferansi);
  await siparis(oteki.profileId, otekiReferansi);
});

afterAll(async () => {
  for (const id of orderIds) await mustDelete(db, 'order', (q) => q.eq('id', id));
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds, authUserIds, warehouseIds: [warehouseId] });
});

describe('POST /me/cart/reorder', () => {
  // Uç planı sepete yazmazsa ekrandaki "tekrar sipariş" boşa çıkar; bu test o hâlde kırmızıya döner.
  it('kendi siparişinin kalemleri sunucu sepetine yazılır ve güncel sepet döner', async () => {
    await new CartService(db).replace(musteriId, []);

    const res = await reorder(musteriReferansi);
    const envelope = (await res.json()) as { data: { added: number; skipped: string[]; cart: { lines: { variantId?: string }[] } } };

    expect(res.status).toBe(200);
    expect(envelope.data.added).toBe(1);
    expect(envelope.data.skipped).toEqual([]);
    expect(envelope.data.cart.lines.map((line) => line.variantId)).toEqual([variantId]);
    const stored = await new CartService(db).get(musteriId);
    expect(stored.items).toEqual([expect.objectContaining({ variantId, qty: 2 })]);
  });

  // Sahiplik sorulmazsa başkasının siparişi müşterinin sepetine kopyalanır; bu test o hâlde kırmızıya döner.
  it('başkasının siparişi tekrar edilemez — 404 `order_not_found`, sepete dokunulmaz', async () => {
    await new CartService(db).replace(musteriId, []);

    const res = await reorder(otekiReferansi);

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('order_not_found');
    expect((await new CartService(db).get(musteriId)).items).toEqual([]);
  });
});
