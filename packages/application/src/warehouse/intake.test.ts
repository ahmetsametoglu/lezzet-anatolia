import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, PurchaseOrderService, StockService, SupplierService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse, mustDelete } from '@lezzet/database/testing';
import {
  openIntakeForm,
  receiveGoods,
  receivePurchase,
  type IntakeDifference,
  type IntakeFormLine,
  type IntakeFormRow,
  type IntakeWarning,
  type PurchaseIntakeLine,
} from './intake';

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
let productId: string;
let categoryId: string;
let supplierId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
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
  await mustDelete(db, 'stock', (q) => q.eq('variant_id', variantId));
});

afterAll(async () => {
  await mustDelete(db, 'stock', (q) => q.eq('variant_id', variantId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId], // kabuller + tedarik siparişleri onunla gider
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
    // "Fiyat yok" iddiası ALAN ADIYLA kurulur: rakam aramak UUID'ye takılır.
    expect(Object.keys(rows[0]!).sort()).toEqual(['expectedQty', 'productName', 'variantId', 'variantLabel']);
  });

  it('bilinmeyen siparişte form BOŞ döner — plansız alım da meşrudur', async () => {
    // Kalemsiz PO diye bir şey YOK (`createDraft` reddediyor: "kalemsiz taslak açılmaz"), yani boş
    // dönüşün tek gerçek yolu siparişin hiç bulunmamasıdır — v2'nin "+ plansız kabul" yolu.
    expect(await openIntakeForm(db, '00000000-0000-0000-0000-000000000000')).toEqual([]);
  });

  it('maliyet PO’dan eşleşir — depocu fiyat girmeden parti alış fiyatıyla doğar', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 600);

    // Ekranın göndereceği satır şekli — para alanı yok, tip de kabul etmez.
    const lines: IntakeFormLine[] = [{ variantId, qty: 20, expiryDate: dayOffset(90), lotNumber: 'LOT-1', location: 'Dolap A' }];

    const outcome = await receiveGoods(db, { warehouseId, purchaseOrderId, lines });

    expect(outcome.status).toBe('ok');
    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    expect(batch?.purchasePriceCents).toBe(600); // depocunun hiç görmediği sayı
    expect(batch?.location).toBe('Dolap A');
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
