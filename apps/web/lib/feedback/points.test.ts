import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, DiscountService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import {
  adjustPointsManually,
  awardPoints,
  awardReferralPoints,
  getPointsBalance,
  listPointsHistory,
  listTopPointsBalances,
  redeemPoints,
} from './points';
import { recordVote, submitReview } from './product-feedback';

/**
 * Puan defteri ve kupona çevirme (17.4, 17.5) — uçtan uca.
 *
 * Sınanan şey üç kural: **bakiye türetilir**, **aynı kaynaktan iki kez puan yok**, **ödül asıl
 * işlemi durdurmaz**. Sonuncusu en kolay bozulan: bir gün biri puan yazımını `await` edip hatayı
 * yukarı fırlatırsa, tavana takılan müşterinin yorumu da kaybolur.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdOrders: string[] = [];
const createdDiscounts: string[] = [];
let b2cId: string;
let b2bId: string;
let staffId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let candidateId: string;
let variantId: string;
let categoryId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const products = new ProductService(db);
  categoryId = (await new CategoryService(db).create({ name: { tr: `Puan testi ${stamp}` } })).id;

  const { product, variants } = await products.create({
    name: { tr: `Puanlı ürün ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const candidate = await products.create({ name: { tr: `Puan adayı ${stamp}` }, categoryId, variants: [{ label: { tr: '250 g' } }] });
  candidateId = candidate.product.id;
  await products.update({ id: candidateId, status: 'candidate' });

  // Çapa damgası ŞART (04.10): puanı harcatmak kapılı üç yetkiden biri ve kapı çapaya bakıyor.
  // Gerçek hayatta çevirebilen müşterinin çapası zaten var — oturumu posta kutusuna gelen kodla
  // açılmıştır; damgasız bir kayıt burada motoru değil, kimlik kapısını sınardı.
  const capa = new Date().toISOString();
  b2cId = (await profiles.insert({ name: 'Ayşe Kaya', email: `puan-b2c-${stamp}@example.test`, type: 'individual', emailAnchoredAt: capa })).id;
  b2bId = (await profiles.insert({ name: 'Restoran SARL', email: `puan-b2b-${stamp}@example.test`, type: 'company', emailAnchoredAt: capa })).id;
  staffId = (await profiles.insert({ name: 'Patron', email: `puan-staff-${stamp}@example.test` })).id;
  createdProfiles.push(b2cId, b2bId, staffId);

  // Her iki müşteri de ürünü almış olmalı — yorum kapısı satın alma istiyor.
  for (const customerId of [b2cId, b2bId]) {
    const { order } = await new OrderService(db).create(
      { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', totalCents: 1200 },
      [{ variantId, qty: 1, unitPriceCents: 1200, vatRate: 5.5 }],
    );
    createdOrders.push(order.id);
  }
});

beforeEach(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  for (const id of [productId, candidateId]) await db.from('product_feedback').delete().eq('product_id', id);
  for (const id of createdDiscounts.splice(0)) await db.from('discount').delete().eq('id', id);
});

afterAll(async () => {
  await db.from('points_entry').delete().in('customer_id', createdProfiles);
  for (const id of [productId, candidateId]) await db.from('product_feedback').delete().eq('product_id', id);
  await db.from('discount').delete().in('customer_id', createdProfiles);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, {
    productIds: [productId, candidateId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

describe('bakiye defterden türetilir', () => {
  it('hiç hareketi olmayan müşterinin bakiyesi sıfırdır — null değil', async () => {
    expect(await getPointsBalance(b2cId)).toMatchObject({ balance: 0, earned: 0, spent: 0 });
  });

  it('kazanım ve harcama ayrı ayrı görünür', async () => {
    await adjustPointsManually({ customerId: b2cId, points: 600, note: 'test zemini', staffId });
    const balance = await getPointsBalance(b2cId);
    expect(balance).toMatchObject({ balance: 600, earned: 600, spent: 0 });
  });

  it('geçmiş yeniden eskiye listelenir', async () => {
    await adjustPointsManually({ customerId: b2cId, points: 50, note: 'ilk', staffId });
    await adjustPointsManually({ customerId: b2cId, points: 30, note: 'ikinci', staffId });
    const history = await listPointsHistory(b2cId);
    expect(history.rows[0]?.note).toBe('ikinci');
  });
});

describe('geri bildirim puanı', () => {
  it('yorum yazan müşteri puan kazanır', async () => {
    await submitReview({ customerId: b2cId, productId, rating: 5, comment: 'Harika.' });
    const balance = await getPointsBalance(b2cId);
    expect(balance.balance).toBe(20); // points_review
  });

  it('metinsiz beğeni daha az puan eder — içerik belirler', async () => {
    await recordVote({ customerId: b2cId, productId, context: 'purchase', vote: 'like' });
    expect((await getPointsBalance(b2cId)).balance).toBe(5); // points_feedback_purchase
  });

  it('keşif kaydırması en ucuz aksiyondur', async () => {
    await recordVote({ customerId: b2cId, productId: candidateId, context: 'candidate', vote: 'like' });
    expect((await getPointsBalance(b2cId)).balance).toBe(2); // points_feedback_candidate
  });

  it('aynı kaynaktan ikinci kez puan verilmez', async () => {
    await recordVote({ customerId: b2cId, productId: candidateId, context: 'candidate', vote: 'like' });
    await recordVote({ customerId: b2cId, productId: candidateId, context: 'candidate', vote: 'dislike' });
    expect((await getPointsBalance(b2cId)).balance).toBe(2);
  });

  it('beğeniden sonra yorum yazmak AYRI bir puan doğurur', async () => {
    await recordVote({ customerId: b2cId, productId, context: 'purchase', vote: 'like' });
    await submitReview({ customerId: b2cId, productId, rating: 5, comment: 'Sonradan yazdım.' });
    // 5 (beğeni) + 20 (yorum) — ikisi ayrı beyan, ayrı sebep.
    expect((await getPointsBalance(b2cId)).balance).toBe(25);
  });

  it('ziyaretçinin kaydırması puan doğurmaz — ödülün sahibi yok', async () => {
    const before = (await listTopPointsBalances(100)).length;
    await recordVote({ productId: candidateId, context: 'candidate', vote: 'like' });
    expect((await listTopPointsBalances(100)).length).toBe(before);
  });

  it('B2B kazanmaz ama yorumu yine de kaydedilir', async () => {
    const result = await submitReview({ customerId: b2bId, productId, rating: 4, comment: 'Correct.' });
    // Asıl işlem tamamlandı...
    expect(result.ok).toBe(true);
    // ...ama puan yazılmadı.
    expect((await getPointsBalance(b2bId)).balance).toBe(0);
  });

  /**
   * ── TAVANIN KAPSAMI DEĞİŞTİ (kullanıcı onayı 11.08) ────────────────────────
   * Bu test bir tur "tavana takılan yorum yazılmaz" diyordu ve o gün doğruydu. Kural değişti:
   * **tavan yalnız PARA ÖDENMEDEN yapılabilen eylemleri kapsar** — yorumun arkasında ödenmiş bir
   * sipariş var, yani tavanı görmüyor. Eski hâlini bırakmak, artık var olmayan bir davranışı
   * ölçmek olurdu.
   *
   * Kapsam kuralının kendisi birim testlerde çivili (`domain-core/feedback/points.test.ts`);
   * burada sınanan şey KABLO: `awardPoints` sebebi motora geçiriyor ve günlük pencereyi yalnız
   * tavana tabi sebeplerle sayıyor mu.
   *
   * **Elle düzeltme de pencereye girmiyor** ve bu bilinçli: `manual` müşterinin bir eylemi değil,
   * personelin düzeltmesidir — müşterinin günlük kazanma sınırını doldurmamalı.
   */
  it('parayla gelen ödül tavanı GÖRMEZ — gün dolu görünse bile yorum puanı yazılır', async () => {
    await adjustPointsManually({ customerId: b2cId, points: 95, note: 'tavan zemini', staffId });
    const result = await submitReview({ customerId: b2cId, productId, rating: 5, comment: 'Sığmayan.' });

    expect(result.ok).toBe(true);
    // 95 (elle) + 20 (yorum): tavan 100 olmasına rağmen ödül tam yazıldı.
    expect((await getPointsBalance(b2cId)).balance).toBe(115);
  });
});

