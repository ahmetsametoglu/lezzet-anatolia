import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { getOrCreateReferralCode, linkReferrer, resolveReferrer } from './referral';
import { getPointsBalance, listPointsHistory, rewardCompletedOrder } from './points';
import { transitionOrder } from '../order/transition';

/**
 * Davet zinciri ve kapanan siparişin iki ödülü (17.4 · 17.7).
 *
 * Zemin 29.07'den beri hazırdı ama iki uç bağlanmamıştı: `referred_by` kolonunu hiçbir kod
 * yazmıyordu ve `reason='order'` yalnız testte geçiyordu — yani müşteri sipariş verdiği için hiç
 * puan kazanmıyor, getiren de hiç kazanmıyordu. Bu dosya o iki ucun gerçekten bağlandığını
 * sınıyor; kuralları değil, KABLOYU.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const orders = new OrderService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
let getirenId: string;
let getirilenId: string;
let yabanciId: string;
let warehouseId: string;
let productId: string;
let variantId: string;
let categoryId: string;

/** Teslim edilmeye hazır bir sipariş kurar (ödül tetikleyicisi teslim/kapanıştır). */
async function siparisAc(customerId: string): Promise<string> {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'out_for_delivery', totalCents: 1500 },
    [{ variantId, qty: 1, unitPriceCents: 1500, vatRate: 5.5 }],
  );
  createdOrders.push(order.id);
  return order.id;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Davet testi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Davetli ürün ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  getirenId = (await profiles.insert({ name: 'Getiren Ayşe', email: `ref-a-${stamp}@example.test`, type: 'individual' })).id;
  getirilenId = (await profiles.insert({ name: 'Gelen Mehmet', email: `ref-b-${stamp}@example.test`, type: 'individual' })).id;
  yabanciId = (await profiles.insert({ name: 'Yabancı', email: `ref-c-${stamp}@example.test`, type: 'individual' })).id;
  createdProfiles.push(getirenId, getirilenId, yabanciId);
});

beforeEach(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  await profiles.update({ id: getirilenId, referredBy: null });
});

afterAll(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles, warehouseIds: [warehouseId] });
});

describe('davet kodu', () => {
  it('istek üzerine üretilir ve AYNI kod ikinci kez döner', async () => {
    // Kod kayıtta değil istekte doğuyor: müşterilerin çoğu hiç davet etmez.
    const ilk = await getOrCreateReferralCode(getirenId);
    expect(ilk).toMatch(/^[A-Z0-9]{8}$/);
    expect(await getOrCreateReferralCode(getirenId)).toBe(ilk);
  });

  it('kod sahibine çözülür; geçersiz kod HATA değil null döner', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    expect(await resolveReferrer(kod!)).toBe(getirenId);
    // Bağlantı yanlış kopyalanmış olabilir — kayıt bir dize yüzünden reddedilmez.
    expect(await resolveReferrer('YOKBOYLE')).toBeNull();
  });
});

describe('getiren bağı', () => {
  it('yeni müşteriyi getirene bağlar', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    expect(await linkReferrer(getirilenId, kod!)).toBe(true);
    expect((await profiles.getById(getirilenId))?.referredBy).toBe(getirenId);
  });

  it('kişi KENDİNİ getiremez', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    expect(await linkReferrer(getirenId, kod!)).toBe(false);
    expect((await profiles.getById(getirenId))?.referredBy).toBeNull();
  });

  it('İLK getiren kazanır — sonraki kod kazanılmış bağı çalamaz', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    await linkReferrer(getirilenId, kod!);

    const yabanciKod = await getOrCreateReferralCode(yabanciId);
    expect(await linkReferrer(getirilenId, yabanciKod!)).toBe(false);
    expect((await profiles.getById(getirilenId))?.referredBy).toBe(getirenId);
  });
});

describe('kapanan siparişin iki ödülü', () => {
  it('teslim edilen sipariş müşteriye SİPARİŞ puanı yazar', async () => {
    const orderId = await siparisAc(getirilenId);
    const sonuc = await transitionOrder({ orderId, to: 'delivered' });
    expect(sonuc.status).toBe('ok');

    const gecmis = await listPointsHistory(getirilenId);
    expect(gecmis.rows.some((e) => e.reason === 'order' && e.refId === orderId)).toBe(true);
  });

  it('aynı sipariş İKİ KEZ puan ödemez — teslim sonrası kapanış da tetikler', async () => {
    const orderId = await siparisAc(getirilenId);
    await transitionOrder({ orderId, to: 'delivered' });
    const oncesi = (await getPointsBalance(getirilenId)).balance;

    // `delivered → completed` de ödülü çağırır; güvence defterin tekillik indeksinde.
    await rewardCompletedOrder(orderId);
    expect((await getPointsBalance(getirilenId)).balance).toBe(oncesi);
  });

  it('GETİREN, getirdiği kişinin ilk siparişinde kazanır — kayıtta değil', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    await linkReferrer(getirilenId, kod!);
    // Bağ kuruldu ama henüz sipariş yok: sahte kayıtla puan basılamasın diye ödül burada DOĞMAZ.
    expect((await getPointsBalance(getirenId)).balance).toBe(0);

    const orderId = await siparisAc(getirilenId);
    await transitionOrder({ orderId, to: 'delivered' });

    const gecmis = await listPointsHistory(getirenId);
    expect(gecmis.rows.some((e) => e.reason === 'referral' && e.refId === getirilenId)).toBe(true);
  });

  it('getirenin ödülü İKİNCİ siparişte tekrarlanmaz', async () => {
    const kod = await getOrCreateReferralCode(getirenId);
    await linkReferrer(getirilenId, kod!);

    await transitionOrder({ orderId: await siparisAc(getirilenId), to: 'delivered' });
    const ilkBakiye = (await getPointsBalance(getirenId)).balance;
    expect(ilkBakiye).toBeGreaterThan(0);

    await transitionOrder({ orderId: await siparisAc(getirilenId), to: 'delivered' });
    // "İlk sipariş mi" kontrolü KODDA yok; kuralı defterin tekillik indeksi taşıyor.
    expect((await getPointsBalance(getirenId)).balance).toBe(ilkBakiye);
  });

  it('getireni olmayan müşterinin siparişi yalnız SİPARİŞ puanı doğurur', async () => {
    const orderId = await siparisAc(yabanciId);
    await transitionOrder({ orderId, to: 'delivered' });
    const gecmis = await listPointsHistory(yabanciId);
    expect(gecmis.rows.every((e) => e.reason !== 'referral')).toBe(true);
    expect(gecmis.rows.some((e) => e.reason === 'order')).toBe(true);
  });
});
