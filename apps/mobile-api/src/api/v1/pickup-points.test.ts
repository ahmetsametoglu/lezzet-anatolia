import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AddressService,
  CartService,
  CategoryService,
  DeliveryZoneService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import type { CheckoutPickup, MeCartView } from '@lezzet/types';
import { app } from '../../app';
import { createSignedInUser } from '../../lib/testing';

/*
  Gel-al teklifi ve gel-al'lı sepet okuması: adres seçicinin depo kartı `GET /me/pickup-points`tan, sepet `pickupWarehouseId`
  ile SEÇİLEN DEPONUN stoğuyla okunur. İki kapı da sunucuda: izin (`pickup_allowed`) ve gel-al noktası (`pickup_enabled`).
*/
const db = serviceDb();
const stamp = Date.now();
const kod = testPostalCode();
const authUserIds: string[] = [];
const profileIds: string[] = [];
let pickupWarehouseId = '';
let zoneWarehouseId = '';
let zoneId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let musteriId = '';
let token = '';

const istek = (path: string, bearer = token) =>
  app.request(`/api/v1/me${path}${path.includes('?') ? '&' : '?'}locale=tr`, { headers: { authorization: `Bearer ${bearer}` } });
const veri = async <T,>(res: Response): Promise<T> => {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
};

beforeAll(async () => {
  // Gel-al deposu (stok burada) ve müşterinin bölgesinin deposu (stok yok): iki okuma iki farklı cevap vermeli.
  pickupWarehouseId = (await createTestWarehouse(db, { label: 'GLP', pickupEnabled: true })).id;
  zoneWarehouseId = (await createTestWarehouse(db, { label: 'GLZ' })).id;
  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Gel-al bölgesi ${stamp}`, warehouseId: zoneWarehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: kod }]);

  categoryId = (await new CategoryService(db).create({ name: { tr: `Gel-al nokta ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Gel-al mantısı ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 1800 });
  await new StockService(db).insert({ warehouseId: pickupWarehouseId, variantId, physicalQty: 20, expiryDate: '2027-06-01', purchasePriceCents: 500 });

  const musteri = await createSignedInUser({ prefix: 'gel-al-nokta', label: 'musteri' });
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
  musteriId = musteri.profileId;
  token = musteri.token;
  await new AddressService(db).insert({ customerId: musteriId, recipient: 'Gel-al Nokta', phone: '+33600000001', line1: '2 rue du Test', postalCode: kod, city: 'Strasbourg' });
  await new CartService(db).replace(musteriId, [{ variantId, qty: 1, stockId: null, unitPrice: 18 }]);
});

afterAll(async () => {
  await new CartService(db).replace(musteriId, []);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds, authUserIds, warehouseIds: [pickupWarehouseId, zoneWarehouseId] });
});

describe('gel-al teklifi', () => {
  it('izinsiz müşteriye teklif yok, izin verilince gel-al deposu adresiyle listelenir', async () => {
    expect(await veri<CheckoutPickup | null>(await istek('/pickup-points'))).toBeNull();

    await new UserProfileService(db).update({ id: musteriId, pickupAllowed: true });
    const offer = await veri<CheckoutPickup | null>(await istek('/pickup-points'));
    expect(offer?.selectedWarehouseId).toBeNull();
    expect(offer?.warehouses.map((w) => w.id)).toContain(pickupWarehouseId);
    // Gel-al noktası olmayan depo teklife girmez: müşteri oraya gidemez.
    expect(offer?.warehouses.map((w) => w.id)).not.toContain(zoneWarehouseId);
  });

  it('sepet gel-al deposuyla okunur: adresin bölgesinde olmayan kalem depoda alınabilir', async () => {
    const adresle = await veri<MeCartView>(await istek(`/cart?postalCode=${kod}`));
    // Adresin bölgesinde stok yok ve kargo dolgusu da yok: kalem "burada gönderilemez" (soğuk zincir) hâlindedir.
    expect(adresle.lines[0]?.route).toBe('not_shippable_here');

    const depoyla = await veri<MeCartView>(await istek(`/cart?postalCode=${kod}&pickupWarehouseId=${pickupWarehouseId}`));
    expect(depoyla.lines[0]?.route).toBe('local');
  });

  it('gel-al noktası olmayan depo kimliği yok sayılır — sepet adresle okunmaya döner', async () => {
    const view = await veri<MeCartView>(await istek(`/cart?postalCode=${kod}&pickupWarehouseId=${zoneWarehouseId}`));
    expect(view.lines[0]?.route).toBe('not_shippable_here');
  });
});
