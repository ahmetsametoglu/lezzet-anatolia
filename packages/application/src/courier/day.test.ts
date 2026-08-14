import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, AddressService, CategoryService, OrderService, ProductService, ReservationService,
  StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, settingsSnapshot } from '@lezzet/database/testing';
import { listCourierDay, markUndelivered, readDoorCashAccountId, startCourierDay, type CourierStop } from './day';
import { recordOrderPayment } from '../order/payment';
import { advanceOrder } from '../order/advance.testkit';

/**
 * Kuryenin gün listesi (11.1) ve kapıdaki iki olumsuz sonuç (11.4) — terfi 21.10 ile birlikte
 * taşındı (kaynağı `apps/web/lib/courier/day.test.ts`).
 *
 * En kritik iki doğrulama: **başka kuryenin durağı görünmüyor mu** ve **ulaşılamadı ile reddedildi
 * ayrı mı** — ikisi karışırsa stok ve iade süreci karışır (tasarım §6).
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
/*
  Telefon DAMGALI (`user_profiles.phone` benzersiz — sabit numara paralel koşuda web köprü
  testiyle çarpışıyordu, defter 08.08). Önek '07': web ve mobile-api aynı `Date.now()` formülünü
  '06' ile kullanıyor; aynı milisaniyede başlayan iki dosya aynı numarayı üretmesin.
  Bağlantı testi de BU değerden türetir — sabit numara beklentisi damgayla birlikte kalktı.
*/
const customerPhone = `07${String(stamp).slice(-8)}`;
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
  const customer = await profiles.insert({ name: 'Marie Dupont', email: `kurye-${stamp}@example.test`, phone: customerPhone });
  const courier = await profiles.insert({ name: 'Kurye Ali', email: `ali-${stamp}@example.test` });
  const other = await profiles.insert({ name: 'Kurye Veli', email: `veli-${stamp}@example.test` });
  customerId = customer.id;
  courierId = courier.id;
  otherCourierId = other.id;
  createdProfiles.push(customer.id, courier.id, other.id);

  addressId = (await new AddressService(db).insert({
    customerId, line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg',
  })).id;
  accountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Sipariş, rezervasyon ve adres AYRICA silinmez: üçü de `purgeTestData`'nın bildiği bağlar
  // (sipariş `profileIds`ten, rezervasyon `productIds`ten, adres profil cascade'inden). Elle
  // yazılan bu satırlar teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/**
 * Yola çıkmış sipariş — kuryenin gün listesine düşmesi için gereken en kısa yol.
 *
 * `upTo` gün başlatmanın (K1) üç adayını kurabilmek için var: yoldaki (varsayılan), HAZIR ve henüz
 * hazırlanmamış sipariş. Varsayılan davranış değişmedi — `upTo` verilmeyen her çağrı eskisi gibi
 * `out_for_delivery`e kadar gider.
 */
async function dispatched(
  opts: { courier?: string; qty?: number; totalCents?: number; date?: string; upTo?: 'confirmed' | 'ready' } = {},
) {
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

  // Hazırlığı ATLANMIŞ sipariş: parti kaydı yok, yani gün başlatmanın "aday değil" dediği hâl.
  if (opts.upTo === 'confirmed') {
    await advanceOrder(db, order.id, ['confirmed']);
    return { orderId: order.id, itemId: items[0]!.id };
  }

  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  await advanceOrder(db, order.id, opts.upTo === 'ready' ? ['ready'] : ['ready', 'out_for_delivery']);
  return { orderId: order.id, itemId: items[0]!.id };
}

const mine = (stops: CourierStop[], orderId: string) => stops.find((stop) => stop.orderId === orderId)!;

