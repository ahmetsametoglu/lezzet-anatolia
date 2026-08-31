import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, AddressService, CategoryService, DeliveryZoneService, OrderService, ProductService,
  ReservationService, StockService, UserProfileService, VehicleService, WarehouseService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, settingsSnapshot, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { warehouseScope } from '@lezzet/domain-core';
import { discardCourierRun, listCourierDay, markUndelivered, readCourierRun, readDoorCashAccountId, startCourierDay, type CourierDayStart, type CourierStop } from './day';
import { loadBox } from './load';
import { openBox, sealBox } from '../warehouse/boxes';
import { listCourierRoutes } from './routes';
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
/** Sefer akışının rotası (18.08): start artık zone claim'i yapıyor — zonesuz sipariş görünmez. */
let zoneId: string;
/** İkinci deponun rotası (11.7): kapsam süzgecinin "görmemesi gereken" tarafı — negatif kanıt. */
let foreignWarehouseId: string;
let foreignZoneId: string;
/** Kuryenin KENDİ deposundaki ikinci rota — "aynı anda tek sefer" ve "araçtan çıkar" ölçümleri
    ancak iki gerçek rotayla kurulabilir (tek rotayla ikinci sefer diye bir şey yok). */
let secondZoneId: string;
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
  // Kurye rol + depo kapsamıyla açılır (11.7): kapı kapsamı profilden çözüyor ve boş kapsam
  // fail-closed `no_route` demek — üretimde de Ayarlar bu ikisini birlikte yazıyor.
  await profiles.setRoles(courierId, ['courier'], [warehouseId]);
  await profiles.setRoles(otherCourierId, ['courier'], [warehouseId]);

  /* Alıcı ve telefon 22.08'de zorunlu oldu. Değerler bu dosyada ANLAMLI: alıcı hesabın sahibinden
     FARKLI (hediye/iş adresi hâli) ve telefon dolu — kurye durağının "kapıda kimi sorayım, kimi
     arayayım" cevabı buradan türüyor. */
  addressId = (await new AddressService(db).insert({
    customerId,
    recipient: 'Ali Şahin',
    phone: '+33655443322',
    line1: '12 rue des Fleurs',
    postalCode: '67000',
    city: 'Strasbourg',
  })).id;
  accountId = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
  // Rota HER GÜN koşar (weekdays 1-7): testin hangi gün koştuğu davranışı değiştirmesin.
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Kurye testi rotası ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
  secondZoneId = (await new DeliveryZoneService(db).insert({
    name: `Kurye testi ikinci rota ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
  // İkinci depo + rotası (11.7): kuryenin kapsamı DIŞINDA — süzgecin negatif tarafı ancak
  // gerçekten var olan ama görünmemesi gereken bir rotayla sınanabilir.
  foreignWarehouseId = (await createTestWarehouse(db)).id;
  foreignZoneId = (await new DeliveryZoneService(db).insert({
    name: `Yabancı depo rotası ${stamp}`, warehouseId: foreignWarehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
});

beforeEach(async () => {
  // Sefer temizliği ÖNCE: rota+gün başına TEK sefer (0046) — önceki testin açtığı run kalırsa
  // sonraki start `already_started` alır. Kapanış seferi `restrict` ile tutar, sıra sabit.
  const { data: runRows } = await db
    .from('delivery_run')
    .select('id')
    .in('delivery_zone_id', [zoneId, secondZoneId]);
  const runIds = (runRows ?? []).map((row) => row.id as string);
  if (runIds.length > 0) {
    await db.from('delivery_run_close').delete().in('delivery_run_id', runIds);
    await db.from('delivery_run').delete().in('id', runIds);
  }
  // **SIRA: defter → parti → sipariş** (06.14). Teslim deftere bir `sale` satırı yazıyor ve o satır
  // İKİSİNİ birden `restrict` ile tutuyor (`stock_id` ve `order_id`); `purgeVariantStock` partinin
  // bütün hareketlerini topladığı için sipariş de aynı anda serbest kalıyor. Sıra oradadır, burada
  // değil (`CLAUDE §4b`).
  //
  // Eskiden üçü de `db.from(...).delete()` ile yazılmıştı ve o çağrı hatayı **yutuyor** — silme
  // başarısız olur, kimse bakmaz, teardown sessizce yarım kalır. Belirtisi düşen teardown değil
  // **çift sayım** olur: her test bir öncekinin malını da sayar (ölçüldü 27.08, kardeş dosyalarda:
  // kalan stok 28 yerine 137, borç 4000 yerine 8000). Künye `cleanup.ts`te.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 300 })).id;
});

/** Bu dosyanın kurduğu araçlar — `purgeTestData` onları `vehicleIds` ile siliyor (elle silme yok). */
const vehicleIds: string[] = [];

afterAll(async () => {
  // Sipariş, rezervasyon ve adres AYRICA silinmez: üçü de `purgeTestData`'nın bildiği bağlar
  // (sipariş `profileIds`ten, rezervasyon `productIds`ten, adres profil cascade'inden). Elle
  // yazılan bu satırlar teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId, foreignWarehouseId],
    // Araç `restrict` FK'lerle korunuyor ve sefer ona bağlı; purge sırayı biliyor (`cleanup.ts`).
    vehicleIds,
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
      deliveryZoneId: zoneId,
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

  /*
    HAZIRLIK KUTUYLA (kullanıcı kararı 30.08) — kutusuz sipariş ne `ready` olur ne yola çıkar.
    Mühür siparişi HAZIR yapar. Kutu HER HÂLDE araca bindirilir (`loadBox`): 31.08'den beri
    yükleme siparişi yola ÇIKARMIYOR, yalnız malı araca geçiriyor — yani `ready` durak da
    yüklenmiş olabilir ve gerçekte de öyledir (kurye rampada yükler, sonra seferi başlatır).
    `out_for_delivery` istendiğinde geçiş AYRICA yazılır.
  */
  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
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
  if (opts.upTo !== 'ready') await advanceOrder(db, order.id, ['out_for_delivery']);
  return { orderId: order.id, itemId: items[0]!.id, boxCode: box.box.code };
}

const mine = (stops: CourierStop[], orderId: string) => stops.find((stop) => stop.orderId === orderId)!;

describe('gün listesi (11.1)', () => {
  it('durak teslimat için gerekeni taşır: adres, ödeme beklentisi, içerik', async () => {
    const { orderId } = await dispatched({ qty: 3, totalCents: 3000 });

    const stop = mine(await listCourierDay(db, { courierId }), orderId);

    expect(stop.address).toBe('12 rue des Fleurs, 67000, Strasbourg');
    /* `collectedAtDoorCents` 30.08'de eklendi: kapıda FİİLEN alınan para. Bekleyen durakta `null` —
       henüz alınmadı; sonuçlanmış durakta gün listesi "nakit 85,00 € alındı" cümlesini onunla kuruyor. */
    expect(stop.payment).toEqual({ dueAmountCents: 3000, expectedMethod: 'cash', collectedAtDoorCents: null });
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

    /*
      YASAK LİSTESİNDEN `unitPrice` ÇIKTI (kullanıcı kararı 30.08) ve sınır DARALMADI, netleşti:
      yasak olan İŞLETMENİN defteridir — alış fiyatı, maliyet, marj, müşterinin kredi limiti.
      Kalemin SATIŞ fiyatı ise kuryenin gördüğü tek paranın bileşenidir: kapıda bir kalem geri
      verildiğinde tahsilattan ne düşeceğini ekran onunla hesaplıyor (`lineAmountCents`). Olmadığı
      hâlde kurye "1/2 geri verildi" yazıp altında hâlâ tam tutarı görüyordu.
    */
    const serialized = JSON.stringify(stop);
    for (const forbidden of ['purchasePrice', 'cogs', 'margin', 'creditLimit']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(stop.items[0]?.unitPriceCents).toBe(1000); // satış fiyatı: tahsilatın bileşeni
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

/** Union daraltıcı — bu testin beklediği dal `ok`; başka dal gelirse sebep görünür düşsün. */
function mustStart(result: CourierDayStart): Extract<CourierDayStart, { status: 'ok' }> {
  if (result.status !== 'ok') throw new Error(`seferin başlaması bekleniyordu, gelen: ${result.status}`);
  return result;
}

describe('seferin künyesi: araç adı + çıkış deposu (30.08 · uyuşmazlık #12)', () => {
  /*
    KİMLİĞİN YANINDA AD DURUR.

    Künye 30.08'e kadar yalnız `vehicleId` taşıyordu ve sefer künyesi ekranı aracın adının
    *ulaşmadığını yazmak* zorunda kalıyordu — kurye rampada bir uuid'den hangi aracın önüne
    gideceğini çıkaramaz. Aynı kural rota SEÇİM listesinde zaten uygulanıyordu; eksik olan
    günün seferiydi.
  */
  it('araç adı PLAKA + okunur ad — plaka aracın sahadaki tek tekil işareti', async () => {
    const adli = await new VehicleService(db).insert({
      plate: `AD-${stamp}`,
      label: 'Soğutmalı panelvan',
      warehouseId,
    });
    vehicleIds.push(adli.id);
    await startCourierDay(db, { courierId, zoneId, vehicleId: adli.id });

    /* Ad plakanın YERİNE değil YANINA geçer (v3:17 `"FR-482-BX · Frigo kamyonet"`): ad "hangi
       tür araç", plaka "hangi araç" sorusunun cevabı. Depoda iki soğutmalı panelvan varsa ad tek
       başına kuryeyi doğru aracın önüne götürmez. */
    expect((await readCourierRun(db, { courierId }))?.vehicleLabel).toBe(`AD-${stamp} · Soğutmalı panelvan`);
  });

  it('ADSIZ araçta plaka yazılır — plaka `not null`, yani yedek HER ZAMAN var', async () => {
    const adsiz = await new VehicleService(db).insert({ plate: `PL-${stamp}`, warehouseId });
    vehicleIds.push(adsiz.id);
    await startCourierDay(db, { courierId, zoneId, vehicleId: adsiz.id });

    expect((await readCourierRun(db, { courierId }))?.vehicleLabel).toBe(`PL-${stamp}`);
  });

  it('ARAÇSIZ seferde ad `null` — araç kaydı zorunlu değil, bu bir eksik değil', async () => {
    await startCourierDay(db, { courierId, zoneId });

    const run = await readCourierRun(db, { courierId });
    expect(run?.vehicleId).toBeNull();
    expect(run?.vehicleLabel).toBeNull();
  });

  it('ÇIKIŞ DEPOSUNUN adı seferin bölgesinden çözülür', async () => {
    await startCourierDay(db, { courierId, zoneId });

    // Depo adı rota zincirinin ilk halkası ("Strasbourg → Krutenau"); bölge → depo üzerinden gelir.
    const depoAdi = (await new WarehouseService(db).getById(warehouseId))?.name;
    expect((await readCourierRun(db, { courierId }))?.warehouseName).toBe(depoAdi);
  });

  it('BAŞLATMA cevabı da aynı künyeyi döner — ekran onu doğrudan günün seferi olarak yazıyor', async () => {
    const arac = await new VehicleService(db).insert({ plate: `BS-${stamp}`, label: 'Kamyonet', warehouseId });
    vehicleIds.push(arac.id);

    const result = mustStart(await startCourierDay(db, { courierId, zoneId, vehicleId: arac.id }));

    /* İki cevabın şekli ayrışsaydı kurye, seferi başlattıktan sonra bir sonraki okumaya kadar
       aracını ve deposunu göremezdi — ve o boşluk hiçbir yerde hata vermezdi. */
    expect(result.run.vehicleLabel).toBe(`BS-${stamp} · Kamyonet`);
    expect(result.run.warehouseName).toBe((await new WarehouseService(db).getById(warehouseId))?.name);
  });
});

describe('sefer KUR ↔ sefer BAŞLAT (31.08)', () => {
  it('kurulan sefer YOLA ÇIKMAZ: damga yok, siparişler HAZIR, dört liste boş', async () => {
    const { orderId } = await dispatched({ upTo: 'ready' });

    const kurulan = mustStart(await startCourierDay(db, { courierId, zoneId, depart: false }));

    /* Sefer satırı DOĞDU ve sipariş damgalandı — kutu okutulabilir hâle geldi. Ama araçtaki mal
       henüz "yolda" değil ve müşteriye haber gitmedi: araç bir ara depodur. */
    expect(kurulan.run.departedAt).toBeNull();
    expect((await orders.getById(orderId))?.deliveryRunId).toBe(kurulan.run.runId);
    expect((await orders.getById(orderId))?.status).toBe('ready');
    expect(kurulan.started).toEqual([]);
    expect(kurulan.alreadyOut).toEqual([]);
    expect(kurulan.awaitingBoxes).toEqual([]);
  });

  it('BAŞLATMA aynı seferi yola çıkarır — damga vurulur, durak açılır', async () => {
    const { orderId } = await dispatched({ upTo: 'ready' });
    const kurulan = mustStart(await startCourierDay(db, { courierId, zoneId, depart: false }));

    const baslayan = mustStart(await startCourierDay(db, { courierId, zoneId }));

    // AYNI sefer: kurma ikinci bir satır doğurmuyor, rota+gün başına tek sefer (K3).
    expect(baslayan.run.runId).toBe(kurulan.run.runId);
    expect(baslayan.run.departedAt).not.toBeNull();
    expect(baslayan.started).toContain(orderId);
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
  });

  it('İKİNCİ başlatma damgayı EZMEZ — "zaten yolda" bir hata değil', async () => {
    await dispatched({ upTo: 'ready' });
    const ilk = mustStart(await startCourierDay(db, { courierId, zoneId }));

    const ikinci = mustStart(await startCourierDay(db, { courierId, zoneId }));

    // Kurye düğmeye iki kez basabilir; cevabı "olmadı" değil "zaten olmuştu"dur.
    expect(ikinci.run.departedAt).toBe(ilk.run.departedAt);
  });

  it('AYNI ANDA TEK SEFER SÜRÜLÜR — ikinci sefer KURULUR ama yola çıkmaz', async () => {
    /*
      Kullanıcı kararı 31.08: araç birden çok seferi TAŞIR ama kurye birini SÜRER. İki sefer aynı
      anda yoldayken ekranın üç sorusu birden cevapsız kalıyor — durak sırası hangi seferin sırası,
      "3/6 durak" hangisinin ilerlemesi, kapanışta hangi kasa sayılacak. Tasarımın hiçbir karesi de
      iki sürülen sefer göstermiyor.
    */
    await dispatched({ upTo: 'ready' });
    const surulen = mustStart(await startCourierDay(db, { courierId, zoneId }));

    const ikinci = await startCourierDay(db, { courierId, zoneId: secondZoneId });

    expect(ikinci).toMatchObject({ status: 'another_running', referenceNo: surulen.run.referenceNo });
    /* KURMA GERİ SARILMIYOR: sefer satırı doğdu ve öyle kalıyor — kutuları okutulabilir, yalnız
       damgası yok. Kurma zaten istenen şeydi; reddedilen tek şey yola çıkmak. */
    const { data: ikinciRun } = await db
      .from('delivery_run')
      .select('departed_at')
      .eq('delivery_zone_id', secondZoneId)
      .maybeSingle();
    expect(ikinciRun).not.toBeNull();
    expect((ikinciRun as { departed_at: string | null } | null)?.departed_at).toBeNull();
  });
});

describe('seferi ARAÇTAN ÇIKAR (31.08 · kullanıcı kararı)', () => {
  /*
    Tasarımda karşılığı YOK ve boşluk cihazda görüldü: yanlış rotayı araca alan kuryenin tek çıkışı
    onu BAŞLATIP kapatmaktı — yani hatanın bedeli müşteriye bildirim olarak yansıyordu. Kurulmuş
    sefer bir NİYETTİR: durak açılmadı, haber gitmedi, para ve stok oynamadı.
  */
  it('siparişler serbest kalır, kutuların araç damgası silinir, rota yeniden seçilebilir', async () => {
    /* KUTU HAZIRLIKTA AÇILIR: `openBox` `preparing` bekliyor ve mühür siparişi HAZIR yapıyor
       (30.08 · kutusuz sipariş `ready` olamaz). Fikstür bu yüzden `confirmed`de duruyor ve
       kalanını elle yürüyor. */
    const { orderId, itemId } = await dispatched({ upTo: 'confirmed' });
    await advanceOrder(db, orderId, ['preparing']);
    const kurulan = mustStart(await startCourierDay(db, { courierId, zoneId, depart: false }));
    const box = await openBox(db, { orderId, warehouseId });
    if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
    const sealed = await sealBox(db, {
      boxId: box.box.boxId,
      warehouseId,
      picks: [{ orderItemId: itemId, batches: [{ stockId, qty: 2 }] }],
    });
    if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);
    const loaded = await loadBox(db, { code: box.box.code, courierId });
    if (loaded.status !== 'ok') throw new Error(`fikstür: kutu araca alınamadı (${loaded.status})`);

    const result = await discardCourierRun(db, { runId: kurulan.run.runId, courierId });

    expect(result).toMatchObject({ ok: true, releasedOrders: 1, unloadedBoxes: 1 });
    /* Sipariş serbest: kurye ataması da düştü, çünkü atama SEFERDEN geliyordu. Durum DEĞİŞMEDİ —
       sefere bağlanmak bir geçiş değildi, çözülmek de değil. */
    const order = await orders.getById(orderId);
    expect(order?.deliveryRunId).toBeNull();
    expect(order?.courierId).toBeNull();
    expect(order?.status).toBe('ready');
    /* Kutunun araç damgası silindi: mal zaten rampada ve `loadBox` stok oynatmıyordu. Bırakılsaydı
       kutu "araçta" görünürken hiçbir sefere ait olmayan bir emanet olurdu. */
    const { data: boxRow } = await db.from('order_box').select('loaded_at').eq('id', box.box.boxId).maybeSingle();
    expect((boxRow as { loaded_at: string | null } | null)?.loaded_at).toBeNull();
    /* Satır DÜŞTÜ: rota+gün kilidi açıldı, yani kurye kendi hatasını düzeltip aynı rotayı yeniden
       alabiliyor. Saklansaydı o rota sonsuza dek kilitli kalırdı. */
    const { data: runRow } = await db.from('delivery_run').select('id').eq('id', kurulan.run.runId).maybeSingle();
    expect(runRow).toBeNull();
    const yeniden = await startCourierDay(db, { courierId, zoneId, depart: false });
    expect(yeniden.status).toBe('ok');
  });

  it('BAŞLAMIŞ sefer çıkarılamaz — geri alınacak niyet kalmadı, çıkışı kapanıştır', async () => {
    await dispatched({ upTo: 'ready' });
    const surulen = mustStart(await startCourierDay(db, { courierId, zoneId }));

    const result = await discardCourierRun(db, { runId: surulen.run.runId, courierId });

    expect(result).toMatchObject({ ok: false, reason: 'already_departed' });
    // Hiçbir iz bırakmadı: sefer duruyor, durakları açık.
    expect((await readCourierRun(db, { courierId }))?.runId).toBe(surulen.run.runId);
  });

  it('BAŞKASININ seferi çıkarılamaz — "yok" ile "senin değil" aynı duvarın iki yüzü', async () => {
    await dispatched({ upTo: 'ready' });
    const kurulan = mustStart(await startCourierDay(db, { courierId, zoneId, depart: false }));

    const result = await discardCourierRun(db, { runId: kurulan.run.runId, courierId: customerId });

    expect(result).toMatchObject({ ok: false, reason: 'not_mine' });
  });
});

describe('seferi başlat (K1 · 18.08)', () => {
  it('HAZIR durak yola çıkar — sefer kaydı doğar, geçiş kuryenin adına düşer', async () => {
    const { orderId } = await dispatched({ upTo: 'ready' });

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    expect(result.started).toContain(orderId);
    expect(result.run.zoneId).toBe(zoneId);
    expect(result.run.referenceNo).toMatch(/^SF-\d{2}-/);
    expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
    // Sipariş SEFERE damgalanır: kanıtlı "kim götürdü" artık run üzerinden okunur.
    expect((await orders.getById(orderId))?.deliveryRunId).toBe(result.run.runId);
  });

  it('KUTULU sipariş tüm kutuları binmeden yola çıkmaz — geçişi SEFER BAŞLATMA yazar (23.8 · 31.08)', async () => {
    // Kutulu hazırlık: kutu mühürlenince sipariş kendiliğinden `ready` olur (sealBox geçişi).
    const { orderId, itemId } = await dispatched({ upTo: 'confirmed' });
    const opened = await openBox(db, { orderId, warehouseId });
    if (opened.status !== 'ok') throw new Error(`kutu açılamadı (${opened.status})`);
    const sealed = await sealBox(db, {
      boxId: opened.box.boxId,
      warehouseId,
      picks: [{ orderItemId: itemId, batches: [{ stockId, qty: 2 }] }],
    });
    if (sealed.status !== 'ok' || !sealed.ready) throw new Error('kutu kapanamadı');

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    // Sefer AÇILDI ve sipariş claim edildi ama YOLA ÇIKMADI: araca binmeyen kutu "yolda" görünmez.
    expect(result.started).not.toContain(orderId);
    expect(result.awaitingBoxes).toEqual([{ orderId, loadedBoxes: 0, boxCount: 1 }]);
    expect((await orders.getById(orderId))?.status).toBe('ready');

    /* Kutu araca biner ama sipariş HÂLÂ HAZIR: yükleme emanet değişimidir (31.08). Araç bir ara
       depodur ve içinde yarının seferinin kutusu da durabilir — okutma müşteriye haber göndermez. */
    const loaded = await loadBox(db, { code: opened.box.code, courierId });
    expect(loaded).toMatchObject({ status: 'ok', allBoxesLoaded: true });
    expect((await orders.getById(orderId))?.status).toBe('ready');

    // Geçişi yazan İKİNCİ başlatmadır (catch-up claim): kutular tamam, durak artık yola çıkar.
    const again = mustStart(await startCourierDay(db, { courierId, zoneId }));
    expect(again.started).toContain(orderId);
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

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    expect(result.alreadyOut).toContain(orderId);
    expect(result.started).not.toContain(orderId);
  });

  it('hazırlanmamış durak yola ÇIKARILMAZ ve gizlenmez — `skipped` + o anki durumu', async () => {
    // Motor `confirmed → out_for_delivery`ye izin VERİYOR (küçük sipariş hazırlığı atlayabilir) ama
    // kuryenin toplu düğmesi bunu yapmaz: parti kaydı yazılmamış siparişte teslimde mal hangi
    // partiden düşecek sorusu cevapsız kalır. Kurye sebebi listede görüyor.
    const { orderId } = await dispatched({ upTo: 'confirmed' });

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    expect(result.skipped).toEqual([{ orderId, currentStatus: 'confirmed' }]);
    expect(result.started).toHaveLength(0);
    expect((await orders.getById(orderId))?.status).toBe('confirmed');
  });

  it('kısmi başarı GÖRÜNÜR: üç aday, üç ayrı liste', async () => {
    const { orderId: hazir } = await dispatched({ upTo: 'ready' });
    const { orderId: yolda } = await dispatched();
    const { orderId: hazirlanmamis } = await dispatched({ upTo: 'confirmed' });

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    expect(result.started).toEqual([hazir]);
    expect(result.alreadyOut).toEqual([yolda]);
    expect(result.skipped).toEqual([{ orderId: hazirlanmamis, currentStatus: 'confirmed' }]);
    expect(result.stale).toHaveLength(0);
  });

  it('sabah BAŞKASINA atanmış görünen sipariş de sefere geçer — kurye SEFERDEN gelir (18.08)', async () => {
    // Eski değişmez tersiydi ("başka kuryenin siparişi yola çıkmaz") ve atama modeline aitti.
    // 18.08 kararı: atama plandır, gerçek seferdir — rotayı fiilen süren claim eder ve
    // `order.courier_id` seferin kuryesiyle SENKRONLANIR ("siparişin kuryesi seferin kuryesinden").
    const { orderId } = await dispatched({ courier: otherCourierId, upTo: 'ready' });

    const result = mustStart(await startCourierDay(db, { courierId, zoneId }));

    expect(result.started).toContain(orderId);
    const order = await orders.getById(orderId);
    expect(order?.courierId).toBe(courierId);
    expect(order?.status).toBe('out_for_delivery');
  });

  it('BAŞKA günün hazır durağı başlatılmaz — gün imzada durur, iki gün iki AYRI seferdir', async () => {
    const { orderId } = await dispatched({ date: dayOffset(3), upTo: 'ready' });

    /* İKİSİ DE `depart:false` (31.08): "aynı anda tek sefer sürülür" kuralı GÜNE de bakmıyor —
       kurye ileri günün seferini bugünkünü kapatmadan yola çıkaramaz. Ölçülen şey burada
       başlatma değil GÜN SÜZGECİ: hangi durak hangi sefere claim ediliyor. */
    const bugun = mustStart(await startCourierDay(db, { courierId, zoneId, depart: false }));
    const { data: bugunOrders } = await db.from('order').select('id').eq('delivery_run_id', bugun.run.runId);
    expect((bugunOrders ?? []).map((row) => row.id as string)).not.toContain(orderId);

    const oGun = mustStart(await startCourierDay(db, { courierId, zoneId, date: dayOffset(3), depart: false }));
    expect(oGun.date).toBe(dayOffset(3));
    expect(oGun.run.runId).not.toBe(bugun.run.runId);
    const { data: oGunOrders } = await db.from('order').select('id').eq('delivery_run_id', oGun.run.runId);
    expect((oGunOrders ?? []).map((row) => row.id as string)).toContain(orderId);
  });

  it('eşzamanlı iki çağrıda sefer TAM BİR KEZ açılır; başkasının açık seferi `already_started` alır', async () => {
    // Hangi çağrının kazandığı SABİTLENMİYOR — yarış gerçek ve kilit VERİDEDİR (`delivery_run_key`
    // mutlak unique, 0046). AYNI kuryenin ikinci basışı artık bir ret DEĞİL, catch-up claim'dir
    // (18.08, mobil bulgu: gün ortasında hazırlanan durak da sefere bağlanabilmeli) — iki cevap da
    // `ok` ve AYNI seferi gösterir. Sabit kalan değişmezler: sefer bir kez açılır, geçiş bir kez
    // yazılır, durak `started` listelerinin TOPLAMINDA tam bir kez görünür.
    const { orderId } = await dispatched({ upTo: 'ready' });

    const [a, b] = await Promise.all([
      startCourierDay(db, { courierId, zoneId }),
      startCourierDay(db, { courierId, zoneId }),
    ]);

    const first = mustStart(a);
    const second = mustStart(b);
    expect(first.run.runId).toBe(second.run.runId);
    expect([...first.started, ...second.started].filter((id) => id === orderId)).toHaveLength(1);

    // `already_started` artık YALNIZ başkasının (ya da kapanmış) seferinin cevabı: rota bugün
    // bu kuryede — öteki kurye başlatamaz, kimde olduğunu görür.
    const other = await startCourierDay(db, { courierId: otherCourierId, zoneId });
    expect(other.status).toBe('already_started');
    if (other.status === 'already_started') {
      expect(other.runId).toBe(first.run.runId);
      expect(other.courierId).toBe(courierId);
      expect(other.mine).toBe(false);
    }

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

describe('depo kapsamı (11.7 · kullanıcı kuralı 21.08)', () => {
  it('başka deponun rotası listede görünmez ve kimliği elle verilse bile başlatılamaz', async () => {
    // LİSTE: kapsam kuryenin profilindekiyle aynı formülden kurulur (motor, elle kurgu değil).
    // Kendi rotası içeride, yabancı deponunki HİÇ yok — soluk/gri değil, yok.
    const scope = warehouseScope(['courier'], [warehouseId]);
    const routes = await listCourierRoutes(db, { date: today, scope });
    expect(routes.some((route) => route.zoneId === zoneId)).toBe(true);
    expect(routes.some((route) => route.zoneId === foreignZoneId)).toBe(false);

    // BAŞLATMA: seçim listesini atlayıp kimliği elle veren istek de aynı süzgece çarpar —
    // cevap `zone_not_found` emsali `no_route`, ve HİÇBİR yazım yapılmaz (sefer kaydı doğmaz).
    const result = await startCourierDay(db, { courierId, zoneId: foreignZoneId });
    expect(result.status).toBe('no_route');
    const { data: runs } = await db.from('delivery_run').select('id').eq('delivery_zone_id', foreignZoneId);
    expect(runs ?? []).toHaveLength(0);

    // Boş kapsam = hiçbir rota (fail-closed): atanmamış kurye "hepsini görür"e düşmez.
    expect(await listCourierRoutes(db, { date: today, scope: warehouseScope(['courier'], []) })).toHaveLength(0);
  });
});

describe('seçim kartının üç sayısı (v3:17 · 31.08)', () => {
  it('rota DURAK, KUTU ve TAHSİLAT sayılarını birlikte taşır', async () => {
    /*
      Kart yalnız durak sayısını yazıyordu ve durak sayısı YÜKÜ SÖYLEMİYOR: üç duraklık bir rota
      on bir kutu taşıyabiliyor. Kurye aracı doldurmadan önce hem hacmi (kutu) hem nakit yükünü
      (tahsilat) bilmek zorunda — tasarımın kendi satırı "5 durak · 7 kutu · 2 tahsilat".

      Fikstür kutulu ve borçlu bir durak kuruyor; sayılar oradan doğrulanıyor.
    */
    const { order, items } = await orders.create(
      {
        warehouseId, customerId, channel: 'b2c', deliveryType: 'route',
        deliveryZoneId: zoneId, deliveryDate: today, totalCents: 4000,
      },
      [{ variantId, qty: 2, unitPriceCents: 2000, vatRate: 5.5 }],
    );
    const stockId = (await stocks.insert({
      warehouseId, variantId, physicalQty: 20, expiryDate: dayOffset(45), purchasePriceCents: 200,
    })).id;
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 2 });
    await advanceOrder(db, order.id, ['confirmed', 'preparing']);
    const box = await openBox(db, { orderId: order.id, warehouseId });
    if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
    const sealed = await sealBox(db, {
      boxId: box.box.boxId,
      warehouseId,
      picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty: 2 }] }],
    });
    if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);

    const route = (await listCourierRoutes(db, { date: today, scope: warehouseScope(['courier'], [warehouseId]) }))
      .find((row) => row.zoneId === zoneId);

    expect(route?.boxCount).toBeGreaterThanOrEqual(1);
    /* Borç motorun kuralından türer (toplam − tahsil + iade > 0): ödenmiş sipariş sayılmaz,
       çünkü kuryenin kapıda yapacağı iş yok. */
    expect(route?.collectionCount).toBeGreaterThanOrEqual(1);
  });
});
