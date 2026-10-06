import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeOrders, purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { AccountService, MoneyMovementService } from './money.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { RegisterQueueService, RegisterStoreService } from './register.service';
import { UserProfileService } from './user-profile.service';

/**
 * Kasa kuyruğu: para nereden yazılırsa yazılsın sipariş ve eşlenmiş kasanın nakit hareketi kuyruğa düşer. İşleyen satırı yalnız işaret
 * değişmediyse siler, yoksa işlem sürerken gelen değişiklik kaybolurdu.
 */
const db = serviceDb();
const orders = new OrderService(db);
const movements = new MoneyMovementService(db);
const queue = new RegisterQueueService(db);

const stamp = Date.now();
let warehouseId: string;
let customerId: string;
let productId: string;
let categoryId: string;
let variantId: string;
let cashAccountId: string;
let bankAccountId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'KASA' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Kasa kuyruğu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Kasa ürünü ${stamp}` }, categoryId });
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kasa müşterisi ${stamp}` })).id;
  const accounts = new AccountService(db);
  cashAccountId = (await accounts.insert({ name: `Kasa çekmecesi ${stamp}`, type: 'cash' })).id;
  bankAccountId = (await accounts.insert({ name: `Kasa bankası ${stamp}`, type: 'bank' })).id;
  // Mağaza numarası damgadan gelir ki kasadaki gerçek mağazanın numarasıyla çakışmasın.
  await new RegisterStoreService(db).save({ warehouseId, externalStoreId: Number(String(stamp).slice(-9)), cashAccountId });
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    accountIds: [cashAccountId, bankAccountId],
    warehouseIds: [warehouseId],
  });
});

async function newOrder(): Promise<string> {
  const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', orderedTotalCents: 1000 }, [
    { variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 },
  ]);
  return order.id;
}

const pay = (orderId: string, amountCents: number) =>
  movements.recordForOrder({ orderId, accountId: bankAccountId, amountCents, type: 'order_payment', paymentMethod: 'bank_transfer' });

interface QueueRow {
  id: string;
  marked_at: string;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
}

async function queueRowOf(column: 'order_id' | 'movement_id', id: string): Promise<QueueRow | null> {
  const { data, error } = await db
    .from('register_queue')
    .select('id, marked_at, attempts, next_attempt_at, last_error')
    .eq(column, id)
    .maybeSingle();
  if (error) throw error;
  return data as QueueRow | null;
}

describe('sipariş parası', () => {
  it('siparişi kuyruğa düşürür ve yöntemi harekete yazar', async () => {
    const orderId = await newOrder();
    await pay(orderId, 400);

    expect(await queueRowOf('order_id', orderId)).not.toBeNull();
    expect((await movements.listByOrder(orderId)).map((movement) => movement.paymentMethod)).toEqual(['bank_transfer']);
  });

  it('yeniden işaretleme denemeyi sıfırlar; işleyen yalnız işareti değişmeyen satırı siler', async () => {
    const orderId = await newOrder();
    await pay(orderId, 400);
    const first = (await queueRowOf('order_id', orderId))!;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await queue.update({ id: first.id, attempts: 3, nextAttemptAt: later, lastError: 'kasa yanıt vermedi' });

    await pay(orderId, 600);
    const second = (await queueRowOf('order_id', orderId))!;
    expect(second).toMatchObject({ id: first.id, attempts: 0, last_error: null });
    expect(Date.parse(second.next_attempt_at)).toBeLessThan(Date.parse(later));
    expect(second.marked_at).not.toBe(first.marked_at);

    // İşlem sürerken gelen ikinci ödeme: eski işaretle tamamlanan satır durur ki sonraki tur onu da yazsın.
    await queue.complete(first.id, first.marked_at);
    expect(await queueRowOf('order_id', orderId)).not.toBeNull();
    await queue.complete(second.id, second.marked_at);
    expect(await queueRowOf('order_id', orderId)).toBeNull();
  });

  it('hareketi olan sipariş silinebilir; silinen sipariş kuyruğa yazılmaz', async () => {
    const orderId = await newOrder();
    await pay(orderId, 400);

    await purgeOrders(db, [orderId]);

    expect(await orders.getById(orderId)).toBeNull();
    expect(await queueRowOf('order_id', orderId)).toBeNull();
  });
});