describe('gün listesi (11.1)', () => {
  it('durak teslimat için gerekeni taşır: adres, ödeme beklentisi, içerik', async () => {
    const { orderId } = await dispatched({ qty: 3, totalCents: 3000 });

    const stop = mine(await listCourierDay(db, { courierId }), orderId);

    expect(stop.address).toBe('12 rue des Fleurs, 67000, Strasbourg');
    expect(stop.payment).toEqual({ dueAmountCents: 3000, expectedMethod: 'cash' });
    expect(stop.contentSummary).toMatch(/^3 × Kayısılı Reçel .*\(250 g\)$/);
    expect(stop.outcome).toBe('pending');
  });

  it('durak kalem satırlarını KİMLİKLE taşır — kısmi iade ancak böyle gönderilebilir (21.10d)', async () => {
    const { orderId, itemId } = await dispatched({ qty: 3, totalCents: 3000 });

    const stop = mine(await listCourierDay(db, { courierId }), orderId);

    // Kimlik UYDURULMAZ: kapının (`confirmDoorDelivery` → `adjustments[].orderItemId`) beklediği
    // satır kimliğinin AYNISI olmalı, yoksa kapıda eksik işaretlenen kalem gönderilemez.
    expect(stop.items).toHaveLength(1);
    expect(stop.items[0]!.orderItemId).toBe(itemId);
    expect(stop.items[0]!.qty).toBe(3);
    expect(stop.items[0]!.name).toMatch(/^Kayısılı Reçel .*\(250 g\)$/);
    // Aynı satırlardan türeyen iki alan ayrışmıyor — ikinci bir okuma açılmadığının da göstergesi.
    expect(stop.itemCount).toBe(stop.items.length);
  });

  it('BAŞKA kuryenin durağı görünmez', async () => {
    const { orderId: benim } = await dispatched();
    const { orderId: baskasinin } = await dispatched({ courier: otherCourierId });

    const stops = await listCourierDay(db, { courierId });

    expect(stops.map((stop) => stop.orderId)).toContain(benim);
    expect(stops.map((stop) => stop.orderId)).not.toContain(baskasinin);
  });

  it('kuryeye giden veride maliyet/kâr YOK, yalnız tahsil edilecek tutar var', async () => {
    const { orderId } = await dispatched();

    const stop = mine(await listCourierDay(db, { courierId }), orderId);

    const serialized = JSON.stringify(stop);
    for (const forbidden of ['purchasePrice', 'cogs', 'margin', 'creditLimit', 'unitPrice']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(stop.payment.dueAmountCents).toBe(2000); // gördüğü tek para
  });

  it('önceden ödenmiş durakta borç NULL — kapıda para konuşulmaz', async () => {
    const { orderId } = await dispatched({ totalCents: 2000 });
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, description: 'Online ödeme' });

    expect(mine(await listCourierDay(db, { courierId }), orderId).payment.dueAmountCents).toBeNull();
  });

  it('"yoldayım" bağlantısı müşterinin dilinde kurulur', async () => {
    const { orderId } = await dispatched();

    const stop = mine(await listCourierDay(db, { courierId, locale: 'fr' }), orderId);

    // E.164: baştaki 0 düşer, ülke kodu 33 gelir — beklenti damgalı numaradan türetilir.
    expect(stop.whatsAppLink).toContain(`wa.me/33${customerPhone.slice(1)}`);
    expect(decodeURIComponent(stop.whatsAppLink!)).toContain('Bonjour Marie Dupont');
  });

  it('başka günün durağı listede yok', async () => {
    const { orderId } = await dispatched({ date: dayOffset(3) });

    expect((await listCourierDay(db, { courierId })).some((stop) => stop.orderId === orderId)).toBe(false);
    expect((await listCourierDay(db, { courierId, date: dayOffset(3) })).some((stop) => stop.orderId === orderId)).toBe(true);
  });
});

/**
 * Kapı kasası hesabı (21.10d). Ayar KÜRESEL tekil bir satır: her test kendi penceresini açıp
 * bulduğu hâli geri koyuyor (CLAUDE §4b · emsal `apps/web/lib/order/quick-sale.test.ts`) — pencere
 * ne kadar kısa olursa paralel koşan başka bir ajanın okuması o kadar az etkilenir.
 */
