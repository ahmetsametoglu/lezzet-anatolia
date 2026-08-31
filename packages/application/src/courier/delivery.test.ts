import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, MoneyMovementService, OrderItemBatchService, OrderService, ProductService,
  ReservationService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, settingsSnapshot, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { confirmDoorDelivery, type DeliveryProofInput, type DoorCollectionInput } from './delivery';
import { readDeliveryProof, requestDeliveryProofUploadUrl } from './proof';
import { advanceOrder } from '../order/advance.testkit';
import { openBox, sealBox } from '../warehouse/boxes';

/**
 * Kapıda teslim, eksik kalem ve tahsilat (11.2/11.3) — terfi 21.10 ile taşındı (kaynağı
 * `apps/web/lib/courier/delivery.test.ts`); K4 anahtarının kapıdaki ucu burada sınanıyor.
 *
 * Üç kritik doğrulama: **B2B imzasız kapanmıyor mu**, **eksik işareti tutarı kendiliğinden
 * düşürüyor mu** (kurye hesap yapmaz) ve **nakit sınır uyarısı engel değil mi**.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);
const movements = new MoneyMovementService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let b2bCustomerId: string;
let courierId: string;
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
  const category = await new CategoryService(db).create({ name: { tr: `Kapı testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sucuk ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '400 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const customer = await profiles.insert({ name: 'Luc Martin', email: `kapi-${stamp}@example.test` });
  const b2b = await profiles.insert({ name: 'Restaurant Anadolu', email: `b2b-${stamp}@example.test`, type: 'company' });
  const courier = await profiles.insert({ name: 'Kurye Ece', email: `ece-${stamp}@example.test` });
  customerId = customer.id;
  b2bCustomerId = b2b.id;
  courierId = courier.id;
  createdProfiles.push(customer.id, b2b.id, courier.id);

  accountId = (await new AccountService(db).insert({ name: `Kurye kasası ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // **DEFTER SİPARİŞTEN DE PARTİDEN DE ÖNCE** (06.14). Teslim, deftere bir `sale` satırı yazıyor ve
  // o satır İKİSİNİ birden `restrict` ile tutuyor — `order_id` ve `stock_id`. `purgeVariantStock`
  // partinin bütün hareketlerini topladığı için sipariş de aynı anda serbest kalıyor.
  //
  // Eski hâlde üç silme de `db.from(...).delete()` ile yazılmıştı ve o çağrı hatayı **yutuyor**:
  // ne sipariş ne parti gidiyordu, her test bir öncekinin malını da sayıyordu (ölçüldü 27.08:
  // kalan stok 28 yerine 137). Testin iddiası doğruydu, zemin temizliği yalan söylüyordu.
  await purgeVariantStock(db, [variantId]);
  for (const id of [customerId, b2bCustomerId]) await mustDelete(db, 'order', (q) => q.eq('customer_id', id));
  // Partiye çıpalanmamış (yalnız varyant taşıyan) rezervasyonlar `purgeVariantStock`ın kapsamında
  // değil — partiyi tutmuyorlar ama kullanılabilir stoğu düşürüyorlar.
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  stockId = (await stocks.insert({ warehouseId, variantId, physicalQty: 30, expiryDate: dayOffset(60), purchasePriceCents: 400 })).id;
});

afterAll(async () => {
  // Sipariş ve rezervasyon AYRICA silinmez: ikisi de `purgeTestData`'nın bildiği bağlar (sipariş
  // `profileIds`ten, rezervasyon `productIds`ten) ve hareketin anahtarı zaten hesaptır
  // (`money_movement.order_id` `set null` — denetim R1). Elle yazılan bu satırlar teardown'ı
  // öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** Kapıya varmış sipariş: hazırlanmış, partisi yazılmış, yola çıkmış. */
