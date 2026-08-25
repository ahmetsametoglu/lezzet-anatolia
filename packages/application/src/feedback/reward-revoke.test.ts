import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, NeighborInviteService, OrderService, PointsBalanceService,
  PointsEntryService, ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { recordOrderPayment, recordOrderRefund } from '../order/payment';
import { adjustFulfillment, cancelOrder } from '../order/refund';
import { advanceOrder, prepareOrderToReady } from '../order/advance.testkit';

/**
 * **DAVET ÖDÜLÜNÜN ÖMRÜ — para geri giderse ödül ne olur** (17.11 · kullanıcı kararları 25.08).
 *
 * ── NEDEN BU DOSYA VAR ──────────────────────────────────────────────────────
 * Kural paraya dokunuyor ve **hiç testi yoktu**: `revokeReferralOnUnpaidOrder` ile `revokePoints`
 * 17.08'de yazıldı, 25.08'de kullanıcı kararıyla DEĞİŞTİ ve iki tarihte de hiçbir iddia onları
 * çivilemedi. Ölçüm elle yapıldı, sonuçları `17.11`in Durum notunda; burası o ölçümün kalıcı hâli.
 *
 * ── ÇİVİLENEN İKİ KARAR ─────────────────────────────────────────────────────
 * **1 · Kısmî iade ödüle DOKUNMAZ** (*"kısmî aslında kısmî sipariş de demektir"*). Bu, 17.08'in
 * *"kısmi iade de kapsanır"* kararını yürürlükten kaldırdı. Ölçülen sebep: 30 €'luk siparişte 1 €
 * iade, getirenin 500 puanını siliyordu ve geri dönüşü yoktu.
 * **2 · Geri alma bakiyeyle KIRPILIR**, bakiye eksiye düşmez; kalan af edilir.
 *
 * ── SINANAN ŞEY MOTOR DEĞİL, KAPININ KARARI ─────────────────────────────────
 * `derivePaymentStatus`ün kendi testleri var. Buradaki iddia bir katman üstte: **hangi ödeme
 * durumunda ödüle dokunulur.** Ayrım önemli çünkü kural iki dosyaya yayılmış — koşul
 * `order/payment.ts`te (`finalize`), kırpma `feedback/points.ts`te (`revokePoints`).
 *
 * §4b: her satır damgalı, sayımlar KENDİ kurduğu müşterinin defteri üzerinden (küresel sayaç yok),
 * teardown `purgeTestData`.
 */
const db = serviceDb();
const orders = new OrderService(db);
const entries = new PointsEntryService(db);

const stamp = Date.now();
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let accountId: string;
const createdProfiles: string[] = [];
const createdInvites: string[] = [];

/** Getiren ödülü — `POINTS_DEFAULTS.referral`. Sayı fikstüre değil AYARA ait, o yüzden okunmuyor:
    testin iddiası "ne kadar" değil, "duruyor mu / gitti mi". Sabit yazmak, ayar değişince testi
    yalancı kırmızıya çevirirdi. */
let referralPoints: number;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Ödül geri alma ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Ödüllü ürün ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  accountId = (await new AccountService(db).insert({ name: `Ödül kasası ${stamp}`, type: 'cash' })).id;
});

afterAll(async () => {
  // Davet AYRICA siliniyor: `purgeTestData` onu tanımıyor ve `neighbor_invite.inviter_id` profili
  // tutuyor — kalırsa profil silinemez ve teardown SESSİZCE yarım kalırdı (`cleanup.ts` künyesi).
  for (const id of createdInvites) await db.from('neighbor_invite').delete().eq('id', id);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [accountId],
    warehouseIds: [warehouseId],
  });
});

/** Damgalı profil; `referredBy` verilirse getiren bağı kurulur (ödülün ön şartı). */
async function makeProfile(label: string, referredBy?: string): Promise<string> {
  const profile = await new UserProfileService(db).insert({
    name: `${label} ${stamp}`,
    ...(referredBy ? { referredBy } : {}),
  });
  createdProfiles.push(profile.id);
  return profile.id;
}

