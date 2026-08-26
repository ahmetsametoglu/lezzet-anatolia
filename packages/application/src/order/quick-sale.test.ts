import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, DeliveryRunService, DeliveryZoneService, OrderItemBatchService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse, mustDelete } from '@lezzet/database/testing';
import { quickSale } from './quick-sale';
import { transitionOrder } from './transition';

/**
 * Hızlı satış (07.10) — kapı önü tek adım. Doğrulanan şey: **tek çağrıda kapanıyor mu** (stok
 * fiiliden düşüyor, referans doğuyor, para yazılıyor, iz kalıyor) ve **olmayan malı satmıyor mu**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let batchA: string;
let batchB: string;
let cashAccount: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kapı satışı testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Mantı ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Kapı müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
  // Kapı önü nakdinin gireceği çekmece — tahsilat artık bir HAREKETTİR (12.2).
  cashAccount = (await new AccountService(db).insert({ name: `Kapı kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('reservation').delete().eq('variant_id', variantId);
  await db.from('stock').delete().eq('variant_id', variantId);
  // A önce doluyor (yakın tarih) — FEFO onu önce çıkarmalı.
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 3, expiryDate: dayOffset(10), purchasePriceCents: 200 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(300), purchasePriceCents: 300 })).id;
});

afterAll(async () => {
  // Sipariş AYRICA silinmez: `purgeTestData` onu `profileIds`ten buluyor. Elle yazılan bu satır
  // teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [cashAccount], // hareketleri de onunla gider
    warehouseIds: [warehouseId],
  });
});

/** Kapıda açılan taslak: kaynak `door`, teslimat yok. */
async function doorDraft(qty: number, unitPriceCents = 1000) {
  return orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'door', totalCents: qty * unitPriceCents },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5 }],
  );
}