describe('kapı kasası hesabı (21.10d)', () => {
  it('hesap AYARDAN okunur — ekranın tahsilat kapısını açan tek değer', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('door_cash_account_id', accountId);

    try {
      expect(await readDoorCashAccountId(db)).toBe(accountId);
    } finally {
      await settings.restore();
    }
  });

  it('ayar yoksa NULL döner — "hesap yok" uydurulmuş bir hesaba düşmez', async () => {
    // Ayar tohumda dolu olabilir; bu senaryo tam onun BOŞ olduğu hâli sınıyor.
    const settings = settingsSnapshot(db);
    await settings.remove('door_cash_account_id');

    try {
      expect(await readDoorCashAccountId(db)).toBeNull();
    } finally {
      await settings.restore();
    }
  });

  it('ayar hesap kimliği DEĞİLSE null — kapıdaki para olmayan bir hesaba yazılmaz', async () => {
    // Ayar elle yazılabilir bir jsonb; operatör oraya hesabın ADINI yazabilir. O değer cevaba
    // konsaydı istemci onu `accountId` diye gönderir ve uçtan 400 alırdı — sebebi görünmeyen bir ret.
    const settings = settingsSnapshot(db);
    await settings.override('door_cash_account_id', 'Kapı kasası');

    try {
      expect(await readDoorCashAccountId(db)).toBeNull();
    } finally {
      await settings.restore();
    }
  });
});

describe('günü başlat (K1 · 21.10d)', () => {
  it('HAZIR durak yola çıkar — geçiş kaydı kuryenin adına düşer', async () => {
    const { orderId } = await dispatched({ upTo: 'ready' });

    const result = await startCourierDay(db, { courierId });

    expect(result.started).toContain(orderId);
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');

    const { data } = await db.from('order_status_log').select('from_status,to_status,actor_id').eq('order_id', orderId);
    expect(
      (data ?? []).some(
        (row) => row.from_status === 'ready' && row.to_status === 'out_for_delivery' && row.actor_id === courierId,
      ),
    ).toBe(true);
  });

  it('zaten yoldaki durak İKİNCİ kez yazılmaz — `alreadyOut`, ve bu bir hata değil', async () => {
    const { orderId } = await dispatched();

    const result = await startCourierDay(db, { courierId });

    expect(result.alreadyOut).toContain(orderId);
    expect(result.started).not.toContain(orderId);
  });

  it('hazırlanmamış durak yola ÇIKARILMAZ ve gizlenmez — `skipped` + o anki durumu', async () => {
    // Motor `confirmed → out_for_delivery`ye izin VERİYOR (küçük sipariş hazırlığı atlayabilir) ama
    // kuryenin toplu düğmesi bunu yapmaz: parti kaydı yazılmamış siparişte teslimde mal hangi
    // partiden düşecek sorusu cevapsız kalır. Kurye sebebi listede görüyor.
    const { orderId } = await dispatched({ upTo: 'confirmed' });

    const result = await startCourierDay(db, { courierId });

    expect(result.skipped).toEqual([{ orderId, currentStatus: 'confirmed' }]);
    expect(result.started).toHaveLength(0);
    expect((await orders.getById(orderId))?.status).toBe('confirmed');
  });

  it('kısmi başarı GÖRÜNÜR: üç aday, üç ayrı liste', async () => {
    const { orderId: hazir } = await dispatched({ upTo: 'ready' });
    const { orderId: yolda } = await dispatched();
    const { orderId: hazirlanmamis } = await dispatched({ upTo: 'confirmed' });

    const result = await startCourierDay(db, { courierId });

    expect(result.started).toEqual([hazir]);
    expect(result.alreadyOut).toEqual([yolda]);
    expect(result.skipped).toEqual([{ orderId: hazirlanmamis, currentStatus: 'confirmed' }]);
    expect(result.stale).toHaveLength(0);
  });

  it('BAŞKA kuryenin hazır siparişi bu çağrıyla yola çıkmaz', async () => {
    const { orderId } = await dispatched({ courier: otherCourierId, upTo: 'ready' });

    const result = await startCourierDay(db, { courierId });

    expect(result.started).not.toContain(orderId);
    expect((await orders.getById(orderId))?.status).toBe('ready');
  });

  it('BAŞKA günün hazır durağı başlatılmaz — gün imzada durur', async () => {
    const { orderId } = await dispatched({ date: dayOffset(3), upTo: 'ready' });

    const bugun = await startCourierDay(db, { courierId });
    expect(bugun.started).not.toContain(orderId);

    const oGun = await startCourierDay(db, { courierId, date: dayOffset(3) });
    expect(oGun.date).toBe(dayOffset(3));
    expect(oGun.started).toContain(orderId);
  });

  it('eşzamanlı iki çağrıda geçiş TAM BİR KEZ yazılır; yazmayan çağrı sessiz kalmaz', async () => {
    // Hangi çağrının kazandığı SABİTLENMİYOR — yarış gerçek ve kilit veritabanındadır (koşullu
    // ilerletme, `transition_order_status`). Sabitlenen iki değişmez var: geçiş bir kez yazılır ve
    // yazamayan çağrı durağı ya `stale` ya `alreadyOut` diye BİLDİRİR. Bunu "stale döner" diye
    // yazmak yalancı bir düşüş üretirdi: kaybeden çağrı listesini kazananın yazımından SONRA
    // okuduysa durağı zaten yolda görür ve dürüst cevabı `alreadyOut`tur.
    const { orderId } = await dispatched({ upTo: 'ready' });

    const [a, b] = await Promise.all([startCourierDay(db, { courierId }), startCourierDay(db, { courierId })]);

    expect([...a.started, ...b.started].filter((id) => id === orderId)).toHaveLength(1);

    const loser = a.started.includes(orderId) ? b : a;
    expect(loser.stale.some((stop) => stop.orderId === orderId) || loser.alreadyOut.includes(orderId)).toBe(true);

    const { data } = await db
      .from('order_status_log')
      .select('to_status')
      .eq('order_id', orderId)
      .eq('from_status', 'ready')
      .eq('to_status', 'out_for_delivery');
    expect(data ?? []).toHaveLength(1);
  });
});

