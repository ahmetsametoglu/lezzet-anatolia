import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService, ProductService, PurchaseOrderService, StockService, SupplierService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { openIntakeForm, receiveGoods, type IntakeDifference, type IntakeFormLine, type IntakeFormRow, type IntakeWarning } from './intake';

/**
 * Mal kabul kapısı (10.4). İki şey sınanıyor: **depocu fiyat girmeden maliyet doğru yazılıyor mu**
 * (PO'dan eşleşiyor) ve **fark/uyarı iş akışını durdurmuyor mu**.
 */
const db = serviceDb();
const stocks = new StockService(db);

const stamp = Date.now();
let variantId: string;
let productId: string;
let categoryId: string;
let supplierId: string;
const createdOrders: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kabul testi ${stamp}` } });
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
  supplierId = (await new SupplierService(db).insert({ name: `Tedarikçi ${stamp}` })).id;
});

beforeEach(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
});

afterAll(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
  for (const id of createdOrders) await db.from('purchase_order').delete().eq('id', id);
  await db.from('supplier').delete().eq('id', supplierId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

/** Tedarik siparişi — beklenen adet ve birim maliyetle (admin girer, depocu görmez). */
async function draftPurchaseOrder(qty: number, unitPrice: number) {
  const { order } = await new PurchaseOrderService(db).createDraft(supplierId, [{ variantId, qty, unitPrice }]);
  createdOrders.push(order.id);
  return order.id;
}

describe('PO’lu mal kabul', () => {
  it('form tedarik siparişinden DOLU gelir ve fiyat taşımaz', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 6);

    const rows: IntakeFormRow[] = await openIntakeForm(purchaseOrderId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId, expectedQty: 20 });
    expect(rows[0]!.productName).toContain('Mantı');
    // "Fiyat yok" iddiası ALAN ADIYLA kurulur: rakam aramak UUID'ye takılır.
    expect(Object.keys(rows[0]!).sort()).toEqual(['expectedQty', 'productName', 'variantId', 'variantLabel']);
  });

  it('maliyet PO’dan eşleşir — depocu fiyat girmeden parti alış fiyatıyla doğar', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 6);

    // Ekranın göndereceği satır şekli — para alanı yok, tip de kabul etmez.
    const lines: IntakeFormLine[] = [{ variantId, qty: 20, expiryDate: dayOffset(90), lotNumber: 'LOT-1', location: 'Dolap A' }];

    const outcome = await receiveGoods({ purchaseOrderId, lines });

    expect(outcome.status).toBe('ok');
    const batch = await stocks.getById(outcome.status === 'ok' ? outcome.result.stockIds[0]! : '');
    expect(batch?.purchasePrice).toBe(6); // depocunun hiç görmediği sayı
    expect(batch?.location).toBe('Dolap A');
    expect(batch?.lotNumber).toBe('LOT-1');
  });

  it('eksik gelen mal FARK olarak işaretlenir, kabul yine tamamlanır', async () => {
    const purchaseOrderId = await draftPurchaseOrder(20, 6);

    const outcome = await receiveGoods({
      purchaseOrderId,
      lines: [{ variantId, qty: 15, expiryDate: dayOffset(90) }],
    });

    expect(outcome.status).toBe('ok');
    const differences: IntakeDifference[] = outcome.status === 'ok' ? outcome.differences : [];
    expect(differences).toEqual([{ variantId, expectedQty: 20, receivedQty: 15 }]);
    // Mal fiilen girdi: fark bir uyarıdır, engel değil.
    expect((await stocks.getAvailable(variantId)).physicalQty).toBe(15);
  });

  it('PO’suz alımda fark üretilmez — karşılaştıracak sipariş yok', async () => {
    const outcome = await receiveGoods({
      supplierId,
      lines: [{ variantId, qty: 5, expiryDate: dayOffset(90) }],
    });

    // PO yok → karşılaştırılacak sipariş de yok; her satırı "beklenmedik" saymak gürültü olurdu.
    expect(outcome.status === 'ok' ? outcome.differences : null).toEqual([]);
    expect((await stocks.getAvailable(variantId)).physicalQty).toBe(5);
  });
});

describe('raf ömrü uyarısı (MLOR) — engellemez, uyarır', () => {
  it('ömrü kısa gelen partide uyarı doğar ama mal GİRER', async () => {
    // 100 günlük ömrün yalnız 10 günü kalmış: eşiğin altında.
    const outcome = await receiveGoods({
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(10) }],
    });

    const warnings: IntakeWarning[] = outcome.status === 'ok' ? outcome.warnings : [];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.remainingPercent).toBeLessThan(50);
    expect((await stocks.getAvailable(variantId)).physicalQty).toBe(4); // kabul engellenmedi
  });

  it('ömrü yeterli partide uyarı yok', async () => {
    const outcome = await receiveGoods({
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(95) }],
    });

    expect(outcome.status === 'ok' ? outcome.warnings : null).toEqual([]);
  });
});

describe('boş form', () => {
  it('kalemsiz kabul yazım YAPMAZ', async () => {
    expect(await receiveGoods({ supplierId, lines: [] })).toEqual({ status: 'empty' });
  });
});
