import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderItemInsert } from '@lezzet/types';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
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
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let discountId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'SIP' })).id;
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
    await discounts.insert({
      name: `Sipariş testi kuponu ${stamp}`,
      // Etiket 26.08'den beri ZORUNLU (kısıt veride) — bu testin konusu değil, bir ad yeter.
      publicLabel: { tr: `Sipariş testi kuponu ${stamp}` },
      trigger: 'coupon', type: 'fixed', amountCents: 300, scope: 'cart',
    })
  ).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId); // kalemler + kullanım kaydı CASCADE
  await discounts.delete(discountId).catch(() => {});
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    warehouseIds: [warehouseId],
  });
});

/** En sade geçerli sipariş: tek kalem, indirimsiz. Testler bunun üstüne tek alan değiştirir. */
const header = () => ({ customerId, warehouseId, channel: 'b2c' as const, orderedTotalCents: 2000 });
// `overrides` TİPLİ (02.9): `Record<string, unknown>` yazım hatasını yutuyordu — alan adı değişince
// eski ad sessizce düşer ve test kendi kurduğu zemini doğrulamaz. Aynı açık `cart/discount.test`'te
// gerçekten yaşandı: koşulsuz kalan kupon uygulandı, iki test sebebini söylemeden patladı.
const line = (overrides: Partial<OrderItemInsert> = {}): Omit<OrderItemInsert, 'orderId'> => ({
  variantId,
  qty: 2,
  unitPriceCents: 1000,
  vatRate: 5.5,
  ...overrides,
});

