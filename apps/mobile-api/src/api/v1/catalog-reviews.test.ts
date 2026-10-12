import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductFeedbackService, ProductService, serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { CatalogProductDetail, ReviewPage } from '@lezzet/types';
import { app } from '../../app';

/*
  Ürün yorumlarının mobil uçları, port açmadan; zemin bu dosyanın damgalı satırlarıdır ve `purgeTestData` ile toplanır. Yorumlar
  yazım kapısını atlayıp onaylı yazılır, çünkü konu yazım değil okumanın özeti ve süzgeci.
*/

const db = serviceDb();
const stamp = Date.now();
let categoryId = '';
let slug = '';
let productId = '';
const profileIds: string[] = [];

/** Beş yorum, en yenisi sonda: dördü yıldızlı (5, 4, 5, 2), biri yalnız beğenili. */
const SEEDS = [
  { name: 'Hugo Bernard', rating: 5, vote: null, comment: 'Fıstığı bol, şerbeti kıvamında.' },
  { name: 'Léa Garnier', rating: 4, vote: null, comment: 'Taze geldi, kutusu özenliydi.' },
  { name: 'Camille Roux', rating: 5, vote: null, comment: 'Le meilleur baklava que j’ai trouvé.' },
  { name: 'Antoine Martin', rating: null, vote: 'like' as const, comment: 'Bayram sofrasının yıldızı oldu.' },
  { name: 'Sophie Klein', rating: 2, vote: null, comment: 'İki dilimi kırık geldi.' },
];

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `MAPI yorum ${stamp}` } })).id;
  const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
  const { product } = await new ProductService(db).create({
    name: ucDil(`MAPI yorumlu ${stamp}`),
    categoryId,
    description: ucDil('Test ürünü'),
    ingredients: ucDil('Un, su'),
    storageInstructions: ucDil('Serin yerde'),
    allergens: [],
    status: 'active',
    variants: [{ label: { tr: '500 g' }, netQuantity: 500, netUnit: 'g' }],
  });
  productId = product.id;
  slug = product.slug;

  const profiles = new UserProfileService(db);
  const feedback = new ProductFeedbackService(db);
  const moderator = await profiles.insert({ name: 'Moderatör', email: `mapi-yorum-mod-${stamp}@example.test` });
  profileIds.push(moderator.id);
  for (const [index, seed] of SEEDS.entries()) {
    const author = await profiles.insert({ name: seed.name, email: `mapi-yorum-${index}-${stamp}@example.test` });
    profileIds.push(author.id);
    const row = await feedback.insert({
      productId,
      customerId: author.id,
      context: 'purchase',
      rating: seed.rating,
      vote: seed.vote,
      comment: seed.comment,
      status: 'pending',
    });
    await feedback.moderate(row.id, 'approved', moderator.id);
  }
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds });
});

describe('ürün yorumları', () => {
  // Detay yorum taşımasaydı native sayfa var olan yorumlara "henüz yorum yok" derdi ve başlıktaki puan boş kalırdı.
  it('ürün detayı puan özetini ve en yeni üç yorumu kısaltılmış adla taşır', async () => {
    const detail = await dataOf<CatalogProductDetail>(await app.request(`/api/v1/products/${slug}?locale=tr`));

    expect(detail.reviews.summary).toEqual({ average: 4.2, totalCount: 5, commentCount: 5, ratingBreakdown: [0, 1, 0, 1, 2] });
    expect(detail.reviews.items.map((review) => review.authorName)).toEqual(['Sophie K.', 'Antoine M.', 'Camille R.']);
    expect(detail.reviews.items[1]).toMatchObject({ rating: null, vote: 'like' });
  });

  // Süzgeç sorguya girmeseydi "5★" çipi bütün yorumları, "3★ ve altı" çipi yıldızsız yorumları da getirirdi.
  it('yıldız süzgeci sunucuda uygulanır; yıldızsız yorum yalnız tümünde durur', async () => {
    const page = async (query: string) => dataOf<ReviewPage>(await app.request(`/api/v1/products/${slug}/reviews?locale=tr${query}`));

    const all = await page('');
    expect(all.rows).toHaveLength(5);
    expect(all.nextCursor).toBeNull();
    expect(all.summary.commentCount).toBe(5);
    expect((await page('&rating=five')).rows.map((review) => review.rating)).toEqual([5, 5]);
    expect((await page('&rating=four')).rows.map((review) => review.rating)).toEqual([4]);
    expect((await page('&rating=low')).rows.map((review) => review.rating)).toEqual([2]);
  });

  it('bozuk süzgeç 400, bilinmeyen ürün 404 alır', async () => {
    expect((await app.request(`/api/v1/products/${slug}/reviews?locale=tr&rating=bes`)).status).toBe(400);
    expect((await app.request(`/api/v1/products/yok-${stamp}/reviews?locale=tr`)).status).toBe(404);
  });
});
