import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  AddressService,
  anonDb,
  CategoryService,
  DeliveryZoneService,
  MoneyMovementService,
  OrderBoxService,
  OrderService,
  ProductService,
  ReservationService,
  serviceDb,
  StockService,
  UserProfileService,
  VariantBarcodeService,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock, settingsSnapshot } from '@lezzet/database/testing';
import { loadBox, openBox, recordOrderPayment, sealBox } from '@lezzet/application';
// Beklenen şekiller ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME
// kırılır (katalog testinin kararı). Kurye sözleşmelerinin ilk tüketicisi de budur.
import type {
  CloseDeliveryRunResult,
  ConfirmDoorDeliveryResponse,
  CourierDayResponse,
  CourierVanStockMoveResponse,
  CourierVanStockResponse,
  DayCloseDraftContract,
  DeliveryProofUploadResponse,
  MarkUndeliveredResponse,
  OrderStatus,
  StartCourierDayResponse,
} from '@lezzet/types';
import { app } from '../../app';

/**
 * Kurye uçları uçtan uca, port açmadan: kapının kararı gövdeye bozulmadan çıkıyor mu, kimlik jetondan mı geliyor, rolsüz
 * kişi dönüyor mu. Zemin dosyanın kendi damgalı satırlarıdır, küresel sayıya bakan iddia yoktur.
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
/** Testin kendi ROTASI — sefer (`delivery_run`) rota+gün ikilisiyle doğar, rotasız başlatılamaz. */
let zoneId = '';
/* İkinci rota: sefer başlatan kurye rotanın o günkü bütün siparişlerini alır, "başka kuryenin durağı" aynı rotada duramaz. */
let otherZoneId = '';
let addressId = '';
let accountId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let stockId = '';
/**
 * Araç deposu ve aracı: van-stock uçlarının bağlamı bunlardan çözülür. Varsayılan sefer yardımcıları aracı geçmez,
 * araçsız sefer de meşru bir hâldir.
 */
let vanWarehouseId = '';
let vanVehicleId = '';
/** Araca okutulacak GERÇEK barkod — kod → varyant çevirisi yalnız UÇTA yaşıyor, motorda değil. */
const vanBarcode = `VANAPI${stamp}`;

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
 * Auth kullanıcısı, rolleri yazılmış profil ve açık oturum. Roller açıkça yazılır, çünkü trigger ilk kullanıcıya `admin`
 * verir; kurye de veritabanı kısıtı gereği en az bir depo ister.
 */
async function signedInUser(label: string, roles: ('customer' | 'courier' | 'admin')[], warehouseIds: string[] = []) {
  const email = `courier-api-${label}-${stamp}@example.test`;
  const password = randomUUID();
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
 * Siparişi durum durum ilerletir; paket testkit'i dışa açık olmadığı için yerel karşılığıdır. Yol sabittir, yanlış
 * yazılırsa RPC `ok:false` döner.
 */
async function advance(orderId: string, path: readonly OrderStatus[]): Promise<void> {
  for (const to of path) {
    const order = await orders.getById(orderId);
    if (!order) throw new Error(`advance: sipariş yok (${orderId})`);
    const result = await orders.transition({ orderId, from: order.status, to });
    if (!result.ok) throw new Error(`advance: ${order.status} → ${to} yazılamadı (şu an ${result.currentStatus})`);
  }
}

/**
 * Yola çıkmış sipariş — kuryenin gün listesine düşmesi için gereken en kısa yol (emsal:
 * `courier/day.test.ts`). `upTo` gün başlatma ucunun üç adayını kurar (yolda · hazır ·
 * hazırlanmamış); verilmeyen her çağrı eskisi gibi `out_for_delivery`e kadar gider.
 */
async function dispatched(
  opts: {
    courier?: string;
    qty?: number;
    orderedTotalCents?: number;
    date?: string;
    channel?: 'b2b' | 'b2c';
    upTo?: 'confirmed' | 'ready';
    zone?: string;
  } = {},
): Promise<string> {
  const qty = opts.qty ?? 2;
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId,
      channel: opts.channel ?? 'b2c',
      deliveryType: 'route',
      deliveryDate: opts.date ?? today,
      // Sipariş ROTAYA yazılıyor: `start_delivery_run` durakları `(rota, gün, route)` üçlüsüyle
      // claim ediyor — rotası olmayan sipariş sefere hiç bağlanmaz ve kapanışta görünmez.
      deliveryZoneId: opts.zone ?? zoneId,
      courierId: opts.courier ?? courierId,
      addressId,
      addressSnapshot: { line1: '12 rue des Fleurs', postalCode: '67000', city: 'Strasbourg' },
      paymentMethod: 'cash',
      orderedTotalCents: opts.orderedTotalCents ?? qty * 1000,
    },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });

  // Hazırlığı ATLANMIŞ sipariş: parti kaydı yok — gün başlatmanın "aday değil" dediği hâl.
  if (opts.upTo === 'confirmed') {
    await advance(order.id, ['confirmed']);
    return order.id;
  }

  /* Hazırlık kutuyla yapılır, mühür siparişi hazır yapar; kutu araca da bindirilir, çünkü yükleme siparişi yola çıkarmaz ve `out_for_delivery` istendiğinde geçiş ayrıca yazılır. */
  await advance(order.id, ['confirmed', 'preparing']);
  const box = await openBox(db, { orderId: order.id, warehouseId });
  if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
  const sealed = await sealBox(db, {
    boxId: box.box.boxId,
    warehouseId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
  });
  if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);
  const loaded = await loadBox(db, { code: box.box.code, courierId: opts.courier ?? courierId });
  if (loaded.status !== 'ok') throw new Error(`fikstür: kutu araca alınamadı (${loaded.status})`);
  if (opts.upTo !== 'ready') await advance(order.id, ['out_for_delivery']);
  return order.id;
}

