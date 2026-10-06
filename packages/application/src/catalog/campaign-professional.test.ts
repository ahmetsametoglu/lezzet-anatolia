import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, DiscountService, serviceDb } from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import { readScopeCampaigns } from './campaign';

/**
 * Vitrin kampanyayı yalnız bireysel görüntüleyene duyurur; profesyonel müşteriye tüketici promosyonu yoktur
 * (docs/feature/iki-is.md, karar 13).
 */
const db = serviceDb();
const stamp = Date.now();
let categoryId: string;
let discountId: string;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Kampanyanın işi ${stamp}` } })).id;
  // Ürünsüz kategoriye bağlı kampanya başka testin sepetine inemez.
  discountId = (
    await new DiscountService(db).insert({
      name: `Kategori kampanyası ${stamp}`,
      publicLabel: { tr: `Kategori kampanyası ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 15,
      scope: 'category',
      categoryId,
    })
  ).id;
});

afterAll(async () => {
  if (discountId) await mustDelete(db, 'discount', (q) => q.eq('id', discountId));
  await purgeTestData(db, { categoryIds: [categoryId] });
});

describe('vitrinin kampanyası', () => {
  it('bireysel görüntüleyene kategori kampanyası duyurulur, profesyonele duyurulmaz', async () => {
    const individualView = await readScopeCampaigns(db, { categoryIds: [categoryId], professional: false });
    const professionalView = await readScopeCampaigns(db, { categoryIds: [categoryId], professional: true });

    expect(individualView.byCategory.get(categoryId)?.id).toBe(discountId);
    expect(professionalView.byCategory.size).toBe(0);
  });
});