async function atTheDoor(opts: { channel?: 'b2b' | 'b2c'; qty?: number; unitPriceCents?: number } = {}) {
  const qty = opts.qty ?? 4;
  const unitPriceCents = opts.unitPriceCents ?? 1000;
  const channel = opts.channel ?? 'b2c';
  const { order, items } = await orders.create(
    {
      warehouseId,
      customerId: channel === 'b2b' ? b2bCustomerId : customerId,
      channel,
      deliveryType: 'route',
      deliveryDate: today,
      courierId,
      paymentMethod: 'cash',
      totalCents: qty * unitPriceCents,
    },
    [{ variantId, qty, unitPriceCents, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty });
  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
  /*
    HAZIRLIK KUTUYLA YAPILIR (kullanıcı kararı 30.08) — kutusuz sipariş artık ne `ready` olur ne
    kapıdan çıkar. Fikstür de gerçek yolu izliyor: kutu açılır, mühürlenir (mühür siparişi HAZIR
    yapar), sonra yola çıkarılır. Kutu KODU geri dönüyor çünkü teslim çağrısı onu istiyor —
    kapıda okutulmayan kutu teslimi durdurur (`boxes_missing`).
  */
  const box = await openBox(db, { orderId: order.id, warehouseId });
  if (box.status !== 'ok') throw new Error(`fikstür: kutu açılamadı (${box.status})`);
  const sealed = await sealBox(db, {
    boxId: box.box.boxId,
    warehouseId,
    picks: [{ orderItemId: items[0]!.id, batches: [{ stockId, qty }] }],
  });
  if (sealed.status !== 'ok') throw new Error(`fikstür: kutu mühürlenemedi (${sealed.status})`);
  await advanceOrder(db, order.id, ['out_for_delivery']);
  return { orderId: order.id, itemId: items[0]!.id, boxCode: box.box.code };
}

describe('teslim onayı (11.2)', () => {
  /*
    KANIT KAPISI AYARA BAĞLI VE FABRİKA DEĞERİ ARTIK KAPALI (kullanıcı kararı 30.08): imza adımı
    kuryenin ekranından söküldü, kanıt kutu okutmasının kendisi oldu. Kapının KENDİSİ duruyor ve
    kapsam yine açılabilir — test onu kendi içinde açıyor, çünkü ölçülen şey ayarın değeri değil
    kapının çalışıp çalışmadığı.
  */
  it('kanıt kapsamı AÇIKKEN B2B teslimatı imzasız KAPANMAZ ve hiçbir yazım yapılmaz', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('delivery_proof_required', { b2b: true, b2c: false });
    try {
      const { orderId, boxCode } = await atTheDoor({ channel: 'b2b' });

      const outcome = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode] });

      expect(outcome).toEqual({ status: 'proof_required', channel: 'b2b' });
      // Kanıt kapısı yazımdan ÖNCE: sipariş hâlâ yolda, stok el değmemiş.
      expect((await orders.getById(orderId))?.status).toBe('out_for_delivery');
      expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(30);
    } finally {
      await settings.restore();
    }
  });

  it('imzayla B2B teslimatı kapanır, kanıt siparişe yazılır', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('delivery_proof_required', { b2b: true, b2c: false });
    try {
      const { orderId, boxCode } = await atTheDoor({ channel: 'b2b' });
      // Ekranın göndereceği şekiller — kanıt görsel anahtarı taşır, tahsilat üç yöntemle sınırlıdır.
      const proof: DeliveryProofInput = { kind: 'signature', imageKey: 'proofs/abc.png', receivedBy: 'Şef Murat' };
      const collection: DoorCollectionInput = { method: 'cash', amountCents: 4000, accountId };

      const outcome = await confirmDoorDelivery(db, {
        orderId,
        courierId,
        scannedBoxCodes: [boxCode],
        proof,
        collection,
      });

      expect(outcome.status).toBe('ok');
      const order = await orders.getById(orderId);
      expect(order?.status).toBe('delivered');
      expect(order?.deliveryProof).toMatchObject({ kind: 'signature', receivedBy: 'Şef Murat', courierId });
    } finally {
      await settings.restore();
    }
  });

  it('B2C kanıtsız teslim edilebilir — kapsam parametrik, varsayılan kapalı', async () => {
    const { orderId, boxCode } = await atTheDoor();

    expect((await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode] })).status).toBe('ok');
    expect((await orders.getById(orderId))?.status).toBe('delivered');
  });

  it('başka kuryenin siparişi bu ekrandan teslim edilemez', async () => {
    const { orderId, boxCode } = await atTheDoor();
    await orders.update({ id: orderId, courierId: null });

    expect(await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode] })).toEqual({ status: 'forbidden', reason: 'not_assigned' });
  });
});

