import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountService, CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { ensureCustomerReferralCode, linkReferrer, resolveReferrer } from '@lezzet/application';
import { getPointsBalance, listPointsHistory } from './points';
import { recordOrderPayment } from '../money/order-payment';
import { deliverOrder } from '../order/fulfillment';

/**
 * Davet zinciri ve getirenin ödülü (17.4 · 17.7 · 17.9).
 *
 * Zemin 29.07'den beri hazırdı ama iki uç bağlanmamıştı: `referred_by` kolonunu hiçbir kod
 * yazmıyordu ve `reason='order'` yalnız testte geçiyordu — yani müşteri sipariş verdiği için hiç
 * puan kazanmıyor, getiren de hiç kazanmıyordu. Bu dosya o iki ucun gerçekten bağlandığını
 * sınıyor; kuralları değil, KABLOYU.
 *
 * **Kapılar artık `@lezzet/application`ta** (17.9): web'in `lib/feedback/referral.ts` kopyası
 * SİLİNDİ — davet bağını kuran çağrı OTP akışının içine girdi ve o akışı iki yüzey çağırıyor.
 * Test web'de KALIYOR ve bu bilinçli: sınadığı şey kural değil, kablonun ta ödeme defterine kadar
 * bağlı olduğu — ve o zincirin web ucu (`lib/money/order-payment`, `lib/order/transition`) burada.
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
/** Tahsilatın yazıldığı kasa — ödül artık paranın defterde görünmesine bağlı. */
let kasaId: string;

/** Teslim edilmeye hazır bir sipariş kurar. Ödülün tetikleyicisi ARTIK ÖDEME (`odemeAl`). */
async function siparisAc(customerId: string): Promise<string> {
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'out_for_delivery', orderedTotalCents: 1500 },
    [{ variantId, qty: 1, unitPriceCents: 1500, vatRate: 5.5 }],
  );
  createdOrders.push(order.id);
  return order.id;
}

/**
 * Siparişin parasını defterde göster — ödül bu anda doğar.
 *
 * Tutar siparişin tamamı: kısmi tahsilat `paid` yapmaz ve testin konusu ödülün ANI, kısmi ödeme
 * kuralı değil (o `money/order-payment.test.ts`in işi).
 */
async function odemeAl(orderId: string): Promise<void> {
  const sonuc = await recordOrderPayment({ orderId, accountId: kasaId, amountCents: 1500, description: 'Davet testi tahsilatı' });
  expect(sonuc.status).toBe('ok');
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

  kasaId = (await new AccountService(db).insert({ name: `Davet testi kasası ${stamp}`, type: 'cash' })).id;
  getirenId = (await profiles.insert({ name: 'Getiren Ayşe', email: `ref-a-${stamp}@example.test`, type: 'individual' })).id;
  getirilenId = (await profiles.insert({ name: 'Gelen Mehmet', email: `ref-b-${stamp}@example.test`, type: 'individual' })).id;
  yabanciId = (await profiles.insert({ name: 'Yabancı', email: `ref-c-${stamp}@example.test`, type: 'individual' })).id;
  createdProfiles.push(getirenId, getirilenId, yabanciId);
});

beforeEach(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  // Tahsilatlar da sıfırlanır: her senaryo kendi ödeme anını kuruyor, önceki testin hareketi
  // bakiyeyi taşırsa "ödeme olmadan puan yok" sınaması yalancı yeşil dönerdi.
  await db.from('money_movement').delete().eq('account_id', kasaId);

  /* SİPARİŞLER DE SIFIRLANIR (17.08) — eskiden yalnız `afterAll`da siliniyorlardı ve bu, senaryolar
     arasında sessiz bir bağımlılık üretiyordu: davet bağı **zaten müşteri olmayana** kurulur
     (`linkReferrerById` → `already_customer`, künyesi ★ karar 2f'ye dayanıyor) ve önceki testten
     kalan sipariş, sonraki testin kurmaya çalıştığı bağı reddettiriyordu. Kural bu dosyada
     görünmüyordu çünkü `linkReferrer` doğrudan çağrılıyor; gerçek akışta kapı hep
     `attachReferralOnLogin` ve kontrol orada ilk günden beri var.
     Para hareketi siparişten ÖNCE silinir (`money_movement.order_id` FK'si siparişi tutuyor) —
     `afterAll`daki aynı sıra. */
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  createdOrders.length = 0;

  await profiles.update({ id: getirilenId, referredBy: null });
});

afterAll(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  // Para hareketi siparişten ÖNCE silinir: `money_movement.order_id` FK'si siparişi tutuyor.
  await db.from('money_movement').delete().eq('account_id', kasaId);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [kasaId],
    warehouseIds: [warehouseId],
  });
});

describe('davet kodu', () => {
  it('istek üzerine üretilir ve AYNI kod ikinci kez döner', async () => {
    // Kod kayıtta değil istekte doğuyor: müşterilerin çoğu hiç davet etmez.
    const ilk = await ensureCustomerReferralCode(db, getirenId);
    expect(ilk).toMatch(/^[A-Z0-9]{8}$/);
    expect(await ensureCustomerReferralCode(db, getirenId)).toBe(ilk);
  });

  it('kod sahibine çözülür; geçersiz kod HATA değil null döner', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    expect(await resolveReferrer(db, kod!)).toBe(getirenId);
    // Bağlantı yanlış kopyalanmış olabilir — kayıt bir dize yüzünden reddedilmez.
    expect(await resolveReferrer(db, 'YOKBOYLE')).toBeNull();
  });
});

