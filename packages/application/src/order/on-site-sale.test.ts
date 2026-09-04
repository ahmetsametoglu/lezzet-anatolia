import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, DiscountService, OrderItemService, OrderService, PriceService, ProductService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
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
  // Araç deposu ARACINI söylemek zorunda (21.249 · `warehouse_vehicle_identity`); yardımcı damgalı
  // aracı kendisi açıyor ve teardown'da depoyla birlikte topluyor.
  vehicleId = (await createTestWarehouse(db, { label: 'VEH', kind: 'vehicle' })).id;

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
  // **DEFTER SİPARİŞTEN ÖNCE** (06.14): kapı satışının `counter_sale` satırı siparişi `restrict`
  // ile tutuyor. Hareketler partiden siliniyor (`stock_id` `not null`).
  await purgeVariantStock(db, [variantId]);
  await db.from('order').delete().eq('customer_id', customerId);
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

    /*
      **DEFTER SİPARİŞTEN ÖNCE** (06.14): kapı satışı deftere `counter_sale` yazıyor ve satır
      siparişi `restrict` ile tutuyor. Anonim alıcının siparişi `purgeTestData`nın kapsamında
      DEĞİL (profil purge'ün malı değil), o yüzden temizliği burada ve sırasıyla yapılıyor.

      SİLME BU TESTİN KENDİ SİPARİŞİ, "bütün anonim satışlar" DEĞİL (03.09). Süzgeç bir tur
      `eq('customer_id', ANONYMOUS_BUYER_ID)` idi ve anonim alıcı küresel tekil bir satır: ifade
      veritabanındaki her kapı satışını kapsıyordu. Postgres silmesi atomiktir — cihazdan yapılmış
      TEK bir satış (`stock_movement_order_fk`) bütün ifadeyi reddediyor, bu testin kendi siparişi
      de kalıyor ve `afterAll` `order_item_variant_id_fkey`e takılıp yarım kalıyordu (ölçüldü
      03.09: teardown 2 adımda yarım, dosya kırmızı). Üstelik sessizdi: çıplak `delete()` hatayı
      fırlatmaz, döndürür (`mustDelete` künyesi). Kimliğe indirildi ve GÜRÜLTÜLÜ oldu.
    */
    await purgeVariantStock(db, [variantId]);
    await mustDelete(db, 'order', (q) => q.eq('id', result.orderId));
  });

  it('OTOMATİK İNDİRİM siparişe DE kaleme DE yazılır — ciro indirimli, borç YOK', async () => {
    /*
      Kullanıcı bulgusu 03.09, cihazda ölçüldü: araçtan iki adet baklava satıldı, sepet 18,30 €
      dedi, kurye 15,30 € tahsil etti (otomatik "Bayram Sofrası seçkisi" 3 €) — ve kayıt şöyleydi:
      `ordered_total 15,30` · `revenue_total 18,30` · `discount_amount 0` · **`payment_status
      partial`**. Yani parasını tam ödemiş müşteri sistemde 3 € BORÇLU görünüyordu; ciro da
      indirimi görmediği için şişikti ve kampanya kotası hiç tükenmiyordu.

      Sebep tek satırdı: kapı `orderedTotalCents`i indirimli yazıyor ama indirimin KENDİSİNİ
      (başlık + kalem payı) hiç yazmıyordu. `revenue_total` kalemlerden türer ve yalnız
      `line_discount_amount` okur — pay yoksa indirim ciroya girmez, `payment_status` da ciroyu
      tahsilatla karşılaştırdığı için `partial` çıkar.

      Test dördünü birden çiviliyor: başlık, kalem payı, ciro ve ödeme durumu. Biri düşerse
      ötekiler de yalan söylüyor demektir.
    */
    const kampanya = await new DiscountService(db).insert({
      name: `Kapı kampanyası ${stamp}`,
      publicLabel: { tr: `Kapı kampanyası ${stamp}` },
      trigger: 'automatic',
      type: 'fixed',
      amountCents: 200,
      // KAPSAM BU DOSYANIN KATEGORİSİ: küresel bir kampanya paketteki her sepet okumasına
      // karışırdı (CLAUDE §4b — kendi kurduğun satırları kullan).
      scope: 'category',
      categoryId,
      isActive: true,
    });

    try {
      const result = await sale({ lines: [{ variantId, qty: 2 }] });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;

      // Müşterinin ödediği sayı: 2 × 10,00 − 2,00 indirim.
      expect(result.totalCents).toBe(2 * LISTE - 200);

      const order = await orders.getById(result.orderId);
      expect(order).toMatchObject({
        orderedTotalCents: 2 * LISTE - 200,
        // CİRO İNDİRİMİ GÖRÜYOR (arızanın kendisi buradaydı: 2000 yazıyordu).
        revenueTotalCents: 2 * LISTE - 200,
        discountAmountCents: 200,
        discountId: kampanya.id,
        // Kampanya adının SİPARİŞ ANINDAKİ kopyası — kampanya sonra adlandırılsa da kayıt değişmez.
        discountLabel: { tr: `Kapı kampanyası ${stamp}` },
        // BORÇ YOK: tahsilat ciroya eşit. Bir tur `partial` çıkıyordu ve borç hatırlatması yolu açıktı.
        paymentStatus: 'paid',
      });

      // Pay kaleme yazıldı; `discount_amount = Σ line_discount_amount` değişmezini veritabanı da
      // denetliyor (`order_discount_balance`, 0041) — yani bu satır kısıtla birlikte iki kez tutuyor.
      const items = await new OrderItemService(db).listByOrder(result.orderId);
      expect(items.reduce((sum, item) => sum + item.lineDiscountAmountCents, 0)).toBe(200);

      await purgeVariantStock(db, [variantId]);
      await mustDelete(db, 'order', (q) => q.eq('id', result.orderId));
    } finally {
      // Kampanya bu testin malı: kalırsa dosyanın öteki testlerinin tutarlarını sessizce oynatır.
      await mustDelete(db, 'discount', (q) => q.eq('id', kampanya.id));
    }
  });
});
