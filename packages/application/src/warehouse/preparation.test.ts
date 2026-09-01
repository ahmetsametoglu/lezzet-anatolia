import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderItemBatchService,
  OrderItemService,
  OrderService,
  ProductService,
  ReservationService,
  StockService,
  StorageAreaService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehousePair, mustDelete, purgeVariantStock } from '@lezzet/database/testing';
import type { PreparationPick } from '@lezzet/types';
import { advanceOrder } from '../order/advance.testkit';
import { confirmPreparation, listPreparationQueue, type PreparationLine, type PreparationOrder } from './preparation';

/**
 * **Depo hazırlığı — D1** (10.1–10.3), terfi 21.11 (kaynağı `apps/web/lib/order/preparation-queue.test.ts`).
 *
 * En kritik doğrulama para DEĞİL, paranın YOKLUĞU: depo ekranına giden veride hiçbir tutar
 * bulunmamalı (tasarım §6). Bunu bir arayüz disiplinine bırakmak yerine veri şeklinde sınıyoruz.
 *
 * Terfiyle gelen İKİ yeni iddia var, ikisi de depo değişmezinin (CLAUDE.md §1) karşılığı:
 * kuyruk başka deponun siparişini GÖSTERMEZ ve onay başka deponun siparişine YAZMAZ.
 */
const db = serviceDb();
const orders = new OrderService(db);
const itemBatches = new OrderItemBatchService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let customerId: string;
/** Depo geçişi (DOMAIN §17): sipariş/parti deposuz yazılamaz — testin KENDİ iki deposu. */
let warehouseId: string;
let otherWarehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let nearBatch: string;
let farBatch: string;
/**
 * İki alan (19.29): öneri satırının hangi rafı gösterdiği ancak iki farklı alanla sınanır — tek
 * alanla "adı taşıyor mu" sorusu cevaplanır ama "DOĞRU adı mı taşıyor" sorusu cevaplanmaz.
 */