/** Durağın kutu kodu kayıttan okunur; kapıda okutma zorunlu. */
async function boxCodeOf(orderId: string): Promise<string> {
  const [box] = await new OrderBoxService(db).listByOrder(orderId);
  if (!box) throw new Error('fikstür: siparişin kutusu yok');
  return box.code;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'KAPI' })).id;

  /*
    Rota fikstürün zeminindedir: sefer `(rota, gün)` ikilisiyle doğar ve deposu rotadan alınır, rotasız kurulumda "seferi başlat" denenemez.
    `weekdays` yedi günü de içerir, çünkü sınanan şey taşımadır, takvim değil.
  */
  zoneId = (
    await new DeliveryZoneService(db).insert({
      name: `Kurye API rotası ${stamp}`,
      warehouseId,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    })
  ).id;
  otherZoneId = (
    await new DeliveryZoneService(db).insert({
      name: `Kurye API öteki rota ${stamp}`,
      warehouseId,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    })
  ).id;

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
    // Alıcı ve telefon zorunlu; kurye kapıda ikisini de okur.
    await new AddressService(db).insert({
      customerId,
      recipient: 'Ali Şahin',
      phone: '+33655443322',
      line1: '12 rue des Fleurs',
      postalCode: '67000',
      city: 'Strasbourg',
    })
  ).id;
  accountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;

  /* Araç bir depodur (`kind='vehicle'`) ve `createTestWarehouse` araç kaydını kendisi açar; tesis olarak kurulsaydı `vanWarehouseIdOf` onu bulamaz ve zemin sessizce yanlış olurdu. */
  const van = await createTestWarehouse(db, { label: 'ARAC', kind: 'vehicle', homeWarehouseId: warehouseId });
  vanWarehouseId = van.id;
  vanVehicleId = van.vehicleId ?? '';
  if (vanVehicleId === '') throw new Error('araç deposu aracını taşımıyor — fikstür bozuk');

  /* Barkod ürünle birlikte düşüyor (`variant_barcode.variant_id … on delete cascade`), o yüzden
     teardown'a ayrı hedef eklenmedi. */
  await new VariantBarcodeService(db).insert({ variantId, code: vanBarcode });
});

beforeEach(async () => {
  /*
    Her test kendi siparişlerini kurar, çünkü gün listesi ve kapanış taslağı günün tamamını okur.
    Silme hatayı gösterir ve sıra zorunludur: `purgeVariantStock` partinin hareketlerini toplayıp siparişi de serbest bırakır; sessiz silme çift sayıma yol açıyordu.
  */
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  // SEFER de testler arasında YAŞAR ve rota+gün başına TEKtir (0046 `delivery_run_key`): önceki
  // testin açtığı sefer silinmezse sonraki test `already_started` alır ve iddia yanlış sebeple
  // kırılır. Sipariş silmesinden SONRA: `order.delivery_run_id` `set null` olduğu için sıra
  // zorunlu değil, ama sefer satırı boşalmış olsun.
  await resetRuns();
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Kapanış, sipariş, rezervasyon, adres, sefer ve rota ayrıca silinmez: hepsi `purgeTestData`'nın bildiği bağlar,
  // boş kimlikle elle silme kurulum yarıda kalınca fırlatırdı.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    accountIds: [accountId],
    // Araç deposu da buradan gider; purge aracın kaydını da toplar.
    warehouseIds: [warehouseId, vanWarehouseId],
  });
});

/**
 * Testin rotasında açılmış seferleri toplar (kapanış seferi `restrict` ile tuttuğu için sıra sabit). Süzgeç rota,
 * çünkü başka bir ajanın aynı kuryeyle açtığı sefer bu dosyanın işi değil.
 */
