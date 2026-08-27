import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CartService } from './cart.service';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { UserProfileService } from './user-profile.service';

/**
 * Sunucu sepeti (07.1) — DB üstünde. Sepet bir DURUMDUR: müşteri başına tek satır, cihazdan
 * bağımsız. Fiyat burada bağlayıcı değildir (checkout'ta çözülür) — test edilen şey satır birleştirme,
 * adet yönetimi ve devralma davranışı.
 */
const db = serviceDb();
const carts = new CartService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
let customerId: string;
let variantA: string;
let variantB: string;
let productId: string;
let categoryId: string;
const createdIds: string[] = [];

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Sepet testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sigara böreği ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500gr' } }, { label: { tr: '1kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantA = variants[0]!.id;
  variantB = variants[1]!.id;

  const profile = await profiles.insert({ name: `Sepet müşterisi ${stamp}` });
  customerId = profile.id;
  createdIds.push(profile.id);
});

beforeEach(async () => {
  await db.from('cart').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdIds });
});

describe('sepet durumu (07.1)', () => {
  it('hiç açılmamış sepet boş döner — çağıranın null kontrolü gerekmez', async () => {
    expect(await carts.get(customerId)).toMatchObject({ customerId, items: [] });
  });

  it('kalem eklenir ve sunucuda kalır (cihaz değişse de durur)', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 2, unitPrice: 12.5 });

    // Aynı müşteri başka bir cihazdan okuyor — yeni servis örneği, aynı satır.
    const otherDevice = await new CartService(db).get(customerId);
    expect(otherDevice.items).toEqual([expect.objectContaining({ variantId: variantA, qty: 2, unitPrice: 12.5 })]);
  });

  it('aynı satır tekrar eklenince ADET birleşir, ikinci satır açılmaz', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 2, unitPrice: 12.5 });
    const cart = await carts.addItem(customerId, { variantId: variantA, qty: 3, unitPrice: 14 });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ qty: 5, unitPrice: 12.5 }); // gösterilen fiyat ilkinde kalır
  });

  it('farklı varyantlar ayrı satırdır', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 12.5 });
    const cart = await carts.addItem(customerId, { variantId: variantB, qty: 1, unitPrice: 22 });
    expect(cart.items).toHaveLength(2);
  });

  it('teklif satırı (partiye çıpalı) normal satırdan AYRI yaşar', async () => {
    const stockId = crypto.randomUUID();
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 12.5 });
    const cart = await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 8, stockId });

    expect(cart.items).toHaveLength(2); // aynı ürün, biri indirimli parti — müşteri ikisini de ister
    expect(cart.items.find((i) => i.stockId === stockId)?.unitPrice).toBe(8);
  });
});

describe('adet ve çıkarma', () => {
  it('adet belirlenir', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 2, unitPrice: 12.5 });
    const cart = await carts.setQty(customerId, { variantId: variantA }, 7);
    expect(cart.items[0]!.qty).toBe(7);
  });

  it('adedi sıfıra indirmek satırı SİLER (arayüzde "−" ile çıkarma)', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 12.5 });
    expect((await carts.setQty(customerId, { variantId: variantA }, 0)).items).toHaveLength(0);
  });

  it('çıkarma yalnız o satırı düşürür — teklif satırı ayrı kalır', async () => {
    const stockId = crypto.randomUUID();
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 12.5 });
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 8, stockId });

    const cart = await carts.removeItem(customerId, { variantId: variantA });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.stockId).toBe(stockId);
  });

  it('boşaltma satırı siler, boş sepet satırı bırakmaz', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 1, unitPrice: 12.5 });
    await carts.clear(customerId);

    const { data } = await db.from('cart').select('customer_id').eq('customer_id', customerId);
    expect(data).toHaveLength(0);
  });
});

/*
  VAR OLMAYAN KİMLİK SEPETE GİRMEZ (28.08). `cart.items` bir `jsonb` kolonu, yani kimlikleri koruyan
  bir yabancı anahtar YOK — kural veride duramıyor, servis kapısında duruyor (`existingOnly`).

  Kapı yokken uydurma bir kimlik `POST /me/cart/items`ten **200** alıyor ve sepete adsız · fiyatsız
  bir satır yazılıyordu: sayaç onu sayıyor, toplam saymıyordu. Sipariş yine açılmıyordu
  (`blocked_lines`) ama müşteri çıkaramadığı bir satırla kilitli kalıyordu.
*/
describe('var olmayan kimlik (28.08)', () => {
  const GHOST = '00000000-0000-4000-8000-000000000001';

  it('sepete YAZILMAZ — süzülür', async () => {
    const cart = await carts.addItems(customerId, [{ variantId: GHOST, qty: 1, unitPrice: 5 }]);
    expect(cart.items).toHaveLength(0);
  });

  it('REDDETMEZ, süzer: aynı istekteki GEÇERLİ kalemler girer', async () => {
    /* Ayrım burada ölçülüyor. `400` dönseydi bir kalemin yokluğu ötekileri de düşürürdü — bayat bir
       cihaz sepeti devrederken müşteri hiçbir şey ekleyemez olurdu. */
    const cart = await carts.addItems(customerId, [
      { variantId: variantA, qty: 2, unitPrice: 12.5 },
      { variantId: GHOST, qty: 1, unitPrice: 5 },
      { variantId: variantB, qty: 1, unitPrice: 22 },
    ]);

    expect(cart.items).toHaveLength(2);
    expect(cart.items.map((i) => i.variantId).sort()).toEqual([variantA, variantB].sort());
  });

  it('DEVİR yolu da korunur — kapı `addItems`te, iki yol da oradan geçiyor', async () => {
    const cart = await carts.takeOver(customerId, [
      { variantId: variantA, qty: 1, unitPrice: 12.5 },
      { variantId: GHOST, qty: 3, unitPrice: 5 },
    ]);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.variantId).toBe(variantA);
  });

  it('var olmayan PAKET de girmez (kimliğin türü ayrı tabloda sorulur)', async () => {
    const cart = await carts.addItems(customerId, [{ bundleId: GHOST, qty: 1, unitPrice: 30 }]);
    expect(cart.items).toHaveLength(0);
  });
});

describe('anonim sepeti devralma (07.1)', () => {
  it('giriş yapınca sunucudaki sepet KORUNUR, gelen kalemler üstüne eklenir', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 2, unitPrice: 12.5 });

    const cart = await carts.takeOver(customerId, [
      { variantId: variantA, qty: 1, unitPrice: 13 }, // çakışan satır → adet toplanır
      { variantId: variantB, qty: 4, unitPrice: 22 }, // yeni satır
    ]);

    expect(cart.items).toHaveLength(2);
    expect(cart.items.find((i) => i.variantId === variantA)).toMatchObject({ qty: 3, unitPrice: 12.5 });
    expect(cart.items.find((i) => i.variantId === variantB)?.qty).toBe(4);
  });

  it('sunucuda sepet yoksa gelen kalemler olduğu gibi devralınır', async () => {
    const cart = await carts.takeOver(customerId, [{ variantId: variantB, qty: 1, unitPrice: 22 }]);
    expect(cart.items).toHaveLength(1);
  });

  it('devralma müşterinin daha önce eklediğini kaybettirmez (boş liste gelse de)', async () => {
    await carts.addItem(customerId, { variantId: variantA, qty: 2, unitPrice: 12.5 });
    expect((await carts.takeOver(customerId, [])).items).toHaveLength(1);
  });
});
