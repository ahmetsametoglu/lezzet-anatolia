import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  AddressService,
  anonDb,
  CategoryService,
  MoneyMovementService,
  OrderService,
  ProductService,
  ReservationService,
  serviceDb,
  StockService,
  UserProfileService,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { recordOrderPayment } from '@lezzet/application';
// Beklenen şekiller ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME
// kırılır (katalog testinin kararı). Kurye sözleşmelerinin ilk tüketicisi de budur.
import type {
  ConfirmDoorDeliveryResponse,
  CourierDayCloseResult,
  CourierDayResponse,
  DayCloseDraftContract,
  DeliveryProofUploadResponse,
  MarkUndeliveredResponse,
  OrderStatus,
} from '@lezzet/types';
import { app } from '../../app';

/**
 * Kurye uçları uçtan uca — `app.request()` ile PORT AÇMADAN (katalog testiyle aynı desen).
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): zeminin TAMAMI bu dosyanın kendi damgalı satırlarıdır —
 * bir depo, bir kategori, bir ürün, bir müşteri, İKİ kurye profili (biri gerçek auth kullanıcısı),
 * bir kasa hesabı ve her testin kendi siparişleri. **Küresel sayıya bakan tek bir iddia yok:**
 * gün listesi hep kendi sipariş kimliklerimizle daraltılıyor, başka bir ajanın açtığı sipariş bu
 * dosyayı kızartamaz. Teardown `purgeTestData` + `mustDelete` ile toplanır.
 *
 * **Asıl sınanan şey taşımadır:** kapının kararı (`stale`, `forbidden`, `already_closed`) gövdeye
 * BOZULMADAN çıkıyor mu, kimlik jetondan mı geliyor, rolsüz kişi kapıdan dönüyor mu. Kararların
 * kendisi `packages/application`ın kurye testlerinde sınandı; burada tekrarlanmıyor.
 */
const stamp = Date.now();
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Kurye rollü gerçek oturum — kimliğin JETONDAN geldiğini ancak gerçek bir token kanıtlar. */
let courierToken = '';
/** Kuryenin PROFİL kimliği (`user_profiles.id`) — `order.courier_id` bunu bekler, auth kimliğini değil. */
let courierId = '';
/** Rolsüz kullanıcı: kapının gerçekten kapalı olduğunu gösterir. */
let outsiderToken = '';
/** `admin` de geçer — rol süzgeci "courier YA DA admin". */
let adminToken = '';
/** Auth kullanıcısı OLMAYAN ikinci kurye: başkasının durağı iddialarının hedefi. */
let otherCourierId = '';

let customerId = '';
let warehouseId = '';
let addressId = '';
let accountId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let stockId = '';

const authUserIds: string[] = [];
const profileIds: string[] = [];

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir (katalog deseni). */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

