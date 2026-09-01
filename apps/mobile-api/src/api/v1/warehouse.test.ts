import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  anonDb,
  CategoryService,
  OrderService,
  ProductService,
  PurchaseOrderService,
  ReservationService,
  serviceDb,
  StockService,
  SupplierService,
  UserProfileService,
  WarehouseTransferService,
} from '@lezzet/database';
import { createTestWarehousePair, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { deliverOrder, dispatchTransfer } from '@lezzet/application';
// Beklenen şekiller ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME
// kırılır (katalog/kurye testlerinin kararı). Depo sözleşmelerinin ilk tüketicisi de budur.
import type {
  ConfirmPreparationResponse,
  DeclareShortResponse,
  IntakeFormResponse,
  OrderStatus,
  PendingIntakesResponse,
  PreparationQueueResponse,
  ReceiveGoodsResponse,
  ReceiveTransferResponse,
  RecordAdjustmentResponse,
  WarehouseReturnQueueResponse,
  WarehouseReturnResponse,
  WarehouseTransfersResponse,
} from '@lezzet/types';
import { app } from '../../app';

/**
 * Depo uçları uçtan uca (21.11) — `app.request()` ile PORT AÇMADAN (kurye/katalog testleriyle aynı desen).
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): zeminin TAMAMI bu dosyanın kendi damgalı satırlarıdır — İKİ
 * depo (kapsam iddiaları tek depoyla kurulamaz), bir kategori, bir ürün, bir müşteri, bir tedarikçi
 * ve üç oturum (depocu · rolsüz · yönetici). **Küresel sayıya bakan tek bir iddia yok:** kuyruk,
 * transfer listesi ve fark raporu hep kendi kimliklerimizle daraltılıyor — başka bir ajanın açtığı
 * sipariş bu dosyayı kızartamaz. Teardown `purgeTestData` + `mustDelete` ile toplanır.
 *
 * **Asıl sınanan şey taşımadır:** kapının kararı (`incomplete`, `forbidden/out_of_scope`, `failed`)
 * gövdeye BOZULMADAN çıkıyor mu, depo kimliği profilden mi geliyor, kapsam dışı yazım gerçekten
 * hiç yazmıyor mu. Kararların kendisi `packages/application`ın depo testlerinde sınandı; burada
 * tekrarlanmıyor.
 *
 * **Telefon damgası dosyaya özgü** (`07…`): `user_profiles.phone` benzersiz ve kurye testi `06…`
 * kullanıyor — aynı milisaniyede kurulan iki dosya birbirini kurulum anında düşürmesin.
 */
const stamp = Date.now();
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);
const transfers = new WarehouseTransferService(db);

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Depo rollü gerçek oturum — kimliğin JETONDAN geldiğini ancak gerçek bir token kanıtlar. */
let warehouseToken = '';
/** Depocunun PROFİL kimliği — düzeltme/geçiş kayıtlarının `actor_id`'si bunu bekler. */
let warehouseStaffId = '';
/** Rolsüz kullanıcı: kapının gerçekten kapalı olduğunu gösterir. */
let outsiderToken = '';
/** İKİ depoya bakan depocu — "kapsam tek değilse söylenmeli" kuralının öteki yarısı. */
let multiToken = '';
/** `admin` de geçer — ve depo-ÜSTÜ olduğu için KAPSAMSIZ (0031 kısıtı yalnız depocu/kuryeye bakar). */
let adminToken = '';

let warehouseId = '';
let otherWarehouseId = '';
let customerId = '';
let addressId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let supplierId = '';
/** Depocunun kendi partisi (her testte yeniden kurulur). */
let stockId = '';
/** BAŞKA deponun partisi — "kapsam dışı" iddialarının zemini. */
let foreignStockId = '';

const authUserIds: string[] = [];
const profileIds: string[] = [];

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir (kurye deseni). */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

/** Depocu jetonuyla okuma — başlığı her çağrıda elle kurmak testin okunurluğunu yiyordu. */
async function asStaff(path: string, token = warehouseToken): Promise<Response> {
  return app.request(path, { headers: { authorization: `Bearer ${token}` } });
}

async function post(path: string, body: unknown, token = warehouseToken): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Auth kullanıcısı + rolleri yazılmış profil + açık oturum.
 *
 * Roller AÇIKÇA yazılıyor, trigger'ın verdiğine güvenilmiyor: `0002` ilk kullanıcıya `admin`,
 * sonrakilere `customer` veriyor — yani "rolsüz kullanıcı" testi, yerel veritabanında hiç admin
 * yoksa sessizce ADMİN kullanıcısı üretir ve 403 iddiası yanlış sebeple kırılırdı.
 */
async function signedInUser(label: string, roles: ('customer' | 'warehouse' | 'admin')[], warehouseIds: string[] = []) {
  const email = `warehouse-api-${label}-${stamp}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles, warehouseIds, name: `Depo ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return { profileId: profile.id, token: session.session.access_token };
}

/**
 * Siparişi durum durum ilerletir — `application/src/order/advance.testkit.ts`in yerel karşılığı.
 *
 * Testkit ÇAĞRILAMIYOR: `@lezzet/application`ın `exports` haritası yalnız `"."` açıyor, yani
 * alt-yol import'u paket sınırında kapalı ve testkit `index.ts`ten dışa verilmiyor. Terfi ihtiyacı
 * (testkit'i dışa açmak) rapora yazıldı; o gün buradaki on satır silinir — kurye testinde de aynısı.
 */
async function advance(orderId: string, path: readonly OrderStatus[]): Promise<void> {
  for (const to of path) {
    const order = await orders.getById(orderId);
    if (!order) throw new Error(`advance: sipariş yok (${orderId})`);
    const result = await orders.transition({ orderId, from: order.status, to, actorId: warehouseStaffId });
    if (!result.ok) throw new Error(`advance: ${order.status} → ${to} yazılamadı (şu an ${result.currentStatus})`);
  }
}

/** Hazırlanmayı bekleyen sipariş — D1 kuyruğunun en kısa zemini. */
async function pendingOrder(opts: { warehouse?: string; qty?: number; date?: string } = {}) {
  const qty = opts.qty ?? 2;
  const warehouse = opts.warehouse ?? warehouseId;
  const { order, items } = await orders.create(
    {
      warehouseId: warehouse,
      customerId,
      channel: 'b2c',
      deliveryType: 'route',
      deliveryDate: opts.date ?? today,
      addressId,
      addressSnapshot: { line1: '3 rue du Dôme', postalCode: '67000', city: 'Strasbourg' },
      paymentMethod: 'cash',
      orderedTotalCents: qty * 1000,
    },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId: warehouse, variantId, qty });
  await advance(order.id, ['confirmed']);
  return { orderId: order.id, itemId: items[0]!.id, qty };
}

