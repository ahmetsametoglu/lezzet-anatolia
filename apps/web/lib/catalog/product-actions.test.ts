import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';

/*
  Ürün formu ülke oranını ilk kayıtta yeni ürünün kimliğiyle yazar: eylem kimlik döndürmez ya da başka kaydın kimliğini döndürürse bu
  dosya kırmızıya döner. Oturum koruması ve sayfa yenileme sahtedir, yazım gerçek.
*/
vi.mock('@/lib/guard', () => ({
  requireStaff: async () => ({ id: '00000000-0000-4000-8000-00000000b0b0', profileId: '00000000-0000-4000-8000-00000000b0b1' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { createProductAction } = await import('./product-actions');

const db = serviceDb();
const ad = `Kimlikli börek ${Date.now()}`;
let categoryId = '';

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Yeni ürün eylemi ${ad}` } })).id;
});

afterAll(async () => {
  // Kategorinin bütün ürünleri silinir: eylem yanlış kimlik döndürürse açtığı ürün yine de geride kalmaz.
  const { data } = await db.from('product').select('id').eq('category_id', categoryId);
  await purgeTestData(db, { productIds: (data ?? []).map((row) => (row as { id: string }).id), categoryIds: [categoryId] });
});

describe('createProductAction', () => {
  it('başarıda yeni ürünün kimliğini döndürür', async () => {
    const sonuc = await createProductAction({
      name: { tr: ad },
      categoryId,
      variants: [{ label: { tr: '1 kg' } }],
    } as Parameters<typeof createProductAction>[0]);

    expect(sonuc.error).toBeNull();
    const urun = sonuc.data ? await new ProductService(db).getById(sonuc.data.id) : null;
    expect(urun?.name.tr).toBe(ad);
  });
});
