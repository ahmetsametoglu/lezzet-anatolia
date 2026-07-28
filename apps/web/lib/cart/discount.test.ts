import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, DiscountService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { DiscountableLine } from '@lezzet/domain-core';
import { resolveCartDiscount, type CartDiscountInput } from './discount';

/**
 * Sepette indirim çözümü (09.6 müşteri tarafı) — "motor hazır, kablo yok" maddesinin kapanışı.
 *
 * Sınanan şey ekranın dört ret hâli: **süresi dolmuş · geçersiz · asgari sepet · otomatik indirim
 * daha büyük**. Ayrıca kupon kaybettiğinde müşterinin kazanan indirimi kaybetmediği.
 */
const db = serviceDb();
const discounts = new DiscountService(db);

const stamp = Date.now();
let customerId: string;
let categoryId: string;
let otherCategoryId: string;
let productId: string;
const createdProfiles: string[] = [];
const createdDiscounts: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** 100 €'luk sepet — tek kalem, indirime tam açık. */
const basket: DiscountableLine[] = [{ variantId: 'v1', qty: 2, unitPriceCents: 5_000 }];

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kupon testi ${stamp}` } });
  const other = await new CategoryService(db).create({ name: { tr: `Diğer ${stamp}` } });
  categoryId = category.id;
  otherCategoryId = other.id;
  const { product } = await new ProductService(db).create({
    name: { tr: `Kupon ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;

  const customer = await new UserProfileService(db).insert({ name: 'Claire Bernard', email: `kupon-${stamp}@example.test` });
  customerId = customer.id;
  createdProfiles.push(customer.id);
});

beforeEach(async () => {
  for (const id of createdDiscounts.splice(0)) await db.from('discount').delete().eq('id', id);
  await new UserProfileService(db).update({ id: customerId, discountPercent: null });
});

afterAll(async () => {
  for (const id of createdDiscounts) await db.from('discount').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId, otherCategoryId], profileIds: createdProfiles });
});

async function makeDiscount(input: Parameters<DiscountService['insert']>[0]) {
  const row = await discounts.insert(input);
  createdDiscounts.push(row.id);
  return row;
}

/**
 * Kupon: varsayılan **%90**, koşulsuz, aktif.
 *
 * Yüksek oran bilinçli. Yerel veritabanı bu testin kurduğu satırlardan ibaret değil — operasyon
 * ekranından elle girilmiş aktif bir kampanya olabilir ve tek-en-büyük kuralı gereği kuponu
 * yenebilir. Test o veriyi silemez (kullanıcının); onun yerine kuponu **baskın** yapıyoruz:
 * ölçülen şey kuponun uygulanıp uygulanmadığı, ortamda başka kural olup olmadığı değil.
 */
function coupon(code: string, overrides: Record<string, unknown> = {}) {
  return makeDiscount({
    name: `Kupon ${code}`,
    trigger: 'coupon',
    code,
    type: 'percent',
    value: 90,
    scope: 'cart',
    ...overrides,
  });
}

describe('kupon uygulanır', () => {
  it('geçerli kupon sepete iner ve payı kalemlere dağıtılır', async () => {
    await coupon(`YAZ${stamp}`);
    // Ekranın göndereceği şekil: sepet satırları + kim + hangi kod.
    const input: CartDiscountInput = { lines: basket, customerId, couponCode: `YAZ${stamp}` };

    const result = await resolveCartDiscount(db, input);

    expect(result).toMatchObject({ status: 'applied', amountCents: 9_000 }); // 100 €'nun %90'ı
    expect(result.status === 'applied' ? result.lineShares : []).toEqual([9_000]);
  });

  it('kod HARF AYRIMSIZ eşleşir — müşteri küçük harfle yazabilir', async () => {
    await coupon(`BAHAR${stamp}`);

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `bahar${stamp}  ` });

    expect(result.status).toBe('applied');
  });

  it('sabit tutarlı kupon EURO saklanır, KURUŞ uygulanır', async () => {
    // Kuruşlu bir değer bilerek: çeviri yuvarlarsa 7550 yerine 7500 çıkar ve test görür.
    await coupon(`SABIT${stamp}`, { type: 'fixed', value: 75.5 });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `SABIT${stamp}` });

    expect(result).toMatchObject({ status: 'applied', amountCents: 7_550 });
  });
});

describe('ekranın dört ret hâli', () => {
  it('geçersiz: böyle bir kod yok', async () => {
    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: 'YOKBOYLE' });

    expect(result).toMatchObject({ status: 'rejected', reason: 'unknown_code' });
  });

  it('süresi dolmuş', async () => {
    await coupon(`ESKI${stamp}`, { validTo: dayOffset(-1) });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `ESKI${stamp}` });

    expect(result).toMatchObject({ status: 'rejected', reason: 'expired' });
  });

  it('asgari sepet tutmuyor — müşteri ürün ekleyerek kullanabilir, bu yüzden sebep AYRI', async () => {
    await coupon(`BUYUK${stamp}`, { minBasket: 150 });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `BUYUK${stamp}` });

    expect(result).toMatchObject({ status: 'rejected', reason: 'min_basket' });
  });

  it('otomatik indirim daha büyük: kupon reddedilir ama KAZANAN uygulanır', async () => {
    await coupon(`KUCUK${stamp}`, { value: 5 });
    await makeDiscount({ name: `Kampanya ${stamp}`, trigger: 'automatic', type: 'percent', value: 95, scope: 'cart' });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `KUCUK${stamp}` });

    // Müşteri hem sebebi görür hem 95 €'yu kaybetmez.
    expect(result).toMatchObject({ status: 'rejected', reason: 'outranked', appliedInsteadCents: 9_500 });
  });
});