/** Getiren + getirilen ikilisi — her testin KENDİ çifti (paylaşılan defter yarışa girmesin). */
async function referralPair(label: string): Promise<{ inviter: string; customer: string }> {
  const inviter = await makeProfile(`${label} getiren`);
  return { inviter, customer: await makeProfile(`${label} getirilen`, inviter) };
}

const balanceOf = async (customerId: string): Promise<number> =>
  (await new PointsBalanceService(db).getByCustomer(customerId))?.balance ?? 0;

/** Yalnız BU müşterinin defteri — küresel sayıya bakılmaz (§4b). */
async function ledgerOf(customerId: string): Promise<readonly { points: number; reason: string }[]> {
  const { rows } = await entries.listByCustomer(customerId, undefined, 50);
  return rows.map((row) => ({ points: row.points, reason: row.reason }));
}

const paymentStatusOf = async (orderId: string) => (await orders.getById(orderId))?.paymentStatus;

/**
 * Sipariş kurar ve yola çıkarır. **Parti her çağrıda YENİ:** testler aynı varyantı paylaşıyor ve
 * ortak bir partiden düşseler, biri ötekinin stoğunu tüketip rastgele kırmızıya döndürürdü.
 */
async function sentOrder(customerId: string, qty: number, unitPriceCents = 1000) {
  const stockId = (await new StockService(db).insert({
    warehouseId, variantId, physicalQty: qty + 5, expiryDate: day(30), purchasePriceCents: 400,
  })).id;
  const prepared = await prepareOrderToReady(db, { warehouseId, customerId, variantId, stockId, qty, unitPriceCents });
  await advanceOrder(db, prepared.orderId, ['out_for_delivery']);
  return prepared;
}

/** Ödenmiş sipariş + yazılmış getiren ödülü — çoğu testin başlangıç noktası. */
async function paidOrderWithReward(label: string, qty: number) {
  const pair = await referralPair(label);
  const order = await sentOrder(pair.customer, qty);
  await recordOrderPayment(db, { orderId: order.orderId, accountId, amountCents: qty * 1000 });
  return { ...pair, ...order, totalCents: qty * 1000 };
}

describe('ödül yazımı — para alındığında', () => {
  it('tam ödeme getirenin ödülünü YAZAR (ötekilerin ön şartı)', async () => {
    const senaryo = await paidOrderWithReward('yazım', 3);

    referralPoints = await balanceOf(senaryo.inviter);
    expect(referralPoints).toBeGreaterThan(0);
    expect(await paymentStatusOf(senaryo.orderId)).toBe('paid');
    expect(await ledgerOf(senaryo.inviter)).toEqual([{ points: referralPoints, reason: 'referral' }]);
  });
});

describe('KISMÎ iade ödüle dokunmaz (kullanıcı kararı 25.08)', () => {
  it('30 € siparişte 10 € iade → ödül DURUR, durum `partial` olur', async () => {
    const senaryo = await paidOrderWithReward('kısmî', 3);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: 1000 });

    expect(await paymentStatusOf(senaryo.orderId)).toBe('partial');
    expect(await balanceOf(senaryo.inviter)).toBe(referralPoints);
  });

  it('YALNIZ 1 € iade de ödülü götürmez — eski kural 500 puanı siliyordu', async () => {
    const senaryo = await paidOrderWithReward('kuruş', 3);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: 100 });

    expect(await balanceOf(senaryo.inviter)).toBe(referralPoints);
  });

  it('JEST İADESİ ödülü götürmez — mal müşteride KALIR, yalnız gönül alınır', async () => {
    // Operasyonun gerçek düğmesi (`adjustFulfillmentAction`, `refundAmountCents` dolu): adet
    // düşmez, tutarı operatör söyler. Eski kural burada da 500 puanı siliyordu.
    const senaryo = await paidOrderWithReward('jest', 3);

    const outcome = await adjustFulfillment(
      db,
      senaryo.orderId,
      [{ orderItemId: senaryo.itemId, fulfilledQty: 3 }],
      { refundAccountId: accountId, refundAmountCents: 500 },
    );

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(await balanceOf(senaryo.inviter)).toBe(referralPoints);
  });

  it('KISMÎ KARŞILAMA ödülü götürmez ve durum `paid` KALIR', async () => {
    // Burada beklenen tutar da düşüyor (depo 3 yerine 2 gönderdi), yani elde tutulan para hâlâ
    // borcu karşılıyor. Bu hâl 25.08 kararından ÖNCE de doğru çalışıyordu; kararın yanlışlıkla
    // bozmadığını çivilemek için duruyor.
    const senaryo = await paidOrderWithReward('eksik-gönderim', 3);

    await adjustFulfillment(db, senaryo.orderId, [{ orderItemId: senaryo.itemId, fulfilledQty: 2 }]);

    expect(await paymentStatusOf(senaryo.orderId)).toBe('paid');
    expect(await balanceOf(senaryo.inviter)).toBe(referralPoints);
  });
});