describe('hızlı satış (07.10)', () => {
  it('tek çağrıda kapanır: stok fiiliden düşer, referans doğar, para yazılır', async () => {
    const { order } = await doorDraft(4);

    const outcome = await quickSale(db, { orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.referenceNo).toMatch(/^LA-\d{2}-/); // ilk kalıcı durum `completed`
    expect(outcome.consumedQty).toBe(4);
    expect(outcome.paymentRecorded).toBe(true);

    const kapanan = await orders.getById(order.id);
    expect(kapanan).toMatchObject({
      status: 'completed',
      paymentStatus: 'paid', // tahsilat hareketinden TÜRETİLDİ
      paymentMethod: 'cash',
      amountCollectedCents: 4000,
      deliveryCostCents: 0, // kapıda teslimat yapılmadı — rota birim maliyeti yazılamaz
      paymentFeeCents: 0, // nakitte komisyon sıfırdır (uydurma değil, olgu)
    });

    // Para uydurulmadı: nakit gerçekten kasanın bakiyesine girdi.
    expect((await new AccountService(db).balance(cashAccount)).balanceCents).toBe(4000);

    // FEFO: önce süresi dolan çıktı — 3 × A (2 €) + 1 × B (3 €) = 9 €.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(0);
    expect((await stocks.getById(batchB))?.physicalQty).toBe(9);
    expect(outcome.cogsAmountCents).toBe(900);
  });

  it('adım atlandı diye İZ atlanmaz: parti kaydı ve geçiş logu yazılır', async () => {
    const { order } = await doorDraft(2);
    // Hesap AÇIKÇA verilir: verilmezse `door_cash_account_id` ayarına düşülür ve o ayar yerelde
    // demo kasayı gösterir — tahsilat kullanıcının gerçek kasasına yazılırdı (denetim R2).
    await quickSale(db, { orderId: order.id, paymentMethod: 'card', paymentAccountId: cashAccount });

    // Geri çağırma ("bu parti kime gitti") hızlı satışta da çalışır.
    const partiler = await itemBatches.listByOrder(order.id);
    expect(partiler).toHaveLength(1);
    expect(partiler[0]).toMatchObject({ stockId: batchA, qty: 2 });

    const gecisler = await db.from('order_status_log').select('from_status,to_status').eq('order_id', order.id);
    expect(gecisler.data).toEqual([{ from_status: 'draft', to_status: 'completed' }]);
  });

  it('rezervasyon adımı YOK: satış sonrası siparişin ayrılmışı kalmaz', async () => {
    const { order } = await doorDraft(2);
    // Online sepetini açmış, kapıya gelip almış: kendi ayırdığı mal kendisini engellemez.
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 2 });

    expect((await quickSale(db, { orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount })).status).toBe('ok');
    expect(await reservations.listActiveByOrder(order.id)).toHaveLength(0);
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
  });

  it('BAŞKASINA ayrılmış mal kapıda satılamaz — tek satır yazılmadan reddedilir', async () => {
    const { order: baskasi } = await doorDraft(1);
    await reservations.reserve({ orderId: baskasi.id, warehouseId, variantId, qty: 12 }); // 13'ün 12'si sözlü

    // FEFO önerisi parti bazında bakar (varyant-toplamı rezervasyonu görmez); son söz RPC'nindir —
    // emniyet, öneriyi üreten katmanda değil, yazımın olduğu yerde durur.
    const { order } = await doorDraft(3);
    const outcome = await quickSale(db, { orderId: order.id, paymentMethod: 'cash' });
    expect(outcome).toMatchObject({ status: 'insufficient_stock', variantId, available: 1 });

    // Reddedilen satış hiçbir iz bırakmaz.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
    expect((await orders.getById(order.id))?.status).toBe('draft');
    expect(await itemBatches.listByOrder(order.id)).toHaveLength(0);
  });

  it('taslak olmayan sipariş kapıda satılamaz', async () => {
    const { order } = await doorDraft(1);
    await transitionOrder(db, { orderId: order.id, to: 'confirmed' });

    // `confirmed → completed` motorun geçiş tablosunda YOK: kural reddi, stok yarışı değil.
    expect(await quickSale(db, { orderId: order.id, paymentMethod: 'cash' })).toMatchObject({
      status: 'forbidden',
      reason: 'not_allowed',
    });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
  });

  it('teslim edilmiş sipariş hızlı satış yolundan kapatılamaz — o kapanıştır (07.7)', async () => {
    const { order } = await doorDraft(1);
    await db.from('order').update({ status: 'delivered' }).eq('id', order.id);

    // `delivered → completed` İZİNLİ ama hızlı satış değil: stoğu ikinci kez düşürmemeli.
    expect(await quickSale(db, { orderId: order.id, paymentMethod: 'cash' })).toMatchObject({
      status: 'forbidden',
      reason: 'not_fast_sale_path',
    });
    expect((await stocks.getById(batchA))?.physicalQty).toBe(3);
  });

  it('kapıda eksik verilirse ödeme durumu kendiliğinden düzelir', async () => {
    const { order, items } = await doorDraft(4);

    // 4 istendi, 2 verildi; para yine 4'ünki alınmış olsa durum `paid` kalır ama fazlalık görünür —
    // burada gerçekten verilen kadarı tahsil ediliyor.
    const outcome = await quickSale(db, {
      orderId: order.id,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
      collectedAmountCents: 2000,
      picks: [{ orderItemId: items[0]!.id, batches: [{ stockId: batchA, qty: 2 }] }],
    });
    expect(outcome.status).toBe('ok');

    const kapanan = await orders.getById(order.id);
    expect(kapanan?.paymentStatus).toBe('paid'); // 20 € tahsil, 20 € karşılandı
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
    const line = (await orders.getWithItems(order.id))!.items[0]!;
    expect(line.fulfilledQty).toBe(2);
  });

  it('hesap verilmezse tahsilat AYARDAKİ çekmeceye yazılır', async () => {
    // Kapıdaki kasiyer ekranı hesabı çoğu zaman göndermez; düşülen yol ayardır ve bu yol bugüne
    // kadar HİÇ sınanmamıştı — hesapsız çağrılar sessizce yereldeki demo kasaya yazıyordu
    // (denetim R2). Ayar bilinen bir duruma getirilir, sonra bulunduğu gibi geri konur (§4b).
    const settings = settingsSnapshot(db);
    const ayarKasasi = (await new AccountService(db).insert({ name: `Ayar kasası ${stamp}`, type: 'cash' })).id;
    await settings.override('door_cash_account_id', ayarKasasi);

    try {
      const { order } = await doorDraft(3);
      const outcome = await quickSale(db, { orderId: order.id, paymentMethod: 'cash' }); // hesap YOK, ayar var
      expect(outcome).toMatchObject({ status: 'ok', paymentRecorded: true });

      // Para uydurulmadı ve DOĞRU çekmeceye girdi: testin kendi kasası boş kaldı.
      expect((await new AccountService(db).balance(ayarKasasi)).balanceCents).toBe(3000);
    } finally {
      await settings.restore();
      await mustDelete(db, 'money_movement', (q) => q.eq('account_id', ayarKasasi));
      await mustDelete(db, 'account', (q) => q.eq('id', ayarKasasi));
    }
  });

  it('hesap belirsizse satış YİNE kapanır — mal gitti, para kayıtsız görünür', async () => {
    // Uydurulmuş bir "ödendi"den, kaydedilmemiş ama görünür bir tahsilat iyidir.
    // Ayar seed'de dolu olabilir; bu senaryo tam da onun BOŞ olduğu hâli sınıyor → geçici olarak kaldır.
    const settings = settingsSnapshot(db);
    await settings.remove('door_cash_account_id');

    try {
      const { order } = await doorDraft(1);
      const outcome = await quickSale(db, { orderId: order.id, paymentMethod: 'cash' }); // hesap yok, ayar da yok
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      expect(outcome.paymentRecorded).toBe(false);

      const kapanan = await orders.getById(order.id);
      expect(kapanan?.status).toBe('completed'); // mal gitti, satış kapandı
      expect(kapanan?.amountCollectedCents).toBe(0); // para kaydı yok — uydurulmadı
      expect(kapanan?.paymentStatus).toBe('pending');
    } finally {
      // Ne bulduysak onu bırakırız — ayar YOKTUYSA yok kalır (eskiden `if (previous)` ile atlanıyordu,
      // yani test değeri geride kalabiliyordu).
      await settings.restore();
    }
  });

  it('iki kez satılamaz — stok bir kez düşer', async () => {
    const { order } = await doorDraft(2);
    await quickSale(db, { orderId: order.id, paymentMethod: 'cash', paymentAccountId: cashAccount });

    // İkincide hesap gerekmez: satış zaten reddediliyor, tahsilat adımına hiç gelinmiyor.
    const ikinci = await quickSale(db, { orderId: order.id, paymentMethod: 'cash' });
    expect(ikinci.status).toBe('forbidden'); // `completed` terminal
    expect((await stocks.getById(batchA))?.physicalQty).toBe(1);
  });
});