/** Hazırlanmış sipariş — parti kaydı var, yani D6'nın düzeltebileceği bir mal geçmişi var. */
async function preparedOrder(qty = 2) {
  const order = await pendingOrder({ qty });
  await advance(order.orderId, ['preparing']);
  await orders.recordPreparation(order.orderId, [{ orderItemId: order.itemId, batches: [{ stockId, qty }] }]);
  return order;
}

/** Kapıda reddedilip depoya dönen sipariş — mal FİİLİDEN DÜŞMEDİ (teslim olmadı). */
async function returnedOrder(qty = 2) {
  const order = await preparedOrder(qty);
  await advance(order.orderId, ['ready', 'out_for_delivery', 'returned']);
  return order;
}

/** Teslim edilmiş sipariş — mal fiiliden düştü; "stoğa dön" ancak burada bir anlam taşır. */
async function deliveredOrder(qty = 2) {
  const order = await preparedOrder(qty);
  await advance(order.orderId, ['ready', 'out_for_delivery']);
  const result = await deliverOrder(db, order.orderId, { actorId: warehouseStaffId });
  if (!result.ok) throw new Error(`teslim yazılamadı (şu an ${result.currentStatus})`);
  return order;
}

/** Tedarik siparişi — beklenen adet ve birim maliyetle (**cent**; admin girer, depocu görmez). */
async function draftPurchaseOrder(qty: number, unitPriceCents: number): Promise<string> {
  const { order } = await new PurchaseOrderService(db).createDraft(supplierId, [{ variantId, qty, unitPriceCents }]);
  return order.id;
}

beforeAll(async () => {
  const pair = await createTestWarehousePair(db);
  warehouseId = pair.primary.id;
  otherWarehouseId = pair.secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Depo API ${stamp}` } });
  categoryId = category.id;

  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Fıstıklı Baklava ${stamp}` },
    categoryId,
    // Raf ömrü 100 gün — MLOR uyarısı bunun yüzdesinden doğar.
    shelfLifeDays: 100,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({
    name: 'Restaurant Bosphore',
    phone: `07${String(stamp).slice(-8)}`,
    email: `depo-musteri-${stamp}@example.test`,
  });
  customerId = customer.id;
  profileIds.push(customer.id);

  const staff = await signedInUser('ayse', ['warehouse'], [warehouseId]);
  warehouseStaffId = staff.profileId;
  warehouseToken = staff.token;
  outsiderToken = (await signedInUser('musteri', ['customer'])).token;
  multiToken = (await signedInUser('gezici', ['warehouse'], [warehouseId, otherWarehouseId])).token;
  // Yönetici KAPSAMSIZ: depo-üstü olduğu için normal hâli budur ve "hangi depo" sorusunun cevabı
  // onda yok — uç bunu 403 ile değil 400 ile söylemeli (guard künyesi).
  adminToken = (await signedInUser('patron', ['admin'])).token;

  addressId = (
    // Alıcı ve telefon 22.08'de zorunlu oldu (kolonlar `not null`).
    await new AddressService(db).insert({
      customerId,
      recipient: 'Ayşe Yılmaz',
      phone: '+33612345678',
      line1: '3 rue du Dôme',
      postalCode: '67000',
      city: 'Strasbourg',
    })
  ).id;
  supplierId = (await new SupplierService(db).insert({ name: `Gaziantep Gıda ${stamp}` })).id;
});

beforeEach(async () => {
  /*
    Her test kendi zeminini kurar: kuyruk ve transfer listesi DEPONUN TAMAMINI okur, önceki testin
    bıraktığı sipariş sessizce sonraki testin sayımına girerdi.

    SIRA TERSİNE DÖNDÜ (27.08 · 06.14) VE BU ÖLÇÜLMÜŞ BİR ARIZANIN DÜZELTMESİ. Burada partiyi
    tutan bağlar elle ve TEK TEK siliniyordu; `stock_adjustment` tablosu kalkıp yerine defter
    (`stock_movement`) gelince o satır olmayan bir tabloyu silmeye başladı ve **dosyanın 49
    testini birden düşürdü** — zararı düşen testle de bitmiyordu: teardown patladığı için depo,
    parti ve sipariş satırları veritabanında kalıyor ve SONRAKİ dosyaların sayımlarını bozuyordu
    (ölçüm: `supplier-debt` 4000 beklerken 8000 gördü — aynı kabul iki kez sayıldı).

    Artık silme sırası tek yerde: `purgeVariantStock` partiyi tutan DÖRT bağı doğru sırayla
    topluyor (defter · kalem eşlemesi · sevk satırı iki uçtan · rezervasyon) ve o geçince sipariş
    de serbest kalıyor. Bu yüzden ÖNCE parti, SONRA sipariş — tersi çalışmaz (CLAUDE §4b: silme
    sırası `cleanup.ts`te durur, dosya kendi sırasını uydurmaz).
  */
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'warehouse_transfer', (q) => q.in('from_warehouse_id', [warehouseId, otherWarehouseId]));
  // Partiye çıpasız (yalnız varyanta bağlı) rezervasyon purge'ün kapsamında değil — o burada düşer.
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));

  stockId = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300, lotNumber: 'LOT-DEPO' })
  ).id;
  foreignStockId = (
    await stocks.insert({ warehouseId: otherWarehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(70), purchasePriceCents: 300 })
  ).id;
});

afterAll(async () => {
  // Transfer, sipariş, rezervasyon ve adres AYRICA silinmez: dördü de `purgeTestData`'nın bildiği
  // bağlar (transfer `warehouseIds`ten, sipariş `profileIds`ten, rezervasyon `productIds`ten, adres
  // profil cascade'inden). Buradaki `if (…)` korumaları doğru bir tehlikeyi görmüştü — kurulum
  // yarıda kalınca boş kimlikle silme "invalid input syntax for uuid" fırlatır — ama kalkanı yanlış
  // yere koyuyordu: doğru cevap silmeyi kimliğin BİLİNDİĞİ yere, purge'e bırakmak (`cleanup.ts`).
  const warehouses = [warehouseId, otherWarehouseId].filter(Boolean);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    profileIds,
    authUserIds,
    warehouseIds: warehouses,
  });
});