describe('elle düzeltme', () => {
  it('sebep zorunludur', async () => {
    expect(await adjustPointsManually({ customerId: b2cId, points: 50, note: '  ', staffId })).toEqual({
      ok: false,
      reason: 'note_required',
    });
  });

  it('sıfır puanlık hareket yazılamaz', async () => {
    expect(await adjustPointsManually({ customerId: b2cId, points: 0, note: 'jest', staffId })).toEqual({
      ok: false,
      reason: 'zero_points',
    });
  });

  it('iz kaydı kalır: kim, ne kadar, neden', async () => {
    const result = await adjustPointsManually({ customerId: b2cId, points: 50, note: 'Gecikme telafisi — jest', staffId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ points: 50, reason: 'manual', note: 'Gecikme telafisi — jest', createdBy: staffId });
  });

  it('B2B müşteriye de elle puan verilebilir — bu bir kazanım değil karardır', async () => {
    const result = await adjustPointsManually({ customerId: b2bId, points: 100, note: 'özel jest', staffId });
    expect(result.ok).toBe(true);
    expect((await getPointsBalance(b2bId)).balance).toBe(100);
  });
});

describe('kupona çevirme', () => {
  async function giveBalance(customerId: string, points: number) {
    await adjustPointsManually({ customerId, points, note: 'çevirme zemini', staffId });
  }

  it('eşiği geçen bakiye kişisel kupona döner', async () => {
    await giveBalance(b2cId, 600);
    const result = await redeemPoints({ customerId: b2cId });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.discountId) throw new Error('kupon oluşmadı');
    createdDiscounts.push(result.discountId);

    expect(result).toMatchObject({ pointsSpent: 600, valueCents: 600, balanceAfter: 0 });
    // Sipariş referansıyla aynı alfabe: karışabilen harfler (I/1, O/0, S/5, Z/2) yok.
    expect(result.code).toMatch(/^PUAN-[34679ACDEFGHJKLMNPQRTUVWXY]{6}$/);

    // Kupon KİŞİSEL ve tek kullanımlık; değeri sabit tutar (yüzde değil).
    const discount = await new DiscountService(db).getById(result.discountId);
    // 600 puan = 6,00 € → kolon 6 euro tutar, servis 600 cent döndürür (02.9 · STACK §8).
    expect(discount).toMatchObject({ customerId: b2cId, type: 'fixed', amountCents: 600, percent: null, maxUses: 1, perCustomerLimit: 1 });
  });

  it('puan defterden DÜŞER — bakiye yeniden türetilir', async () => {
    await giveBalance(b2cId, 600);
    const result = await redeemPoints({ customerId: b2cId, points: 500 });
    if (result.ok && result.discountId) createdDiscounts.push(result.discountId);

    expect((await getPointsBalance(b2cId)).balance).toBe(100);
  });

  it('eşik altı çevrilemez', async () => {
    await giveBalance(b2cId, 300);
    expect(await redeemPoints({ customerId: b2cId })).toMatchObject({ ok: false, reason: 'below_minimum' });
  });

  it('bakiyeden fazlası çevrilemez', async () => {
    await giveBalance(b2cId, 600);
    expect(await redeemPoints({ customerId: b2cId, points: 900 })).toMatchObject({ ok: false, reason: 'insufficient_balance' });
  });

  it('B2B çeviremez — sebebi müşteriye motor sözlüğüyle sızmaz', async () => {
    await giveBalance(b2bId, 600);
    expect(await redeemPoints({ customerId: b2bId })).toEqual({ ok: false, reason: 'not_eligible' });
  });
});

