import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { buildOrderNotification } from './notification-data';

/**
 * Bildirim verisinin kalem satırları (14.5).
 *
 * Sınanan tek kural: **"daha hazırlanmadı" ile "eksik gönderildi" aynı şey değildir.**
 *
 * `fulfilled_qty` yeni onaylanmış bir siparişte 0'dır — çünkü kimse malı almaya gitmemiştir. Mail
 * bunu ayırt etmiyordu ve her kalemi "0 gönderildi, tamamı iade edilecek" diye anlatıyordu; müşteri
 * siparişini verir vermez hepsinin iptal edildiğini sanıyordu (gerçek sipariş LA-26-99C7YN).
 */
const db = serviceDb();
const orders = new OrderService(db);

const stamp = Date.now();
const createdOrders: string[] = [];
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let variantId: string;
let categoryId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Bildirim ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Bildirim ürünü ${stamp}`, fr: `Produit ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: 'Ayşe Kaya', email: `bildirim-${stamp}@example.test` })).id;
});

afterAll(async () => {
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId] });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

async function orderWith(
  status: 'confirmed' | 'delivered',
  fulfilledQty: number,
  extra: Partial<Parameters<typeof orders.create>[0]> = {},
) {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status, totalCents: 2000, ...extra },
    // İndirim KALEME de dağıtılır: `discount_amount = Σ line_discount_amount` artık veritabanının
    // zorladığı bir değişmez (0041). Tek kalemli fikstürde payın tamamı o kaleme iner.
    [{ variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5, lineDiscountAmountCents: extra.discountAmountCents ?? 0 }],
  );
  createdOrders.push(order.id);
  await db.from('order_item').update({ fulfilled_qty: fulfilledQty }).eq('order_id', order.id);
  return order.id;
}

describe('kalem satırları', () => {
  it('ONAYLANMIŞ siparişte sipariş edilen adet yazar, eksiklik notu ÇIKMAZ', async () => {
    const orderId = await orderWith('confirmed', 0);

    const bundle = await buildOrderNotification(orderId, 'order_confirmed');
    expect(bundle?.data.lines).toHaveLength(1);
    expect(bundle?.data.lines[0]).toMatchObject({ qty: 2, shortfall: null });
    // Boşluk kontrolü YOK: `Intl` fransızcada dar bloke boşluk (U+202F) kullanır, kaynak dosyadaki
    // düz boşlukla eşleşmez. Sınanan şey biçim değil, TUTAR.
    expect(bundle?.data.lines[0]?.amount).toMatch(/20,00/);
  });

  it('hazırlık KESİNLEŞTİĞİNDE eksiklik görünür — asıl kural burada işler', async () => {
    const orderId = await orderWith('delivered', 1);

    const bundle = await buildOrderNotification(orderId, 'order_delivered');
    expect(bundle?.data.lines[0]?.qty).toBe(1);
    // Tasarım kuralı: sebep yazılmaz, yalnız miktar + para çözümü.
    expect(bundle?.data.lines[0]?.shortfall).toMatch(/10,00/);
  });

  it('tam karşılanan teslimde eksiklik notu yok', async () => {
    const orderId = await orderWith('delivered', 2);

    expect((await buildOrderNotification(orderId, 'order_delivered'))?.data.lines[0]).toMatchObject({
      qty: 2,
      shortfall: null,
    });
  });
});

/**
 * Mailin DİLİ (04.9) ve indirim satırının ADI (05.13).
 *
 * İkisi de aynı boşluktan doğdu: müşteriye görünen metnin kaynağı yoktu. Dil profilden okunuyordu ve
 * o kolonu hiçbir akış yazmıyordu (herkes `'fr'`); indirim satırı da kampanyanın adını bilmiyordu.
 * İkisinin de cevabı artık SİPARİŞTE — çünkü ikisi de sonradan değişmemesi gereken bilgiler.
 */
describe('siparişin dili ve indirim satırı', () => {
  it('dil siparişten okunur — profil sonradan değişse de mail değişmez', async () => {
    const orderId = await orderWith('confirmed', 0, { locale: 'de' });

    const bundle = await buildOrderNotification(orderId, 'order_confirmed');
    expect(bundle?.data.locale).toBe('de');
    expect(bundle?.recipient.locale).toBe('de');
    // Metin de o dilde kurulmuş olmalı, yalnız alan değil.
    expect(bundle?.data.totals[0]?.label).toBe('Zwischensumme');
  });

  it('sipariş dilsizse profile düşülür — hızlı satışta okunan bir yüzey yoktur', async () => {
    await new UserProfileService(db).update({ id: customerId, preferredLanguage: 'tr' });
    const orderId = await orderWith('confirmed', 0);

    expect((await buildOrderNotification(orderId, 'order_confirmed'))?.data.locale).toBe('tr');
    await new UserProfileService(db).update({ id: customerId, preferredLanguage: 'fr' });
  });

  it('indirim satırı KOPYADAN gelen adı yazar, kampanya tanımından değil', async () => {
    const orderId = await orderWith('confirmed', 0, {
      locale: 'fr',
      discountAmountCents: 300,
      discountLabel: { tr: 'Hoş geldin indirimi', fr: 'Offre de bienvenue' },
    });

    const totals = (await buildOrderNotification(orderId, 'order_confirmed'))?.data.totals ?? [];
    expect(totals.find((row) => row.label.startsWith('Remise'))?.label).toBe('Remise — Offre de bienvenue');
  });

  it('ad yoksa satır genel adında kalır — tür UYDURULMAZ', async () => {
    const orderId = await orderWith('confirmed', 0, { locale: 'fr', discountAmountCents: 300 });

    const totals = (await buildOrderNotification(orderId, 'order_confirmed'))?.data.totals ?? [];
    expect(totals.some((row) => row.label === 'Remise')).toBe(true);
  });
});

/**
 * Mailin ana düğmesinin GİTTİĞİ YER (03.08).
 *
 * Bağ `referenceNo ?? id` ile kuruluyordu ve numara onayla doğduğu için pratikte HER sipariş
 * mailinde numara yazıyordu; sayfa ise siparişi kimlikle çözüyor. Yani düğme çalışmıyordu ve bunu
 * kimse sınamıyordu — arıza tam da bu yüzden aylarca yaşadı. Sınanan şey biçim değil, İÇERİK:
 * adreste taşınan değer siparişin kimliği mi.
 */
describe('sipariş bağı', () => {
  it('bağ KİMLİK taşır — referans numarası taşısaydı sayfa 404 verirdi', async () => {
    const orderId = await orderWith('confirmed', 0);
    // Numara normalde onay akışında doğar; burada doğrudan yazılıyor — sınanan şey numaranın nasıl
    // doğduğu değil, VAR olduğunda bağın hangi değeri taşıdığı.
    await db.from('order').update({ reference_no: `LA-TEST-${stamp}` }).eq('id', orderId);

    const bundle = await buildOrderNotification(orderId, 'order_confirmed');
    expect(bundle?.data.orderUrl).toContain(orderId);
    // Numara mailin METNİNDE durur; görünen ile adreste taşınan aynı şey olmak zorunda değil.
    expect(bundle?.data.referenceNo).toBe(`LA-TEST-${stamp}`);
  });
});
