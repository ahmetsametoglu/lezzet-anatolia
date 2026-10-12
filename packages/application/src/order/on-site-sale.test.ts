import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, DiscountService, MoneyMovementService, OrderItemService, OrderService, PriceService,
  ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeOrdersBy, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { ANONYMOUS_BUYER_ID, quoteOnSiteSale, sellOnSite } from './on-site-sale';

/**
 * Yerinde satış tek adımda kapanır (`draft → completed`: mal düşer, referans doğar, para yazılır); pazarlık izi liste fiyatıyla
 * birlikte yazılır ve toplam pazarlıklı fiyattan türer. Satışa kapalı ürün elle fiyatla dirilmez, araç da bir depodur.
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
  // Araç deposu satışta tezgâhla aynı kapıdan satar; aracını söylemek zorunda olduğu için (`warehouse_vehicle_identity`) yardımcı
  // damgalı aracı kendisi açar ve depoyla birlikte toplar.
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
  // Defter siparişten önce gider: kapı satışının `counter_sale` satırı siparişi `restrict` ile tutar, hareketler partiden silinir.
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
    // Araçta 5 var: 6 istenirse satış olmaz ve geriye sipariş satırı kalmaz.
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

  it('kapı hesabı olmayan yöntemle satış başlamaz — sipariş yazılmaz, para kayıtsız kalmaz', async () => {
    const sayOrders = async () => (await db.from('order').select('id').eq('customer_id', customerId)).data?.length ?? 0;
    const oncekiSayi = await sayOrders();

    const result = await sale({ paymentMethod: 'bank_transfer', paymentAccountId: undefined });

    expect(result).toEqual({ status: 'no_payment_account' });
    expect(await sayOrders()).toBe(oncekiSayi);
  });

  it('kalemsiz satış yazılmaz', async () => {
    expect(await sale({ lines: [] })).toEqual({ status: 'empty' });
  });

  it('AYNI KİMLİKLE tekrar gelen satış ikinci sipariş ve ikinci tahsilat açmaz — yazılmış satış aynen döner', async () => {
    const key = `sale-test-${stamp}-tekrar`;

    const first = await sale({ idempotencyKey: key });
    const again = await sale({ idempotencyKey: key });

    expect(first.status).toBe('ok');
    expect(again).toEqual(first);
    if (first.status !== 'ok') return;
    expect((await db.from('order').select('id').eq('idempotency_key', key)).data).toHaveLength(1);
    const payments = (await new MoneyMovementService(db).listByOrder(first.orderId)).filter((m) => m.type === 'order_payment');
    expect(payments).toHaveLength(1);
    expect((await stocks.listByVariant(facilityId, variantId)).reduce((s, b) => s + b.physicalQty, 0)).toBe(8);
  });

  it('aynı kimlikle FARKLI sepet ya da başka yer gelirse ilk satış aynen döner; yeni sepet yazılmaz', async () => {
    const key = `sale-test-${stamp}-farkli`;

    const first = await sale({ idempotencyKey: key });
    const otherCart = await sale({ idempotencyKey: key, lines: [{ variantId, qty: 5 }] });
    const otherPlace = await sale({ idempotencyKey: key, warehouseId: vehicleId });

    expect(first.status).toBe('ok');
    expect(otherCart).toEqual(first);
    expect(otherPlace).toEqual(first);
    expect((await db.from('order').select('id').eq('idempotency_key', key)).data).toHaveLength(1);
    expect((await stocks.listByVariant(facilityId, variantId)).reduce((s, b) => s + b.physicalQty, 0)).toBe(8);
    expect((await stocks.listByVariant(vehicleId, variantId)).reduce((s, b) => s + b.physicalQty, 0)).toBe(5);
  });

  it('kapanıştan önce düşen satış aynı kimlikle gelince AYNI taslak kapanır — yeni sipariş açılmaz', async () => {
    const key = `sale-test-${stamp}-taslak`;
    const { order: draft } = await orders.create(
      {
        customerId,
        warehouseId: facilityId,
        channel: 'b2c',
        orderSource: 'door',
        deliveryType: 'pickup',
        status: 'draft',
        paymentMethod: 'cash',
        shippingFeeCents: 0,
        orderedTotalCents: 2 * LISTE,
        idempotencyKey: key,
      },
      [{ variantId, qty: 2, unitPriceCents: LISTE, vatRate: 5.5 }],
    );

    const result = await sale({ idempotencyKey: key });

    expect(result).toMatchObject({ status: 'ok', orderId: draft.id, totalCents: 2 * LISTE, paymentRecorded: true });
    expect((await orders.getById(draft.id))?.status).toBe('completed');
    expect((await db.from('order').select('id').eq('idempotency_key', key)).data).toHaveLength(1);
  });

  it('ANONİM ALICI müşteri değildir — listede, sayaçta ve segmentte GÖRÜNMEZ', async () => {
    /* Sipariş sahipsiz olamaz ama alıcıya kimlik sorulmaz; sabit satır `roles = {system}` taşır ve müşteri okumalarının hepsi
       `roles @> {customer}` ile süzülür (`CUSTOMERS_ONLY`). Anonim alıcıya bu yüzden geçmiş oluşmaz, aynı müşteri alıyor gibi görünmez. */
    const anonim = await new UserProfileService(db).getById(ANONYMOUS_BUYER_ID);
    expect(anonim?.roles).toEqual(['system']);

    const result = await sale({ customerId: ANONYMOUS_BUYER_ID, lines: [{ variantId, qty: 1 }] });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect((await orders.getById(result.orderId))?.customerId).toBe(ANONYMOUS_BUYER_ID);

    // Müşteri listesi onu HİÇ görmüyor — kimlikle aranarak da gelmiyor.
    const sayfa = await new UserProfileService(db).list({ limit: 200 });
    expect(sayfa.rows.some((row) => row.id === ANONYMOUS_BUYER_ID)).toBe(false);

    /* Anonim alıcının siparişi `purgeTestData` kapsamında değil, temizlik burada ve sırasıyla (önce defter) yapılır. Silme yalnız bu
       testin siparişidir, çünkü anonim alıcı küresel tekil bir satırdır ve geniş süzgeç başka kapı satışlarına uzanırdı. */
    await purgeVariantStock(db, [variantId]);
    await mustDelete(db, 'order', (q) => q.eq('id', result.orderId));
  });

  it('OTOMATİK İNDİRİM siparişe DE kaleme DE yazılır — ciro indirimli, borç YOK', async () => {
    /* İndirim toplamla birlikte başlığa ve kalem payına da yazılmalı: ciro kalem payından türer, ödeme durumu ciroyu tahsilatla
       karşılaştırır ve pay eksikse tam ödemiş müşteri borçlu görünür. Test dördünü birlikte doğrular. */
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

describe('adı belli müşteriye satış', () => {
  const B2B = 800;
  let vadeliId: string;
  let vadesizId: string;
  let qualiteId: string;

  beforeAll(async () => {
    await new PriceService(db).insert({ variantId, channel: 'b2b', amountCents: B2B });
    const profiles = new UserProfileService(db);
    vadeliId = (
      await profiles.insert({
        name: `Vadeli şirket ${stamp}`,
        type: 'company',
        b2bApproved: true,
        creditEnabled: true,
        creditLimitCents: 100_000,
        paymentTermDays: 30,
      })
    ).id;
    vadesizId = (await profiles.insert({ name: `Vadesiz şirket ${stamp}`, type: 'company', b2bApproved: true, creditEnabled: false })).id;
    qualiteId = (await profiles.insert({ name: `QUALITE şirketi ${stamp}`, type: 'company', b2bApproved: true, business: 'qualite' })).id;
    createdProfiles.push(vadeliId, vadesizId, qualiteId);
  });

  afterAll(async () => {
    // Satış partiye çıpalandığı için parti önce, sipariş sonra gider (`beforeEach` sırası).
    await purgeVariantStock(db, [variantId]);
    await purgeOrdersBy(db, 'customer_id', [vadeliId, vadesizId, qualiteId]);
  });

  it('vadeli satış kapıda para almaz: sipariş B2B kanalında, KDV dahil borçla ve tahsilatsız kapanır', async () => {
    const result = await sale({ customerId: vadeliId, paymentMethod: 'bank_transfer', paymentAccountId: undefined, onAccount: true });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.paymentRecorded).toBe(false);
    // B2B fiyatı vergisizdir; borç her tabanda KDV dahil yazılır.
    expect(result.totalCents).toBeGreaterThan(2 * B2B);

    const order = await orders.getById(result.orderId);
    expect(order).toMatchObject({
      status: 'completed',
      channel: 'b2b',
      onAccount: true,
      pricesIncludeVat: false,
      orderedTotalCents: result.totalCents,
    });
    const movements = await new MoneyMovementService(db).listByOrder(result.orderId);
    expect(movements.filter((m) => m.type === 'order_payment')).toHaveLength(0);
  });

  it('KESİN TUTAR hiçbir şey yazmaz ve satışın yazacağı KDV dahil toplamdır — sepetin vergisiz ara toplamı değil', async () => {
    const sayOrders = async () => (await db.from('order').select('id').eq('customer_id', vadeliId)).data?.length ?? 0;
    const once = await sayOrders();

    const quote = await quoteOnSiteSale(db, {
      warehouseId: facilityId,
      customerId: vadeliId,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
      lines: [{ variantId, qty: 2 }],
    });
    expect(await sayOrders()).toBe(once);

    const result = await sale({ customerId: vadeliId });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.totalCents).toBeGreaterThan(2 * B2B);
    expect(quote).toEqual({ status: 'ok', totalCents: result.totalCents });
  });

  it('peşin B2B satış tahsilatı yazar ve siparişi B2B kanalına yazar; kasa B2B nakdini kanaldan tanır', async () => {
    const result = await sale({ customerId: vadeliId });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.paymentRecorded).toBe(true);
    expect(await orders.getById(result.orderId)).toMatchObject({ channel: 'b2b', onAccount: false });
  });

  it('vade izni olmayan şirkete vadeli satış açılmaz ve sipariş yazılmaz', async () => {
    const result = await sale({ customerId: vadesizId, paymentMethod: 'bank_transfer', paymentAccountId: undefined, onAccount: true });

    expect(result).toEqual({ status: 'credit_not_allowed', reason: 'not_enabled' });
    const { data } = await db.from('order').select('id').eq('customer_id', vadesizId);
    expect(data ?? []).toHaveLength(0);
  });

  it('müşterinin işi deponun işiyle tutmazsa satış yazılmaz: QUALITE müşterisi Lezzet kapısından almaz', async () => {
    expect(await sale({ customerId: qualiteId })).toEqual({ status: 'business_mismatch' });
  });

  it('anonim alıcıya vadeli satış yazılmaz, çünkü açık bakiyesi yoktur', async () => {
    expect(await sale({ customerId: ANONYMOUS_BUYER_ID, paymentMethod: 'bank_transfer', onAccount: true })).toEqual({
      status: 'payment_not_allowed',
    });
  });
});