describe('getiren müşteri (17.7)', () => {
  it('getiren yoksa puan doğmaz', async () => {
    expect(await awardReferralPoints(b2cId)).toBeNull();
  });

  it('getirene bir kez puan yazılır', async () => {
    const invited = await profiles.insert({ name: 'Davetli', email: `davetli-${stamp}@example.test` });
    createdProfiles.push(invited.id);
    await profiles.update({ id: invited.id, referredBy: b2cId });

    expect(await awardReferralPoints(invited.id)).not.toBeNull();
    // Kaynak YENİ müşteridir: "aynı kişiyi iki kez getiremezsin".
    expect(await awardReferralPoints(invited.id)).toBeNull();
    // Değer merdiveni (kullanıcı kararı 11.08): getiren 500 — çevirme eşiğinin tamı, yani hesap
    // ekranının "size de 5 € kupon" sözünü gerçek yapan sayı.
    expect((await getPointsBalance(b2cId)).balance).toBe(500);
  });
});

describe('doğrudan puan yazımı', () => {
  it('bilinmeyen müşteriye puan yazılmaz', async () => {
    expect(await awardPoints({ customerId: '00000000-0000-0000-0000-000000000000', reason: 'order', refId: crypto.randomUUID() })).toBeNull();
  });

  it('sipariş puanı kaynak başına bir kez yazılır', async () => {
    const orderId = createdOrders[0]!;
    expect(await awardPoints({ customerId: b2cId, reason: 'order', refId: orderId })).not.toBeNull();
    expect(await awardPoints({ customerId: b2cId, reason: 'order', refId: orderId })).toBeNull();
    expect((await getPointsBalance(b2cId)).balance).toBe(10);
  });
});