let areaA: string;
let areaB: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;
  const areas = new StorageAreaService(db);
  areaA = (await areas.insert({ warehouseId, name: 'Dolap A', kind: 'frozen' })).id;
  areaB = (await areas.insert({ warehouseId, name: 'Dolap B', kind: 'frozen' })).id;

  const category = await new CategoryService(db).create({ name: { tr: `Hazırlık kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Fıstıklı Baklava ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  // E-posta benzersiz: damga + DOSYAYA ÖZGÜ önek (kurye emsali). İki dosya aynı damgaya düşerse
  // ("aynı milisaniye") önek ayırır; öneksiz bir damga bir gün mutlaka çakışır.
  const profile = await new UserProfileService(db).insert({
    name: 'Ayşe Yılmaz',
    email: `hazirlik-kapisi-${stamp}@example.test`,
  });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  // Parti SIRASIYLA gider: önce hareket defteri, sonra parti (06.14).
  await purgeVariantStock(db, [variantId]);
  // Yakın tarihli parti önce çıkmalı (FEFO) — konum da öneriyle birlikte gitmeli.
  nearBatch = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 4, expiryDate: dayOffset(10), purchasePriceCents: 400, storageAreaId: areaA })
  ).id;
  farBatch = (
    await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(90), purchasePriceCents: 500, storageAreaId: areaB })
  ).id;
});

afterAll(async () => {
  // Sipariş ve rezervasyon AYRICA silinmez: ikisi de `purgeTestData`'nın bildiği bağlar (sipariş
  // `profileIds`ten, rezervasyon `productIds`ten). Elle yazılan bu satırlar teardown'ı öldürüyordu
  // (ölçüldü 14.08, `cleanup.ts` künyesi). `beforeEach`teki silme başka iş görür: testler arası
  // izolasyon, ve orada kimlikler zaten kurulmuş durumda.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    storageAreaIds: [areaA, areaB],
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

/** Onaylanmış sipariş — kuyruğa düşmesi için gereken en kısa yol. */
async function confirmedOrder(
  qty: number,
  opts: { pinTo?: string; deliveryDate?: string; inWarehouse?: string; stockId?: string; deliveryType?: 'route' | 'shipping' } = {},
) {
  const warehouse = opts.inWarehouse ?? warehouseId;
  const { order, items } = await orders.create(
    { warehouseId: warehouse, customerId, channel: 'b2c', deliveryType: opts.deliveryType ?? 'route', deliveryDate: opts.deliveryDate, orderedTotalCents: qty * 1000 },
    [{ variantId, qty, unitPriceCents: 1000, vatRate: 5.5, stockId: opts.pinTo }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId: warehouse, variantId, qty, stockId: opts.pinTo });
  await advanceOrder(db, order.id, ['confirmed']);
  return { orderId: order.id, itemId: items[0]!.id };
}

/** Yalnız BU testin kurduğu sipariş — küresel kuyruk sayısına bakılmaz (CLAUDE.md §4b). */
async function queueRowOf(orderId: string, opts: { deliveryDate?: string } = {}): Promise<PreparationOrder | undefined> {
  const queue = await listPreparationQueue(db, { warehouseId, ...opts });
  return queue.find((row) => row.orderId === orderId);
}

describe('hazırlık kuyruğu (D1 · 10.1)', () => {
  it('kalem başına parti önerisi verir — önce tarihi yakın olan, konumuyla', async () => {
    const { orderId } = await confirmedOrder(6);

    const line: PreparationLine = (await queueRowOf(orderId))!.lines[0]!;

    // 4 adet yakın partiden, kalan 2 uzak partiden — bir kalem birden çok partiye bölünebilir.
    expect(line.suggestion).toEqual([
      // Öneri ADI taşıyor, kimliği değil (19.29): depocu rafta tabelayı okuyor.
      { stockId: nearBatch, qty: 4, expiryDate: dayOffset(10), areaName: 'Dolap A' },
      { stockId: farBatch, qty: 2, expiryDate: dayOffset(90), areaName: 'Dolap B' },
    ]);
    expect(line.productName).toContain('Fıstıklı Baklava');
    expect(line.variantLabel).toBe('500 g');
    expect(line.shortfallQty).toBe(0);
  });

  it('depoya giden veride HİÇBİR tutar yok (tasarım §6)', async () => {
    const { orderId } = await confirmedOrder(2);

    const mine = (await queueRowOf(orderId))!;

    const serialized = JSON.stringify(mine);
    // Anahtar adları `…Cents` oldu (02.9) ama iddia AYNI: alt-dize araması hem eski hem yeni adı
    // yakalar, çünkü yeni ad eskisini içeriyor (`unitPrice` ⊂ `unitPriceCents`).
    for (const moneyKey of ['unitPrice', 'total', 'purchasePrice', 'lineDiscountAmount', 'amountCollected', 'vatRate']) {
      expect(serialized).not.toContain(moneyKey);
    }
    // Adres ve iletişim de yok; yalnız koli etiketi için ad var.
    expect(serialized).not.toContain('@example.test');
    expect(mine.customerName).toBe('Ayşe Yılmaz');
  });

  it('yarım kalan hazırlık kuyrukta KALIR ve ilerlemesi görünür (v2: "yarım iş sürer")', async () => {
    const { orderId, itemId } = await confirmedOrder(5);
    await advanceOrder(db, orderId, ['preparing']);
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }]);

    const order = (await queueRowOf(orderId))!;

    expect(order.status).toBe('preparing');
    expect(order.pickedLineCount).toBe(0); // kalem tamamlanmadı
    expect(order.lines[0]!.pickedQty).toBe(2);
    // Öneri KALAN adet için kurulur — toplanan tekrar toplanmaz.
    expect(order.lines[0]!.suggestion.reduce((sum, pick) => sum + pick.qty, 0)).toBe(3);
  });

  it('yarım kalan kalemin PARTİ DAĞILIMI da döner — devam eden depocu tahmin etmez (21.11d)', async () => {
    const { orderId, itemId } = await confirmedOrder(8);
    await advanceOrder(db, orderId, ['preparing']);
    // İki partiden toplanmış yarım iş: dağılım tek sayıya (`pickedQty: 6`) indirgenirse geri
    // ÜRETİLEMEZ — hangi 4'ün yakın, hangi 2'nin uzak partiden çıktığı kaybolur.
    await orders.recordPreparation(orderId, [
      { orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 4 }, { stockId: farBatch, qty: 2 }] },
    ]);

    const line = (await queueRowOf(orderId))!.lines[0]!;

    expect(line.pickedQty).toBe(6);
    // Sıra veritabanının, o yüzden içerik karşılaştırması sıradan bağımsız kuruluyor.
    expect([...line.pickedBatches].sort((a, b) => a.stockId.localeCompare(b.stockId))).toEqual(
      [{ stockId: nearBatch, qty: 4 }, { stockId: farBatch, qty: 2 }].sort((a, b) => a.stockId.localeCompare(b.stockId)),
    );
    /* ŞEKİL YAZIMINKİYLE AYNI — iddia DERLEMEDE kuruluyor: okunan dizi, yazım kapısının
       beklediği tipe atanabiliyor. Eskiden bu, diziyi `confirmPreparation`a geri göndererek
       ölçülüyordu; o kapı 30.08'de kutusuz onayı reddetmeye başladı ve yerine geçen `sealBox`
       ABSOLÜT yazıyor (0015) — yani bu fikstürün zaten yazılmış 6 adedinin üstüne aynı partileri
       ikinci kez koymak gerçek bir senaryo değil, testin kendi kurgusunun artığı olurdu.
       Yazım yolunun kendisi `boxes.test.ts`te ölçülüyor (çok kutulu birleşim, parti izi). */
    const geriGonderilebilir: PreparationPick['batches'] = line.pickedBatches;
    expect(geriGonderilebilir).toHaveLength(2);
  });

  it('hiç toplanmamış kalemde dağılım BOŞ DİZİ — eksik alan değil, boş gerçek', async () => {
    const { orderId } = await confirmedOrder(2);

    expect((await queueRowOf(orderId))!.lines[0]!.pickedBatches).toEqual([]);
  });

  it('parti kaydı KALEM kimliğiyle eşleşir — iki kalemli sipariş dağılımları karıştırmaz', async () => {
    // Aynı varyanttan iki satır: haritanın anahtarı sipariş olsaydı ikisi tek yığına düşerdi.
    const { order, items } = await orders.create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', orderedTotalCents: 3000 },
      [
        { variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 },
        { variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 },
      ],
    );
    await reservations.reserve({ orderId: order.id, warehouseId, variantId, qty: 3 });
    await advanceOrder(db, order.id, ['confirmed', 'preparing']);
    await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: nearBatch, qty: 1 }] }]);

    const row = (await queueRowOf(order.id))!;

    expect(row.lines.find((line) => line.itemId === items[0]!.id)!.pickedBatches).toEqual([{ stockId: nearBatch, qty: 1 }]);
    expect(row.lines.find((line) => line.itemId === items[1]!.id)!.pickedBatches).toEqual([]);
  });

  it('teslim edilmiş sipariş kuyruğa girmez — arşiv yığılmaz', async () => {
    const { orderId, itemId } = await confirmedOrder(1);
    await orders.recordPreparation(orderId, [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 1 }] }]);
    await advanceOrder(db, orderId, ['ready', 'out_for_delivery']);

    expect(await queueRowOf(orderId)).toBeUndefined();
  });

  it('gün süzgeci: başka günün siparişi listede yok', async () => {
    const mine = await confirmedOrder(1, { deliveryDate: dayOffset(1) });
    const other = await confirmedOrder(1, { deliveryDate: dayOffset(5) });

    expect(await queueRowOf(mine.orderId, { deliveryDate: dayOffset(1) })).toBeDefined();
    expect(await queueRowOf(other.orderId, { deliveryDate: dayOffset(1) })).toBeUndefined();
  });

  it('BAŞKA DEPONUN siparişi bu kuyrukta GÖRÜNMEZ (CLAUDE.md §1 — depo değişmezi)', async () => {
    // İkinci deponun kendi partisi olmalı: rezervasyon deposuz yazılamaz.
    await stocks.insert({ warehouseId: otherWarehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePriceCents: 400 });
    const { orderId } = await confirmedOrder(2, { inWarehouse: otherWarehouseId });

    expect(await queueRowOf(orderId)).toBeUndefined();
    // Ama kendi deposunda GÖRÜNÜR — süzgeç körlük değil, kapsam.
    const theirs = await listPreparationQueue(db, { warehouseId: otherWarehouseId });
    expect(theirs.some((row) => row.orderId === orderId)).toBe(true);
  });

  /*
    TEK SİPARİŞ SÜZGECİ (10.1 · hazırlık kâğıdı) — belge tek siparişi basıyor ve onun için
    kuyruğun tamamını okuyup elde süzmek, kâğıdın maliyetini kuyruğun boyuna bağlardı.

    Asıl iddia süzgecin ÇALIŞMASI değil, kuyruğun ÖLÇÜTLERİNİ değiştirmemesi: kimlikle istemek bir
    kestirme olsaydı, adrese başka deponun sipariş kimliğini yazan biri o siparişin kâğıdını
    basardı — kalemleri, partileri, rafları ve alıcı adıyla birlikte.
  */
  it('`orderId` verilince YALNIZ o sipariş gelir', async () => {
    const mine = await confirmedOrder(2);
    await confirmedOrder(3);

    const rows = await listPreparationQueue(db, { warehouseId, orderId: mine.orderId });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.orderId).toBe(mine.orderId);
    // Kalemler eksiksiz: kâğıt kuyruk satırından değil, tam siparişten basılıyor.
    expect(rows[0]?.lines).toHaveLength(1);
  });

  it('`orderId` kapsamı DELMEZ — başka deponun siparişi kimlikle de gelmez', async () => {
    await stocks.insert({ warehouseId: otherWarehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(30), purchasePriceCents: 400 });
    const { orderId } = await confirmedOrder(2, { inWarehouse: otherWarehouseId });

    expect(await listPreparationQueue(db, { warehouseId, orderId })).toEqual([]);
  });
});

describe('partiye kilitli kalem (10.2)', () => {
  it('kilitli kalemde öneri o partiye sabitlenir, FEFO devreye girmez', async () => {
    const { orderId } = await confirmedOrder(2, { pinTo: farBatch }); // FEFO yakın partiyi önerirdi

    const line = (await queueRowOf(orderId))!.lines[0]!;

    expect(line.pinnedStockId).toBe(farBatch);
    expect(line.suggestion).toEqual([{ stockId: farBatch, qty: 2, expiryDate: dayOffset(90), areaName: 'Dolap B' }]);
  });

  /* KİLİTLİ KALEM İHLALİ ARTIK KUTU KAPISINDA ÖLÇÜLÜYOR (30.08): `confirmPreparation` kutusuz
     onayı reddettiği için bu kapıdan `pinned_violation`a hiç ulaşılamıyor. Aynı iddia —
     "kilitli kalem başka partiden konamaz, kutu açık kalır, HİÇBİR yazım yok" — `boxes.test.ts`te
     duruyor ve orada gerçek yoldan ölçülüyor. */
});

describe('hazırlık onayı ve eksik kararı (10.3)', () => {
  /*
    HAZIRLIĞIN KENDİSİ ARTIK KUTU DÖNGÜSÜNÜN İÇİNDE (kullanıcı kararı 30.08).

    Bu blokta dört test vardı — "tamamı toplanınca HAZIR", "eksik varsa `preparing`te kalır",
    "büyük eksikte müşteriye sor", "küçük eksikte kalanı gönder". Dördü de `confirmPreparation`
    üzerinden ölçüyordu ve o kapı artık `pickup` dışında her siparişe `box_required` diyor; yani
    ölçtükleri hâl bu kapıdan ÜRETİLEMEZ.

    ÖLÇÜM KAYBOLMADI, İKİYE AYRILDI:
      · geçiş ve parti yazımı → `boxes.test.ts` ("içerik + parti izi yazılır, kutu mühürlenir,
        sipariş HAZIR olur" ve çok kutulu birleşim)
      · eksik tavsiyesinin İÇERİĞİ (`ask_customer` / `send_rest`, eşikler, tutar taşımaması) →
        `domain-core/stock/shortfall.test.ts`, yani motorun kendi birim testi — DB'siz ve orada
        çok daha ayrıntılı
      · tavsiyenin kutu yolunda GÖRÜNÜR olması → `boxes.test.ts` (`declareShort`)

    Kapıya kalan tek şey kapsam kararı ve bilinmeyen sipariş; ikisi aşağıda.
  */
  it('BAŞKA DEPONUN siparişine onay YAZILMAZ — görünür ret döner', async () => {
    const { orderId, itemId } = await confirmedOrder(2);

    const outcome = await confirmPreparation(db, {
      orderId,
      // Depocu ikinci depoda çalışıyor; sipariş birincinin.
      warehouseId: otherWarehouseId,
      picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    // Ret GÖRÜNÜR ama sessiz DEĞİL: hiçbir satır yazılmadı, sipariş durumu da değişmedi.
    expect(await itemBatches.listByOrder(orderId)).toHaveLength(0);
    expect((await orders.getById(orderId))?.status).toBe('confirmed');
  });

  it('olmayan sipariş `not_found` döner', async () => {
    const outcome = await confirmPreparation(db, {
      orderId: '00000000-0000-0000-0000-000000000000',
      warehouseId,
      picks: [],
    });

    expect(outcome).toEqual({ status: 'not_found' });
  });
});

/*
  KARGO SİPARİŞİ KUTUSUZ KAPATILAMAZ (kullanıcı kararı 28.08).

  Kutusuz akış ROTA kulvarında meşru ve öyle kalıyor (23.6'nın bilinçli çift akışı) — ikinci test
  tam da onu koruyor: yeni kural eski yolu kırmamalı.

  Kargoda duvarın burada olmasının sebebi zamanlama: duyuruda çarpmak kutuların çoktan mühürlenmiş
  olması demekti ve depocu kartonu geri açardı.
*/
describe('kutusuz onay reddi (28.08 → 30.08 rotaya genişledi)', () => {
  it('KARGO siparişi reddedilir ve HİÇBİR satır yazılmaz', async () => {
    const { orderId, itemId } = await confirmedOrder(2, { deliveryType: 'shipping' });

    const sonuc = await confirmPreparation(db, {
      orderId,
      warehouseId,
      picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }],
    });

    expect(sonuc).toEqual({ status: 'box_required' });
    // Ret hiçbir iz bırakmamalı: yarım yazılmış bir hazırlık, "kim ne kadar topladı" sorusunu
    // cevapsız bırakır ve sipariş de ilerlemiş görünür.
    const kalem = (await new OrderItemService(db).listByOrder(orderId)).find((row) => row.id === itemId)!;
    expect(kalem.fulfilledQty).toBe(0);
    expect((await new OrderService(db).getById(orderId))!.status).toBe('confirmed');
  });

  it('ROTA siparişi de reddedilir — "kutusuz akış" 30.08\'de kapandı', async () => {
    const { orderId, itemId } = await confirmedOrder(2);

    const sonuc = await confirmPreparation(db, {
      orderId,
      warehouseId,
      picks: [{ orderItemId: itemId, batches: [{ stockId: nearBatch, qty: 2 }] }],
    });

    /* 23.6'nın "rotada kutusuz akış meşru" kararı bir İŞ kuralı değil, kutulu akış yazılırken
       bırakılmış bir GEÇİŞ kapısıydı. Kullanıcı ölçtü ve kapattı: kutusuz sipariş rampada
       okutulmuyor, araca binmiyor, kapıda doğrulanmıyor. */
    expect(sonuc).toEqual({ status: 'box_required' });
    expect((await new OrderService(db).getById(orderId))!.status).toBe('confirmed');
  });
});