describe('kişisellik ve sınırlar', () => {
  it('başkasının kişisel kuponu VAR OLMAYAN gibi görünür — kodun varlığı sızmaz', async () => {
    const other = await new UserProfileService(db).insert({ name: 'Başkası', email: `baska-${stamp}@example.test` });
    createdProfiles.push(other.id);
    await coupon(`OZEL${stamp}`, { customerId: other.id });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `OZEL${stamp}` });

    // `not_yours` DIŞARI çıkmaz: "bu kupon var ama senin değil" demek kodu doğrulamak olurdu.
    expect(result).toMatchObject({ status: 'rejected', reason: 'unknown_code' });
  });

  it('pasife alınmış kupon uygulanmaz', async () => {
    await coupon(`KAPALI${stamp}`, { isActive: false });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `KAPALI${stamp}` });

    expect(result).toMatchObject({ status: 'rejected', reason: 'inactive' });
  });

  it('kullanım tavanı dolmuş kupon reddedilir — sayaçtan değil KAYITTAN', async () => {
    const rule = await coupon(`TEK${stamp}`, { maxUses: 1 });
    await db.from('discount_use').insert({ discount_id: rule.id, customer_id: customerId, amount: 10 });

    const result = await resolveCartDiscount(db, { lines: basket, customerId, couponCode: `TEK${stamp}` });

    expect(result).toMatchObject({ status: 'rejected', reason: 'used_up' });
  });
});

describe('kupon girilmeden', () => {
  it('otomatik kampanya kendiliğinden iner', async () => {
    await makeDiscount({ name: `Oto ${stamp}`, trigger: 'automatic', type: 'percent', value: 85, scope: 'cart' });

    const result = await resolveCartDiscount(db, { lines: basket, customerId });

    expect(result).toMatchObject({ status: 'automatic', amountCents: 8_500 });
  });

  it('müşterinin genel oranı da bir adaydır, fiyat değil', async () => {
    await new UserProfileService(db).update({ id: customerId, discountPercent: 88 });

    const result = await resolveCartDiscount(db, { lines: basket, customerId });

    // `discountId: null` → kazanan bir `Discount` satırı değil, müşterinin kendi oranı.
    expect(result).toMatchObject({ status: 'automatic', amountCents: 8_800, discountId: null });
  });

  it('kod girilmediğinde KUPON kaynaklı indirim doğmaz', async () => {
    await coupon(`GIRILMEDI${stamp}`);

    const result = await resolveCartDiscount(db, { lines: basket, customerId });

    // Kupon havuzda ama kodu girilmedi: kazanamaz. ("Hiç aday yoksa `none`" hâli motorun birim
    // testinde — yerel veritabanında elle girilmiş kampanya olabileceği için burada ölçülemez.)
    expect(result.status).not.toBe('applied');
  });
});

describe('matrah muafiyetleri sepette de geçerli', () => {
  it('paket ve teklif satırı matrahı BÜYÜTMEZ, payı da 0 olur', async () => {
    await makeDiscount({ name: `Oto2 ${stamp}`, trigger: 'automatic', type: 'percent', value: 90, scope: 'cart' });
    const mixed: DiscountableLine[] = [
      { variantId: 'v1', qty: 1, unitPriceCents: 4_000 },
      { variantId: '', qty: 1, unitPriceCents: 3_000, bundleId: 'b1' },
      { variantId: 'v2', qty: 1, unitPriceCents: 3_000, offerStockId: 's1' },
    ];

    const result = await resolveCartDiscount(db, { lines: mixed, customerId });

    // Matrah yalnız 40 € — paket ve teklif kendi özel fiyatındadır (DOMAIN §5/§13).
    expect(result).toMatchObject({ status: 'automatic', amountCents: 3_600 });
    expect(result.status === 'automatic' ? result.lineShares : []).toEqual([3_600, 0, 0]);
  });

  it('asgari sepet ölçütü de MUAF kalemleri saymaz', async () => {
    await coupon(`ESIK${stamp}`, { minBasket: 60 });
    const mixed: DiscountableLine[] = [
      { variantId: 'v1', qty: 1, unitPriceCents: 4_000 },
      { variantId: '', qty: 1, unitPriceCents: 5_000, bundleId: 'b1' }, // 50 € paket
    ];

    const result = await resolveCartDiscount(db, { lines: mixed, customerId, couponCode: `ESIK${stamp}` });

    // Ekranda 90 € görünse de indirim matrahı 40 €: eşik tutmuyor. Motorun matrahıyla teşhisin
    // matrahı AYNI yüklemi kullanmalı, yoksa "geçerli" diyen uyarı indirimsiz sepetle biterdi.
    expect(result).toMatchObject({ status: 'rejected', reason: 'min_basket' });
  });
});
