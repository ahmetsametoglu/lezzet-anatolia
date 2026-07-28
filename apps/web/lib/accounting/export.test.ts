import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { buildExport, matchInvoiceNo, pendingInvoices, toExportCsv } from './export';

/**
 * Muhasebe export'u (12.7) — DB üstünde. Doğrulanan şey dosyanın biçimi değil, **neyin girip
 * neyin girmediği**:
 * - satış tarihi sipariş kaydından değil, TESLİM/KAPANIŞ anından gelir (`order_sale` görünümü),
 * - hediye sipariş dosyaya girmez ama farkı açıklayan satır özet'te durur,
 * - gerçekleşmemiş sipariş (taslak/onaylı) hiç görünmez,
 * - fatura numarası eşleşen satış kuyruktan düşer.
 */
const db = serviceDb();
const orders = new OrderService(db);

const stamp = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** Seed'in ve diğer testlerin dokunmadığı geçmiş bir pencere — export şirket genelini okur. */
const PERIOD = { from: dayOffset(-200), to: dayOffset(-180) };

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Export testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Baklava ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Export müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
});

let counter = 0;

interface SaleInput {
  /** Kaç gün önce gerçekleşti (teslim/kapanış anı). */
  daysAgo: number;
  unitPrice?: number;
  qty?: number;
  vatRate?: number;
  shippingFee?: number;
  isGiftOrder?: boolean;
  status?: 'completed' | 'delivered';
  invoiceNo?: string;
}

/**
 * Gerçekleşmiş satış kurar. Durum LOG'u doğrudan yazılır çünkü `sale_date` onun `created_at`inden
 * türüyor ve testin satışı geçmişe koyması gerekiyor — servis tarihi geriye alamaz (almamalı da).
 */
async function makeSale(g: SaleInput) {
  counter += 1;
  const qty = g.qty ?? 1;
  const unitPrice = g.unitPrice ?? 10;
  const { order } = await orders.create(
    {
      customerId,
      channel: 'b2c',
      total: qty * unitPrice + (g.shippingFee ?? 0),
      shippingFee: g.shippingFee,
      isGiftOrder: g.isGiftOrder,
    },
    [{ variantId, qty, fulfilledQty: qty, unitPrice, vatRate: g.vatRate ?? 5.5 }],
  );

  const status = g.status ?? 'completed';
  await orders.update({ id: order.id, status, referenceNo: `LA-EX-${stamp}-${counter}`, invoiceNo: g.invoiceNo ?? null });
  await db.from('order_status_log').insert({
    order_id: order.id,
    from_status: 'draft',
    to_status: status,
    created_at: `${dayOffset(-g.daysAgo)}T10:00:00.000Z`,
  });
  return order;
}

describe('dönem ve satış tarihi', () => {
  it('satış tarihi kayıt anından değil TESLİM anından gelir', async () => {
    const order = await makeSale({ daysAgo: 190, unitPrice: 21.1 });

    const { rows } = await buildExport(PERIOD);
    const row = rows.find((r) => r.orderId === order.id);
    expect(row?.saleDate).toBe(dayOffset(-190)); // sipariş bugün kaydedildi, satış 190 gün önce
    expect(row?.gross).toBe(21.1);
  });

  it('dönem dışında gerçekleşen satış dosyaya girmez', async () => {
    const outside = await makeSale({ daysAgo: 300 });
    const { rows } = await buildExport(PERIOD);
    expect(rows.map((r) => r.orderId)).not.toContain(outside.id);
  });

  it('teslim sonra kapanış: satış İLK gerçekleşme gününe yazılır', async () => {
    // Ocakta teslim, şubatta kapanan sipariş şubat cirosuna yazılamaz.
    const order = await makeSale({ daysAgo: 190, status: 'delivered' });
    await orders.update({ id: order.id, status: 'completed' });
    await db.from('order_status_log').insert({
      order_id: order.id, from_status: 'delivered', to_status: 'completed', created_at: `${dayOffset(-120)}T10:00:00.000Z`,
    });

    const { rows } = await buildExport(PERIOD);
    expect(rows.find((r) => r.orderId === order.id)?.saleDate).toBe(dayOffset(-190));
  });

  it('gerçekleşmemiş sipariş hiç görünmez — taslak ciro değildir', async () => {
    const { order } = await orders.create({ customerId, channel: 'b2c', total: 50 }, [{ variantId, qty: 1, unitPrice: 50, vatRate: 5.5 }]);
    const { rows } = await buildExport(PERIOD);
    expect(rows.map((r) => r.orderId)).not.toContain(order.id);
  });
});