describe('TAM iade ödülü geri alır', () => {
  it('paranın tamamı dönünce ödül SIFIRLANIR ve defterde ters satır durur', async () => {
    const senaryo = await paidOrderWithReward('tam-iade', 3);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: senaryo.totalCents });

    expect(await paymentStatusOf(senaryo.orderId)).toBe('refunded');
    expect(await balanceOf(senaryo.inviter)).toBe(0);
    // Satır SİLİNMEZ, karşı kayıt yazılır (17.4): "neden puanım eksildi" defterden okunabilmeli.
    expect(await ledgerOf(senaryo.inviter)).toEqual([
      { points: -referralPoints, reason: 'referral' },
      { points: referralPoints, reason: 'referral' },
    ]);
  });

  it('KISMÎ iade sonra TAMAMLANIRSA ödül o an gider — kısmî hâl yalnız ERTELEr', async () => {
    const senaryo = await paidOrderWithReward('tamamlanan', 3);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: 1000 });
    expect(await balanceOf(senaryo.inviter)).toBe(referralPoints);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: 2000 });
    expect(await paymentStatusOf(senaryo.orderId)).toBe('refunded');
    expect(await balanceOf(senaryo.inviter)).toBe(0);
  });

  it('ödenmiş siparişin İPTALİ de ödülü geri alır (operasyon yolu)', async () => {
    const pair = await referralPair('iptal');
    const stockId = (await new StockService(db).insert({
      warehouseId, variantId, physicalQty: 10, expiryDate: day(30), purchasePriceCents: 400,
    })).id;
    // İptal `out_for_delivery`den izinli DEĞİL — sipariş `ready`de bırakılıyor.
    const order = await prepareOrderToReady(db, { warehouseId, customerId: pair.customer, variantId, stockId, qty: 2, unitPriceCents: 1000 });
    await recordOrderPayment(db, { orderId: order.orderId, accountId, amountCents: 2000 });
    expect(await balanceOf(pair.inviter)).toBe(referralPoints);

    await cancelOrder(db, order.orderId, { actorId: null, reason: 'staff' });

    expect(await paymentStatusOf(order.orderId)).toBe('refunded');
    expect(await balanceOf(pair.inviter)).toBe(0);
  });

  it('yeniden ödenirse ödül GERİ GELMEZ — bilinçli sınır (tekillik indeksi)', async () => {
    // Tersi, aynı siparişi iade/ödeme arasında gidip gelerek puan üretmeye kapı açardı.
    const senaryo = await paidOrderWithReward('yeniden-ödeme', 3);
    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: senaryo.totalCents });
    expect(await balanceOf(senaryo.inviter)).toBe(0);

    await recordOrderPayment(db, { orderId: senaryo.orderId, accountId, amountCents: senaryo.totalCents });

    expect(await paymentStatusOf(senaryo.orderId)).toBe('paid');
    expect(await balanceOf(senaryo.inviter)).toBe(0);
  });
});