describe('create — üç tablo tek gerçek', () => {
  it('başlık, kalemler ve kullanım kaydı birlikte yazılır', async () => {
    const { order, items } = await orders.create(
      { ...header(), orderedTotalCents: 1700, discountAmountCents: 300, discountId },
      [line({ lineDiscountAmountCents: 200 }), line({ variantId: secondVariantId, qty: 1, unitPriceCents: 500, lineDiscountAmountCents: 100 })],
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
    expect(order.amountCollectedCents).toBe(0);
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
        { ...header(), orderedTotalCents: 1700, discountAmountCents: 300, discountId: '00000000-0000-0000-0000-000000000000' },
        [line({ lineDiscountAmountCents: 300 })],
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

    await expect(orders.create({ ...header(), orderedTotalCents: 1700, discountAmountCents: 300 }, [line()])).rejects.toThrow(/indirim/i);

    // Kontrol COMMIT anında yapılıyor; ihlal yalnız hata vermekle kalmayıp yazımı geri almalı.
    expect(await countOrders()).toBe(before);
  });

  it('payların toplamı tutuyorsa yazılır — kuruş artığı dahil', async () => {
    // 3,00 € üç kaleme bölünürse pay 1,00 + 1,00 + 1,00 değil 1,01 + 1,00 + 0,99 olabilir; motorun
    // garantisi eşit dağıtım değil, TOPLAMIN korunması. Kısıt da onu denetliyor.
    const { order } = await orders.create({ ...header(), orderedTotalCents: 2700, discountAmountCents: 300 }, [
      line({ lineDiscountAmountCents: 101 }),
      line({ variantId: secondVariantId, lineDiscountAmountCents: 100 }),
      line({ lineDiscountAmountCents: 99 }),
    ]);

    expect(order.discountAmountCents).toBe(300);
  });

  it('SONRADAN bozan bir güncelleme de reddedilir — koruma yazım yolunda değil VERİDE', async () => {
    const { order } = await orders.create(header(), [line()]);

    // RPC bugünün tek yazım yolu; ama yarın elle giriş, bir onarım betiği ya da doğrudan SQL ikinci
    // bir yol açabilir. Kısıt veride durduğu için hangi yoldan gelinirse gelinsin denge bozulamaz.
    await expect(orders.update({ id: order.id, discountAmountCents: 500 })).rejects.toThrow(/indirim/i);

    expect((await orders.getById(order.id))?.discountAmountCents).toBe(0);
  });

  it('kalemin payını silmek de dengeyi bozar — kısıt kalem tarafını da tutuyor', async () => {
    const { order, items } = await orders.create({ ...header(), orderedTotalCents: 1700, discountAmountCents: 300 }, [
      line({ lineDiscountAmountCents: 300 }),
      line({ variantId: secondVariantId }),
    ]);

    const { error } = await db.from('order_item').delete().eq('id', items.find((i) => i.lineDiscountAmountCents === 300)!.id);
    expect(error?.message).toMatch(/indirim/i);

    expect((await orders.getWithItems(order.id))?.items).toHaveLength(2);
  });
});

/** Bu testin kendi siparişleri — küresel sayıya bakılmaz (paylaşılan DB, CLAUDE.md §4b). */
async function countOrders(): Promise<number> {
  const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  return count ?? 0;
}

/**
 * Kargo künyesi (07.12) — taşıyıcı + takip numarası.
 *
 * Kural VERİDE duruyor (`order_carrier_only_shipping`), ekranda değil: rota siparişinde taşıyıcı
 * yoktur ve olmayan bir taşıyıcının takip bağlantısı müşteriye hiç çalışmayan bir düğme gösterirdi.
 * Ekran unutabilir; veritabanı unutmaz.
 */
describe('kargo künyesi yalnız kargo siparişinde', () => {
  it('kargo siparişine taşıyıcı ve takip numarası yazılır', async () => {
    const { order } = await orders.create({ ...header(), deliveryType: 'shipping' }, [line()]);
    const updated = await orders.setShipment(order.id, 'colissimo', '6A 2451 7788');
    expect(updated).toMatchObject({ carrier: 'colissimo', trackingNumber: '6A 2451 7788' });
  });

  it('ROTA siparişine yazılamaz — kendi aracımızla giden malın taşıyıcısı yoktur', async () => {
    const { order } = await orders.create({ ...header(), deliveryType: 'route' }, [line()]);
    await expect(orders.setShipment(order.id, 'dhl', 'XYZ')).rejects.toThrow();
  });
});

/**
 * SINIR TESTİ (02.9 · STACK §8) — sipariş ailesi euro↔cent.
 *
 * Sipariş ailesinde ÜÇ ayrı yol var ve üçü ayrı ayrı denenir, çünkü üçü ayrı kodda:
 *   1. **Yazma RPC'si** (`create_order`) — gövde jsonb gider, anahtarlar kolonlarla kesişir.
 *      `unitPriceCents` olduğu gibi gitseydi `unit_price_cents` üretirdi, öyle bir kolon yok,
 *      anahtar SESSİZCE düşerdi (`rpcMoneyToEuro`).
 *   2. **Okuma** (`moneyFields`) — kolon euro, dönen alan cent.
 *   3. **Güncelleme** (`update`) — aynı eşleme yazma yönünde.
 *
 * Kolonlar HAM okunur (`db.from('order')`): iki tarafı da servisten okuyan bir test, aynı yanlış
 * sabitle çarpılsa yine geçerdi.
 */
describe('sipariş ailesi — euro↔cent sınırı', () => {
  it('cent yazılır, kolonlar euro tutar, cent okunur (gidiş-dönüş)', async () => {
    const { order, items } = await orders.create(
      { ...header(), orderedTotalCents: 1234, shippingFeeCents: 790 },
      [line({ unitPriceCents: 617, qty: 2 })],
    );

    expect(order.orderedTotalCents).toBe(1234);
    expect(order.shippingFeeCents).toBe(790);
    expect(items[0]?.unitPriceCents).toBe(617);

    const { data: baslik } = await db.from('order').select('ordered_total, shipping_fee').eq('id', order.id).single();
    const ham = baslik as { ordered_total: number | string; shipping_fee: number | string };
    expect(Number(ham.ordered_total)).toBe(12.34);
    expect(Number(ham.shipping_fee)).toBe(7.9);

    const { data: kalem } = await db.from('order_item').select('unit_price').eq('id', items[0]!.id).single();
    expect(Number((kalem as { unit_price: number | string }).unit_price)).toBe(6.17);

    const okunan = await orders.getById(order.id);
    expect(okunan?.orderedTotalCents).toBe(1234);
    expect(okunan?.shippingFeeCents).toBe(790);
  });

  it('güncelleme de sınırdan geçer — kolon euro kalır', async () => {
    const { order } = await orders.create(header(), [line()]);

    await orders.update({ id: order.id, packagingCostCents: 155 });

    const { data } = await db.from('order').select('packaging_cost').eq('id', order.id).single();
    expect(Number((data as { packaging_cost: number | string }).packaging_cost)).toBe(1.55);
    expect((await orders.getById(order.id))?.packagingCostCents).toBe(155);
  });

  // `undefined` ile `null` AYNI ŞEY DEĞİL: ilki "gönderme" (kolon varsayılanını alır), ikincisi
  // "boşalt". İkisini `null`a indirdiğim ilk hâl `shipping_fee`in `not null` kısıtını kırdı.
  it('gönderilmeyen para alanı kolonun VARSAYILANINI alır, null yazmaz', async () => {
    const { order } = await orders.create({ ...header(), shippingFeeCents: undefined }, [line()]);
    expect(order.shippingFeeCents).toBe(0);
  });
});

/**
 * KANAL DONAR (27.08, `03.12`) — kural VERİDE zorlanıyor mu?
 *
 * Kural motorda yazılıydı (`canChangeChannel`, hep `false`) ama 27.08'e kadar onu ne soran ne
 * zorlayan vardı: `OrderUpdateSchema` tam `partial()`ti. Şema tarafı artık kanalı düşürüyor
 * (`order.schema.test.ts`), ama şema yalnız KENDİ kapısından geçeni korur — besleme betiği,
 * düzeltme sorgusu ya da elle müdahale o kapıdan geçmez. Bu dosyanın sorusu tam olarak o:
 * **veritabanı bozuk güncellemeyi kabul ediyor mu?**
 *
 * Bedeli soyut değil: kanal `vat_treatment`ı ve fiyat kademesini belirliyor, yani kapanmış bir
 * siparişin kanalını oynatmak parası çoktan alınmış bir belgenin vergisini geriye dönük
 * değiştirmektir — ve hiçbir yer itiraz etmediği için SESSİZCE.
 */
describe('kanal DEĞİŞMEZ — tetikleyici (order_channel_frozen)', () => {
  it('kanalı değiştiren doğrudan güncelleme REDDEDİLİR', async () => {
    const { order } = await orders.create(header(), [line()]);
    expect(order.channel).toBe('b2c');

    // Servisi ATLAYARAK: şema kalkanının arkasındaki savunmayı sınıyoruz, kalkanın kendisini değil.
    const { error } = await db.from('order').update({ channel: 'b2b' }).eq('id', order.id);

    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514'); // check_violation — tetikleyicinin bildirdiği kod
    // Ve kanal YERİNDE durmalı: red, "yarısını yazdı" demek değildir.
    expect((await orders.getById(order.id))?.channel).toBe('b2c');
  });

  it('AYNI kanalı yeniden yazmak reddedilmez — donmak "dokunma" değil, "değiştirme" yasağıdır', async () => {
    const { order } = await orders.create(header(), [line()]);

    const { error } = await db.from('order').update({ channel: 'b2c' }).eq('id', order.id);

    // Ayrım önemli: idempotent bir yazım (aynı satırı aynı değerlerle tazeleyen bir betik)
    // kanalı da gönderebilir. Onu reddetmek, hiçbir şeyi değiştirmeyen bir işlemi kesmek olurdu.
    expect(error).toBeNull();
  });

  it('kanala dokunmayan güncelleme etkilenmez — kalkan öteki alanları kesmez', async () => {
    const { order } = await orders.create(header(), [line()]);

    await orders.update({ id: order.id, paymentStatus: 'paid' });

    expect((await orders.getById(order.id))?.paymentStatus).toBe('paid');
  });
});