/**
 * **ARAÇTAN SATIŞ SEFERE BAĞLANIR** (ölçülmüş açık, 26.08).
 *
 * Sefer kapanışının beklediği nakit `delivery_run_collection`'dan geliyor ve o görünüm
 * `delivery_run_id is not null` süzüyor; kolonu yazan tek yer ise seferin DURAKLARI
 * (`start_delivery_run`). Araçtan yapılan satış bir durak değil — bağ kurulmasaydı kurye akşam
 * parayı teslim eder, sistem onu beklemez ve mutabakat sebebi görünmeyen bir FAZLA verirdi.
 *
 * Kurulum bilerek AYRI (dosyanın `beforeAll`ına dokunulmuyor): bu senaryonun araç deposu, kuryesi,
 * bölgesi ve açık seferi var; ötekilerin hiçbirinin yok.
 */
describe('araçtan satış — sefer bağı (26.08)', () => {
  const yerel: { aracId?: string; tesisId?: string; kuryeId?: string; zoneId?: string; runId?: string; variantId?: string } = {};
  const gun = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    yerel.aracId = (await createTestWarehouse(db, { label: 'VAN', kind: 'vehicle' })).id;
    yerel.tesisId = (await createTestWarehouse(db, { label: 'TESIS' })).id;

    // Kurye kapsamsız OLAMAZ (`user_profiles_warehouse_scope`) — kapsamına aracı ve tesisi alıyor.
    const kurye = await new UserProfileService(db).insert({
      name: `Kurye ${stamp}`,
      roles: ['courier'],
      warehouseIds: [yerel.aracId, yerel.tesisId],
    });
    yerel.kuryeId = kurye.id;
    // Dosyanın ortak listesine EKLENMİYOR: iç `afterAll` dıştakinden ÖNCE koşuyor ve depoyu
    // silmeye çalıştığımda kurye hâlâ o depoları kapsamında taşıyordu (`restrict` — ölçüldü).
    // Kuryeyi kendi temizliğimde, depolarla AYNI çağrıda topluyorum: sıra `purgeTestData`nın işi.

    // Bölge TESİSE bağlanır — araca bağlanamaz (tetikleyici, `warehouse-vehicle.test.ts`).
    const zoneSvc = new DeliveryZoneService(db);
    yerel.zoneId = (await zoneSvc.insert({ name: `Sefer bölgesi ${stamp}`, warehouseId: yerel.tesisId, weekdays: [1, 2, 3, 4, 5, 6, 7] })).id;

    const run = await new DeliveryRunService(db).start({
      zoneId: yerel.zoneId,
      date: gun,
      courierId: kurye.id,
      referenceNo: `SF-TEST-${String(stamp).slice(-6)}`,
    });
    yerel.runId = run.runId;

    const { variants } = await new ProductService(db).create({ name: { tr: `Araç ürünü ${stamp}` }, categoryId });
    yerel.variantId = variants[0]!.id;
    await stocks.insert({ warehouseId: yerel.aracId, variantId: yerel.variantId, physicalQty: 20, expiryDate: dayOffset(90), purchasePriceCents: 100 });
  });

  afterAll(async () => {
    await db.from('order').delete().eq('warehouse_id', yerel.aracId!);
    await db.from('stock').delete().eq('variant_id', yerel.variantId!);
    await db.from('delivery_run_close').delete().eq('delivery_run_id', yerel.runId!);
    await db.from('order').delete().eq('delivery_run_id', yerel.runId!);
    await db.from('delivery_run').delete().eq('id', yerel.runId!);
    await db.from('delivery_zone').delete().eq('id', yerel.zoneId!);
    await purgeTestData(db, { profileIds: [yerel.kuryeId!], warehouseIds: [yerel.aracId!, yerel.tesisId!] });
  });

  /** Araçtan açılan taslak — kaynağı `door`, deposu ARAÇ. */
  async function aracTaslagi() {
    return orders.create(
      { warehouseId: yerel.aracId!, customerId, channel: 'b2c', orderSource: 'door', totalCents: 500 },
      [{ variantId: yerel.variantId!, qty: 1, unitPriceCents: 500, vatRate: 5.5 }],
    );
  }

  it('araçtan satış AÇIK SEFERE bağlanır ve beklenen nakde girer', async () => {
    const collection = async () => {
      const { data } = await db.from('delivery_run_collection').select('expected_cash').eq('delivery_run_id', yerel.runId!).maybeSingle();
      return Number(data?.expected_cash ?? 0);
    };
    const once = await collection();

    const { order } = await aracTaslagi();
    const sonuc = await quickSale(db, {
      orderId: order.id,
      actorId: yerel.kuryeId,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
    });
    expect(sonuc.status).toBe('ok');

    const kapanmis = await orders.getById(order.id);
    expect(kapanmis!.deliveryRunId).toBe(yerel.runId);
    // Asıl iddia BU: para seferin beklenen nakdine girdi. Kolon yazılmasa görünüm onu hiç görmezdi.
    expect(await collection()).toBe(once + 5);
  });

  /**
   * DEPO KAPISINDAKİ satış bir sefere ait değildir — parası kasaya girer, kuryenin kapanışına
   * değil. Ölçüt satışın YERİ, personelin rolü değil: aynı kurye tesisten satsa da bağ kurulmaz.
   */
  it('TESİSTEN yapılan satış sefere bağlanmaz — ölçüt satışın yeri', async () => {
    await stocks.insert({ warehouseId: yerel.tesisId!, variantId: yerel.variantId!, physicalQty: 5, expiryDate: dayOffset(90), purchasePriceCents: 100 });
    const { order } = await orders.create(
      { warehouseId: yerel.tesisId!, customerId, channel: 'b2c', orderSource: 'door', totalCents: 500 },
      [{ variantId: yerel.variantId!, qty: 1, unitPriceCents: 500, vatRate: 5.5 }],
    );
    const sonuc = await quickSale(db, { orderId: order.id, actorId: yerel.kuryeId, paymentMethod: 'cash', paymentAccountId: cashAccount });
    expect(sonuc.status).toBe('ok');
    expect((await orders.getById(order.id))!.deliveryRunId).toBeNull();
    await db.from('order').delete().eq('id', order.id);
  });

  /**
   * **"AÇIK SEFER" TEK TANIMDIR** (mobil şeridin ölçümü, 26.08) — ve tanım *kapanmamış olmak*tır,
   * *dönmemiş olmak* değil.
   *
   * Ayrışma böyle görülmüştü: seed dönüş damgasını kapanış kaydı OLMADAN yazınca kurye ekranı
   * seferi "açık" (kapat düğmesi çizili) gösterdi, motor ise kendi ölçütüyle "kapalı" saydı ve
   * araçtan satılan malın parası hiçbir sefere bağlanmadı. İki tanım varsa biri bir gün yanlış olur.
   *
   * Burada o hâl elle kuruluyor (damga var, kapanış yok) ve iddia şu: ekran ne diyorsa motor da
   * onu der. Ölçüt yeniden damgaya çevrilirse bu test kırmızıya döner.
   */
  it('DÖNÜŞ DAMGALI ama kapanmamış sefer hâlâ açıktır — motor ekranla aynı tanımı okur', async () => {
    await db
      .from('delivery_run')
      .update({ returned_at: new Date().toISOString() })
      .eq('id', yerel.runId!);

    const { order } = await aracTaslagi();
    const sonuc = await quickSale(db, {
      orderId: order.id,
      actorId: yerel.kuryeId,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
    });
    expect(sonuc.status).toBe('ok');
    expect((await orders.getById(order.id))!.deliveryRunId).toBe(yerel.runId);
  });

  /**
   * **KAPANMIŞ SEFER PARA ALMAZ** (mobil şeridin ölçümü, 26.08).
   *
   * Mutabakat bir FOTOĞRAFTIR: kapanış anında beklenen nakit sayılan nakitle karşılaştırılır ve
   * fark yazılır. Kapanmış bir sefere sonradan satış bağlamak o fotoğrafı geçmişe dönük değiştirir
   * — dün mutabık olan sefer bugün kendiliğinden "eksik" görünür ve sebebi hiçbir ekranda yazmaz.
   *
   * Bu test aynı zamanda "açık sefer"in TEK tanımını çiviliyor: motor ile kurye ekranı aynı
   * fonksiyondan (`readCourierRun`) okuyor. Ayrıştıkları gün burası kırmızıya döner — ilk yazımda
   * motor kendi ölçütünü kurmuştu ve seed dönüş damgasını kapanışsız yazınca bağ hiç kurulmadı.
   *
   * SON sırada duruyor ve bilerek: seferi kapatmak yukarıdaki iki senaryonun zeminini kaldırır.
   */
  it('KAPANMIŞ sefere bağlanmaz — mutabakat fotoğrafı geçmişe dönük değişmez', async () => {
    const kapanis = await new DeliveryRunService(db).close({ runId: yerel.runId!, countedCashCents: 0, actorId: null });
    expect(kapanis.ok).toBe(true);

    const { order } = await aracTaslagi();
    const sonuc = await quickSale(db, {
      orderId: order.id,
      actorId: yerel.kuryeId,
      paymentMethod: 'cash',
      paymentAccountId: cashAccount,
    });
    expect(sonuc.status).toBe('ok'); // Satış kapanır — bağ kurulmaması satışı engellemez.
    expect((await orders.getById(order.id))!.deliveryRunId).toBeNull();
  });
});