async function resetRuns(): Promise<void> {
  const { data, error } = await db.from('delivery_run').select('id').eq('delivery_zone_id', zoneId);
  if (error) throw new Error(`sefer satırları okunamadı: ${error.message}`);
  const runIds = (data ?? []).map((row) => row.id as string);
  if (runIds.length === 0) return;

  await mustDelete(db, 'delivery_run_close', (q) => q.in('delivery_run_id', runIds));
  await mustDelete(db, 'delivery_run', (q) => q.in('id', runIds));
}

/**
 * Seferi başlatır ve künyesini döndürür. `zoneId` her çağrıda geçilir, paylaşılan veritabanındaki başka rotalar
 * `route_required` doğurmasın; ret dalları sebebiyle hataya çevrilir.
 */
async function startRun(body: Record<string, unknown> = {}): Promise<Extract<StartCourierDayResponse, { status: 'ok' }>> {
  const result = await dataOf<StartCourierDayResponse>(await post('/api/v1/courier/day/start', { zoneId, ...body }));
  if (result.status !== 'ok') throw new Error(`sefer başlatılamadı: ${result.status}`);
  return result;
}

/**
 * Seferi kurar, yola çıkarmaz: aynı anda tek sefer sürülür, ama araçta birden çok sefer taşınabilir.
 */