describe('eksik/reddedilen kalem (11.2)', () => {
  it('eksik işareti tutarı KENDİLİĞİNDEN düşürür — kurye hesap yapmaz', async () => {
    const { orderId, itemId, boxCode } = await atTheDoor({ qty: 4 }); // 40 €

    // Müşteri 1 adedi kabul etmedi → 3 adet teslim.
    const outcome = await confirmDoorDelivery(db, {
      orderId, courierId, scannedBoxCodes: [boxCode],
      adjustments: [{ orderItemId: itemId, fulfilledQty: 3 }],
      collection: { method: 'cash', amountCents: 3000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', collectedCents: 3000, amountDueCents: 0, paymentStatus: 'paid' });
    // Reddedilen adet HİÇ çıkmadı: fiiliden yalnız 3 düştü, 1 adet depoda kaldı.
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(27);
  });

  it('kalem düzeltmesi teslimden ÖNCE yazılır — mal iki kez oynatılmaz', async () => {
    const { orderId, itemId, boxCode } = await atTheDoor({ qty: 4 });

    await confirmDoorDelivery(db, {
      orderId, courierId, scannedBoxCodes: [boxCode],
      adjustments: [{ orderItemId: itemId, fulfilledQty: 2 }],
      collection: { method: 'cash', amountCents: 2000, accountId },
    });

    // Kalem–parti kaydı 2'ye inmiş olmalı: teslimde bundan düşülür (0026 "tam bir kez say").
    const batches = await itemBatches.listByOrder(orderId);
    expect(batches.reduce((sum, batch) => sum + batch.qty, 0)).toBe(2);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(28);
  });
});

describe('tahsilat ve nakit sınırı (11.3)', () => {
  it('nakit yasal sınır aşımında UYARI çıkar ama tahsilat tamamlanır', async () => {
    const { orderId, boxCode } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 }); // 2.000 € — sınır 1.000 €

    const outcome = await confirmDoorDelivery(db, {
      orderId, courierId, scannedBoxCodes: [boxCode],
      collection: { method: 'cash', amountCents: 200_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: true, collectedCents: 200_000, paymentStatus: 'paid' });
    expect((await orders.getById(orderId))?.status).toBe('delivered'); // engellenmedi
  });

  it('aynı tutar KARTLA alınırsa uyarı yok — sınır yalnız nakde ait', async () => {
    const { orderId, boxCode } = await atTheDoor({ qty: 4, unitPriceCents: 50_000 });

    const outcome = await confirmDoorDelivery(db, {
      orderId, courierId, scannedBoxCodes: [boxCode],
      collection: { method: 'card', amountCents: 200_000, accountId },
    });

    expect(outcome).toMatchObject({ status: 'ok', cashLimitExceeded: false });
    // Yöntem siparişe yazılır: gün kapanışı beklenen toplamları bundan türetir (11.6).
    expect((await orders.getById(orderId))?.paymentMethod).toBe('card');
  });

  it('sınır ayardan gelir — kodda sabit yok', async () => {
    const settings = settingsSnapshot(db);
    await settings.override('cash_legal_limit_cents', 1_000); // 10 €
    const { orderId, boxCode } = await atTheDoor({ qty: 4 });

    try {
      const outcome = await confirmDoorDelivery(db, {
        orderId, courierId, scannedBoxCodes: [boxCode],
        collection: { method: 'cash', amountCents: 4000, accountId },
      });
      expect(outcome).toMatchObject({ cashLimitExceeded: true });
    } finally {
      await settings.restore();
    }
  });

  it('tahsilatsız teslim: kalan borç görünür kalır', async () => {
    const { orderId, boxCode } = await atTheDoor({ qty: 4 });

    const outcome = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode] });

    expect(outcome).toMatchObject({ status: 'ok', collectedCents: 0, amountDueCents: 4000, paymentStatus: 'pending' });
  });

  it('K4: kapı anahtarı HAREKETE yazılır — kuyruk tekrarının yakalanacağı tek yer orası', async () => {
    // Anahtar sözleşmede duruyor ama harekete geçmiyorsa hiçbir şeyi engellemez: tekrarı yakalayan
    // kontrol `meta.idempotencyKey` üzerinden okuyor (`order/payment.ts`).
    const { orderId, boxCode } = await atTheDoor({ qty: 2 });
    const key = `door-${stamp}-${orderId}`;

    await confirmDoorDelivery(db, {
      orderId, courierId, scannedBoxCodes: [boxCode],
      collection: { method: 'cash', amountCents: 2000, accountId, idempotencyKey: key },
    });

    const written = (await movements.listByOrder(orderId)).filter((m) => m.type === 'order_payment');
    expect(written).toHaveLength(1);
    expect(written[0]?.meta?.['idempotencyKey']).toBe(key);
  });

  it('K4: siparişin tamamı yeniden gönderilirse teslim RPC’si `stale` der — para adımına HİÇ gelinmez', async () => {
    // Mükerrer yazımın BİRİNCİ kilidi durum makinesidir (`deliver_order` yalnız `out_for_delivery`
    // durumundan teslim eder); anahtar ikinci kilittir. İkisi birden ölçülmezse "anahtar var,
    // koruma var" sanılır — oysa bu yoldan zaten geçilemiyor.
    const { orderId, boxCode } = await atTheDoor({ qty: 2 });
    const collection: DoorCollectionInput = { method: 'cash', amountCents: 2000, accountId, idempotencyKey: `retry-${stamp}` };

    const first = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode], collection });
    const second = await confirmDoorDelivery(db, { orderId, courierId, scannedBoxCodes: [boxCode], collection });

    expect(first.status).toBe('ok');
    expect(second).toEqual({ status: 'stale', currentStatus: 'delivered' });
    expect((await movements.listByOrder(orderId)).filter((m) => m.type === 'order_payment')).toHaveLength(1);
  });
});

