import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { notifyShippingDataMissing, notifyStockLowAfterReserve, notifyTicketOpened } from './staff-events';

/**
 * Personel olay üreticileri: `stock_low` aynı düşüşü, `ticket_opened` aynı talebi, `shipping_data_missing` aynı ürün ya da depo eksiğini
 * ikinci kez zile düşürmez. Fan-out `dispatch.test`te sınanır, burada üreticinin kararı; satırlar testin kurduğu personele yazılır ve purge
 * ile gider.
 */
const db = serviceDb();
const stamp = Date.now();

let staffId: string;
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
/** ticket_opened dedupe anahtarının kimliği — teardown fan-out'un TÜM kopyalarını bununla bulur. */
const ticketId = crypto.randomUUID();

async function kendiSatirlarim(kind: string): Promise<number> {
  const { data, error } = await db.from('notification').select('id').eq('profile_id', staffId).eq('kind', kind);
  if (error) throw error;
  return (data as unknown[]).length;
}

beforeAll(async () => {
  const staff = await new UserProfileService(db).insert({ name: `staff-events testi ${stamp}`, roles: ['admin'] });
  staffId = staff.id;
  warehouseId = (await createTestWarehouse(db, { label: 'SE' })).id;

  // Ürün kurulum yolu stok testinin AYNISI (`products.create` varyantı da açar); eşik raw update
  // ile: eşikli ve STOKSUZ varyant — "kullanılabilir 0 < eşik 5" gerçeği kurulumdan.
  const category = await new CategoryService(db).create({ name: { tr: `Staff-events ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Eşik Ürünü ${stamp}` },
    categoryId: category.id,
    dateType: 'DLC',
    shelfLifeDays: 60,
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await db.from('product_variant').update({ min_stock_qty: 5, sku: `SE-${stamp}` }).eq('id', variantId);
});

afterAll(async () => {
  // Fan-out satırı SEED adminlerine de yazar (listStaff herkesi çeker) — o kopyalar profil
  // purge'üyle gitmez. Dedupe anahtarları test damgalı: tüm kopyalar oradan bulunur, purge siler.
  const { data } = await db
    .from('notification')
    .select('id')
    .in('dedupe_key', [
      `stock-low:${warehouseId}:${variantId}`,
      `ticket-opened:${ticketId}`,
      `shipping-data:unmeasured:${variantId}`,
      `shipping-data:no_box:${warehouseId}`,
    ]);
  await purgeTestData(db, {
    notificationIds: ((data ?? []) as { id: string }[]).map((r) => r.id),
    profileIds: [staffId],
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [warehouseId],
  });
});

describe('notifyStockLowAfterReserve', () => {
  it('eşik altında satır doğar (sayılar gerçek); aynı düşüş ikinci kez zile düşmez', async () => {
    await notifyStockLowAfterReserve(db, { warehouseId, variantIds: [variantId] });
    expect(await kendiSatirlarim('stock_low')).toBe(1);

    const { data } = await db.from('notification').select('payload, warehouse_id').eq('profile_id', staffId).eq('kind', 'stock_low').single();
    const satir = data as { payload: Record<string, unknown>; warehouse_id: string | null };
    expect(satir.payload).toMatchObject({ sku: `SE-${stamp}`, availableQty: 0, minStockQty: 5 });
    // Depo boyutu satırda (CLAUDE: depo bir boyut değil, değişmez) — depocu süzgeci buna dayanır.
    expect(satir.warehouse_id).toBe(warehouseId);

    // İkinci çağrı: dedupe yutar — süregelen hâli bildirim değil eşik listesi taşır.
    await notifyStockLowAfterReserve(db, { warehouseId, variantIds: [variantId] });
    expect(await kendiSatirlarim('stock_low')).toBe(1);
  });

  it('boş varyant listesi sessizliktir — sorgu bile atılmaz, satır doğmaz', async () => {
    await notifyStockLowAfterReserve(db, { warehouseId, variantIds: [] });
    expect(await kendiSatirlarim('stock_low')).toBe(1); // öncekinden kalan tek satır
  });
});

describe('notifyTicketOpened', () => {
  it('talep başına TEK haber; tip ve referans payload ile taşınır', async () => {
    await notifyTicketOpened(db, { ticketId, type: 'damaged', referenceNo: 'LA-26-SE1' });
    await notifyTicketOpened(db, { ticketId, type: 'damaged', referenceNo: 'LA-26-SE1' });
    expect(await kendiSatirlarim('ticket_opened')).toBe(1);

    const { data } = await db.from('notification').select('payload').eq('profile_id', staffId).eq('kind', 'ticket_opened').single();
    expect((data as { payload: Record<string, unknown> }).payload).toMatchObject({ ticketType: 'damaged', referenceNo: 'LA-26-SE1' });
  });
});

describe('notifyShippingDataMissing', () => {
  // Ekran okuması her seçimde tekrarlanır; tekilleştirme tutmazsa eksik giderilene kadar her okuma yeni bir zil satırı yazardı.
  it('ürün eksiği ürün başına tek haberdir ve ürün kartına açılacak kimliği taşır', async () => {
    await notifyShippingDataMissing(db, { reason: 'unmeasured', variantIds: [variantId], warehouseId });
    await notifyShippingDataMissing(db, { reason: 'unmeasured', variantIds: [variantId], warehouseId });
    expect(await kendiSatirlarim('shipping_data_missing')).toBe(1);

    const { data } = await db
      .from('notification')
      .select('payload, target_type, target_id, warehouse_id')
      .eq('profile_id', staffId)
      .eq('kind', 'shipping_data_missing')
      .single();
    expect(data).toMatchObject({
      payload: { reason: 'unmeasured', productId, sku: `SE-${stamp}` },
      target_type: 'variant',
      target_id: variantId,
      warehouse_id: warehouseId,
    });
  });

  it('depo eksiği ürünsüzdür: hedefsiz tek haber', async () => {
    await notifyShippingDataMissing(db, { reason: 'no_box', variantIds: [], warehouseId });
    await notifyShippingDataMissing(db, { reason: 'no_box', variantIds: [], warehouseId });
    const { data } = await db
      .from('notification')
      .select('payload, target_type')
      .eq('profile_id', staffId)
      .eq('dedupe_key', `shipping-data:no_box:${warehouseId}`);
    expect(data).toEqual([{ payload: { reason: 'no_box' }, target_type: null }]);
  });
});