async function openRun(body: Record<string, unknown> = {}): Promise<Extract<StartCourierDayResponse, { status: 'ok' }>> {
  const result = await dataOf<StartCourierDayResponse>(
    await post('/api/v1/courier/day/start', { zoneId, depart: false, ...body }),
  );
  if (result.status !== 'ok') throw new Error(`sefer kurulamadı: ${result.status}`);
  return result;
}

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
    const benim = await dispatched({ qty: 3, orderedTotalCents: 3000 });
    // Başka rotada, başka kuryede: bizim seferimiz onu claim edemez (RPC bölge+gün süzüyor).
    const baskasinin = await dispatched({ courier: otherCourierId, zone: otherZoneId });
    /* Duraklar sefere bağlıdır: sefer kurulmadan durak yoktur. */
    await startRun();

    const res = await asCourier('/api/v1/courier/day');
    expect(res.status).toBe(200);

    const day = await dataOf<CourierDayResponse>(res);
    expect(day.date).toBe(today);

    const ids = day.stops.map((stop) => stop.orderId);
    expect(ids).toContain(benim);
    expect(ids).not.toContain(baskasinin);

    const stop = day.stops.find((s) => s.orderId === benim)!;
    expect(stop.address).toBe('12 rue des Fleurs, 67000, Strasbourg');
    /* Bekleyen durakta kapıda tahsilat `null`. */
    expect(stop.payment).toEqual({ dueAmountCents: 3000, expectedMethod: 'cash', collectedAtDoorCents: null });
    expect(stop.outcome).toBe('pending');
    // Kuryenin gördüğü tek para tahsil edeceği tutardır — maliyet/kâr sözleşmede YOK (tasarım §6).
    expect(JSON.stringify(stop)).not.toContain('purchasePrice');
  });

  it('ARAÇTAKİ seferlerin durakları güne bakılmaksızın gelir — ileri günün seferi de araçta (31.08)', async () => {
    const bugunku = await dispatched();
    const ilerideki = await dispatched({ date: dayOffset(3) });
    /* İkisi de kurulur, biri sürülür: araç iki seferi taşır, kurye birini sürer. */
    const bugunSefer = await startRun();
    const ileriSefer = await openRun({ date: dayOffset(3) });

    const gun = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));

    /* Kullanıcının senaryosu: araç iki-üç günlük yola çıkıyor, rotalar tek günlük olduğu için
       yarının seferi de bugünden yükleniyor. Güne süzülseydi o kutular hiçbir ekranda görünmezdi. */
    expect(gun.runs.map((run) => run.runId).sort()).toEqual([bugunSefer.run.runId, ileriSefer.run.runId].sort());
    const ids = gun.stops.map((s) => s.orderId);
    expect(ids).toContain(bugunku);
    expect(ids).toContain(ilerideki);
    // Ve her durak hangi seferin olduğunu SÖYLÜYOR — liste sefere göre gruplanabiliyor.
    expect(gun.stops.find((s) => s.orderId === ilerideki)!.runId).toBe(ileriSefer.run.runId);
  });

  it('bozuk gün anahtarı 400 — SQL\'e inip 500 üretmez', async () => {
    const res = await asCourier('/api/v1/courier/day?date=dun');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_query' });
  });

  it('kapı kasası hesabı AYARDAN gelir — tahsilat kapısını açan tek değer (21.10d)', async () => {
    // Ayar KÜRESEL tekil satır: pencere kısa tutulur ve bulunan hâl geri konur (CLAUDE §4b).
    const settings = settingsSnapshot(db);
    await settings.override('door_cash_account_id', accountId);

    try {
      const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
      // Gün başına TEKİL: durak başına tekrarlanmıyor, çünkü ayar da tekil.
      expect(day.doorAccountId).toBe(accountId);
    } finally {
      await settings.restore();
    }
  });

  it('ayar boşsa `doorAccountId` null — istemci uydurma bir hesaba yazmasın', async () => {
    const settings = settingsSnapshot(db);
    await settings.remove('door_cash_account_id');

    try {
      const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
      expect(day.doorAccountId).toBeNull();
    } finally {
      await settings.restore();
    }
  });

  it('durak kalem satırlarını kimlik ve adetle taşır (21.10d)', async () => {
    const orderId = await dispatched({ qty: 3, orderedTotalCents: 3000 });
    await startRun(); // durak sefere bağlı

    const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
    const stop = day.stops.find((s) => s.orderId === orderId)!;

    expect(stop.items).toHaveLength(1);
    expect(stop.items[0]!.qty).toBe(3);
    expect(stop.items[0]!.name).toContain('Kayısılı Reçel');
    // Kimlik gerçek: siparişin kalem satırının kendisi (ekran onu `adjustments`a koyacak).
    const line = (await orders.getWithItems(orderId))!.items[0]!;
    expect(stop.items[0]!.orderItemId).toBe(line.id);
  });

  it('KALEM KİMLİĞİ ZİNCİRİ KAPANDI: gün cevabındaki satır kısmi iade olarak geri gönderilebilir', async () => {
    // Okunan kalem kimliği yazan uca aynen gider; kurye kapıda eksik kalemi ancak böyle gönderebilir.
    const orderId = await dispatched({ qty: 2, orderedTotalCents: 2000 });
    await startRun(); // durak sefere bağlı
    const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
    const item = day.stops.find((s) => s.orderId === orderId)!.items[0]!;

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      adjustments: [{ orderItemId: item.orderItemId, fulfilledQty: 1 }],
      scannedBoxCodes: [await boxCodeOf(orderId)],
    });

    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toMatchObject({ status: 'ok', adjustedLines: 1 });
    // Taşıma "oldu" demiyor, malın gerçeği değişti: iki adet ayrılmıştı, teslim edilen bir adet.
    expect((await orders.getWithItems(orderId))!.items[0]!.fulfilledQty).toBe(1);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(19);
  });

  it('kurye AKIBET yazamaz — gövdeye konsa bile kaleme geçmez (21.272)', async () => {
    /*
      Kapıdaki iki karar ayrı ellerdedir: adedi kurye söyler, akıbeti mal depoya dönünce depocu seçer; akıbet alanı kurye şemasından `omit` ile çıkarıldı.
      İddia "400 döner" değil "yazılmaz": şema bilinmeyen anahtarı düşürür ve kalemin `returnDisposition`ı boş kalmalı.
    */
    const orderId = await dispatched({ qty: 2, orderedTotalCents: 2000 });
    await startRun();
    const day = await dataOf<CourierDayResponse>(await asCourier('/api/v1/courier/day'));
    const item = day.stops.find((s) => s.orderId === orderId)!.items[0]!;

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      // Sözleşmede artık olmayan alan — kötü niyet değil, bayat bir istemcinin göndereceği şey.
      adjustments: [{ orderItemId: item.orderItemId, fulfilledQty: 1, returnDisposition: 'discard' }],
      scannedBoxCodes: [await boxCodeOf(orderId)],
    });

    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toMatchObject({ status: 'ok', adjustedLines: 1 });

    /* Adet yazıldı — kuryenin söylediği şey geçti. */
    const line = (await orders.getWithItems(orderId))!.items[0]!;
    expect(line.fulfilledQty).toBe(1);
    /* Akıbet YAZILMADI — kuryenin söylemediği şey geçmedi. Karar depocuda kaldı. */
    expect(line.returnDisposition).toBeNull();
  });
});