describe('getiren bağı', () => {
  it('yeni müşteriyi getirene bağlar', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    expect(await linkReferrer(db, getirilenId, kod!)).toBe('linked');
    expect((await profiles.getById(getirilenId))?.referredBy).toBe(getirenId);
  });

  it('kişi KENDİNİ getiremez', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    expect(await linkReferrer(db, getirenId, kod!)).toBe('self');
    expect((await profiles.getById(getirenId))?.referredBy).toBeNull();
  });

  it('İLK getiren kazanır — sonraki kod kazanılmış bağı çalamaz', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    await linkReferrer(db, getirilenId, kod!);

    const yabanciKod = await ensureCustomerReferralCode(db, yabanciId);
    expect(await linkReferrer(db, getirilenId, yabanciKod!)).toBe('already_referred');
    expect((await profiles.getById(getirilenId))?.referredBy).toBe(getirenId);
  });
});

/**
 * ── ÖDÜLÜN ANI DEĞİŞTİ: TESLİMAT → ÖDEME (17.9) ────────────────────────────
 * Bu blok bir tur "kapanan siparişin İKİ ödülü"ydü ve teslimatı tetik sayıyordu. İki kullanıcı
 * kararı ikisini de değiştirdi (11.08): **sipariş puanı kaldırıldı** (artık `reason='order'`
 * yazılmıyor) ve **getirenin ödülü paranın alındığı ana** bağlandı. Testler o yüzden yeniden
 * yazıldı — kural değişince onu koruyan sınamanın da değişmesi gerekir; eskisini bırakmak
 * "geçmiş davranışı" ölçmek olurdu.
 *
 * Tetik artık `recordOrderPayment`: ödeme durumu `paid`e dönünce ödül `order/payment.ts`in
 * `finalize`ında doğuyor. Testin kablosu da bu yüzden para tarafından geçiyor.
 */
describe('getirenin ödülü — para alındığında', () => {
  it('SİPARİŞ PUANI ARTIK YOK: teslimat da ödeme de `order` satırı doğurmaz', async () => {
    const orderId = await siparisAc(getirilenId);
    // Teslim DÜZ DURUM YAZIMINDAN yapılmaz (denetim 26.08): fiili stok düşümü geçişle aynı
    // transaction'da olmalı, o iş `deliver_order`ın içinde. Fikstür de gerçek kapıdan geçer —
    // yoksa test, üretimde hiç oluşmayan bir durumdan ödül kuralını sınardı.
    expect(await deliverOrder(orderId)).toMatchObject({ ok: true });
    await odemeAl(orderId);

    const gecmis = await listPointsHistory(getirilenId);
    expect(gecmis.rows.some((e) => e.reason === 'order')).toBe(false);
  });

  it('TESLİMAT TEK BAŞINA ödül doğurmaz — ölçüt paranın defterde görünmesi', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    await linkReferrer(db, getirilenId, kod!);

    // Sonucu İDDİA EDİLİYOR: teslim gerçekten olmadan "teslimat tek başına ödül doğurmaz" demek,
    // olmayan bir olayın sonucunu ölçmek olurdu (aynı gerekçe yukarıda).
    expect(await deliverOrder(await siparisAc(getirilenId))).toMatchObject({ ok: true });
    // Teslim edildi ama tahsilat yazılmadı: bedava sipariş verip puan üretme kapısı kapalı.
    expect((await getPointsBalance(getirenId)).balance).toBe(0);
  });

  it('GETİREN, getirdiği kişinin siparişinin PARASI ALININCA kazanır — kayıtta değil', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    await linkReferrer(db, getirilenId, kod!);
    // Bağ kuruldu ama henüz sipariş yok: sahte kayıtla puan basılamasın diye ödül burada DOĞMAZ.
    expect((await getPointsBalance(getirenId)).balance).toBe(0);

    await odemeAl(await siparisAc(getirilenId));

    const gecmis = await listPointsHistory(getirenId);
    expect(gecmis.rows.some((e) => e.reason === 'referral' && e.refId === getirilenId)).toBe(true);
  });

  it('getirenin ödülü İKİNCİ siparişte tekrarlanmaz', async () => {
    const kod = await ensureCustomerReferralCode(db, getirenId);
    await linkReferrer(db, getirilenId, kod!);

    await odemeAl(await siparisAc(getirilenId));
    const ilkBakiye = (await getPointsBalance(getirenId)).balance;
    expect(ilkBakiye).toBeGreaterThan(0);

    await odemeAl(await siparisAc(getirilenId));
    // "İlk sipariş mi" kontrolü KODDA yok; kuralı defterin tekillik indeksi taşıyor.
    expect((await getPointsBalance(getirenId)).balance).toBe(ilkBakiye);
  });

  it('getireni olmayan müşterinin ödenen siparişi hiçbir puan doğurmaz', async () => {
    await odemeAl(await siparisAc(yabanciId));
    const gecmis = await listPointsHistory(yabanciId);
    expect(gecmis.rows.length).toBe(0);
  });
});
