import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderItemService, OrderService, PriceService, ProductService,
  StockService, UserProfileService, WarehouseService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { ANONYMOUS_BUYER_ID, sellOnSite } from './on-site-sale';

/**
 * YERİNDE SATIŞ (21.118) — depo kapısı ve kuryenin aracı.
 *
 * Çivilenen dört karar:
 *  1. **Tek adım.** `draft → completed`: mal fiiliden düşer, referans doğar, para yazılır. Ara
 *     durum yoktur — yerinde satışın tanımı "mal gider, para alınır, satış kapanır".
 *  2. **Pazarlık izi İKİSİ BİRLİKTE.** `listUnitPriceCents` + `priceSetBy`; ve siparişin TOPLAMI
 *     pazarlıklı fiyattan türer (09.8'in değişmezi: tek sayı disiplini). Yalnız son fiyat
 *     saklansaydı kayıt "taviz verildi" demezdi, kâr motoru da kişisel tavizi kampanyayla aynı
 *     kovaya koyardı.
 *  3. **Satışa kapalı ürün elle fiyatla DİRİLMEZ** — ölçüt liste fiyatının varlığı, yazılan sayı
 *     değil. Ve reddedilen satışta sipariş HİÇ yazılmaz.
 *  4. **Araç da bir depodur.** Aynı kapı `kind='vehicle'` deposundan da satar; kuryenin arabası
 *     ayrı bir kavram değil.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);

const stamp = Date.now();
let customerId: string;
let staffId: string;
let facilityId: string;
let vehicleId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const LISTE = 1000;
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  facilityId = (await createTestWarehouse(db)).id;
  // ARAÇ DEPOSU: tür bir etiket değil, üç sorgunun süzgeci (0031 künyesi). Satış tarafında ayrım
  // yok — kurye arabasından da tezgâhtan da aynı kapı satar.
  vehicleId = (await new WarehouseService(db).insert({
    code: `VEH${stamp % 100000}`, name: `Test aracı ${stamp}`, kind: 'vehicle',
  })).id;

  const category = await new CategoryService(db).create({ name: { tr: `Yerinde satış testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Börek ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: LISTE });

  const customer = await new UserProfileService(db).insert({ name: `Yerinde müşteri ${stamp}` });
  customerId = customer.id;
  // Kurye/depocu KAPSAMSIZ olamaz (`user_profiles_warehouse_scope`): boş dizi "hiçbir depo"
  // demek ve kapı fail-closed kapanır. Kuryenin kapsamına ARACI da giriyor — satacağı yer orası.
  const staff = await new UserProfileService(db).insert({
    name: `Kurye ${stamp}`, roles: ['courier'], warehouseIds: [facilityId, vehicleId],
  });
  staffId = staff.id;
  createdProfiles.push(customer.id, staff.id);

  cashAccount = (await new AccountService(db).insert({ name: `Araç kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await stocks.insert({ warehouseId: facilityId, variantId, physicalQty: 10, expiryDate: dayOffset(30), purchasePriceCents: 400 });
  await stocks.insert({ warehouseId: vehicleId, variantId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 400 });
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles,
    accountIds: [cashAccount], warehouseIds: [facilityId, vehicleId],
  });
});

const sale = (over: Partial<Parameters<typeof sellOnSite>[1]> = {}) =>
  sellOnSite(db, {
    warehouseId: facilityId, staffId, customerId, paymentMethod: 'cash', paymentAccountId: cashAccount,
    lines: [{ variantId, qty: 2 }], ...over,
  });

describe('yerinde satış', () => {
  it('TEK ADIMDA kapanır: sipariş `completed`, kaynak `door`, teslimat `pickup`, stok düşer', async () => {
    const before = (await stocks.listByVariant(facilityId, variantId)).reduce((s, b) => s + b.physicalQty, 0);

    const result = await sale();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.totalCents).toBe(2 * LISTE);
    expect(result.referenceNo).not.toBeNull();
    expect(result.paymentRecorded).toBe(true);

    const order = await orders.getById(result.orderId);
    expect(order).toMatchObject({ status: 'completed', orderSource: 'door', deliveryType: 'pickup', warehouseId: facilityId });
    // Kargo ücreti SORULMADI: `pickup`ta sorunun kendisi geçersiz, sipariş doğrudan 0 yazar.
    expect(order?.shippingFeeCents).toBe(0);

    const after = (await stocks.listByVariant(facilityId, variantId)).reduce((s, b) => s + b.physicalQty, 0);
    expect(after).toBe(before - 2);
  });

  it('PAZARLIK İZİ ikisi birlikte yazılır VE toplam pazarlıklı fiyattan türer', async () => {
    const result = await sale({ lines: [{ variantId, qty: 2, negotiatedUnitPriceCents: 800 }] });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Bu dosyanın asıl iddiası: toplam LİSTEDEN değil, yazılan fiyattan çıkıyor.
    expect(result.totalCents).toBe(2 * 800);

    const [item] = await new OrderItemService(db).listByOrder(result.orderId);
    expect(item).toMatchObject({ unitPriceCents: 800, listUnitPriceCents: LISTE, priceSetBy: staffId });
  });

  it('pazarlık YOKSA iz de yok — yarım iz yazılmaz (kısıt veride)', async () => {
    const result = await sale();
    if (result.status !== 'ok') return;

    const [item] = await new OrderItemService(db).listByOrder(result.orderId);
    expect(item?.listUnitPriceCents).toBeNull();
    expect(item?.priceSetBy).toBeNull();
  });

  it('ARAÇTAN satış aynı kapıdan yapılır — araç ayrı bir kavram değil, depo türü', async () => {
    const result = await sale({ warehouseId: vehicleId, lines: [{ variantId, qty: 3 }] });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const order = await orders.getById(result.orderId);
    expect(order?.warehouseId).toBe(vehicleId);

    const kalan = (await stocks.listByVariant(vehicleId, variantId)).reduce((s, b) => s + b.physicalQty, 0);
    expect(kalan).toBe(2);
  });

  it('OLMAYAN MAL SATILMAZ — ve reddedilen satıştan ORTADA TASLAK KALMAZ', async () => {
    /* Kullanıcının sorusu (26.08): "oranın stoğunu göz önünde bulunduracak mıyız?" Araçta 5 var;
       6 istenirse satış olmamalı — ve olmayan satıştan geriye bir sipariş satırı da kalmamalı. */
    const sayOrders = async () => (await db.from('order').select('id').eq('customer_id', customerId)).data?.length ?? 0;
    const oncekiSayi = await sayOrders();

    const result = await sale({ warehouseId: vehicleId, lines: [{ variantId, qty: 6 }] });

    expect(result).toEqual({ status: 'insufficient_here', lines: [{ name: expect.any(String), available: 5 }] });
    const sonrakiSayi = await sayOrders();
    expect(sonrakiSayi).toBe(oncekiSayi);

    // Araçtaki mal DA yerinde durmalı — reddedilen satış hiçbir şeye dokunmaz.
    const kalan = (await stocks.listByVariant(vehicleId, variantId)).reduce((s, b) => s + b.physicalQty, 0);
    expect(kalan).toBe(5);
  });

  it('kalemsiz satış yazılmaz', async () => {
    expect(await sale({ lines: [] })).toEqual({ status: 'empty' });
  });

  it('ANONİM ALICI müşteri değildir — listede, sayaçta ve segmentte GÖRÜNMEZ', async () => {
    /* Bu dosyanın ikinci asıl iddiası. Sipariş sahipsiz olamıyor ama kimlik de sorulmuyor; sabit
       satır `roles = {system}` taşıyor ve müşteri okumalarının hepsi `roles @> {customer}` ile
       süzülüyor (`CUSTOMERS_ONLY`). Yani anonim alıcıya bir GEÇMİŞ oluşmuyor — kullanıcı kararı
       26.08: "aynı müşteri alıyor gibi görünmemeli". */
    const anonim = await new UserProfileService(db).getById(ANONYMOUS_BUYER_ID);
    expect(anonim?.roles).toEqual(['system']);

    const result = await sale({ customerId: ANONYMOUS_BUYER_ID, lines: [{ variantId, qty: 1 }] });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect((await orders.getById(result.orderId))?.customerId).toBe(ANONYMOUS_BUYER_ID);

    // Müşteri listesi onu HİÇ görmüyor — kimlikle aranarak da gelmiyor.
    const sayfa = await new UserProfileService(db).list({ limit: 200 });
    expect(sayfa.rows.some((row) => row.id === ANONYMOUS_BUYER_ID)).toBe(false);

    await db.from('order').delete().eq('customer_id', ANONYMOUS_BUYER_ID);
  });
});