describe('ulaşılamadı / reddedildi (11.4)', () => {
  it('ulaşılamadı: sipariş `ready`e döner, mal AYRILMIŞ kalır', async () => {
    const { orderId } = await dispatched({ qty: 2 });

    const result = await markUndelivered(db, { orderId, courierId, outcome: 'unreachable', note: 'zil bozuk' });

    expect(result).toMatchObject({ status: 'ok', currentStatus: 'ready' });
    // Stok HİÇ değişmez: mal araçta, başkasına satılamaz (ORDER_LIFECYCLE).
    const available = await stocks.getAvailable(warehouseId, variantId);
    expect(available.physicalQty).toBe(20);
    expect(available.reservedQty).toBe(2);
  });

  it('kuryenin kapıda yazdığı not durum kaydına DÜŞER', async () => {
    // Düzeltme 95428fb: not `transition`a geçirilmezse kuryenin girdiği tek serbest bilgi hiçbir
    // yere yazılmıyordu — ekran "sebep yok" gösteriyordu ve sebep gerçekten yoktu.
    const { orderId } = await dispatched();

    await markUndelivered(db, { orderId, courierId, outcome: 'unreachable', note: 'zil bozuk' });

    const { data } = await db.from('order_status_log').select('note,to_status').eq('order_id', orderId);
    expect((data ?? []).some((row) => row.to_status === 'ready' && row.note === 'zil bozuk')).toBe(true);
  });

  it('ulaşılamayan durak listede KALIR ve deneme sayısıyla görünür', async () => {
    const { orderId } = await dispatched();
    await markUndelivered(db, { orderId, courierId, outcome: 'unreachable' });

    const stop = mine(await listCourierDay(db, { courierId }), orderId);

    // "Ulaşılamadı" ile "henüz sıra gelmedi" ikisi de `ready`; ayrım geçiş geçmişinden türer.
    expect(stop.outcome).toBe('unreachable');
    expect(stop.attempts).toBe(1);
  });

  it('reddedildi: sipariş `returned` olur — iki sonucun akıbeti AYRI', async () => {
    const { orderId } = await dispatched();

    const result = await markUndelivered(db, { orderId, courierId, outcome: 'refused', note: 'kabul etmedi' });

    expect(result).toMatchObject({ status: 'ok', currentStatus: 'returned' });
    expect(mine(await listCourierDay(db, { courierId }), orderId).outcome).toBe('refused');
  });

  it('başka kuryenin durağı bu ekrandan kapatılamaz', async () => {
    const { orderId } = await dispatched({ courier: otherCourierId });

    const result = await markUndelivered(db, { orderId, courierId, outcome: 'refused' });

    expect(result).toEqual({ status: 'forbidden', reason: 'not_assigned' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });
});
