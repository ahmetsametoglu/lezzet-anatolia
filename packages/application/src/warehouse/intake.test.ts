import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  ProductService,
  PurchaseOrderService,
  StockService,
  StorageAreaService,
  SupplierService,
  VariantBarcodeService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock } from '@lezzet/database/testing';
import {
  listPendingIntakes,
  openIntakeForm,
  readIntakeHeader,
  receiveGoods,
  receivePurchase,
  type IntakeDifference,
  type IntakeFormLine,
  type IntakeFormRow,
  type IntakeWarning,
  type PurchaseIntakeLine,
} from './intake';
// Zincirin öteki ucu: tarama kapısı. Ayrı dosyada testli ama BAĞ burada sınanıyor (künye aşağıda).
import { learnCode, resolveScannedCode } from './scan';

/**
 * **Mal kabul — D2** (10.4), terfi 21.11 (kaynağı `apps/web/lib/stock/intake.test.ts`).
 *
 * İki şey sınanıyor: **depocu fiyat girmeden maliyet doğru yazılıyor mu** (PO'dan eşleşiyor) ve
 * **fark/uyarı iş akışını durdurmuyor mu**.
 *
 * Terfiyle gelen yeni iddia: **otomatik fiyat PORTU**. Kayıtsız portta `repricedCount` `null`
 * döner — sıfır DEĞİL (CLAUDE.md §1: ölçülemeyen değer sıfır değildir).
 */
const db = serviceDb();
const stocks = new StockService(db);

