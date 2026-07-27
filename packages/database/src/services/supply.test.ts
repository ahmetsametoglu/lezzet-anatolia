import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { ReorderService } from './reorder.service';
import { StockIntakeService } from './stock-intake.service';
import { StockService } from './stock.service';
import { SupplierProductService, SupplierService } from './supplier.service';

/**
 * Tedarik zinciri (06.8–06.11) — DB üstünde. Zincirin bütünü doğrulanır:
 * eşik altı öneri → PO taslağı → mal kabul → partiler + PO kapanışı + son alış fiyatı.
 */
const db = serviceDb();
const suppliers = new SupplierService(db);
const mappings = new SupplierProductService(db);
const orders = new PurchaseOrderService(db);
const intakes = new StockIntakeService(db);
const stocks = new StockService(db);
const reorder = new ReorderService(db);

let supplierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const tedarikciler: string[] = [];

beforeAll(async () => {
  const damga = Date.now();
  const category = await new CategoryService(db).create({ name: { tr: `Tedarik testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `İçli köfte ${damga}` },
    categoryId: category.id,
    shelfLifeDays: 300,
    variants: [{ label: { tr: '500gr' }, minStockQty: 20 }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const supplier = await suppliers.insert({ name: `Anadolu Gıda ${damga}`, paymentTermDays: 30 });
  supplierId = supplier.id;
  tedarikciler.push(supplier.id);
  await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
});

beforeEach(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
});

// Tedarik grafiği `restrict` FK'lerle bağlı: giriş → sipariş → tedarikçi sırasıyla toplanır.
afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], supplierIds: tedarikciler });
});

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('tedarikçi ve kod eşlemesi (06.8)', () => {
  it('aynı varyant aynı tedarikçide iki kez tanımlanmaz — kod değişirse satır güncellenir', async () => {
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-9999' });

    const kayitlar = await mappings.listBySupplier(supplierId);
    expect(kayitlar.filter((m) => m.variantId === variantId)).toHaveLength(1);
    expect(kayitlar.find((m) => m.variantId === variantId)?.supplierCode).toBe('AG-9999');
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
  });

  it('tercihli işareti tekildir — ikinci tedarikçi tercihli olunca ilki düşer', async () => {
    const ikinci = await suppliers.insert({ name: `Alternatif Gıda ${Date.now()}` });
    tedarikciler.push(ikinci.id);
    const a = await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', isPreferred: true });
    const b = await mappings.setMapping({ supplierId: ikinci.id, variantId, supplierCode: 'ALT-77' });

    await mappings.setPreferred(b.id);
    const kaynaklar = await mappings.listByVariant(variantId);
    expect(kaynaklar.find((m) => m.id === b.id)?.isPreferred).toBe(true);
    expect(kaynaklar.find((m) => m.id === a.id)?.isPreferred).toBe(false);
    await mappings.setPreferred(a.id); // sonraki testler için tercihliyi geri al
  });

  it('borç türetilir: girişler − ödemeler', async () => {
    await intakes.receive({
      supplierId,
      lines: [{ variantId, qty: 10, expiryDate: gun(250), unitCost: 4 }],
    });

    // Ödeme tarafı 12.3'te bağlandı; buradaki sözleşme yalnız denklemin kendisidir
    // (ödemenin borcu gerçekten kapattığı `apps/web/lib/money/supplier-debt.test.ts`'te).
    const borc = await suppliers.debt(supplierId);
    expect(borc.intakeTotal).toBeGreaterThanOrEqual(40);
    expect(borc.balance).toBe(Math.round((borc.intakeTotal - borc.paid) * 100) / 100);
  });
});

describe('tedarik siparişi (06.9)', () => {
  it('taslak kalemleri tedarikçi koduyla eşleşir; liste onun diliyle çıkar', async () => {
    const { order, items } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }], 'Haftalık sipariş');
    expect(order.status).toBe('draft');
    expect(items[0]!.supplierProductId).not.toBeNull();

    const liste = await orders.printableList(order.id);
    expect(liste[0]).toEqual({ supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', qty: 24, packQty: 12 });
  });

  it('gönderim işareti insana aittir; kalemsiz taslak açılmaz', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 12 }]);
    const gonderilen = await orders.markSent(order.id);
    expect(gonderilen.status).toBe('sent');
    expect(gonderilen.sentAt).not.toBeNull();

    await expect(orders.createDraft(supplierId, [])).rejects.toThrow();
  });

  it('mal gelmiş sipariş iptal edilemez — zincir kopmaz', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 12 }]);
    await intakes.receive({ supplierId, purchaseOrderId: order.id, lines: [{ variantId, qty: 12, expiryDate: gun(250) }] });

    await expect(orders.cancel(order.id)).rejects.toThrow();
  });
});

describe('mal kabul (06.10)', () => {
  it('partiler girişe bağlanır, PO kapanır, son alış fiyatı tazelenir — tek işlemde', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);

    const sonuc = await intakes.receive({
      supplierId,
      purchaseOrderId: order.id,
      lines: [
        { variantId, qty: 12, expiryDate: gun(250), lotNumber: 'LOT-A', unitCost: 3.5, location: 'Dolap 1' },
        { variantId, qty: 12, expiryDate: gun(280), lotNumber: 'LOT-B', unitCost: 3.5 },
      ],
    });

    expect(sonuc.ok).toBe(true);
    expect(sonuc.stockIds).toHaveLength(2);
    expect(sonuc.totalAmount).toBe(84); // 24 × 3.5

    const partiler = await stocks.listByVariant(variantId);
    expect(partiler.every((p) => p.intakeId === sonuc.intakeId)).toBe(true);
    expect(partiler.find((p) => p.lotNumber === 'LOT-A')?.location).toBe('Dolap 1');

    expect((await orders.getById(order.id))?.status).toBe('received');
    expect((await mappings.listByVariant(variantId)).find((m) => m.supplierId === supplierId)?.lastPurchasePrice).toBe(3.5);
  });

  it('eksik gelen mal fark olarak görünür — parti satılsa bile rakam erimez', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);
    const sonuc = await intakes.receive({
      supplierId,
      purchaseOrderId: order.id,
      lines: [{ variantId, qty: 20, expiryDate: gun(250) }],
    });

    // Kabulden sonra partiden satış/fire olsa da "gelen" 20 kalır: giriş miktarı tarihtir.
    await stocks.setPhysicalQty(sonuc.stockIds[0]!, 5);

    const fark = await intakes.orderVsReceived(order.id);
    expect(fark.find((f) => f.variantId === variantId)).toMatchObject({ orderedQty: 24, receivedQty: 20, diff: -4 });
  });

  it('kalemsiz mal kabul yapılamaz', async () => {
    await expect(intakes.receive({ supplierId, lines: [] })).rejects.toThrow();
  });
});

describe('"sipariş zamanı" önerisi (06.11)', () => {
  it('eşik altı varyant tedarikçisine göre gruplanır ve koliye yuvarlanır', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: gun(250) }); // eşik 20

    const gruplar = await reorder.suggestions();
    const grup = gruplar.find((g) => g.supplierId === supplierId);
    const satir = grup?.lines.find((l) => l.variantId === variantId);

    expect(satir).toMatchObject({ availableQty: 5, minStockQty: 20, supplierCode: 'AG-1234' });
    expect(satir?.suggestedQty).toBe(24); // 15 gerekiyor, koli 12 → 2 koli
  });

  it('öneriden tek dokunuşla PO taslağı çıkar', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: gun(250) });

    const grup = (await reorder.suggestions()).find((g) => g.supplierId === supplierId)!;
    const { order, items } = await reorder.createDraftFrom(grup, 'Eşik altı otomatik taslak');

    expect(order.supplierId).toBe(supplierId);
    expect(items.find((i) => i.variantId === variantId)?.qty).toBe(24);
  });

  it('tedarikçisi eşlenmemiş kalemlerden sipariş açılmaz (açıkça reddedilir)', async () => {
    await expect(reorder.createDraftFrom({ supplierId: null, lines: [] })).rejects.toThrow();
  });

  it('stok eşiğin üstündeyse öneri çıkmaz', async () => {
    await stocks.insert({ variantId, physicalQty: 50, expiryDate: gun(250) });

    const gruplar = await reorder.suggestions();
    expect(gruplar.flatMap((g) => g.lines).find((l) => l.variantId === variantId)).toBeUndefined();
  });
});
