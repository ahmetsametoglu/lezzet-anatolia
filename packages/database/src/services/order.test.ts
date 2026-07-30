import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { DiscountService } from './discount.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { UserProfileService } from './user-profile.service';

/**
 * Siparişin DOĞUŞU (07.4 RPC borcu) — DB üstünde. Sınanan şey tek bir söz: **ya üçü de yazılır ya
 * hiçbiri.** Sipariş üç tabloya birden yazılır (başlık · kalemler · indirim kullanım kaydı) ve
 * aralarındaki bağ bir uygulama detayı değil, siparişin kendisidir.
 *
 * Bu dosya `database` paketinde çünkü sınanan şey KURAL değil KISIT: hangi indirimin kazandığı
 * motorun testinde, burada yalnız "veritabanı bozuk siparişi kabul ediyor mu" sorusu var.
 *
 * Testlerin çoğu **hatanın ARDINDAN ne kaldığına** bakıyor. "Fırlattı" yetmez: telafi mantığının
 * kapattığı sanılan açık tam olarak buydu — hata görülüyordu ama geride yarım bir sipariş kalıyordu.
 */
const db = serviceDb();
const orders = new OrderService(db);
const discounts = new DiscountService(db);

const stamp = Date.now();
let customerId: string;
let variantId: string;
let secondVariantId: string;
let productId: string;
let categoryId: string;
let discountId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sipariş testi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Mantı ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500gr' } }, { label: { tr: '1kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  secondVariantId = variants[1]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Sipariş müşterisi ${stamp}` })).id;
  discountId = (
    await discounts.insert({ name: `Sipariş testi kuponu ${stamp}`, trigger: 'coupon', type: 'fixed', value: 3, scope: 'cart' })
  ).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId); // kalemler + kullanım kaydı CASCADE
  await discounts.delete(discountId).catch(() => {});
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId] });
});

/** En sade geçerli sipariş: tek kalem, indirimsiz. Testler bunun üstüne tek alan değiştirir. */
const header = () => ({ customerId, channel: 'b2c' as const, total: 20 });
const line = (overrides: Record<string, unknown> = {}) => ({
  variantId,
  qty: 2,
  unitPrice: 10,
  vatRate: 5.5,
  ...overrides,
});

describe('create — üç tablo tek gerçek', () => {
  it('başlık, kalemler ve kullanım kaydı birlikte yazılır', async () => {
    const { order, items } = await orders.create(
      { ...header(), total: 17, discountAmount: 3, discountId },
      [line({ lineDiscountAmount: 2 }), line({ variantId: secondVariantId, qty: 1, unitPrice: 5, lineDiscountAmount: 1 })],
    );

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.orderId === order.id)).toBe(true);

    const { data: uses } = await db.from('discount_use').select('amount, discount_id').eq('order_id', order.id);
    expect(uses).toHaveLength(1);
    // Kaydedilen tutar kuralın DEĞERİ değil, o sepette gerçekten inen indirim.
    expect(Number(uses?.[0]?.amount)).toBe(3);
  });

  it('gönderilmeyen alan TABLONUN varsayılanını alır — kolonlar tek tek sayılmıyor', async () => {
    const { order } = await orders.create(header(), [line()]);

    // Bu üçü gövdede hiç yok; RPC gelen anahtarları kolonlarla kesiştirdiği için ifadeye girmiyorlar.
    expect(order.status).toBe('draft');
    expect(order.paymentStatus).toBe('pending');
    expect(order.amountCollected).toBe(0);
    // Kalem tarafında da aynı: `fulfilled_qty` gönderilmedi, varsayılanı geldi.
    const { items } = (await orders.getWithItems(order.id))!;
    expect(items[0]?.fulfilledQty).toBe(0);
  });

  it('indirim inmediyse kullanım kaydı YAZILMAZ — tüketilen bir hak yok', async () => {
    const { order } = await orders.create(header(), [line()]);

    const { count } = await db.from('discount_use').select('id', { count: 'exact', head: true }).eq('order_id', order.id);
    expect(count).toBe(0);
  });

  it('kalemsiz sipariş açılamaz', async () => {
    await expect(orders.create(header(), [])).rejects.toThrow(/kalemsiz/);
    // Kapı da RPC de reddediyor; RPC doğrudan çağrılarak istemci tarafı kontrolü ATLANIYOR —
    // korumanın veritabanında olduğu, uygulamada değil.
    const { error } = await db.rpc('create_order', { p_order: { customer_id: customerId, channel: 'b2c' }, p_items: [] });
    expect(error?.message).toMatch(/kalemsiz/);
  });
});

describe('yarım yazım geride hiçbir şey bırakmaz', () => {
  it('kalem yazılamazsa BAŞLIK da yazılmaz — öksüz sipariş kalmaz', async () => {
    const before = await countOrders();

    // Var olmayan varyant: kalem FK'sinden düşer. Başlık o sırada çoktan yazılmış olur — telafi
    // mantığıyla değil, transaction'ın geri alınmasıyla ortadan kalkmalı.
    await expect(
      orders.create(header(), [line(), line({ variantId: '00000000-0000-0000-0000-000000000000' })]),
    ).rejects.toThrow();

    expect(await countOrders()).toBe(before);
  });

  it('kullanım kaydı yazılamazsa sipariş de yazılmaz — kotayı delen sipariş doğmaz', async () => {
    const before = await countOrders();

    // Var olmayan indirim kuralı: `discount_use.discount_id` FK'si düşer. Bu satır eskiden siparişten
    // SONRA yazılıyordu; düşerse ortada indirimli ama kotayı hiç tüketmemiş bir sipariş kalırdı.
    await expect(
      orders.create(
        { ...header(), total: 17, discountAmount: 3, discountId: '00000000-0000-0000-0000-000000000000' },
        [line({ lineDiscountAmount: 3 })],
      ),
    ).rejects.toThrow();

    expect(await countOrders()).toBe(before);
  });
});

/**
 * `discount_amount = Σ line_discount_amount` — **veritabanının zorladığı** değişmez (0041).
 *
 * Kaynağı yaşanmış bir para hatası: başlığa 3 € indirim yazılıyor, kalemlerin payı 0 kalıyordu.
 * Ödeme motoru borcu kalemlerden topladığı için tamamı ödenmiş sipariş `partial` görünüyor ve
 * bildirim maili müşteriden kapıda 3 € daha istiyordu.
 */
describe('indirim dengesi (kısıt tetikleyicisi)', () => {
  it('başlıktaki indirim kalemlere dağıtılmadıysa sipariş YAZILMAZ', async () => {
    const before = await countOrders();

    await expect(orders.create({ ...header(), total: 17, discountAmount: 3 }, [line()])).rejects.toThrow(/indirim/i);

    // Kontrol COMMIT anında yapılıyor; ihlal yalnız hata vermekle kalmayıp yazımı geri almalı.
    expect(await countOrders()).toBe(before);
  });

  it('payların toplamı tutuyorsa yazılır — kuruş artığı dahil', async () => {
    // 3,00 € üç kaleme bölünürse pay 1,00 + 1,00 + 1,00 değil 1,01 + 1,00 + 0,99 olabilir; motorun
    // garantisi eşit dağıtım değil, TOPLAMIN korunması. Kısıt da onu denetliyor.
    const { order } = await orders.create({ ...header(), total: 27, discountAmount: 3 }, [
      line({ lineDiscountAmount: 1.01 }),
      line({ variantId: secondVariantId, lineDiscountAmount: 1 }),
      line({ lineDiscountAmount: 0.99 }),
    ]);

    expect(order.discountAmount).toBe(3);
  });

  it('SONRADAN bozan bir güncelleme de reddedilir — koruma yazım yolunda değil VERİDE', async () => {
    const { order } = await orders.create(header(), [line()]);

    // RPC bugünün tek yazım yolu; ama yarın elle giriş, bir onarım betiği ya da doğrudan SQL ikinci
    // bir yol açabilir. Kısıt veride durduğu için hangi yoldan gelinirse gelinsin denge bozulamaz.
    await expect(orders.update({ id: order.id, discountAmount: 5 })).rejects.toThrow(/indirim/i);

    expect((await orders.getById(order.id))?.discountAmount).toBe(0);
  });

  it('kalemin payını silmek de dengeyi bozar — kısıt kalem tarafını da tutuyor', async () => {
    const { order, items } = await orders.create({ ...header(), total: 17, discountAmount: 3 }, [
      line({ lineDiscountAmount: 3 }),
      line({ variantId: secondVariantId }),
    ]);

    const { error } = await db.from('order_item').delete().eq('id', items.find((i) => i.lineDiscountAmount === 3)!.id);
    expect(error?.message).toMatch(/indirim/i);

    expect((await orders.getWithItems(order.id))?.items).toHaveLength(2);
  });
});

/** Bu testin kendi siparişleri — küresel sayıya bakılmaz (paylaşılan DB, CLAUDE.md §4b). */
async function countOrders(): Promise<number> {
  const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  return count ?? 0;
}