const stamp = Date.now();
let variantId: string;
/** Depo geçişi (DOMAIN §17): kabul deposuz yazılamaz — testin kendi deposu. */
let warehouseId: string;
/** Partinin rafı artık tanımlı bir alan (19.29) — testin kendi dolabı. */
let storageAreaId: string;
let productId: string;
let categoryId: string;
let supplierId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  storageAreaId = (await new StorageAreaService(db).insert({ warehouseId, name: `Dolap ${stamp}`, kind: 'frozen' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Kabul kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Mantı ${stamp}` },
    categoryId: category.id,
    // Raf ömrü 100 gün — MLOR eşiği bunun yüzdesinden hesaplanır.
    shelfLifeDays: 100,
    variants: [{ label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await new SupplierService(db).insert({ name: `Kabul tedarikçisi ${stamp}` })).id;
});

beforeEach(async () => {
  // Parti SIRASIYLA gider: önce hareket defteri, sonra parti (06.14 — `stock_movement.stock_id`
  // `restrict` ve artık her partinin hareketi var, mal kabulün girişi bile).
  await purgeVariantStock(db, [variantId]);
});

afterAll(async () => {
  // Partiler AYRICA silinmez: `purgeTestData` onları `productIds`ten buluyor (§1). Elle yazılan bu
  // satır teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi). `beforeEach`teki silme
  // başka iş görür: testler arası izolasyon.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId], // kabuller + tedarik siparişleri onunla gider
    storageAreaIds: [storageAreaId],
    warehouseIds: [warehouseId],
  });
});

/** Tedarik siparişi — beklenen adet ve birim maliyetle (**cent**; admin girer, depocu görmez). */
async function draftPurchaseOrder(qty: number, unitPriceCents: number) {
  const { order } = await new PurchaseOrderService(db).createDraft(supplierId, [{ variantId, qty, unitPriceCents }]);
  return order.id;
}

describe('PO’lu mal kabul', () => {
  it('form tedarik siparişinden DOLU gelir ve fiyat taşımaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const rows: IntakeFormRow[] = await openIntakeForm(db, purchaseOrderId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId, expectedQty: 20 });
    expect(rows[0]!.productName).toContain('Mantı');
    expect(rows[0]!.variantLabel).toBe('1 kg');
    /* "Fiyat yok" iddiası ALAN ADIYLA kurulur: rakam aramak UUID'ye takılır.

       Liste 21.160'ta dörtten sekize çıktı ve dördü de tanıma/karar alanı: `sku` +
       `supplierCode` (depocunun elindeki kâğıtla eşleştirme), `dateType` + `shelfLifeDays`
       (satırın SKT alanı ve ömür uyarısı bunlarsız kurulamıyor). Test o turda güncellenmedi ve
       paket kırmızıya döndü — düzeltildi 30.08. */
    expect(Object.keys(rows[0]!).sort()).toEqual([
      // Dokuzuncu alan `caseSizes` (30.08): adet çekmecesinin çarpan tablosu — depocu "3 koli
      // geldi" der, paketi ekran çarpar. Para değil: koli boyu bir ÖLÇÜDÜR.
      'caseSizes',
      'dateType',
      'expectedQty',
      'productName',
      'shelfLifeDays',
      'sku',
      'supplierCode',
      'variantId',
      'variantLabel',
    ]);
  });

  /**
   * **Form KALANI gösterir, ısmarlanan toplamı değil** (kusur, ölçüldü ve düzeltildi 25.08 · 10.4 turu).
   *
   * Düzeltmeden önce ekranla kayıt aynı olay hakkında iki farklı şey söylüyordu: `expectedQtysOf`
   * ilk günden `missingQty`ye bakıyor, form ise `line.qty` gösteriyordu. Kısmen gelmiş bir siparişte
   * depocu kalanı sayıp yazınca ekran "olmayan bir eksik" çiziyor, kayıt farkı sıfır yazıyordu.
   */
  it('KISMEN gelmiş siparişte form KALANI gösterir — ekran ile kayıt aynı tabana bakar', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);
    expect((await openIntakeForm(db, purchaseOrderId))[0]!.expectedQty).toBe(20);

    // İlk sevkiyat: 12 geldi, 8 kaldı.
    await receiveGoods(db, {
      warehouseId,
      purchaseOrderId,
      lines: [{ variantId, qty: 12, expiryDate: dayOffset(90) }],
    });

    const rows = await openIntakeForm(db, purchaseOrderId);
    expect(rows[0]!.expectedQty).toBe(8);

    // Ve kalan tam gelince kayıt FARK ÜRETMEZ — ekranın gösterdiği sayı yazılabilir bir sayıdır.
    const outcome = await receiveGoods(db, {
      warehouseId,
      purchaseOrderId,
      lines: [{ variantId, qty: 8, expiryDate: dayOffset(90) }],
    });
    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' ? outcome.differences : null).toEqual([]);
    // Satır listede KALIR (0 ile): ikinci koliden yine çıkabilir, fazla kabul meşrudur.
    expect((await openIntakeForm(db, purchaseOrderId))[0]!.expectedQty).toBe(0);
  });

  it('bilinmeyen siparişte form BOŞ döner — plansız alım da meşrudur', async () => {
    // Kalemsiz PO diye bir şey YOK (`createDraft` reddediyor: "kalemsiz taslak açılmaz"), yani boş
    // dönüşün tek gerçek yolu siparişin hiç bulunmamasıdır — v2'nin "+ plansız kabul" yolu.
    expect(await openIntakeForm(db, '00000000-0000-0000-0000-000000000000')).toEqual([]);
  });

  it('maliyet PO’dan eşleşir — depocu fiyat girmeden parti alış fiyatıyla doğar', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    // Ekranın göndereceği satır şekli — para alanı yok, tip de kabul etmez.
    const lines: IntakeFormLine[] = [{ variantId, qty: 20, expiryDate: dayOffset(90), lotNumber: 'LOT-1', storageAreaId }];

    const outcome = await receiveGoods(db, { warehouseId, purchaseOrderId, lines });

    expect(outcome.status).toBe('ok');
    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    expect(batch?.purchasePriceCents).toBe(600); // depocunun hiç görmediği sayı
    expect(batch?.storageAreaId).toBe(storageAreaId);
    expect(batch?.lotNumber).toBe('LOT-1');
  });

  it('eksik gelen mal FARK olarak işaretlenir, kabul yine tamamlanır', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const outcome = await receiveGoods(db, {
      warehouseId,
      purchaseOrderId,
      lines: [{ variantId, qty: 15, expiryDate: dayOffset(90) }],
    });

    expect(outcome.status).toBe('ok');
    const differences: IntakeDifference[] = outcome.status === 'ok' ? outcome.differences : [];
    expect(differences).toEqual([{ variantId, expectedQty: 20, receivedQty: 15 }]);
    // Mal fiilen girdi: fark bir uyarıdır, engel değil (parçalı kabul).
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(15);
  });

  it('PO’suz alımda fark üretilmez — karşılaştıracak sipariş yok', async () => {
    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 5, expiryDate: dayOffset(90) }],
    });

    expect(outcome.status === 'ok' ? outcome.differences : null).toEqual([]);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(5);
  });
});

/**
 * Satın alma kaydı — admin yolu (09.14). Depocu yolundan ayrılan TEK şey maliyet.
 */
describe('satın alma kaydı — maliyet admin yolundan gelir', () => {
  it('PO’SUZ alımda parti elle girilen fiyatla doğar', async () => {
    const outcome = await receivePurchase(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(90), unitCostCents: 750 }],
    });

    expect(outcome.status).toBe('ok');
    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    // Giriş CENT (750), DB euro (7,50), okuma yine CENT — çevrim sınırda ve TEK yerde (`STACK §8`).
    expect(batch?.purchasePriceCents).toBe(750);
  });

  it('SATIR maliyeti PO’yu EZER — fatura gerçeği söyler', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const outcome = await receivePurchase(db, {
      warehouseId,
      purchaseOrderId,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(90), unitCostCents: 800 }],
    });

    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    expect(batch?.purchasePriceCents).toBe(800);
  });

  it('satır maliyeti YOKSA PO’dan eşleşir — admin yalnız sapanı düzeltir', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    const outcome = await receivePurchase(db, {
      warehouseId,
      purchaseOrderId,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(90), unitCostCents: null }],
    });

    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    expect(batch?.purchasePriceCents).toBe(600);
  });

  it('AYNI varyantın iki satırı AYRI fiyat taşır — varyant anahtarlı harita bunu yutardı', async () => {
    const lines: PurchaseIntakeLine[] = [
      { variantId, qty: 3, expiryDate: dayOffset(60), unitCostCents: 500 },
      { variantId, qty: 3, expiryDate: dayOffset(120), unitCostCents: 900 },
    ];

    const outcome = await receivePurchase(db, { warehouseId, supplierId, lines });

    expect(outcome.status).toBe('ok');
    const ids = outcome.status === 'ok' ? outcome.result.stockIds : [];
    const fiyatlar = [];
    for (const id of ids) fiyatlar.push((await stocks.getById(id))?.purchasePriceCents);
    expect(fiyatlar.sort()).toEqual([500, 900]);
  });

  it('kalemsiz kayıt yazım YAPMAZ', async () => {
    expect(await receivePurchase(db, { warehouseId, supplierId, lines: [] })).toEqual({ status: 'empty' });
  });
});

describe('raf ömrü uyarısı (MLOR) — engellemez, uyarır', () => {
  it('ömrü kısa gelen partide uyarı doğar ama mal GİRER', async () => {
    // 100 günlük ömrün yalnız 10 günü kalmış: eşiğin altında.
    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(10) }],
    });

    const warnings: IntakeWarning[] = outcome.status === 'ok' ? outcome.warnings : [];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.remainingPercent).toBeLessThan(50);
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(4); // kabul engellenmedi
  });

  it('ömrü yeterli partide uyarı yok', async () => {
    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(95) }],
    });

    expect(outcome.status === 'ok' ? outcome.warnings : null).toEqual([]);
  });
});

describe('boş form', () => {
  it('kalemsiz kabul yazım YAPMAZ', async () => {
    expect(await receiveGoods(db, { warehouseId, supplierId, lines: [] })).toEqual({ status: 'empty' });
  });
});

/**
 * **Künye ve bekleyen sevkiyat listesi** (21.11d) — ekranın *"TS-26-0114 · Gaziantep Gıda"* başlığı
 * ve konusuz açılışı.
 *
 * Paylaşılan DB (CLAUDE.md §4b): liste küresel okuyor (satın alma depo-üstüdür), o yüzden **hiçbir
 * iddia sayıya bakmaz** — kendi damgalı sipariş kimliklerimiz listede aranır. Başka ajanın açtığı
 * bir PO bu dosyayı kızartamaz.
 */
describe('kabul künyesi ve bekleyen sevkiyatlar (D2 · 21.11d)', () => {
  const purchaseOrders = new PurchaseOrderService(db);

  it('künye referans + TEDARİKÇİ ADI taşır, para taşımaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(6, 400);
    await purchaseOrders.markSent(purchaseOrderId, `TS-KUNYE-${stamp}`);

    const header = await readIntakeHeader(db, purchaseOrderId);

    expect(header).toEqual({
      purchaseOrderId,
      referenceNo: `TS-KUNYE-${stamp}`,
      supplierName: `Kabul tedarikçisi ${stamp}`,
    });
    // "Para yok" iddiası ALAN ADIYLA kurulur (form satırındaki emsalle aynı).
    expect(Object.keys(header!).sort()).toEqual(['purchaseOrderId', 'referenceNo', 'supplierName']);
  });

  it('TASLAK siparişin referansı `null` — numara gönderimde doğar, uydurulmaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(3, 400);

    expect(await readIntakeHeader(db, purchaseOrderId)).toMatchObject({ referenceNo: null });
  });

  it('olmayan sipariş `null` döner — boş künye ile karıştırılmaz', async () => {
    expect(await readIntakeHeader(db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('bekleyen liste GÖNDERİLMİŞ siparişi künyesi + kalem sayısıyla verir', async () => {
    const purchaseOrderId = await draftPurchaseOrder(9, 400);
    await purchaseOrders.markSent(purchaseOrderId, `TS-BEKLEYEN-${stamp}`);

    const mine = (await listPendingIntakes(db, { limit: 100 })).find((row) => row.purchaseOrderId === purchaseOrderId);

    expect(mine).toEqual({
      purchaseOrderId,
      referenceNo: `TS-BEKLEYEN-${stamp}`,
      supplierName: `Kabul tedarikçisi ${stamp}`,
      // Kalem SAYISI, adet değil: sipariş tek kalemli (9 adet).
      lineCount: 1,
      /* Sipariş DURUMU 21.160'ta eklendi: liste "gönderildi" ile "kısmen geldi"yi ayırt
         edebilsin diye (ekran ikincisine ayrı bir rozet çiziyor). Alan o turda eklenip test
         güncellenmedi — düzeltildi 30.08. */
      status: 'sent',
    });
  });

  it('TASLAK listede YOK — tedarikçi ondan habersiz, mal yolda değil', async () => {
    const purchaseOrderId = await draftPurchaseOrder(4, 400);

    const list = await listPendingIntakes(db, { limit: 100 });

    expect(list.some((row) => row.purchaseOrderId === purchaseOrderId)).toBe(false);
  });

  it('PARÇALI kabul edilmiş sipariş listede KALIR — ikinci deponun payı gizlenmez (K6)', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 400);
    await purchaseOrders.markSent(purchaseOrderId, `TS-PARCALI-${stamp}`);
    // İlk depo payını aldı; sipariş kapanmadı (`partially_received`).
    await receiveGoods(db, { warehouseId, purchaseOrderId, lines: [{ variantId, qty: 8, expiryDate: dayOffset(90) }] });
    expect((await purchaseOrders.getById(purchaseOrderId))?.status).toBe('partially_received');

    const list = await listPendingIntakes(db, { limit: 100 });

    expect(list.some((row) => row.purchaseOrderId === purchaseOrderId)).toBe(true);
  });

  it('KAPANMIŞ sipariş listeden düşer — tamamı gelen mal beklenmez', async () => {
    const purchaseOrderId = await draftPurchaseOrder(5, 400);
    await purchaseOrders.markSent(purchaseOrderId, `TS-KAPANAN-${stamp}`);
    await receiveGoods(db, { warehouseId, purchaseOrderId, lines: [{ variantId, qty: 5, expiryDate: dayOffset(90) }] });
    expect((await purchaseOrders.getById(purchaseOrderId))?.status).toBe('received');

    const list = await listPendingIntakes(db, { limit: 100 });

    expect(list.some((row) => row.purchaseOrderId === purchaseOrderId)).toBe(false);
  });

  it('listede PARA yok — kapı fiyatı okur ama taşımaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(7, 1234);
    await purchaseOrders.markSent(purchaseOrderId, `TS-PARASIZ-${stamp}`);

    const mine = (await listPendingIntakes(db, { limit: 100 })).find((row) => row.purchaseOrderId === purchaseOrderId);

    expect(Object.keys(mine!).sort()).toEqual([
      'lineCount',
      'purchaseOrderId',
      'referenceNo',
      'status',
      'supplierName',
    ]);
    expect(JSON.stringify(mine)).not.toContain('1234');
  });
});

/**
 * **Otomatik fiyat portu** — terfinin getirdiği tek yapısal fark (`RepricePort`).
 *
 * Web kopyası `repriceVariants`'ı doğrudan çağırıyor; o modül fiyat şeridinin işi ve bu turda
 * taşınmadı. Port, bağın KAYIP değil KAYITSIZ olduğunu söyler.
 */
describe('otomatik fiyat portu', () => {
  it('kayıtlı port kabul edilen VARYANTLARLA çağrılır ve sayısı döner', async () => {
    const seen: string[][] = [];

    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 2, expiryDate: dayOffset(90) }],
      reprice: async (ids) => {
        seen.push([...ids]);
        return 3;
      },
    });

    expect(seen).toEqual([[variantId]]);
    expect(outcome.status === 'ok' ? outcome.repricedCount : undefined).toBe(3);
  });

  it('port KAYITSIZSA `null` döner — sıfır DEĞİL (ölçülemeyen değer sıfır değildir)', async () => {
    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 2, expiryDate: dayOffset(90) }],
    });

    expect(outcome.status === 'ok' ? outcome.repricedCount : undefined).toBeNull();
    // Kabul yine yazıldı: fiyat hizalaması malın gerçeğini bağlamaz.
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(2);
  });

  it('port PATLASA da mal kabul geri ALINMAZ — sayı `null`, parti yerinde', async () => {
    const outcome = await receiveGoods(db, {
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 6, expiryDate: dayOffset(90) }],
      reprice: async () => {
        throw new Error('fiyat servisi cevap vermedi');
      },
    });

    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' ? outcome.repricedCount : undefined).toBeNull();
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(6);
  });
});

/**
 * **OKUTMA → KABUL zincirinin son halkası** (23.10'un kalan maddesi).
 *
 * Tarama kapısı ile kabul kapısı ayrı ayrı testli; sınanmayan şey ARALARINDAKİ bağdı: okutulan
 * kodun çözdüğü varyant, kabulün yazdığı partinin varyantı mı? Ekran bu iki kapıyı birleştiriyor
 * ve arada bir eşleme hatası olsaydı (yanlış varyanta yazma) hiçbir test görmezdi — sonucu depoda,
 * olmayan malı satmaya çalışırken görülürdü.
 *
 * Koli kodunun ÇARPANI da burada anlam kazanıyor: kod "1 okutma = N adet" diyorsa, kabulün yazdığı
 * parti de o kadar olmalı.
 */
describe('okutulan kod → yazılan parti (23.10)', () => {
  it('okutulan kodun varyantı, kabulün yazdığı partinin varyantıdır', async () => {
    const code = `TARAMA-${stamp}`;
    await new VariantBarcodeService(db).insert({ variantId, code });

    // 1) Depocu okutur: kapı kimliği bulur (stok kararı VERMEZ — depo değişmezi).
    const resolved = await resolveScannedCode(db, { code });
    expect(resolved.status).toBe('found');
    const okutulanVariantId = resolved.status === 'found' ? resolved.variantId : '';

    // 2) Ekran o kimliği kabul satırına koyar ve gönderir.
    const outcome = await receiveGoods(db, {
      warehouseId,
      purchaseOrderId: null,
      lines: [{ variantId: okutulanVariantId, qty: 4, expiryDate: dayOffset(70), storageAreaId }],
    });

    expect(outcome.status).toBe('ok');
    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    // Zincirin kanıtı: kodun çözdüğü varyant ile partinin varyantı AYNI.
    expect(batch?.variantId).toBe(okutulanVariantId);
    expect(batch?.variantId).toBe(variantId);
    expect(batch?.warehouseId).toBe(warehouseId);
  });

  it('KOLİ kodunun çarpanı kadar mal girer — "1 okutma = N adet" sözü partide tutulur', async () => {
    const code = `KOLI-${stamp}`;
    await new VariantBarcodeService(db).insert({ variantId, code, kind: 'case', qtyPerCode: 12 });

    const resolved = await resolveScannedCode(db, { code });
    expect(resolved.status === 'found' ? resolved.qtyPerCode : 0).toBe(12);

    const oncekiToplam = (await stocks.getAvailable(warehouseId, variantId)).physicalQty;
    const outcome = await receiveGoods(db, {
      warehouseId,
      purchaseOrderId: null,
      // Ekranın yaptığı da tam olarak bu: çarpanı adet olarak koyar (depocu düzeltebilir).
      lines: [{ variantId, qty: resolved.status === 'found' ? resolved.qtyPerCode : 0, expiryDate: dayOffset(70) }],
    });

    expect(outcome.status).toBe('ok');
    expect((await stocks.getAvailable(warehouseId, variantId)).physicalQty).toBe(oncekiToplam + 12);
  });

  it('ÖĞRETİLEN kod aynı turda kabule girer — öğrenme ile yazım arasında boşluk yok', async () => {
    // "İkinci gelişte tanır" vaadinin ilk yarısı: öğretilen kod ANINDA çözülebilmeli, yoksa depocu
    // aynı koliyi ikinci kez okutmak zorunda kalırdı.
    const code = `OGREN-${stamp}`;
    expect(await learnCode(db, { variantId, code, kind: 'case', qtyPerCode: 6 })).toEqual({ status: 'ok' });

    const resolved = await resolveScannedCode(db, { code });

    expect(resolved.status).toBe('found');
    expect(resolved.status === 'found' ? resolved.variantId : '').toBe(variantId);
    expect(resolved.status === 'found' ? resolved.qtyPerCode : 0).toBe(6);
  });
});