describe('kapı: Bearer + rol + DEPO KİMLİĞİ', () => {
  it('Bearer olmadan 401 — depo uçları oturumsuz gezilmez', async () => {
    const res = await app.request('/api/v1/warehouse/preparation');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });

  it('geçerli Bearer ama DEPOCU DEĞİL → 403 forbidden', async () => {
    const res = await asStaff('/api/v1/warehouse/preparation', outsiderToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ data: null, error: 'forbidden' });
  });

  it('KAPSAM DIŞI depo sorulursa 403 — depocu başka deponun işini göremez', async () => {
    const res = await asStaff(`/api/v1/warehouse/preparation?warehouseId=${otherWarehouseId}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ data: null, error: 'warehouse_out_of_scope' });
  });

  it('KAPSAMSIZ yönetici 403 DEĞİL 400 alır — kapı ona açık, eksik olan "hangi depo"', async () => {
    const res = await asStaff('/api/v1/warehouse/preparation', adminToken);
    expect(res.status).toBe(400);
    // Varsayılan depo YOKTUR (CLAUDE §1): belirsizliği bir depo seçerek kapatmak, sistemi sessizce
    // yanlış şehrin malına bakar hâle getirirdi.
    expect(await res.json()).toEqual({ data: null, error: 'warehouse_required' });
  });

  it('yönetici depoyu SEÇEREK girer — kapsamı yok ama depo-üstüdür', async () => {
    const { orderId } = await pendingOrder();

    const res = await asStaff(`/api/v1/warehouse/preparation?warehouseId=${warehouseId}`, adminToken);

    expect(res.status).toBe(200);
    expect((await dataOf<PreparationQueueResponse>(res)).orders.map((o) => o.orderId)).toContain(orderId);
  });

  it('yöneticinin verdiği depo GERÇEK olmalı — yanlış uuid boş kuyruk değil 404 döner', async () => {
    // Sessiz yalanın önlendiği yer burası: doğrulanmasaydı yazım hatası "bekleyen iş yok" derdi.
    const res = await asStaff('/api/v1/warehouse/preparation?warehouseId=00000000-0000-0000-0000-000000000000', adminToken);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'warehouse_not_found' });
  });

  it('İKİ depolu depocu da parametresiz giremez — belirsizlik bir depo seçerek kapatılmaz', async () => {
    const res = await asStaff('/api/v1/warehouse/preparation', multiToken);
    // Kapsamsız yöneticiyle AYNI anahtar: iki hâl farklı ama istemcinin çaresi bir — parametreyi gönder.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'warehouse_required' });
  });

  it('kapıyı açan şey ADMİNLİK değil KAPSAMDIR: iki depolu depocu ikincisini de görür', async () => {
    const { orderId } = await pendingOrder({ warehouse: otherWarehouseId });

    const res = await asStaff(`/api/v1/warehouse/preparation?warehouseId=${otherWarehouseId}`, multiToken);

    expect(res.status).toBe(200);
    expect((await dataOf<PreparationQueueResponse>(res)).orders.map((o) => o.orderId)).toContain(orderId);
  });

  it('uuid olmayan depo parametresi 400 — sorguya inmeden', async () => {
    const res = await asStaff('/api/v1/warehouse/preparation?warehouseId=depo-1');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_query' });
  });
});

describe('D1 · GET /api/v1/warehouse/preparation', () => {
  it('kuyruk kendi deposunun bekleyen siparişlerini verir; başka deponunki YOK', async () => {
    const benim = await pendingOrder({ qty: 3 });
    const baskasinin = await pendingOrder({ warehouse: otherWarehouseId });

    const res = await asStaff('/api/v1/warehouse/preparation');
    expect(res.status).toBe(200);

    const queue = await dataOf<PreparationQueueResponse>(res);
    // Gün SÜZGEÇTİR, varsayılan değil: parametresiz çağrıda süzgeç uygulanmadığı `null` ile söylenir.
    expect(queue.date).toBeNull();

    const ids = queue.orders.map((row) => row.orderId);
    expect(ids).toContain(benim.orderId);
    expect(ids).not.toContain(baskasinin.orderId);

    const order = queue.orders.find((row) => row.orderId === benim.orderId)!;
    expect(order.customerName).toBe('Restaurant Bosphore');
    expect(order.lineCount).toBe(1);
    expect(order.pickedLineCount).toBe(0);
    expect(order.lines[0]!.orderedQty).toBe(3);
    expect(order.lines[0]!.productName).toContain('Fıstıklı Baklava');
    // Motor önerisi geliyor: depocunun rafta arayacağı parti ve son tarihi.
    expect(order.lines[0]!.suggestion).toEqual([
      // Alan ADIYLA geliyor (19.29); bu partinin rafı seçilmemiş, yani `null` — meşru hâl.
      { stockId, qty: 3, expiryDate: dayOffset(60), areaName: null },
    ]);
    expect(order.lines[0]!.shortfallQty).toBe(0);
  });

  it('depo ekranına giden veride TUTAR yok (tasarımın altın kuralı)', async () => {
    await pendingOrder();

    const serialized = JSON.stringify(await dataOf<PreparationQueueResponse>(await asStaff('/api/v1/warehouse/preparation')));

    // İddia ALAN ADIYLA kurulur: rakam aramak uuid'ye takılır.
    for (const moneyKey of ['unitPrice', 'purchasePrice', 'orderedTotalCents', 'vatRate']) {
      expect(serialized).not.toContain(moneyKey);
    }
  });

  it('`date` verilince yalnız o günün işi gelir ve cevapta gün ZORUNLU döner', async () => {
    const bugun = await pendingOrder();
    const gelecek = await pendingOrder({ date: dayOffset(3) });

    const queue = await dataOf<PreparationQueueResponse>(await asStaff(`/api/v1/warehouse/preparation?date=${dayOffset(3)}`));

    expect(queue.date).toBe(dayOffset(3));
    const ids = queue.orders.map((row) => row.orderId);
    expect(ids).toContain(gelecek.orderId);
    expect(ids).not.toContain(bugun.orderId);
  });

  it('bozuk gün anahtarı 400 — SQL’e inip 500 üretmez', async () => {
    const res = await asStaff('/api/v1/warehouse/preparation?date=dun');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_query' });
  });
});

describe('D1 · POST /api/v1/warehouse/preparation/:orderId/confirm', () => {
  /*
    KUTUSUZ ONAY KAPANDI (kullanıcı kararı 30.08) — bu ucun eski üç testi (mutlu yol · eksik
    toplama · parti dağılımı) artık üretilemeyen bir hâli ölçüyordu: `confirmPreparation` `pickup`
    dışında her siparişe `box_required` diyor, hazırlık da yalnız kutu döngüsünden geçiyor.

    ÖLÇÜM KAYBOLMADI, YER DEĞİŞTİRDİ — üçünün konusu da `warehouse/boxes.test.ts`te duruyor:
    içerik + parti izi + HAZIR geçişi, çok kutulu birleşimde parti izinin korunması, ve eksik
    beyanının tavsiye üretmesi. Buraya kalan tek şey KAPININ kendisi.
  */
  it('rota siparişi de kutusuz onaylanmaz — `box_required`, ve HİÇBİR yazım yapılmaz', async () => {
    const order = await pendingOrder({ qty: 2 });

    const res = await post(`/api/v1/warehouse/preparation/${order.orderId}/confirm`, {
      picks: [{ orderItemId: order.itemId, batches: [{ stockId, qty: 2 }] }],
    });

    // Ret bir HTTP kodu değil, ekranın göstereceği CEVAP — kapsam kararının aynı deseni.
    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmPreparationResponse>(res)).toEqual({ status: 'box_required' });
    // Duvar yazımdan ÖNCE: sipariş hâlâ toplamada, hiçbir adet karşılanmış görünmüyor.
    expect((await orders.getById(order.orderId))?.status).toBe('confirmed');
    expect((await orders.getWithItems(order.orderId))!.items[0]!.fulfilledQty).toBe(0);
  });

  it('BAŞKA DEPONUN siparişi 200 + `out_of_scope` ile döner — ve hiçbir yazım yapılmaz', async () => {
    const order = await pendingOrder({ warehouse: otherWarehouseId });

    const res = await post(`/api/v1/warehouse/preparation/${order.orderId}/confirm`, {
      picks: [{ orderItemId: order.itemId, batches: [{ stockId: foreignStockId, qty: 2 }] }],
    });

    // Kapsam kararı bir HTTP kodu değil, ekranın göstereceği CEVAPTIR (rol kapısının 403'ünden ayrı).
    expect(res.status).toBe(200);
    expect(await dataOf<ConfirmPreparationResponse>(res)).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await orders.getWithItems(order.orderId))!.items[0]!.fulfilledQty).toBe(0);
  });

  it('olmayan sipariş `not_found`; uuid olmayan kimlik 400', async () => {
    const yok = await post('/api/v1/warehouse/preparation/00000000-0000-0000-0000-000000000000/confirm', { picks: [] });
    expect(await dataOf<ConfirmPreparationResponse>(yok)).toEqual({ status: 'not_found' });

    const bozuk = await post('/api/v1/warehouse/preparation/siparis-1/confirm', { picks: [] });
    expect(bozuk.status).toBe(400);
    expect(await bozuk.json()).toEqual({ data: null, error: 'invalid_order_id' });
  });
});

describe('D1 · POST /api/v1/warehouse/orders/:orderId/declare-short', () => {
  /*
    SİPARİŞİ EKSİK KAPAT (kullanıcı bulgusu 31.08) — kutuya HİÇ dokunmayan sipariş kararı.

    Beyan önce `sealBox`ın bir bayrağıydı ve depocunun gerçek anını karşılamıyordu: son kutu
    kapandıktan sonra mühürlenecek kutu YOKTUR, o yol `empty` döner ve düğme sessizce ölüdür
    (cihazda ölçüldü: iki kutu mühürlü, sipariş `preparing`de asılı). Burada ölçülen şey kapının
    kendisi — kapsam kararı, `ready` geçişi ve olmayan sipariş.
  */
  it('BAŞKA DEPONUN siparişi 200 + `out_of_scope` ile döner ve durum DEĞİŞMEZ', async () => {
    const order = await pendingOrder({ warehouse: otherWarehouseId });

    const res = await post(`/api/v1/warehouse/orders/${order.orderId}/declare-short`, {});

    expect(res.status).toBe(200);
    expect(await dataOf<DeclareShortResponse>(res)).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await orders.getById(order.orderId))?.status).toBe('confirmed');
  });

  it('olmayan sipariş `not_found`; uuid olmayan kimlik 400', async () => {
    const yok = await post('/api/v1/warehouse/orders/00000000-0000-0000-0000-000000000000/declare-short', {});
    expect(await dataOf<DeclareShortResponse>(yok)).toEqual({ status: 'not_found' });

    const bozuk = await post('/api/v1/warehouse/orders/siparis-1/declare-short', {});
    expect(bozuk.status).toBe(400);
    expect(await bozuk.json()).toEqual({ data: null, error: 'invalid_order_id' });
  });
});

describe('D2 · mal kabul', () => {
  it('form tedarik siparişinden DOLU gelir ve FİYAT taşımaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const form = await dataOf<IntakeFormResponse>(await asStaff(`/api/v1/warehouse/intake/${purchaseOrderId}`));

    expect(form.rows).toHaveLength(1);
    expect(form.rows[0]).toMatchObject({ variantId, expectedQty: 20, variantLabel: '1 kg' });
    /* Liste 21.160'ta dörtten sekize çıktı; dördü de tanıma/karar alanı (`sku` + `supplierCode`
       depocunun kâğıdıyla eşleştirme, `dateType` + `shelfLifeDays` satırın SKT alanı ve ömür
       uyarısı). "Fiyat yok" iddiası yine ALAN ADIYLA kuruluyor. Düzeltildi 30.08. */
    expect(Object.keys(form.rows[0]!).sort()).toEqual([
      // `caseSizes` (30.08) koli çarpanı, `lotCandidates` (21.175) depodaki parti kodları —
      // ikisi de tanıma/karar alanı, para değil. Liste onlarla birlikte ona çıktı.
      'caseSizes',
      'dateType',
      'expectedQty',
      'lotCandidates',
      'productName',
      'shelfLifeDays',
      'sku',
      'supplierCode',
      'variantId',
      'variantLabel',
    ]);
  });

  it('form KÜNYESİ referans + tedarikçi adı taşır — ekran başlığı yazılabilsin (21.11d)', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);
    await new PurchaseOrderService(db).markSent(purchaseOrderId, `TS-API-${stamp}`);

    const form = await dataOf<IntakeFormResponse>(await asStaff(`/api/v1/warehouse/intake/${purchaseOrderId}`));

    expect(form.purchaseOrder).toEqual({
      purchaseOrderId,
      referenceNo: `TS-API-${stamp}`,
      supplierName: `Gaziantep Gıda ${stamp}`,
    });
  });

  it('OLMAYAN sipariş: künye `null`, satırlar boş — ikisi ayrı şeydir', async () => {
    const form = await dataOf<IntakeFormResponse>(
      await asStaff('/api/v1/warehouse/intake/00000000-0000-0000-0000-000000000000'),
    );

    /* `mlorPercent` OLMAYAN siparişte de gelir ve gelmeli: MLOR eşiği bir AYARDIR, siparişin
       değil sistemin özelliği. Ekran satır yazılırken ömür uyarısını onunla hesaplıyor ve eşiği
       koda gömmek, ekranın söylediği kuralı sistemin kuralı olmaktan çıkarırdı. */
    expect(form).toEqual({ purchaseOrder: null, rows: [], mlorPercent: 75 });
  });

  it('BEKLEYEN SEVKİYAT listesi: gönderilmiş sipariş künyesi + kalem sayısıyla gelir', async () => {
    const purchaseOrderId = await draftPurchaseOrder(12, 600);
    await new PurchaseOrderService(db).markSent(purchaseOrderId, `TS-API-BEKLEYEN-${stamp}`);

    const body = await dataOf<PendingIntakesResponse>(await asStaff('/api/v1/warehouse/intake'));

    // Küresel sayıya BAKILMAZ: liste depo-üstüdür (satın alma K6), kendi kimliğimiz aranır.
    const mine = body.intakes.find((row) => row.purchaseOrderId === purchaseOrderId);
    expect(mine).toEqual({
      purchaseOrderId,
      referenceNo: `TS-API-BEKLEYEN-${stamp}`,
      supplierName: `Gaziantep Gıda ${stamp}`,
      lineCount: 1,
      // Sipariş DURUMU 21.160'ta eklendi: ekran "gönderildi" ile "kısmen geldi"yi ayrı rozetle
      // gösteriyor. Alan o turda eklenip test güncellenmedi — düzeltildi 30.08.
      status: 'sent',
    });
    // Depo ekranına giden listede TUTAR yok — kapı fiyatı okur ama taşımaz. İddiayı üstteki
    // `toEqual` KURUYOR: tam nesne eşitliği fazladan bir anahtarı da reddeder, yani fiyat alanı
    // eklenirse bu test kırılır. Burada eskiden ikinci bir tel vardı (`not.toContain('600')`) ve
    // ALT DİZE arıyordu; 19.08'de yalancı kırmızı üretti — rastgele `purchaseOrderId`in hex'i
    // (`…db4ba60054ff`) tesadüfen "600" içeriyordu. Yasak olan sayı değil FİYAT ALANI, onu da
    // şekil eşitliği söyler; damgalı `referenceNo` için her koşuda zar atan tel söküldü.
  });

  it('bekleyen listesi TASLAĞI göstermez — tedarikçi ondan habersiz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(5, 600);

    const body = await dataOf<PendingIntakesResponse>(await asStaff('/api/v1/warehouse/intake'));

    expect(body.intakes.some((row) => row.purchaseOrderId === purchaseOrderId)).toBe(false);
  });

  it('kabul yazılır ve maliyet PO’dan eşleşir — depocu fiyatı hiç görmeden', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const res = await post(`/api/v1/warehouse/intake/${purchaseOrderId}/receive`, {
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(90), lotNumber: 'LOT-1', location: 'Dolap A' }],
    });
    expect(res.status).toBe(200);

    const outcome = await dataOf<ReceiveGoodsResponse>(res);
    if (outcome.status !== 'ok') throw new Error(`kabul yazılmadı: ${outcome.status}`);
    expect(outcome.differences).toEqual([]);
    expect(outcome.warnings).toEqual([]);
    // Fiyat portu KAYITSIZ: `null` döner, sıfır DEĞİL (ölçülemeyen değer sıfır değildir).
    expect(outcome.repricedCount).toBeNull();

    const batch = await stocks.getById(outcome.result.stockIds[0]!);
    expect(batch?.purchasePriceCents).toBe(600); // depocunun hiç görmediği sayı
    expect(batch?.warehouseId).toBe(warehouseId);
    expect(batch?.lotNumber).toBe('LOT-1');
  });

  it('SKT ZORUNLU: tarihsiz satır 400 alır ve HİÇBİR parti doğmaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);
    const before = (await stocks.getAvailable(warehouseId, variantId)).physicalQty;

    const res = await post(`/api/v1/warehouse/intake/${purchaseOrderId}/receive`, {
      lines: [{ variantId, qty: 20 }],
    });

    // Kural ekranda değil ŞEMADA: `expiryDate` zorunlu alan, yani istek kapıya hiç ulaşmıyor.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(before);
  });

  it('eksik gelen mal FARK olarak döner — iş durmaz (parçalı kabul)', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const outcome = await dataOf<ReceiveGoodsResponse>(
      await post(`/api/v1/warehouse/intake/${purchaseOrderId}/receive`, {
        lines: [{ variantId, qty: 15, expiryDate: dayOffset(90) }],
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`kabul yazılmadı: ${outcome.status}`);
    expect(outcome.differences).toEqual([{ variantId, expectedQty: 20, receivedQty: 15 }]);
    // Fark bir UYARIDIR, engel değil: mal fiilen girdi.
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(35);
  });

  it('raf ömrü kısa parti UYARIR ama engellemez (MLOR)', async () => {
    const outcome = await dataOf<ReceiveGoodsResponse>(
      await post('/api/v1/warehouse/intake/receive', {
        supplierId,
        lines: [{ variantId, qty: 4, expiryDate: dayOffset(10) }],
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`kabul yazılmadı: ${outcome.status}`);
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]!.variantId).toBe(variantId);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(24);
  });

  it('PLANSIZ kabul: siparişsiz mal da girer, fark üretilmez', async () => {
    const outcome = await dataOf<ReceiveGoodsResponse>(
      await post('/api/v1/warehouse/intake/receive', {
        supplierId,
        lines: [{ variantId, qty: 5, expiryDate: dayOffset(90) }],
        note: 'kapıdan gelen ikram',
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`kabul yazılmadı: ${outcome.status}`);
    // Karşılaştırılacak bir beklenti yok: her satırı "beklenmedik mal" saymak anlamsız uyarı yığını olurdu.
    expect(outcome.differences).toEqual([]);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(25);
  });

  it('satırsız kabul yazım YAPMAZ — `empty`', async () => {
    const outcome = await dataOf<ReceiveGoodsResponse>(await post('/api/v1/warehouse/intake/receive', { supplierId, lines: [] }));
    expect(outcome).toEqual({ status: 'empty' });
  });
});

describe('D4 · POST /api/v1/warehouse/adjustments', () => {
  it('imha: `out` yönlü adet stoktan DÜŞER ve OLAY belgesi döner', async () => {
    const res = await post('/api/v1/warehouse/adjustments', {
      lines: [{ stockId, qty: 3, direction: 'out' }],
      reason: 'damaged',
      note: 'soğuk zincir kırıldı',
    });
    expect(res.status).toBe(200);

    const outcome = await dataOf<RecordAdjustmentResponse>(res);
    if (outcome.status !== 'ok') throw new Error(`düzeltme yazılmadı: ${JSON.stringify(outcome)}`);
    // Kâğıt tutanakla eşleşen numara — öneki motor seçer, numarayı DB üretir.
    expect(outcome.result.referenceNo).toMatch(/^IMH-/);
    expect((await stocks.getById(stockId))?.physicalQty).toBe(17);
  });

  /* YÖN AYRI ALANDA (06.14): eskiden bu satır `qty: -2` gönderiyordu — adet işaretliydi. Yön açık
     alana çıktı çünkü işaretin miktara gömülü olması rapor tarafında ölçülmüş bir arızaya yol
     açıyordu (girişlerle çıkışlar aynı toplamda eriyordu). Adet artık DAİMA pozitif ve sözleşme
     negatifi reddediyor (`z.number().int().positive()`). */
  it('`in` yönlü adet stoğa geri ekler (sayım fazlası)', async () => {
    const outcome = await dataOf<RecordAdjustmentResponse>(
      await post('/api/v1/warehouse/adjustments', {
        lines: [{ stockId, qty: 2, direction: 'in' }],
        reason: 'count_diff',
        note: 'sayımda 2 adet fazla çıktı',
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`düzeltme yazılmadı: ${JSON.stringify(outcome)}`);
    expect(outcome.result.referenceNo).toMatch(/^SAY-/);
    expect((await stocks.getById(stockId))?.physicalQty).toBe(22);
  });

  it('`return_restock` DEPOCUYA KAPALI — kural tipte duruyor, ekranda değil', async () => {
    /* Gövdenin GERİ KALANI GEÇERLİ (yön dahil): reddin sebebi yalnız `reason` olsun. Eksik bir
       alan da `invalid_body` üretirdi ve test doğru cümleyi yanlış sebeple geçerdi. */
    const res = await post('/api/v1/warehouse/adjustments', {
      lines: [{ stockId, qty: 1, direction: 'in' }],
      reason: 'return_restock',
      note: 'iade',
    });

    // Sözleşme sebebi varlık enum'undan `.exclude` ile türetiyor: istek kapıya hiç ulaşmıyor.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
    expect((await stocks.getById(stockId))?.physicalQty).toBe(20);
  });

  it('BAŞKA DEPONUN partisi 200 + `out_of_scope`, hangi parti olduğu SÖYLENİR', async () => {
    const outcome = await dataOf<RecordAdjustmentResponse>(
      await post('/api/v1/warehouse/adjustments', {
        lines: [
          { stockId, qty: 1, direction: 'out' },
          { stockId: foreignStockId, qty: 1, direction: 'out' },
        ],
        reason: 'lost',
      }),
    );

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope', stockIds: [foreignStockId] });
    // Ret BÜTÜN tutanağa iner, satırı ayıklamaz: kendi partisi de el değmeden kaldı.
    expect((await stocks.getById(stockId))?.physicalQty).toBe(20);
  });

  it('fiziksel gerçek ihlali `failed` döner ve MESAJ operatöre AYNEN ulaşır', async () => {
    const outcome = await dataOf<RecordAdjustmentResponse>(
      await post('/api/v1/warehouse/adjustments', {
        lines: [{ stockId, qty: 999, direction: 'out' }],
        reason: 'expired',
      }),
    );

    // Ucun taşıdığı şey doğru: ret bir istisna değil, 200 ile dönen bir CEVAP ve hiçbir satır yazılmadı.
    expect(outcome.status).toBe('failed');
    expect((await stocks.getById(stockId))?.physicalQty).toBe(20);

    // **ÖLÇÜLDÜ (08.08), DÜZELTİLDİ (21.11c).** RPC reddi `throw` ile geliyor ama fırlatılan şey bir
    // `Error` DEĞİL, DÜZ BİR NESNE — `constructor.name === 'Object'`, alanları `{code, details,
    // hint, message}`. Kapının eski süzgeci (`error instanceof Error ? …`) bu nesneyi yakalamıyordu
    // ve sözleşmenin vaadi ("mesaj operatöre AYNEN gösterilir") tutmuyordu: operatör hangi partide
    // kaç adet olduğunu göremiyor, sabit bir "Kayıt yazılamadı" okuyordu. Çıkarım artık tek
    // yardımcıda (`application/warehouse/rpc-error.ts`) ve dört kapının dördü de onu çağırıyor.
    expect(outcome.status === 'failed' ? outcome.message : '').toMatch(/partide 20 adet var, 999 adet düşülemez/);
  });

  it('satırsız istek `empty`', async () => {
    const outcome = await dataOf<RecordAdjustmentResponse>(
      await post('/api/v1/warehouse/adjustments', { lines: [], reason: 'lost' }),
    );
    expect(outcome).toEqual({ status: 'empty' });
  });
});

describe('D5 · transfer (gelen)', () => {
  /** Bu depoya yola çıkmış transfer — kabul testlerinin en kısa zemini. */
  async function inbound(qty = 4) {
    const outcome = await dispatchTransfer(db, {
      fromWarehouseId: otherWarehouseId,
      toWarehouseId: warehouseId,
      lines: [{ sourceStockId: foreignStockId, qty }],
      note: 'rampa testi',
    });
    if (outcome.status !== 'ok') throw new Error(`sevk kurulamadı: ${JSON.stringify(outcome)}`);
    const lines = await transfers.listLines(outcome.transferId);
    return { transferId: outcome.transferId, lineId: lines[0]!.id };
  }

  it('"bana ne geliyor" listesi satırlarıyla gelir; sayılmamış satır `null` taşır', async () => {
    const { transferId, lineId } = await inbound(4);

    const res = await asStaff('/api/v1/warehouse/transfers');
    expect(res.status).toBe(200);

    const body = await dataOf<WarehouseTransfersResponse>(res);
    const mine = body.transfers.find((row) => row.transferId === transferId)!;
    expect(mine.fromWarehouseId).toBe(otherWarehouseId);
    expect(mine.referenceNo).toMatch(/^TRF-/);
    expect(mine.note).toBe('rampa testi');
    expect(mine.lines).toEqual([
      {
        lineId,
        sourceStockId: foreignStockId,
        name: `Fıstıklı Baklava ${stamp} (1 kg)`,
        dispatchedQty: 4,
        // `null` = henüz sayılmadı; `0` olsaydı "geldi ama kayıp" derdi (0042).
        receivedQty: null,
      },
    ]);
  });

  it('RAMPADA SAY: sayılan mal hedefte YENİ parti olarak doğar', async () => {
    const { transferId, lineId } = await inbound(4);

    const res = await post(`/api/v1/warehouse/transfers/${transferId}/receive`, {
      lines: [{ lineId, receivedQty: 4 }],
    });
    expect(res.status).toBe(200);

    expect(await dataOf<ReceiveTransferResponse>(res)).toMatchObject({ status: 'ok', transferId, createdBatches: 1 });
    // Parti kimliği KORUNUR, birleşmez (T4): hedefte lot'u kopyalanmış yeni bir satır var.
    const arrived = (await stocks.listByVariant(warehouseId, variantId)).filter((batch) => batch.id !== stockId);
    expect(arrived).toHaveLength(1);
    expect(arrived[0]!.physicalQty).toBe(4);
  });

  it('BOŞ satır kabulü BLOKLAR — hangi satır sayılmadıysa o söylenir', async () => {
    const { transferId, lineId } = await inbound(4);

    const res = await post(`/api/v1/warehouse/transfers/${transferId}/receive`, { lines: [] });

    expect(res.status).toBe(200);
    expect(await dataOf<ReceiveTransferResponse>(res)).toEqual({
      status: 'incomplete',
      missingLineIds: [lineId],
      unknownLineIds: [],
    });
    // Yarım kabul, hiç kabul etmemekten kötüdür: transfer hâlâ yolda.
    expect((await transfers.getById(transferId))?.status).toBe('in_transit');
  });

  it('`0` bir BEYANDIR — "geldi ama kayıp" yazılır ve kabul kapanır', async () => {
    const { transferId, lineId } = await inbound(4);

    const outcome = await dataOf<ReceiveTransferResponse>(
      await post(`/api/v1/warehouse/transfers/${transferId}/receive`, { lines: [{ lineId, receivedQty: 0 }] }),
    );

    expect(outcome.status).toBe('ok');
    expect((await transfers.getById(transferId))?.status).toBe('received');
  });

  it('İKİNCİ kabul BAYATTIR — durum görünür döner, yutulmaz', async () => {
    const { transferId, lineId } = await inbound(4);
    await post(`/api/v1/warehouse/transfers/${transferId}/receive`, { lines: [{ lineId, receivedQty: 4 }] });

    const outcome = await dataOf<ReceiveTransferResponse>(
      await post(`/api/v1/warehouse/transfers/${transferId}/receive`, { lines: [{ lineId, receivedQty: 4 }] }),
    );

    expect(outcome).toEqual({ status: 'stale', currentStatus: 'received' });
  });

  it('uuid olmayan transfer kimliği 400', async () => {
    const res = await post('/api/v1/warehouse/transfers/trf-1/receive', { lines: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_transfer_id' });
  });
});

describe('D6 · GET /api/v1/warehouse/returns', () => {
  it('rampaya dönen sipariş künyesi, kuryesi ve satırlarıyla gelir', async () => {
    const order = await returnedOrder(2);

    const body = await dataOf<WarehouseReturnQueueResponse>(await asStaff('/api/v1/warehouse/returns'));

    const mine = body.drops.find((drop) => drop.orderId === order.orderId);
    expect(mine?.lines).toEqual([
      // Tavan KARŞILANMIŞ adet: `adjust_fulfillment` hedefi bunun üstüne çıkaramaz.
      { orderItemId: order.itemId, name: expect.stringContaining('Fıstıklı Baklava'), fulfilledQty: 2, disposition: null },
    ]);
    expect(mine?.returnedAt).not.toBeNull();
  });

  it('BAŞKA DEPONUN dönüşü bu listede YOK — depo bölümün bağlamıdır', async () => {
    const order = await preparedOrder(2);
    // Aynı siparişi başka depoya taşıyamayız; ikinci deponun kendi dönüşünü kurmak gerekiyor.
    const foreign = await pendingOrder({ warehouse: otherWarehouseId });
    await advance(foreign.orderId, ['preparing']);
    await orders.recordPreparation(foreign.orderId, [{ orderItemId: foreign.itemId, batches: [{ stockId: foreignStockId, qty: foreign.qty }] }]);
    await advance(foreign.orderId, ['ready', 'out_for_delivery', 'returned']);
    await advance(order.orderId, ['ready', 'out_for_delivery', 'returned']);

    const body = await dataOf<WarehouseReturnQueueResponse>(await asStaff('/api/v1/warehouse/returns'));

    expect(body.drops.some((drop) => drop.orderId === order.orderId)).toBe(true);
    expect(body.drops.some((drop) => drop.orderId === foreign.orderId)).toBe(false);
  });

  it('AKIBET işaretlenince liste kendini temizler — okuma ile yazma aynı gerçeği söyler', async () => {
    const order = await returnedOrder(2);
    const before = await dataOf<WarehouseReturnQueueResponse>(await asStaff('/api/v1/warehouse/returns'));
    expect(before.drops.some((drop) => drop.orderId === order.orderId)).toBe(true);

    await post(`/api/v1/warehouse/returns/${order.orderId}`, {
      adjustments: [{ orderItemId: order.itemId, fulfilledQty: 0, returnDisposition: 'discard', note: 'koku şüphesi' }],
    });

    const after = await dataOf<WarehouseReturnQueueResponse>(await asStaff('/api/v1/warehouse/returns'));
    expect(after.drops.some((drop) => drop.orderId === order.orderId)).toBe(false);
  });

  it('listede TUTAR yok — dönüşü karşılayan depocu parayı görmez', async () => {
    const order = await returnedOrder(2);

    const body = await dataOf<WarehouseReturnQueueResponse>(await asStaff('/api/v1/warehouse/returns'));
    const serialized = JSON.stringify(body.drops.find((drop) => drop.orderId === order.orderId));

    for (const moneyKey of ['unitPrice', 'total', 'purchasePrice', 'refunded', 'amountCollected', 'vatRate']) {
      expect(serialized).not.toContain(moneyKey);
    }
  });
});

describe('D6 · POST /api/v1/warehouse/returns/:orderId', () => {
  it('STOĞA DÖN: teslim edilmiş malın adedi geri yazılır', async () => {
    const order = await deliveredOrder(2);
    // Teslim fiiliden düştü: 20 → 18.
    expect((await stocks.getById(stockId))?.physicalQty).toBe(18);

    const res = await post(`/api/v1/warehouse/returns/${order.orderId}`, {
      adjustments: [
        { orderItemId: order.itemId, fulfilledQty: 0, returnDisposition: 'restock', note: 'soğuk zincir kesintisiz — ambalaj sağlam' },
      ],
    });
    expect(res.status).toBe(200);

    const outcome = await dataOf<WarehouseReturnResponse>(res);
    if (outcome.status !== 'ok') throw new Error(`düzeltme yazılmadı: ${JSON.stringify(outcome)}`);
    expect(outcome.restockedQty).toBe(2);
    expect(outcome.discardedQty).toBe(0);
    // Miktar HEDEF değerdi; farkı sistem hesapladı ve mal gerçekten depoya döndü.
    expect((await stocks.getById(stockId))?.physicalQty).toBe(20);
    expect((await orders.getWithItems(order.orderId))!.items[0]!.fulfilledQty).toBe(0);
  });

  it('İMHA: kapıdan dönen mal fiiliden düşer ve ayrılmış geri bırakılır', async () => {
    const order = await returnedOrder(2);

    const outcome = await dataOf<WarehouseReturnResponse>(
      await post(`/api/v1/warehouse/returns/${order.orderId}`, {
        adjustments: [{ orderItemId: order.itemId, fulfilledQty: 0, returnDisposition: 'discard', note: 'koku şüphesi' }],
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`düzeltme yazılmadı: ${JSON.stringify(outcome)}`);
    expect(outcome.discardedQty).toBe(2);
    expect(outcome.restockedQty).toBe(0);
    // Mal hiç çıkmamıştı: fiili düşüm ve fire kaydı BURADA doğar.
    expect((await stocks.getById(stockId))?.physicalQty).toBe(18);
    // Gitmeyen adet başkasına satılabilir olmalı (DOMAIN §4).
    expect(outcome.releasedQty).toBe(2);
  });

  it('JEST: mal müşteride kaldı — stok da karşılanan adet de DEĞİŞMEZ', async () => {
    const order = await deliveredOrder(2);

    const outcome = await dataOf<WarehouseReturnResponse>(
      await post(`/api/v1/warehouse/returns/${order.orderId}`, {
        adjustments: [{ orderItemId: order.itemId, fulfilledQty: 2, returnDisposition: 'goodwill' }],
      }),
    );

    if (outcome.status !== 'ok') throw new Error(`düzeltme yazılmadı: ${JSON.stringify(outcome)}`);
    expect(outcome).toMatchObject({ restockedQty: 0, discardedQty: 0, releasedQty: 0 });
    // Miktarı düşürmek malın hiç gitmediğini söylerdi — stok da COGS de bozulurdu (DOMAIN §8).
    expect((await stocks.getById(stockId))?.physicalQty).toBe(18);
    expect((await orders.getWithItems(order.orderId))!.items[0]!.fulfilledQty).toBe(2);
  });

  it('BAŞKA DEPONUN siparişi düzeltilemez — `out_of_scope`, yazım yok', async () => {
    const order = await pendingOrder({ warehouse: otherWarehouseId });

    const res = await post(`/api/v1/warehouse/returns/${order.orderId}`, {
      adjustments: [{ orderItemId: order.itemId, fulfilledQty: 0, returnDisposition: 'discard' }],
    });

    expect(res.status).toBe(200);
    expect(await dataOf<WarehouseReturnResponse>(res)).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await orders.getWithItems(order.orderId))!.items[0]!.fulfilledQty).toBe(0);
  });

  it('olmayan sipariş `not_found`; uuid olmayan kimlik 400', async () => {
    const yok = await post('/api/v1/warehouse/returns/00000000-0000-0000-0000-000000000000', {
      adjustments: [{ orderItemId: '00000000-0000-0000-0000-000000000000', fulfilledQty: 0 }],
    });
    expect(await dataOf<WarehouseReturnResponse>(yok)).toEqual({ status: 'not_found' });

    const bozuk = await post('/api/v1/warehouse/returns/siparis-1', { adjustments: [] });
    expect(bozuk.status).toBe(400);
    expect(await bozuk.json()).toEqual({ data: null, error: 'invalid_order_id' });
  });
});

/*
  D1 · SEVK UÇLARI (07.12) — bu describe **yalnız UCUN kendi kararlarını** ölçüyor.

  Kapının iş kuralları (ön koşullar, koli kurulumu, çok koli süzgeci, duyurunun tekrarsızlığı)
  `packages/application/src/shipping/announce.test.ts`te çivili ve burada tekrar edilmiyor —
  kutu döngüsü uçlarının (23.6/23.7) izlediği çizginin aynısı.

  Ucun KENDİ kararı iki tane: sağlayıcı yapılandırılmamışsa ağa hiç çıkmamak, ve depo kapsamı.
*/
describe('D1 · sevk uçları (teklif + duyuru)', () => {
  it('sağlayıcı yapılandırılmamışken 503 — boş anahtarla ağa çıkılmaz', async () => {
    const { orderId } = await pendingOrder();

    // Test ortamında Sendcloud anahtarı yok; uç bunu SÖYLÜYOR ve sessizce boş liste dönmüyor.
    // Boş liste dönseydi ekran "bu siparişe hiç servis yok" derdi — yapılandırma eksiği,
    // veri eksikliği gibi okunurdu.
    const teklif = await asStaff(`/api/v1/warehouse/orders/${orderId}/dispatch-options`);
    expect(teklif.status).toBe(503);

    const duyuru = await post(`/api/v1/warehouse/orders/${orderId}/announce`, { shippingOptionCode: 'x' });
    expect(duyuru.status).toBe(503);
  });

  it('duyuru gövdesi ZORUNLU alan istiyor — servis kodsuz çağrı 400', async () => {
    const { orderId } = await pendingOrder();

    const res = await post(`/api/v1/warehouse/orders/${orderId}/announce`, {});
    // Gövde denetimi sağlayıcı kontrolünden ÖNCE: hangi servisin satın alınacağı belli değilse
    // yapılandırma sorusunu sormanın anlamı yok.
    expect(res.status).toBe(400);
  });

  /*
    RAMPADA BEKLEYEN KUTU SAYISI — ucun kendi kararı KAPSAM: sayı depodan gelir, istemciden değil.

    Sayacın KURALLARI (mühürsüz/duyurulmamış kutu sayılmaz, başka deponun kutusu sayılmaz)
    `packages/application/src/shipping/announce.test.ts`te çivili; burada tekrar edilmiyor —
    dosyanın künyesindeki çizgi bu.
  */
  it('bekleyen kutu sayısı SAĞLAYICIDAN bağımsız — kargo kapalıyken de cevap verir', async () => {
    const res = await asStaff('/api/v1/warehouse/handover/pending');

    // 503 dönmüyor: bu uç sağlayıcıya HİÇ çıkmıyor, kendi tablomuzu sayıyor. Teklif/duyuru
    // uçlarıyla aynı kefeye konsaydı depocu, kargo anahtarı yokken rampasını da göremezdi.
    expect(res.status).toBe(200);
    expect(await dataOf<{ boxes: number }>(res)).toEqual({ boxes: 0 });
  });

  it('bozuk sipariş kimliği 400 — uuid olmayan yol parçası kapıya hiç ulaşmaz', async () => {
    expect((await asStaff('/api/v1/warehouse/orders/bozuk/dispatch-options')).status).toBe(400);
  });
});
