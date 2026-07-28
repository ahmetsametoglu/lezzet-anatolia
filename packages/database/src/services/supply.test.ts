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
const createdSuppliers: string[] = [];

beforeAll(async () => {
  const stamp = Date.now();
  const category = await new CategoryService(db).create({ name: { tr: `Tedarik testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `İçli köfte ${stamp}` },
    categoryId: category.id,
    shelfLifeDays: 300,
    variants: [{ label: { tr: '500gr' }, minStockQty: 20 }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const supplier = await suppliers.insert({ name: `Anadolu Gıda ${stamp}`, paymentTermDays: 30 });
  supplierId = supplier.id;
  createdSuppliers.push(supplier.id);
  await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
});

beforeEach(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
});

// Tedarik grafiği `restrict` FK'lerle bağlı: giriş → sipariş → tedarikçi sırasıyla toplanır.
afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], supplierIds: createdSuppliers });
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('tedarikçi ve kod eşlemesi (06.8)', () => {
  it('aynı varyant aynı tedarikçide iki kez tanımlanmaz — kod değişirse satır güncellenir', async () => {
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-9999' });

    const mapped = await mappings.listBySupplier(supplierId);
    expect(mapped.filter((m) => m.variantId === variantId)).toHaveLength(1);
    expect(mapped.find((m) => m.variantId === variantId)?.supplierCode).toBe('AG-9999');
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
  });

  it('tercihli işareti tekildir — ikinci tedarikçi tercihli olunca ilki düşer', async () => {
    const second = await suppliers.insert({ name: `Alternatif Gıda ${Date.now()}` });
    createdSuppliers.push(second.id);
    const a = await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', isPreferred: true });
    const b = await mappings.setMapping({ supplierId: second.id, variantId, supplierCode: 'ALT-77' });

    await mappings.setPreferred(b.id);
    const sources = await mappings.listByVariant(variantId);
    expect(sources.find((m) => m.id === b.id)?.isPreferred).toBe(true);
    expect(sources.find((m) => m.id === a.id)?.isPreferred).toBe(false);
    await mappings.setPreferred(a.id); // sonraki testler için tercihliyi geri al
  });

  it('borç türetilir: girişler − ödemeler', async () => {
    await intakes.receive({
      supplierId,
      lines: [{ variantId, qty: 10, expiryDate: dayOffset(250), unitCost: 4 }],
    });

    // Ödeme tarafı 12.3'te bağlandı; buradaki sözleşme yalnız denklemin kendisidir
    // (ödemenin borcu gerçekten kapattığı `apps/web/lib/money/supplier-debt.test.ts`'te).
    const debt = await suppliers.debt(supplierId);
    expect(debt.intakeTotal).toBeGreaterThanOrEqual(40);
    expect(debt.balance).toBe(Math.round((debt.intakeTotal - debt.paid) * 100) / 100);
  });
});

describe('tedarik siparişi (06.9)', () => {
  it('taslak kalemleri tedarikçi koduyla eşleşir; liste onun diliyle çıkar', async () => {
    const { order, items } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }], 'Haftalık sipariş');
    expect(order.status).toBe('draft');
    expect(items[0]!.supplierProductId).not.toBeNull();

    const printable = await orders.printableList(order.id);
    expect(printable[0]).toEqual({ supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', qty: 24, packQty: 12 });
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
    await intakes.receive({ supplierId, purchaseOrderId: order.id, lines: [{ variantId, qty: 12, expiryDate: dayOffset(250) }] });

    await expect(orders.cancel(order.id)).rejects.toThrow();
  });
});

describe('mal kabul (06.10)', () => {
  it('partiler girişe bağlanır, PO kapanır, son alış fiyatı tazelenir — tek işlemde', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);

    const outcome = await intakes.receive({
      supplierId,
      purchaseOrderId: order.id,
      lines: [
        { variantId, qty: 12, expiryDate: dayOffset(250), lotNumber: 'LOT-A', unitCost: 3.5, location: 'Dolap 1' },
        { variantId, qty: 12, expiryDate: dayOffset(280), lotNumber: 'LOT-B', unitCost: 3.5 },
      ],
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.stockIds).toHaveLength(2);
    expect(outcome.totalAmount).toBe(84); // 24 × 3.5

    const batches = await stocks.listByVariant(variantId);
    expect(batches.every((p) => p.intakeId === outcome.intakeId)).toBe(true);
    expect(batches.find((p) => p.lotNumber === 'LOT-A')?.location).toBe('Dolap 1');

    expect((await orders.getById(order.id))?.status).toBe('received');
    expect((await mappings.listByVariant(variantId)).find((m) => m.supplierId === supplierId)?.lastPurchasePrice).toBe(3.5);
  });

  it('eksik gelen mal fark olarak görünür — parti satılsa bile rakam erimez', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);
    const outcome = await intakes.receive({
      supplierId,
      purchaseOrderId: order.id,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(250) }],
    });

    // Kabulden sonra partiden satış/fire olsa da "gelen" 20 kalır: giriş miktarı tarihtir.
    await stocks.setPhysicalQty(outcome.stockIds[0]!, 5);

    const diff = await intakes.orderVsReceived(order.id);
    expect(diff.find((f) => f.variantId === variantId)).toMatchObject({ orderedQty: 24, receivedQty: 20, diff: -4 });
  });

  it('kalemsiz mal kabul yapılamaz', async () => {
    await expect(intakes.receive({ supplierId, lines: [] })).rejects.toThrow();
  });
});

describe('"sipariş zamanı" önerisi (06.11)', () => {
  it('eşik altı varyant tedarikçisine göre gruplanır ve koliye yuvarlanır', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: dayOffset(250) }); // eşik 20

    const groups = await reorder.suggestions();
    const group = groups.find((g) => g.supplierId === supplierId);
    const row = group?.lines.find((l) => l.variantId === variantId);

    expect(row).toMatchObject({ availableQty: 5, minStockQty: 20, supplierCode: 'AG-1234' });
    expect(row?.suggestedQty).toBe(24); // 15 gerekiyor, koli 12 → 2 koli
  });

  it('öneriden tek dokunuşla PO taslağı çıkar', async () => {
    await stocks.insert({ variantId, physicalQty: 5, expiryDate: dayOffset(250) });

    const group = (await reorder.suggestions()).find((g) => g.supplierId === supplierId)!;
    const { order, items } = await reorder.createDraftFrom(group, 'Eşik altı otomatik taslak');

    expect(order.supplierId).toBe(supplierId);
    expect(items.find((i) => i.variantId === variantId)?.qty).toBe(24);
  });

  it('tedarikçisi eşlenmemiş kalemlerden sipariş açılmaz (açıkça reddedilir)', async () => {
    await expect(reorder.createDraftFrom({ supplierId: null, lines: [] })).rejects.toThrow();
  });

  it('stok eşiğin üstündeyse öneri çıkmaz', async () => {
    await stocks.insert({ variantId, physicalQty: 50, expiryDate: dayOffset(250) });

    const groups = await reorder.suggestions();
    expect(groups.flatMap((g) => g.lines).find((l) => l.variantId === variantId)).toBeUndefined();
  });
});
