import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, AddressService, CategoryService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { openBox, sealBox } from '@lezzet/application';
import { listCourierDay, markUndelivered, type CourierStop } from './day';
import { recordOrderPayment } from '../money/order-payment';
import { transitionOrder } from '../order/transition';

/**
 * Kuryenin gün listesi (11.1) ve kapıdaki iki olumsuz sonuç (11.4).
 *
 * En kritik iki doğrulama: **başka kuryenin durağı görünmüyor mu** ve **ulaşılamadı ile reddedildi
 * ayrı mı** — ikisi karışırsa stok ve iade süreci karışır (tasarım §6).
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let addressId: string;
let courierId: string;
let otherCourierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let stockId: string;
let accountId: string;
const createdProfiles: string[] = [];

// WhatsApp beklentisi de BU değerden türer — sabit yazılsaydı damga her koşuda beklentiyi kırardı.
const customerPhone = `06${String(stamp).slice(-8)}`;

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kurye testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kayısılı Reçel ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '250 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  // Telefon DAMGALI: `user_profiles.phone` benzersiz (phone-key) ve bu fikstürün paket kopyası da
  // var — sabit bir numara yazan iki dosya aynı pencerede koşunca unique kısıta çarpışıyor (08.08).
  const customer = await profiles.insert({ name: 'Marie Dupont', email: `kurye-${stamp}@example.test`, phone: customerPhone });
  const courier = await profiles.insert({ name: 'Kurye Ali', email: `ali-${stamp}@example.test` });
  const other = await profiles.insert({ name: 'Kurye Veli', email: `veli-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  otherCourierId = other.id;
  createdProfiles.push(customer.id, courier.id, other.id);

  // Alıcı + telefon 22.08'den beri ZORUNLU — kurye durağının kapıda soracağı ad ve arayacağı numara.
  addressId = (await new AddressService(db).insert({
    customerId, recipient: 'Ayşe Yılmaz', phone: '+33612345678',
    line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg',
  })).id;
  accountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // SIRA: defter → parti → sipariş (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  // Özeti: teslimin `sale` satırı ikisini birden `restrict` ile tutuyor ve hatayı yutan `delete()`
  // teardown'ı sessizce yarım bırakıyordu.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Sipariş, rezervasyon ve adres AYRICA silinmez: üçü de `purgeTestData`'nın bildiği bağlar
  // (sipariş `profileIds`ten, rezervasyon `productIds`ten, adres profil cascade'inden). Elle
  // yazılan bu satırlar teardown'ı öldürüyordu — `beforeAll` düşünce kimlik `undefined` kalıyor,
  // uuid hatasıyla fırlıyor ve purge HİÇ çağrılmıyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** Yola çıkmış sipariş — kuryenin gün listesine düşmesi için gereken en kısa yol. */
async function dispatched(opts: { courier?: string; qty?: number; totalCents?: number; date?: string } = {}) {
  const qty = opts.qty ?? 2;
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryDate: opts.date ?? today,
      courierId: opts.courier ?? courierId,
      addressId,
      addressSnapshot: { line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg' },
      paymentMethod: 'cash',
      totalCents: opts.totalCents ?? qty * 1000,
    },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  for (const status of ['confirmed', 'preparing'] as const) await transitionOrder({ orderId: order.id, to: status });
  /* HAZIRLIK KUTUYLA (30.08): kutusuz sipariş `ready` olamaz. Mühür siparişi HAZIR yapar. */
  const box = await openBox(db, { orderId: order.id, warehouseId });
  if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
  const sealed = await sealBox(db, {
    boxId: box.box.boxId,
    warehouseId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
  });
  if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);
  await transitionOrder({ orderId: order.id, to: 'out_for_delivery' });
  return { orderId: order.id, itemId: items[0]!.id, boxCode: box.box.code };
}

const mine = (stops: CourierStop[], orderId: string) => stops.find((stop) => stop.orderId === orderId)!;

