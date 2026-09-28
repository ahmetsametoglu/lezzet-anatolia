import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductFeedbackService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { claimDiscoverSwipes, recordDiscoverSwipe } from './discover';
import { getPointsBalance } from './points';

/**
 * Ziyaretçi kaydırmasının hesaba bağlanıp puana dönmesi. Kural aynı ürüne bir kez puan: ziyaretçide kimlik olmadığı için her
 * kaydırma yeni satır açar, turu tekrarlayarak puan biriktirme yolu ancak bu kapıda kapanır.
 */
const db = serviceDb();
const feedback = new ProductFeedbackService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
let categoryId: string;
let productA: string;
let productB: string;

/** Kimliksiz kaydırma — ziyaretçinin yaptığı şeyin birebir aynısı. */
async function guestSwipe(productId: string): Promise<string> {
  const result = await recordDiscoverSwipe(db, { productId, vote: 'like', dwellMs: 1500 });
  if (result.status !== 'ok' || result.swipe.id === null) throw new Error(`kaydırma yazılamadı: ${result.status}`);
  return result.swipe.id;
}

async function newCustomer(): Promise<string> {
  const profile = await profiles.insert({
    roles: ['customer'],
    name: `Keşif ${stamp}`,
    email: `kesif-${stamp}-${createdProfiles.length + 1}@example.test`,
  });
  createdProfiles.push(profile.id);
  return profile.id;
}

beforeAll(async () => {
  const products = new ProductService(db);
  categoryId = (await new CategoryService(db).create({ name: { tr: `Keşif testi ${stamp}` } })).id;

  const first = await products.create({ name: { tr: `Aday A ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  const second = await products.create({ name: { tr: `Aday B ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productA = first.product.id;
  productB = second.product.id;
  // Aday olmayan ürüne kaydırma yazılmaz, bu yüzden ikisi de adaya çekilir.
  await products.update({ id: productA, status: 'candidate' });
  await products.update({ id: productB, status: 'candidate' });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productA, productB], categoryIds: [categoryId], profileIds: createdProfiles });
});

describe('keşif turunun hesaba bağlanması', () => {
  it('kimliksiz kaydırmalar hesaba bağlanır ve puana döner', async () => {
    const ids = [await guestSwipe(productA), await guestSwipe(productB)];
    const customerId = await newCustomer();

    const result = await claimDiscoverSwipes(db, customerId, ids);

    expect(result.linked).toBe(2);
    expect(result.points).toBeGreaterThan(0);
    // Sinyalin sahibi belli: satırlar kimliksiz değil.
    const rows = await feedback.listByCustomer(customerId);
    expect(rows.map((r) => r.productId).sort()).toEqual([productA, productB].sort());
    expect((await getPointsBalance(db, customerId)).balance).toBe(result.points);
  });

  /** Ziyaretçide her kaydırma ayrı satırdır; körlemesine bağlansaydı her satıra puan ödenirdi. */
  it('aynı ürünün tekrar tekrar kaydırılması TEK puan verir', async () => {
    const ids = [await guestSwipe(productA), await guestSwipe(productA), await guestSwipe(productA)];
    const customerId = await newCustomer();

    const result = await claimDiscoverSwipes(db, customerId, ids);

    expect(result.linked).toBe(1);
    const rows = await feedback.listByCustomer(customerId);
    expect(rows).toHaveLength(1);
  });

  /** Turu ikinci kez yapıp yeniden talep etmek yeni puan doğurmaz — ürün zaten oylanmış. */
  it('ikinci tur aynı ürünler için puan vermez', async () => {
    const customerId = await newCustomer();
    const first = await claimDiscoverSwipes(db, customerId, [await guestSwipe(productA)]);
    expect(first.linked).toBe(1);

    const second = await claimDiscoverSwipes(db, customerId, [await guestSwipe(productA)]);
    expect(second).toEqual({ linked: 0, points: 0 });
    expect((await getPointsBalance(db, customerId)).balance).toBe(first.points);
  });

  /** Bağlanmış satır kimliksiz değildir, ikinci kez talep edilemez. */
  it('başkasının hesabına bağlanmış satır devralınamaz', async () => {
    const id = await guestSwipe(productB);
    const owner = await newCustomer();
    await claimDiscoverSwipes(db, owner, [id]);

    const intruder = await newCustomer();
    expect(await claimDiscoverSwipes(db, intruder, [id])).toEqual({ linked: 0, points: 0 });
    expect(await feedback.listByCustomer(intruder)).toHaveLength(0);
  });

  it('boş talep sessizce geçer — hiç kaydırmadan giriş yapan ziyaretçi', async () => {
    expect(await claimDiscoverSwipes(db, await newCustomer(), [])).toEqual({ linked: 0, points: 0 });
  });
});