/**
 * Teslim kanıtının YÜKLEME kapısı (11.2).
 *
 * Bu blok kendi fikstürünü kurmuyor, yukarıdakini kullanıyor (`atTheDoor`): ikinci bir sipariş
 * kurulumu yazmak aynı seksen satırı ikinci kez yazmak olurdu ve ikisi bir gün ayrışırdı
 * (`CLAUDE §1`). Sınanan üç kural: **anahtarı kapı seçer**, **başkasının siparişine yüklenemez**,
 * **yalnız görsel kabul edilir**.
 */
describe('teslim kanıtı yükleme kapısı (11.2)', () => {
  it('kuryesi olduğu siparişe imzalı adres üretir ve ANAHTARI kapı seçer', async () => {
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl(db, { orderId, courierId, filename: 'imza.png' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Anahtar sipariş kimliğine göre klasörlü: kanıt siparişle birlikte temizlenebilsin diye.
    expect(result.key).toMatch(new RegExp(`^delivery/proofs/${orderId}/[a-z0-9-]+\\.png$`));
    expect(result.uploadUrl).toContain('https://');
  });

  it('aynı siparişe iki kanıt AYRI anahtar alır — biri ötekini ezmez', async () => {
    // Bir teslimatta hem imza hem fotoğraf olabilir; üzerine yazılan şey, "eksik geldi"
    // ihtilafının tek sigortasıdır.
    const { orderId } = await atTheDoor();

    const ilk = await requestDeliveryProofUploadUrl(db, { orderId, courierId, filename: 'imza.png' });
    const ikinci = await requestDeliveryProofUploadUrl(db, { orderId, courierId, filename: 'kapi.jpg' });

    expect(ilk.ok && ikinci.ok).toBe(true);
    if (!ilk.ok || !ikinci.ok) return;
    expect(ilk.key).not.toBe(ikinci.key);
  });

  it('BAŞKA kuryenin siparişine yüklenemez — ve cevap "yok" ile aynı', async () => {
    // Ayrı cevap verseydik kimlik deneyerek hangi siparişlerin var olduğu haritalanabilirdi.
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl(db, {
      orderId,
      courierId: '00000000-0000-0000-0000-000000000000',
      filename: 'imza.png',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('görsel olmayan dosya reddedilir — yetki sorusuna hiç gelinmeden', async () => {
    const { orderId } = await atTheDoor();

    const result = await requestDeliveryProofUploadUrl(db, { orderId, courierId, filename: 'kanit.pdf' });

    expect(result).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('yazılan kanıt OKUNABİLİYOR — yazılıp hiç açılmayan sigorta, olmayan sigortadır', async () => {
    // Sözleşmenin iki ucu bir kez ayrışmıştı: yazan `imageKey` koyuyordu, ekran `photos[]`
    // arıyordu. Bu test o turu kapatıyor — yazılan kayıt aynı şemadan geri okunuyor.
    const { orderId, boxCode } = await atTheDoor({ channel: 'b2b' });
    const upload = await requestDeliveryProofUploadUrl(db, { orderId, courierId, filename: 'imza.png' });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;

    await confirmDoorDelivery(db, {
      orderId,
      courierId,
      scannedBoxCodes: [boxCode],
      proof: { kind: 'signature', imageKey: upload.key, receivedBy: 'Mehmet Yılmaz' },
    });

    const stored = (await orders.getById(orderId))?.deliveryProof;
    const view = await readDeliveryProof(stored);
    expect(view).toMatchObject({ kind: 'signature', imageKey: upload.key, receivedBy: 'Mehmet Yılmaz', courierId });
    // Açılabilir adres: kanıtın tek amacı ihtilafta AÇILMAK.
    expect(view?.imageUrl).toContain('https://');
  });

  it('tanınmayan biçimdeki blok null döner — yarım kanıt "kanıt var" der', async () => {
    // Eski biçimde yazılmış bir blok varsa yarım göstermektense hiç göstermemek doğru.
    expect(await readDeliveryProof({ photos: ['x'], by: 'biri' })).toBeNull();
    expect(await readDeliveryProof(null)).toBeNull();
  });
});