describe('POST /api/v1/courier/day/start — seferi başlat', () => {
  it('mutlu yol: seferin HAZIR durakları yola çıkar ve künye cevapta döner', async () => {
    const hazir = await dispatched({ upTo: 'ready' });

    const res = await post('/api/v1/courier/day/start', { zoneId });
    expect(res.status).toBe(200);

    const result = await dataOf<StartCourierDayResponse>(res);
    if (result.status !== 'ok') throw new Error(`sefer başlatılamadı: ${result.status}`);
    expect(result.date).toBe(today);
    expect(result.started).toContain(hazir);
    // Sefer kaydı gerçekten doğdu: ekranın "başladı" bayrağı sunucunun kaydıdır.
    expect(result.run.zoneId).toBe(zoneId);
    expect(result.run.referenceNo).toMatch(/^SF-/);
    // Uç "başladı" demiyor, durum gerçekten değişti — kapı sırasının şartı bu (teslim yalnız
    // yoldaki siparişten yazılır).
    expect((await orders.getById(hazir))?.status).toBe('out_for_delivery');
    // Sipariş sefere BAĞLANDI: kapanışın beklenen tahsilatı bu bağ üzerinden gruplanıyor.
    expect((await orders.getById(hazir))?.deliveryRunId).toBe(result.run.runId);
  });

  it('kısmi başarı GÖVDEDE ve 200: geçen, zaten yolda olan, hazır olmayan ayrı listelerde', async () => {
    const hazir = await dispatched({ upTo: 'ready' });
    const yolda = await dispatched();
    const hazirlanmamis = await dispatched({ upTo: 'confirmed' });

    const res = await post('/api/v1/courier/day/start', { zoneId });
    expect(res.status).toBe(200);

    const result = await dataOf<StartCourierDayResponse>(res);
    if (result.status !== 'ok') throw new Error(`sefer başlatılamadı: ${result.status}`);
    expect(result.started).toEqual([hazir]);
    // İkinci basış bir hata DEĞİL: "yapılacak yeni bir şey yok" cevabı.
    expect(result.alreadyOut).toEqual([yolda]);
    // Atlanan durak gizlenmiyor; sebebi o anki durumunun kendisi.
    expect(result.skipped).toEqual([{ orderId: hazirlanmamis, currentStatus: 'confirmed' }]);
    expect(result.stale).toEqual([]);
    expect((await orders.getById(hazirlanmamis))?.status).toBe('confirmed');
  });

  it('`date` verilince o günün seferi başlatılır', async () => {
    const yarin = await dispatched({ date: dayOffset(3), upTo: 'ready' });

    const bugun = await startRun();
    expect(bugun.started).not.toContain(yarin);

    /* Aynı rota, başka gün: kısıt gün bazlıdır, ikinci sefer açılabilir ama yola çıkmaz; ölçülen gün süzgecidir, hangi durak hangi sefere bağlanıyor. */
    const result = await openRun({ date: dayOffset(3) });
    expect(result.date).toBe(dayOffset(3));
    const { data: claimed } = await db.from('order').select('id').eq('delivery_run_id', result.run.runId);
    expect((claimed ?? []).map((row) => row.id as string)).toContain(yarin);
  });

  it('KURYE DEĞİL → 403; başkasının rotası bu uçtan başlatılamaz', async () => {
    const hazir = await dispatched({ upTo: 'ready' });

    const res = await app.request('/api/v1/courier/day/start', {
      method: 'POST',
      headers: { authorization: `Bearer ${outsiderToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ zoneId }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ data: null, error: 'forbidden' });
    // Rol kapısı yazımdan ÖNCE: sipariş kımıldamadı.
    expect((await orders.getById(hazir))?.status).toBe('ready');
  });

  it('bozuk gün anahtarı 400', async () => {
    const res = await post('/api/v1/courier/day/start', { date: 'bugun' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });
});

describe('POST /api/v1/courier/stops/:orderId/deliver', () => {
  it('mutlu yol: teslim + kapıda tahsilat tek istekte', async () => {
    const orderId = await dispatched({ qty: 2, orderedTotalCents: 2000 });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
      scannedBoxCodes: [await boxCodeOf(orderId)],
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

    // Sipariş teslim edildi ve tahsilat tamamlandığı için kapandı; mal fiiliden düştü, para defterde.
    expect((await orders.getById(orderId))?.status).toBe('completed');
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(18);
    const movements = await new MoneyMovementService(db).listByOrder(orderId);
    expect(movements.filter((m) => m.type === 'order_payment')).toHaveLength(1);
  });

  it('AYNI istek tekrar gelirse `stale` — ve bu bir HATA değil, 200 ile GÖRÜNÜR cevap', async () => {
    const orderId = await dispatched();
    /* Kutu kapısı `stale`den önce gelir; okutma olmadan ikinci istek `boxes_missing` alır ve bayat geçiş ölçülemezdi. */
    const codes = [await boxCodeOf(orderId)];
    await post(`/api/v1/courier/stops/${orderId}/deliver`, { scannedBoxCodes: codes });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, { scannedBoxCodes: codes });
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

  it('kanıt kapsamı AÇIKKEN B2B kanalında kanıt yoksa `proof_required` — ve HİÇBİR yazım yapılmaz', async () => {
    /* Fabrika değeri iki kanalda kapalı; test kapsamı kendisi açar ve `finally`de geri koyar (`settings` küresel tekil satır). */
    const settings = settingsSnapshot(db);
    await settings.override('delivery_proof_required', { b2b: true, b2c: false });
    try {
    const orderId = await dispatched({ channel: 'b2b' });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
      scannedBoxCodes: [await boxCodeOf(orderId)],
    });

    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmDoorDeliveryResponse>(res)).toEqual({ status: 'proof_required', channel: 'b2b' });
    // Kapı SIRAsının sözü: kanıt kapısı yazımdan önce. Sipariş hâlâ yolda, para yazılmadı.
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
    expect(await new MoneyMovementService(db).listByOrder(orderId)).toHaveLength(0);
    } finally {
      await settings.restore();
    }
  });

  it('`idempotencyKey` aynıysa para İKİNCİ kez yazılmaz — `collectionDeduped`', async () => {
    // Anahtar ikinci kilittir: para yazılmışken teslim yazılmamış hâlde devreye girer ve test tam o hâli kurar.
    // Aynı isteği iki kez göndermek `stale` üretir, çünkü birinci kilit durum makinesidir.
    const orderId = await dispatched({ orderedTotalCents: 2000 });
    const key = `kuyruk-${stamp}`;
    await recordOrderPayment(db, { orderId, accountId, amountCents: 2000, description: 'Kapıda tahsilat', idempotencyKey: key });

    const res = await post(`/api/v1/courier/stops/${orderId}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId, idempotencyKey: key },
      scannedBoxCodes: [await boxCodeOf(orderId)],
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
    await startRun(); // durak sefere bağlı — aşağıda gün listesinde aranıyor

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

/**
 * Kapanış seferi kapatır: duraklar önce sefere bağlanmalı, çünkü beklenen tahsilat ve kapanış fotoğrafı sefer
 * üzerinden gruplanır. Seferler `beforeEach`te toplanır.
 */
describe('sefer kapanışı (K7)', () => {
  it('taslak: teslim/bekleyen/dönen ayrı listeler + beklenen tahsilat', async () => {
    const teslim = await dispatched({ orderedTotalCents: 2000 });
    const bekleyen = await dispatched();
    const donen = await dispatched();
    // Üç durak da zaten yolda: sefer onları `alreadyOut` diye claim eder — araçtaki mal o seferindir.
    const run = await startRun();

    await post(`/api/v1/courier/stops/${teslim}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
      scannedBoxCodes: [await boxCodeOf(teslim)],
    });
    await post(`/api/v1/courier/stops/${bekleyen}/undelivered`, { outcome: 'unreachable', note: 'kimse yok' });
    await post(`/api/v1/courier/stops/${donen}/undelivered`, { outcome: 'refused', note: 'kabul etmedi' });

    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));

    expect(draft.date).toBe(today);
    // Taslağın ÖZNESİ görünür: ekran "Kuzey rotası · SF-26-…" künyesini buradan kuruyor.
    expect(draft.run?.runId).toBe(run.run.runId);
    expect(draft.closed).toBeNull();
    expect(draft.delivered.map((s) => s.orderId)).toEqual([teslim]);
    expect(draft.pending.map((s) => s.orderId)).toEqual([bekleyen]);
    expect(draft.returned.map((s) => s.orderId)).toEqual([donen]);
    // Beklenen tutar görünümden okunur; kapıda nakit tahsil edilen tek sipariş bu.
    expect(draft.expected).toEqual({ cashCents: 2000, cardCents: 0 });
  });

  it('seferi kapat: fark TÜRER ve işareti anlamlıdır', async () => {
    const teslim = await dispatched({ orderedTotalCents: 2000 });
    const run = await startRun();
    await post(`/api/v1/courier/stops/${teslim}/deliver`, {
      collection: { method: 'cash', amountCents: 2000, accountId },
      scannedBoxCodes: [await boxCodeOf(teslim)],
    });

    const res = await post('/api/v1/courier/day-close', {
      runId: run.run.runId,
      countedCashCents: 1900,
      note: '1 € eksik çıktı',
    });
    expect(res.status).toBe(200);

    const result = await dataOf<CloseDeliveryRunResult>(res);
    expect(result.ok).toBe(true);
    expect(result.runId).toBe(run.run.runId);
    expect(result.expectedCashCents).toBe(2000);
    expect(result.countedCashCents).toBe(1900);
    // Eksi = eksik teslim. Mutlak değere indirilmez; iki yön de açıklanmayı hak eder.
    expect(result.differenceCashCents).toBe(-100);
    expect(result.reconciled).toBe(false);
    expect(result.deliveredCount).toBe(1);

    // Kapanmış sefer SALT-OKUNUR: taslak artık kaydı taşıyor ve ekran onu öyle çizer.
    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));
    expect(draft.closed?.countedCashCents).toBe(1900);
    expect(draft.closed?.note).toBe('1 € eksik çıktı');
  });

  it('ikinci kapanış EZMEZ: `already_closed` — hata değil, 200 ile alan cevabı', async () => {
    const run = await startRun();
    await post('/api/v1/courier/day-close', { runId: run.run.runId, countedCashCents: 0 });

    const res = await post('/api/v1/courier/day-close', { runId: run.run.runId, countedCashCents: 9999 });

    expect(res.status).toBe(200);
    const result = await dataOf<CloseDeliveryRunResult>(res);
    expect(result).toMatchObject({ ok: false, reason: 'already_closed' });
    // Ezilmediğinin kanıtı kaydın kendisi: ikinci çağrının sayımı yazılmadı.
    const draft = await dataOf<DayCloseDraftContract>(await asCourier('/api/v1/courier/day-close'));
    expect(draft.closed?.countedCashCents).toBe(0);
  });

  it('bozuk sefer kimliğiyle kapanış 400 — RPC\'ye inip 500 üretmez', async () => {
    // Eski hâli "bozuk GÜN anahtarı"ydı; öznenin sefere inmesiyle kapının süzdüğü değer de değişti.
    // Kimliksiz gövde de aynı kapıdan döner: `runId` artık zorunlu.
    expect((await post('/api/v1/courier/day-close', { runId: 'sefer-1' })).status).toBe(400);

    const res = await post('/api/v1/courier/day-close', { countedCashCents: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });
});

/**
 * Araç stoğu uçları: motor ve ekran testleri HTTP katmanının üstünden atlar; yetki kapısı, gövde çözümü, alanın argümana
 * bağlanması ve cevap zarfı yalnız burada ölçülür.
 */
describe('araç stoğu uçları (21.278)', () => {
  /** Araçlı sefer — van-stock bağlamı ancak SÜRÜLEN ve ARACI OLAN seferden çözülüyor. */
  async function vanRun(): Promise<void> {
    await startRun({ vehicleId: vanVehicleId });
  }

  /** Araca mal koyar ve cevabı doğrular: kurulumun kendisi de bir iddiadır, sessizce düşen kurulum yanlış sebep gösterirdi. */
  async function araca(targetQty: number, observedQty: number): Promise<CourierVanStockMoveResponse> {
    const sonuc = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/set', { variantId, targetQty, observedQty }),
    );
    if (sonuc.status !== 'ok') throw new Error(`araca yazılamadı: ${sonuc.status}`);
    return sonuc;
  }

  it('rolsüz kullanıcı dört yolun DÖRDÜNDEN de döner — kapı uçların üstünde', async () => {
    const asOutsider = (path: string, method: 'GET' | 'POST') =>
      app.request(path, {
        method,
        headers: { authorization: `Bearer ${outsiderToken}`, 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });

    const yollar: [string, 'GET' | 'POST'][] = [
      ['/api/v1/courier/van-stock', 'GET'],
      ['/api/v1/courier/van-stock?q=reçel', 'GET'],
      ['/api/v1/courier/van-stock/set', 'POST'],
      ['/api/v1/courier/van-stock/scan', 'POST'],
    ];
    for (const [path, method] of yollar) {
      const res = await asOutsider(path, method);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it('bozuk gövde MOTORA HİÇ ULAŞMADAN 400 döner — doğrulama uçta', async () => {
    /* `invalid_body` yalnız bu katmanda doğuyor: motor bu gövdeyi hiç görmüyor, ekran ise onu hiç
       üretmiyor. Yani kırılırsa başka hiçbir test söylemez. */
    const eksikHedef = await post('/api/v1/courier/van-stock/set', { variantId });
    expect(eksikHedef.status).toBe(400);
    expect(await eksikHedef.json()).toEqual({ data: null, error: 'invalid_body' });

    const bozukKimlik = await post('/api/v1/courier/van-stock/set', { variantId: 'varyant-1', targetQty: 2 });
    expect(bozukKimlik.status).toBe(400);

    const kodsuz = await post('/api/v1/courier/van-stock/scan', {});
    expect(kodsuz.status).toBe(400);
    expect(await kodsuz.json()).toEqual({ data: null, error: 'invalid_body' });
  });

  it('ARAÇLI SEFERİ OLMAYAN kurye: liste boş künye döner, yazım `no_vehicle` ile reddedilir', async () => {
    /* Sefer YOK — bağlam çözümü (`courierVanContext`) uçta çağrılıyor ve iki uç aynı boşluğa iki
       AYRI cevap veriyor: okuma boş bir künye (ekran "araç yok" bloğunu çizsin), yazım adlandırılmış
       bir ret. İkisi de 200: bu bir hata değil, kuryenin meşru bir hâli. */
    const liste = await dataOf<CourierVanStockResponse>(await asCourier('/api/v1/courier/van-stock'));
    expect(liste).toEqual({ vehicleWarehouseId: null, onVan: [], candidates: [] });

    const yazim = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/set', { variantId, targetQty: 3, observedQty: 0 }),
    );
    expect(yazim).toEqual({ status: 'no_vehicle' });
  });

  it('gövdedeki `targetQty` motorun HEDEFİNE bağlanıyor — araç sayısı mutlak yazılıyor', async () => {
    /* Kablolamanın asıl iddiası: uç `targetQty`yi motorun `targetQty`sine geçirir; araçta 0 iken hedef 3 yazılınca fark +3 çıkmazsa bağlantı yanlıştır. */
    await vanRun();

    const ilk = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/set', { variantId, targetQty: 3, observedQty: 0 }),
    );
    expect(ilk).toMatchObject({ status: 'ok', variantId, delta: 3, vanQty: 3 });

    /* İkinci yazım AZALTIYOR: yön istemciden gelmiyor, sunucu ÖLÇEREK buluyor (`setVanQty` künyesi).
       Aynı uçtan hem alma hem devretme çıkması bu ucun var oluş sebebiydi. */
    const azalt = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/set', { variantId, targetQty: 1, observedQty: 3 }),
    );
    expect(azalt).toMatchObject({ status: 'ok', delta: -2, vanQty: 1 });
  });

  it('`observedQty` BAYATLIK KALKANI olarak motora ulaşıyor — yanlış taban yazım yapmıyor', async () => {
    /* `observedQty` zorunludur ve uçtan motora geçmelidir: motor onu kalkan olarak kullanır (taban uyuşmazsa `stale`), uç düşürseydi kalkan sessizce devre dışı kalırdı. */
    await vanRun();
    await araca(4, 0);

    /* Kurye ekranı 4 yerine 1 görüyor sanıyor (başka bir telefon araca mal koydu). */
    const bayat = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/set', { variantId, targetQty: 2, observedQty: 1 }),
    );
    expect(bayat).toMatchObject({ status: 'stale', variantId, vanQty: 4 });

    /* Ve gerçekten HİÇBİR ŞEY yazılmadı — reddin kanıtı cevabın kendisi değil, sayının durmasıdır. */
    const liste = await dataOf<CourierVanStockResponse>(await asCourier('/api/v1/courier/van-stock'));
    expect(liste.onVan.find((line) => line.variantId === variantId)?.qty).toBe(4);
  });

  it('okutma KODU VARYANTA ÇEVİRİYOR ve bir tane ekliyor; tanınmayan kod kendi dalıyla döner', async () => {
    /*
      Çeviri yalnız UÇTA: eşleme `variant_barcode`ta ve ne motor ne ekran oraya bakıyor
      (`VariantBarcodeService.findByCode` bu dosyanın ölçtüğü tek yerde çağrılıyor). Tanınmayan kodun
      SESSİZ GEÇMEMESİ de burada kanıtlanıyor — sessiz geçseydi kurye okuttuğunu sanır, mal araca
      hiç binmezdi.
    */
    await vanRun();

    const okutma = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/scan', { code: vanBarcode }),
    );
    expect(okutma).toMatchObject({ status: 'ok', variantId, delta: 1, vanQty: 1 });

    const taninmayan = await dataOf<CourierVanStockMoveResponse>(
      await post('/api/v1/courier/van-stock/scan', { code: `YOK-${stamp}` }),
    );
    expect(taninmayan).toEqual({ status: 'unknown_code' });
  });

  it('liste araçtakini ve depodaki adayları BİRLİKTE veriyor; `?q=` süzgeci uca ulaşıyor', async () => {
    /*
      Tek uçtan iki okuma (v3:19) — ayrı uç açılmadı, çünkü soru aynı: "depodan ne alabilirim".
      `?q=` sorgu dizesinden okunuyor ve yalnız burada; motorun `query` argümanına bağlandığını
      başka hiçbir test ölçmüyor.
    */
    await vanRun();
    await araca(2, 0);

    const liste = await dataOf<CourierVanStockResponse>(await asCourier('/api/v1/courier/van-stock'));
    expect(liste.vehicleWarehouseId).toBe(vanWarehouseId);
    expect(liste.onVan.map((line) => line.variantId)).toContain(variantId);
    expect(liste.candidates.map((row) => row.variantId)).toContain(variantId);

    /* Eşleşmeyen sorgu ADAYLARI boşaltır ama ARAÇTAKİNİ boşaltmaz: süzgeç depodan ne alınacağının
       sorusudur, araçta ne olduğunun değil. İkisi tek cevapta ama iki ayrı okuma. */
    const suzulmus = await dataOf<CourierVanStockResponse>(
      await asCourier(`/api/v1/courier/van-stock?q=hicboyleurunyok${stamp}`),
    );
    expect(suzulmus.candidates).toEqual([]);
    expect(suzulmus.onVan.map((line) => line.variantId)).toContain(variantId);
  });
});