describe('kasaya yazılmayı bekleyen tahsilat', () => {
  const payCash = (orderId: string, amountCents: number) =>
    movements.recordForOrder({ orderId, accountId: cashAccountId, amountCents, type: 'order_payment', paymentMethod: 'cash' });

  it('silinmez; tutarı ve siparişi değişmez, açıklaması değişir', async () => {
    const orderId = await newOrder();
    const other = await newOrder();
    await payCash(orderId, 1000);
    const [movement] = await movements.listByOrder(orderId);

    await expect(movements.delete(movement!.id)).rejects.toThrow('silinmez');
    await expect(movements.update({ id: movement!.id, amountCents: 900 })).rejects.toThrow('değişmez');
    await expect(movements.update({ id: movement!.id, orderId: other })).rejects.toThrow('değişmez');
    await expect(movements.update({ id: movement!.id, orderId: null })).rejects.toThrow('değişmez');
    await movements.update({ id: movement!.id, description: 'açıklama düzeltildi' });

    expect((await movements.listByOrder(orderId)).map((row) => row.amountCents)).toEqual([1000]);
  });

  it('sipariş silinince bağı boşalır, hareket kalır', async () => {
    const orderId = await newOrder();
    await payCash(orderId, 1000);
    const [movement] = await movements.listByOrder(orderId);

    await purgeOrders(db, [orderId]);

    expect(await movements.getById(movement!.id)).toMatchObject({ orderId: null, amountCents: 1000 });
  });
});

describe('kuyruk kilidi', () => {
  it('kilitli satırı ikinci yazar alamaz; bırakılınca ya da süresi geçince alınır', async () => {
    const orderId = await newOrder();
    await pay(orderId, 400);
    const row = (await queueRowOf('order_id', orderId))!;
    const target = { orderId, movementId: null };
    const later = new Date(Date.now() + 600_000).toISOString();

    expect(await queue.claim(target, later)).toMatchObject({ id: row.id });
    expect(await queue.claim(target, later)).toBeNull();
    await queue.release(row.id);
    expect(await queue.claim(target, later)).toMatchObject({ id: row.id });

    await db.from('register_queue').update({ locked_until: new Date(Date.now() - 1000).toISOString() }).eq('id', row.id);
    expect(await queue.claim(target, later)).toMatchObject({ id: row.id });
  });
});

describe('eşlenmiş kasanın hareketi', () => {
  it('kimliğiyle kuyruğa düşer; silinmesi de düşer ki kasadaki karşılığı geri alınsın', async () => {
    const movement = await movements.insert({ accountId: cashAccountId, direction: 'out', amountCents: 2000, type: 'expense' });
    const marked = (await queueRowOf('movement_id', movement.id))!;
    expect(marked).not.toBeNull();
    await queue.complete(marked.id, marked.marked_at);

    await movements.delete(movement.id);

    const reversal = await queueRowOf('movement_id', movement.id);
    expect(reversal).not.toBeNull();
    // Hareketi silinen satırı temizlik hareketten bulamaz; işleyenin yapacağı gibi tüketilir.
    await queue.complete(reversal!.id, reversal!.marked_at);
  });

  it('karşı hesabı eşlenmiş kasa olan transfer düşer, eşlenmemiş hesabın hareketi düşmez', async () => {
    const transfer = await movements.insert({
      accountId: bankAccountId,
      direction: 'out',
      amountCents: 5000,
      type: 'transfer',
      counterAccountId: cashAccountId,
    });
    const expense = await movements.insert({ accountId: bankAccountId, direction: 'out', amountCents: 300, type: 'expense' });

    expect(await queueRowOf('movement_id', transfer.id)).not.toBeNull();
    expect(await queueRowOf('movement_id', expense.id)).toBeNull();
  });
});