/** Kurye jetonuyla okuma — başlığı her çağrıda elle kurmak testin okunurluğunu yiyordu. */
async function asCourier(path: string): Promise<Response> {
  return app.request(path, { headers: { authorization: `Bearer ${courierToken}` } });
}

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${courierToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Auth kullanıcısı + rolleri yazılmış profil + açık oturum.
 *
 * Roller AÇIKÇA yazılıyor, trigger'ın verdiğine güvenilmiyor: `0002` ilk kullanıcıya `admin`,
 * sonrakilere `customer` veriyor — yani "rolsüz kullanıcı" testi, yerel veritabanında hiç admin
 * yoksa sessizce ADMİN kullanıcısı üretir ve 403 iddiası yanlış sebeple kırılırdı.
 *
 * **Kurye KAPSAMSIZ olamaz** (`user_profiles_warehouse_scope`, 0031): `courier`/`warehouse` rolü
 * en az bir depo ister ve kısıt veritabanındadır — uygulama unutsa da geçmez. Depo bir boyut değil
 * DEĞİŞMEZDİR (CLAUDE §1) ve bu test onu fikstürde de öyle kabul ediyor.
 */
async function signedInUser(label: string, roles: ('customer' | 'courier' | 'admin')[], warehouseIds: string[] = []) {
  const email = `courier-api-${label}-${stamp}@example.test`;
  const password = `Kurye!${stamp}`;
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles, warehouseIds, name: `Kurye ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

/**
 * Siparişi durum durum ilerletir — `application/src/order/advance.testkit.ts`in yerel karşılığı.
 *
 * Testkit ÇAĞRILAMIYOR: `@lezzet/application`ın `exports` haritası yalnız `"."` açıyor, yani
 * alt-yol import'u paket sınırında kapalı ve testkit `index.ts`ten dışa verilmiyor. Terfi ihtiyacı
 * (testkit'i dışa açmak) rapora yazıldı; o gün buradaki on satır silinir.
 *
 * Motor (`canTransition`) burada sorulmuyor çünkü mobile-api `@lezzet/domain-core`a bağlı değil —
 * ve gerekmiyor: yol sabit ve yanlış yazılırsa RPC `ok:false` döner, fikstür de gürültü çıkarır.
 */
async function advance(orderId: string, path: readonly OrderStatus[]): Promise<void> {
  for (const to of path) {
    const order = await orders.getById(orderId);
    if (!order) throw new Error(`advance: sipariş yok (${orderId})`);
    const result = await orders.transition({ orderId, from: order.status, to });
    if (!result.ok) throw new Error(`advance: ${order.status} → ${to} yazılamadı (şu an ${result.currentStatus})`);
  }
}

/** Yola çıkmış sipariş — kuryenin gün listesine düşmesi için gereken en kısa yol (emsal: `courier/day.test.ts`). */
async function dispatched(
  opts: { courier?: string; qty?: number; totalCents?: number; date?: string; channel?: 'b2b' | 'b2c' } = {},
): Promise<string> {
  const qty = opts.qty ?? 2;
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: opts.channel ?? 'b2c',
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
  await advance(order.id, ['confirmed', 'preparing']);
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }]);
  await advance(order.id, ['ready', 'out_for_delivery']);
  return order.id;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'KAPI' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kurye API ${stamp}` } });
  categoryId = category.id;

  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kayısılı Reçel ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '250 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({
    name: 'Marie Dupont',
    // Telefon da DAMGALI: `user_profiles.phone` benzersiz ve sabit bir numara yazan iki dosya
    // (ya da düşüp temizlenememiş bir koşu) birbirini kurulum anında düşürür.
    phone: `06${String(stamp).slice(-8)}`,
    email: `kapi-musteri-${stamp}@example.test`,
  });
  customerId = customer.id;
  profileIds.push(customer.id);

  const other = await profiles.insert({ name: 'Kurye Veli', email: `kapi-veli-${stamp}@example.test` });
  otherCourierId = other.id;
  profileIds.push(other.id);

  const courier = await signedInUser('ali', ['courier'], [warehouseId]);
  courierId = courier.profileId;
  courierToken = courier.token;
  outsiderToken = (await signedInUser('musteri', ['customer'])).token;
  adminToken = (await signedInUser('patron', ['admin'])).token;

  addressId = (
    await new AddressService(db).insert({ customerId, line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg' })
  ).id;
  accountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // Her test kendi siparişlerini kurar: gün listesi ve kapanış taslağı GÜNÜN TAMAMINI okur, önceki
  // testin bıraktığı durak sessizce sonraki testin sayımına girerdi.
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Kurulum yarıda kaldıysa (kısıt ihlali gibi) kimlikler BOŞ kalır; boş bir kimlikle silmeye
  // çalışmak "invalid input syntax for uuid" fırlatır ve ASIL hatayı gizler — teardown'ın hatası
  // kurulumun hatasının üstüne yazılmamalı.
  const known = [courierId, otherCourierId].filter(Boolean);
  // Kapanış kaydı PROFİLDEN ÖNCE: `courier_day_close.courier_id` `restrict` ile bağlı ve Supabase
  // `delete()` hatayı fırlatmaz döndürür — bakılmazsa teardown sessizce yarım kalırdı (CLAUDE §4b).
  if (known.length > 0) await mustDelete(db, 'courier_day_close', (q) => q.in('courier_id', known));
  if (customerId) await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  if (variantId) await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  if (addressId) await mustDelete(db, 'address', (q) => q.eq('id', addressId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

describe('kapı: Bearer + rol süzgeci', () => {
  it('Bearer olmadan 401 — kurye uçları oturumsuz gezilmez (katalogun tersi)', async () => {
    const res = await app.request('/api/v1/courier/day');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });

  it('geçerli Bearer ama KURYE DEĞİL → 403 forbidden', async () => {
    const res = await app.request('/api/v1/courier/day', { headers: { authorization: `Bearer ${outsiderToken}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ data: null, error: 'forbidden' });
  });

  it('admin de geçer — ama BAŞKASININ rotasını görmez', async () => {
    const orderId = await dispatched();

    const res = await app.request('/api/v1/courier/day', { headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    // Rol kapıyı açar, kimliği DEĞİŞTİRMEZ: kapı yine yalnız `courier_id` = o kişi olan siparişleri
    // döndürüyor, yani yöneticinin listesi kuryenin durağını içermiyor.
    expect((await dataOf<CourierDayResponse>(res)).stops.map((stop) => stop.orderId)).not.toContain(orderId);
  });
});

describe('GET /api/v1/courier/day', () => {
  it('kuryenin kendi durakları + gün; başka kuryenin durağı yok', async () => {
    const benim = await dispatched({ qty: 3, totalCents: 3000 });
    const baskasinin = await dispatched({ courier: otherCourierId });

    const res = await asCourier('/api/v1/courier/day');
    expect(res.status).toBe(200);

    const day = await dataOf<CourierDayResponse>(res);
    expect(day.date).toBe(today);

    const ids = day.stops.map((stop) => stop.orderId);
    expect(ids).toContain(benim);
    expect(ids).not.toContain(baskasinin);

    const stop = day.stops.find((s) => s.orderId === benim)!;
    expect(stop.address).toBe('12 rue des Fleurs, 67000, Strasbourg');
    expect(stop.payment).toEqual({ dueAmountCents: 3000, expectedMethod: 'cash' });
    expect(stop.outcome).toBe('pending');
    // Kuryenin gördüğü tek para tahsil edeceği tutardır — maliyet/kâr sözleşmede YOK (tasarım §6).
    expect(JSON.stringify(stop)).not.toContain('purchasePrice');
  });

  it('`date` verilince o günün rotası gelir', async () => {
    const yarin = await dispatched({ date: dayOffset(3) });

    const bugun = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
    expect(bugun.stops.map((s) => s.orderId)).not.toContain(yarin);

    const res = await asCourier(`/api/v1/courier/day?date=${dayOffset(3)}`);
    const gun = await dataOf<CourierDayResponse>(res);
    expect(gun.date).toBe(dayOffset(3));
    expect(gun.stops.map((s) => s.orderId)).toContain(yarin);
  });

  it('bozuk gün anahtarı 400 — SQL\'e inip 500 üretmez', async () => {
    const res = await asCourier('/api/v1/courier/day?date=dun');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_query' });
  });
});

describe('POST /api/v1/courier/stops/:orderId/deliver', () => {
  it('mutlu yol: teslim + kapıda tahsilat tek istekte', async () => {
    const orderId = await dispatched({ qty: 2, totalCents: 2000 });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
    });
    expect(res.status).toBe(200);

    const outcome = await dataOf<ConfirmDoorDeliveryResponse>(res);
    expect(outcome).toMatchObject({
      status: 'ok',
      collectedCents: 2000,
      amountDueCents: 0,
      paymentStatus: 'paid',
      cashLimitExceeded: false,
      adjustedLines: 0,
    });

    // Taşıma "oldu" demiyor, gerçek değişti: sipariş teslim, mal fiiliden düştü, para defterde.
    expect((await orders.getById(orderId))?.status).toBe('delivered');
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(18);
    const movements = await new MoneyMovementService(db).listByOrder(orderId);
    expect(movements.filter((m) => m.type === 'order_payment')).toHaveLength(1);
  });

  it('AYNI istek tekrar gelirse `stale` — ve bu bir HATA değil, 200 ile GÖRÜNÜR cevap', async () => {
    const orderId = await dispatched();
    await post(`/api/v1/courier/stops/${orderId}/deliver`, {});

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {});
    // Doc 04 omurgası: "bayat geçiş reddi GÖRÜNÜR olmalı — app bu reddi YUTMAZ". Bir HTTP koduna
    // indirgenseydi `currentStatus` kaybolurdu ve ekran "neden olmadı"yı söyleyemezdi.
    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toEqual({ status: 'stale', currentStatus: 'delivered' });
  });

  it('başka kuryenin durağı bu jetonla kapatılamaz', async () => {
    const orderId = await dispatched({ courier: otherCourierId });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {});

    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toEqual({ status: 'forbidden', reason: 'not_assigned' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('B2B kanalında kanıt yoksa `proof_required` — ve HİÇBİR yazım yapılmaz', async () => {
    const orderId = await dispatched({ channel: 'b2b' });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
    });

    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toEqual({ status: 'proof_required', channel: 'b2b' });
    // Kapı SIRAsının sözü: kanıt kapısı yazımdan önce. Sipariş hâlâ yolda, para yazılmadı.
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
    expect(await new MoneyMovementService(db).listByOrder(orderId)).toHaveLength(0);
  });

  it('`idempotencyKey` aynıysa para İKİNCİ kez yazılmaz — `collectionDeduped`', async () => {
    // **Kurulum bilinçli:** uçtan aynı isteği iki kez göndermek `deduped` ÜRETMEZ, `stale` üretir —
    // mükerrer yazımın birinci kilidi durum makinesidir (`delivery.ts` künyesi) ve o kilit yukarıda
    // ayrıca sınandı. Anahtar İKİNCİ kilittir; devreye ancak para yazılmışken teslim yazılmamışsa
    // girer. Test tam o hâli kuruyor: hareket önceden yazılı, sipariş hâlâ yolda.
    const orderId = await dispatched({ totalCents: 2000 });
    const key = `kuyruk-${stamp}`;
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, description: 'Kapıda tahsilat', idempotencyKey: key });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId, idempotencyKey: key },
    });

    expect(res.status).toBe(200);
    const outcome = await dataOf<ConfirmDoorDeliveryResponse>(res);
    expect(outcome).toMatchObject({ status: 'ok', collectionDeduped: true, paymentStatus: 'paid' });
    // Asıl iddia: para TEK kez yazıldı — kuyruk yeniden-denemesi kasayı iki kez şişirmedi.
    const movements = await new MoneyMovementService(db).listByOrder(orderId);
    expect(movements.filter((m) => m.type === 'order_payment')).toHaveLength(1);
  });

  it('uuid olmayan durak kimliği 400', async () => {
    const res = await post('/api/v1/courier/stops/durak-1/deliver', {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_order_id' });
  });
});

describe('POST /api/v1/courier/stops/:orderId/undelivered', () => {
  it('NOT ZORUNLU: notsuz istek 400 note_required', async () => {
    const orderId = await dispatched();

    const res = await post(`/api/v1/courier/stops/${orderId}/undelivered`, { outcome: 'unreachable' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'note_required' });
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('boşluktan ibaret not da geçmez', async () => {
    const orderId = await dispatched();
    const res = await post(`/api/v1/courier/stops/${orderId}/undelivered`, { outcome: 'unreachable', note: '   ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'note_required' });
  });

  it('ulaşılamadı: sipariş `ready`e döner ve NOT durum kaydına düşer', async () => {
    const orderId = await dispatched();

    const res = await post(`/api/v1/courier/stops/${orderId}/undelivered`, { outcome: 'unreachable', note: 'zil bozuk' });

    expect(res.status).toBe(200);
    expect(await dataOf<MarkUndeliveredResponse>(res)).toEqual({
      status: 'ok',
      outcome: 'unreachable',
      currentStatus: 'ready',
    });

    // Kuryenin kapıda girdiği TEK serbest bilgi bir yere düşmeli — yoksa ekran "sebep yok" gösterir
    // ve sebep gerçekten yok olur (düzeltme 95428fb).
    const { data } = await db.from('order_status_log').select('note,to_status').eq('order_id', orderId);
    expect((data ?? []).some((row) => row.to_status === 'ready' && row.note === 'zil bozuk')).toBe(true);

    // Ulaşılamayan durak listede KALIR ve deneme sayısıyla görünür.
    const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
    const stop = day.stops.find((s) => s.orderId === orderId)!;
    expect(stop.outcome).toBe('unreachable');
    expect(stop.attempts).toBe(1);
  });

  it('reddedildi: sipariş `returned` olur — iki sonucun akıbeti AYRI', async () => {
    const orderId = await dispatched();

    const res = await post(`/api/v1/courier/stops/${orderId}/undelivered`, {
      outcome: 'refused',
      note: 'müşteri kabul etmedi',
    });

    expect(await dataOf<MarkUndeliveredResponse>(res)).toEqual({
      status: 'ok',
      outcome: 'refused',
      currentStatus: 'returned',
    });
  });

  it('tanınmayan sonuç değeri 400 (not dolu olsa bile)', async () => {
    const orderId = await dispatched();
    const res = await post(`/api/v1/courier/stops/${orderId}/undelivered`, { outcome: 'olmadi', note: 'zil bozuk' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });
});

describe('POST /api/v1/courier/stops/:orderId/proof-upload', () => {
  it('imzalı yükleme adresi + anahtarı SUNUCU seçer', async () => {
    const orderId = await dispatched();

    const res = await post(`/api/v1/courier/stops/${orderId}/proof-upload`, { filename: 'imza.png' });
    expect(res.status).toBe(200);

    const result = await dataOf<DeliveryProofUploadResponse>(res);
    if (!result.ok) throw new Error(`imzalı adres üretilemedi: ${result.reason}`);
    // Anahtar istemciden gelmiyor: siparişe çıpalı ve tek kullanımlık bir kimlik taşıyor.
    expect(result.key).toContain(orderId);
    expect(result.key.endsWith('.png')).toBe(true);
    expect(result.uploadUrl).toMatch(/^https?:\/\//);
  });

  it('desteklenmeyen dosya türü reddedilir', async () => {
    const orderId = await dispatched();
    const res = await post(`/api/v1/courier/stops/${orderId}/proof-upload`, { filename: 'kanit.pdf' });
    expect(await dataOf<DeliveryProofUploadResponse>(res)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it("başka kuryenin siparişi için izin ÜRETİLMEZ — 'yok' ile 'senin değil' aynı cevap", async () => {
    const orderId = await dispatched({ courier: otherCourierId });
    const res = await post(`/api/v1/courier/stops/${orderId}/proof-upload`, { filename: 'imza.png' });
    expect(await dataOf<DeliveryProofUploadResponse>(res)).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('gün kapanışı (K7)', () => {
  beforeEach(async () => {
    // Kapanış kaydı gün başına TEKİLDİR ve testler arasında yaşar — her test kendi gününü açık bulmalı.
    await mustDelete(db, 'courier_day_close', (q) => q.eq('courier_id', courierId));
  });

  it('taslak: teslim/bekleyen/dönen ayrı listeler + beklenen tahsilat', async () => {
    const teslim = await dispatched({ totalCents: 2000 });
    const bekleyen = await dispatched();
    const donen = await dispatched();

    await post(`/api/v1/courier/stops/${teslim}/deliver`, { collection: { method: 'cash', amountCents: 2000, accountId } });
    await post(`/api/v1/courier/stops/${bekleyen}/undelivered`, { outcome: 'unreachable', note: 'kimse yok' });
    await post(`/api/v1/courier/stops/${donen}/undelivered`, { outcome: 'refused', note: 'kabul etmedi' });

    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));

    expect(draft.date).toBe(today);
    expect(draft.closed).toBeNull();
    expect(draft.delivered.map((s) => s.orderId)).toEqual([teslim]);
    expect(draft.pending.map((s) => s.orderId)).toEqual([bekleyen]);
    expect(draft.returned.map((s) => s.orderId)).toEqual([donen]);
    // Beklenen tutar görünümden okunur; kapıda nakit tahsil edilen tek sipariş bu.
    expect(draft.expected).toEqual({ cashCents: 2000, cardCents: 0, chequeCents: 0 });
  });

  it('günü kapat: fark TÜRER ve işareti anlamlıdır', async () => {
    const teslim = await dispatched({ totalCents: 2000 });
    await post(`/api/v1/courier/stops/${teslim}/deliver`, { collection: { method: 'cash', amountCents: 2000, accountId } });

    const res = await post('/api/v1/courier/day-close', { date: today, countedCashCents: 1900, note: '1 € eksik çıktı' });
    expect(res.status).toBe(200);

    const result = await dataOf<CourierDayCloseResult>(res);
    expect(result.ok).toBe(true);
    expect(result.expectedCashCents).toBe(2000);
    expect(result.countedCashCents).toBe(1900);
    // Eksi = eksik teslim. Mutlak değere indirilmez; iki yön de açıklanmayı hak eder.
    expect(result.differenceCashCents).toBe(-100);
    expect(result.reconciled).toBe(false);
    expect(result.deliveredCount).toBe(1);

    // Kapanmış gün SALT-OKUNUR: taslak artık kaydı taşıyor ve ekran onu öyle çizer.
    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));
    expect(draft.closed?.countedCashCents).toBe(1900);
    expect(draft.closed?.note).toBe('1 € eksik çıktı');
  });

  it('ikinci kapanış EZMEZ: `already_closed` — hata değil, 200 ile alan cevabı', async () => {
    await post('/api/v1/courier/day-close', { date: today, countedCashCents: 0 });

    const res = await post('/api/v1/courier/day-close', { date: today, countedCashCents: 9999 });

    expect(res.status).toBe(200);
    const result = await dataOf<CourierDayCloseResult>(res);
    expect(result).toMatchObject({ ok: false, reason: 'already_closed' });
    // Ezilmediğinin kanıtı kaydın kendisi: ikinci çağrının sayımı yazılmadı.
    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));
    expect(draft.closed?.countedCashCents).toBe(0);
  });

  it('bozuk gün anahtarıyla kapanış 400', async () => {
    const res = await post('/api/v1/courier/day-close', { date: 'bugun' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });
});
