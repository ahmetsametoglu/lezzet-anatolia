import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AddressService,
  CartService,
  CategoryService,
  DeliveryZoneService,
  PriceService,
  ProductService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import { MIN_BASKET_KEY } from '@lezzet/application';
import type { CatalogProductDetail, CheckoutPickup, MeCartView } from '@lezzet/types';
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
let productSlug = '';
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
    // Detay ucu yalnız satıştaki ürünü döndürür; satışa açmak dört metni üç dilde ister (`product_publish_requires_all_locales`).
    name: { tr: `Gel-al mantısı ${stamp}`, fr: `Manti retrait ${stamp}`, de: `Manti Abholung ${stamp}` },
    description: { tr: 'El açması', fr: 'Fait main', de: 'Handgemacht' },
    ingredients: { tr: 'Un, kıyma', fr: 'Farine, viande', de: 'Mehl, Hackfleisch' },
    storageInstructions: { tr: 'Dondurucuda', fr: 'Au congélateur', de: 'Im Gefrierfach' },
    allergens: [],
    categoryId,
    status: 'active',
    shelfLifeDays: 200,
    variants: [{ label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netQuantity: 1000, netUnit: 'g' }],
  });
  productId = product.id;
  productSlug = product.slug;
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
  // Gel-al deposuna depo kapsamlı bir eşik: gel-al okuması rota kuralına düşerse bu sayı sepete girer.
  await new SettingsService(db).set(MIN_BASKET_KEY, 9900, { scopeType: 'warehouse', scopeId: pickupWarehouseId });
});

afterAll(async () => {
  await new CartService(db).replace(musteriId, []);
  await db.from('settings').delete().eq('key', MIN_BASKET_KEY).eq('scope_type', 'warehouse').eq('scope_id', pickupWarehouseId);
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

  it('gel-al sepeti rota tabanını uygulamaz: depo kapsamındaki 9900 eşiği gel-al okumasına girmez', async () => {
    // Gel-al kuralı yalnız kanal satırını okur (`minBasketFor`); rota kuralına düşülseydi kapsamdaki depo eşiği (9900) sepete yazılırdı.
    const depoyla = await veri<MeCartView>(await istek(`/cart?postalCode=${kod}&pickupWarehouseId=${pickupWarehouseId}`));
    expect(depoyla.minBasketCents).toBeLessThan(9900);
  });

  it('ürün detayı seçili depoyla okunur: bölgede olmayan kalem gel-al deposunda satılabilir, izinsizde depo yok sayılır', async () => {
    const detay = (q: string, bearer = token) =>
      app.request(`/api/v1/products/${productSlug}?locale=tr${q}`, { headers: { authorization: `Bearer ${bearer}` } });
    const adresle = await veri<CatalogProductDetail>(await detay(`&postalCode=${kod}`));
    expect(adresle.variants[0]?.stockStatus).not.toBe('available');

    const depoyla = await veri<CatalogProductDetail>(await detay(`&postalCode=${kod}&pickupWarehouseId=${pickupWarehouseId}`));
    expect(depoyla.variants[0]?.stockStatus).toBe('available');

    // İzin kapısı sunucuda: izinsiz müşterinin gönderdiği depo kimliği yok sayılır, yer posta kodundan çözülür.
    const izinsiz = await createSignedInUser({ prefix: 'gel-al-nokta', label: 'izinsiz' });
    authUserIds.push(izinsiz.authUserId);
    profileIds.push(izinsiz.profileId);
    const izinsizle = await veri<CatalogProductDetail>(await detay(`&postalCode=${kod}&pickupWarehouseId=${pickupWarehouseId}`, izinsiz.token));
    expect(izinsizle.variants[0]?.stockStatus).not.toBe('available');
  });
});