describe('gün listesi (11.1)', () => {
  it('durak teslimat için gerekeni taşır: adres, ödeme beklentisi, içerik', async () => {
    const { orderId } = await dispatched({ qty: 3, totalCents: 3000 });

    const stop = mine(await listCourierDay({ courierId }), orderId);

    expect(stop.address).toBe('12 rue des Fleurs, 67000, Strasbourg');
    /* `collectedAtDoorCents` 30.08'de eklendi — bekleyen durakta `null`. */
    expect(stop.payment).toEqual({ dueAmountCents: 3000, expectedMethod: 'cash', collectedAtDoorCents: null });
    expect(stop.contentSummary).toMatch(/^3 × Kayısılı Reçel .*\(250 g\)$/);
    expect(stop.outcome).toBe('pending');
  });

  it('BAŞKA kuryenin durağı görünmez', async () => {
    const { orderId: benim } = await dispatched();
    const { orderId: baskasinin } = await dispatched({ courier: otherCourierId });

    const stops = await listCourierDay({ courierId });

    expect(stops.map((stop) => stop.orderId)).toContain(benim);
    expect(stops.map((stop) => stop.orderId)).not.toContain(baskasinin);
  });

  it('kuryeye giden veride maliyet/kâr YOK, yalnız tahsil edilecek tutar var', async () => {
    const { orderId } = await dispatched();

    const stop = mine(await listCourierDay({ courierId }), orderId);

    const serialized = JSON.stringify(stop);
    /* `unitPrice` yasak listesinden çıktı (30.08): yasak olan İŞLETMENİN defteri; kalemin SATIŞ
       fiyatı kuryenin gördüğü tek paranın bileşenidir (kısmi iadede tutar ondan düşüyor). */
    for (const forbidden of ['purchasePrice', 'cogs', 'margin', 'creditLimit']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(stop.payment.dueAmountCents).toBe(2000); // gördüğü tek para
  });

  it('önceden ödenmiş durakta borç NULL — kapıda para konuşulmaz', async () => {
    const { orderId } = await dispatched({ totalCents: 2000 });
    await recordOrderPayment({ orderId, accountId, amountCents: 2000, description: 'Online ödeme' });

    expect(mine(await listCourierDay({ courierId }), orderId).payment.dueAmountCents).toBeNull();
  });

  it('"yoldayım" bağlantısı müşterinin dilinde kurulur', async () => {
    const { orderId } = await dispatched();

    const stop = mine(await listCourierDay({ courierId, locale: 'fr' }), orderId);

    expect(stop.whatsAppLink).toContain(`wa.me/33${customerPhone.slice(1)}`);
    expect(decodeURIComponent(stop.whatsAppLink!)).toContain('Bonjour Marie Dupont');
  });

  it('başka günün durağı listede yok', async () => {
    const { orderId } = await dispatched({ date: dayOffset(3) });

    expect((await listCourierDay({ courierId })).some((stop) => stop.orderId === orderId)).toBe(false);
    expect((await listCourierDay({ courierId, date: dayOffset(3) })).some((stop) => stop.orderId === orderId)).toBe(true);
  });
});

describe('ulaşılamadı / reddedildi (11.4)', () => {
  it('ulaşılamadı: sipariş `ready`e döner, mal AYRILMIŞ kalır', async () => {
    const { orderId } = await dispatched({ qty: 2 });

    const result = await markUndelivered({ orderId, courierId, outcome: 'unreachable', note: 'zil bozuk' });

    expect(result).toMatchObject({ status: 'ok', currentStatus: 'ready' });
    // Stok HİÇ değişmez: mal araçta, başkasına satılamaz (ORDER_LIFECYCLE).
    const available = await stocks.getAvailable(warehouseId, variantId);
    expect(available.physicalQty).toBe(20);
    expect(available.reservedQty).toBe(2);
  });

  it('ulaşılamayan durak listede KALIR ve deneme sayısıyla görünür', async () => {
    const { orderId } = await dispatched();
    await markUndelivered({ orderId, courierId, outcome: 'unreachable' });

    const stop = mine(await listCourierDay({ courierId }), orderId);

    // "Ulaşılamadı" ile "henüz sıra gelmedi" ikisi de `ready`; ayrım geçiş geçmişinden türer.
    expect(stop.outcome).toBe('unreachable');
    expect(stop.attempts).toBe(1);
  });

  it('reddedildi: sipariş `returned` olur — iki sonucun akıbeti AYRI', async () => {
    const { orderId } = await dispatched();

    const result = await markUndelivered({ orderId, courierId, outcome: 'refused', note: 'kabul etmedi' });

    expect(result).toMatchObject({ status: 'ok', currentStatus: 'returned' });
    expect(mine(await listCourierDay({ courierId }), orderId).outcome).toBe('refused');
  });

  it('başka kuryenin durağı bu ekrandan kapatılamaz', async () => {
    const { orderId } = await dispatched({ courier: otherCourierId });

    const result = await markUndelivered({ orderId, courierId, outcome: 'refused' });

    expect(result).toEqual({ status: 'forbidden', reason: 'not_assigned' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });
});