describe('hediye sipariş export dışıdır ama farkı görünür', () => {
  it('dosyada satırı yok, özette sayısı ve tutarı var', async () => {
    await makeSale({ daysAgo: 190, unitPrice: 21.1 });
    const gift = await makeSale({ daysAgo: 188, unitPrice: 42.2, isGiftOrder: true });

    const { rows, summary } = await buildExport(PERIOD);
    expect(rows.map((r) => r.orderId)).not.toContain(gift.id);
    expect(summary.orderCount).toBe(1);
    expect(summary.excludedGiftCount).toBe(1);
    expect(summary.excludedGiftGross).toBe(42.2);
  });
});

describe('dosyanın toplamı satırlarla tutar', () => {
  it('özet satırların toplamıdır; oran kovaları da tutar', async () => {
    await makeSale({ daysAgo: 195, unitPrice: 21.1, vatRate: 5.5, shippingFee: 7.9 });
    await makeSale({ daysAgo: 190, unitPrice: 12, vatRate: 20 });
    await makeSale({ daysAgo: 185, unitPrice: 30, qty: 2, vatRate: 5.5 });

    const { rows, summary } = await buildExport(PERIOD);
    expect(summary.orderCount).toBe(3);
    expect(summary.gross).toBe(rows.reduce((t, r) => t + r.gross, 0));
    expect(summary.net + summary.vat).toBe(summary.gross);
    expect(summary.byVatRate.reduce((t, l) => t + l.gross, 0)).toBe(summary.gross);
  });

  it('CSV başlık + satır + TOPLAM taşır; hediye farkı da dosyada yazar', async () => {
    await makeSale({ daysAgo: 190, unitPrice: 21.1 });
    await makeSale({ daysAgo: 189, unitPrice: 10, isGiftOrder: true });

    const csv = toExportCsv(await buildExport(PERIOD));
    expect(csv.split('\n')[0]).toContain('Referans;Fatura no');
    expect(csv).toContain(`LA-EX-${stamp}`);
    expect(csv).toMatch(/TOPLAM;1 satış/);
    expect(csv).toContain('HARİÇ (patron ikramı);1 satış');
  });

  it('satışsız dönem de dosya üretir — boş rapor, rapor yokluğu değildir', async () => {
    const empty = await buildExport({ from: dayOffset(-900), to: dayOffset(-880) });
    expect(empty.rows).toEqual([]);
    expect(empty.summary.orderCount).toBe(0);
    expect(toExportCsv(empty)).toContain('TOPLAM;0 satış');
  });
});

describe('fatura eşleştirme kuyruğu', () => {
  it('numarası olmayan satış kuyrukta; eşleşince düşer', async () => {
    const order = await makeSale({ daysAgo: 190 });

    const queue = await pendingInvoices({ limit: 200 });
    expect(queue.rows.map((r) => r.id)).toContain(order.id);

    const result = await matchInvoiceNo(order.id, ' FA-2026-0042 ');
    expect(result).toEqual({ status: 'ok', orderId: order.id, invoiceNo: 'FA-2026-0042' });

    const after = await pendingInvoices({ limit: 200 });
    expect(after.rows.map((r) => r.id)).not.toContain(order.id);
    expect((await orders.getById(order.id))?.invoiceNo).toBe('FA-2026-0042');
  });

  it('hediye sipariş kuyruğa hiç girmez — fatura numarası almayacak', async () => {
    const gift = await makeSale({ daysAgo: 190, isGiftOrder: true });
    const queue = await pendingInvoices({ limit: 200 });
    expect(queue.rows.map((r) => r.id)).not.toContain(gift.id);
  });

  it('boş numara reddedilir — satır kuyruktan düşer ama hiçbir faturaya bağlanmazdı', async () => {
    const order = await makeSale({ daysAgo: 190 });
    expect(await matchInvoiceNo(order.id, '   ')).toEqual({ status: 'invalid', reason: 'empty_invoice_no' });
    expect((await orders.getById(order.id))?.invoiceNo).toBeNull();
  });
});