describe('geri alma BAKİYEYLE kırpılır (kullanıcı kararı 25.08)', () => {
  it('puanın bir kısmı harcanmışsa yalnız ELDE OLAN geri alınır, bakiye eksiye düşmez', async () => {
    const senaryo = await paidOrderWithReward('kırpma', 3);
    const harcanan = Math.floor(referralPoints * 0.6);
    await entries.insert({ customerId: senaryo.inviter, points: -harcanan, reason: 'redemption', refId: null });
    const kalan = referralPoints - harcanan;
    expect(await balanceOf(senaryo.inviter)).toBe(kalan);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: senaryo.totalCents });

    expect(await balanceOf(senaryo.inviter)).toBe(0);
    // Yazılan satır GERÇEKTEN geri alınan tutardır: tam ödül değil, elde kalan. Fark af edilir —
    // müşteri sonradan puan kazanırsa o puan kendisinindir, gizli bir borca gitmez.
    expect(await ledgerOf(senaryo.inviter)).toContainEqual({ points: -kalan, reason: 'referral' });
    expect(await ledgerOf(senaryo.inviter)).not.toContainEqual({ points: -referralPoints, reason: 'referral' });
  });

  it('bakiye SIFIRKEN hiç satır yazılmaz — "0 puan geri alındı" defterde anlamsızdır', async () => {
    const senaryo = await paidOrderWithReward('sıfır-bakiye', 3);
    await entries.insert({ customerId: senaryo.inviter, points: -referralPoints, reason: 'redemption', refId: null });
    expect(await balanceOf(senaryo.inviter)).toBe(0);

    await recordOrderRefund(db, { orderId: senaryo.orderId, accountId, amountCents: senaryo.totalCents });

    expect(await balanceOf(senaryo.inviter)).toBe(0);
    // İki satır: ödül + çevirme. Negatif bir `referral` satırı OLMAMALI.
    expect(await ledgerOf(senaryo.inviter)).toEqual([
      { points: -referralPoints, reason: 'redemption' },
      { points: referralPoints, reason: 'referral' },
    ]);
  });
});

describe('getiren ödülünün ölçütü KİŞİDİR, sipariş değil', () => {
  it('müşterinin BAŞKA ödenmiş siparişi kaldıysa ödül korunur', async () => {
    // Ödül *"bu kişi gerçekten müşterimiz oldu"* olgusunu ödüllendiriyor. İkinci siparişin iadesi,
    // ilk siparişte hak edilmiş ödülü götürmemeli.
    const pair = await referralPair('iki-sipariş');
    const ilk = await sentOrder(pair.customer, 2);
    await recordOrderPayment(db, { orderId: ilk.orderId, accountId, amountCents: 2000 });
    const ikinci = await sentOrder(pair.customer, 2);
    await recordOrderPayment(db, { orderId: ikinci.orderId, accountId, amountCents: 2000 });
    expect(await balanceOf(pair.inviter)).toBe(referralPoints);

    await recordOrderRefund(db, { orderId: ikinci.orderId, accountId, amountCents: 2000 });

    expect(await paymentStatusOf(ikinci.orderId)).toBe('refunded');
    expect(await balanceOf(pair.inviter)).toBe(referralPoints);
  });
});

describe('KOMŞU ödülü aynı kurala tabidir', () => {
  it('kısmî iade komşu ödülünü KORUR, tam iade GERİ ALIR', async () => {
    const inviter = await makeProfile('komşu davet eden');
    const guest = await makeProfile('komşu davetli');
    const zoneId = (await db.from('delivery_zone').select('id').limit(1)).data?.[0]?.id as string;
    // Davetin kaynağı davet edenin KENDİ siparişidir (`neighbor_invite.order_id` zorunlu).
    const source = await sentOrder(inviter, 1);
    const invite = await new NeighborInviteService(db).insert({
      token: `rev${stamp}`.slice(0, 16),
      inviterId: inviter,
      orderId: source.orderId,
      deliveryZoneId: zoneId,
      deliveryDate: day(3),
      maxUses: 3,
    });
    createdInvites.push(invite.id);

    const guestOrder = await sentOrder(guest, 3);
    await orders.update({ id: guestOrder.orderId, neighborInviteId: invite.id });
    await recordOrderPayment(db, { orderId: guestOrder.orderId, accountId, amountCents: 3000 });
    const neighborPoints = await balanceOf(inviter);
    expect(neighborPoints).toBeGreaterThan(0);

    await recordOrderRefund(db, { orderId: guestOrder.orderId, accountId, amountCents: 500 });
    expect(await balanceOf(inviter)).toBe(neighborPoints);

    await recordOrderRefund(db, { orderId: guestOrder.orderId, accountId, amountCents: 2500 });
    expect(await paymentStatusOf(guestOrder.orderId)).toBe('refunded');
    expect(await balanceOf(inviter)).toBe(0);
  });
});
