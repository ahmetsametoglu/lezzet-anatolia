import { describe, expect, it } from 'vitest';
import { ProductFeedbackInsertSchema } from './product-feedback.schema';

/**
 * **Boş değerlendirme yazılamaz: yıldız, beğeni ya da METİN — biri olmalı.**
 *
 * Üçü de boşken kayıt açılsaydı ürün skoru bozulmazdı (hesaba girmez) ama moderasyon kuyruğuna
 * okunacak hiçbir şey taşımayan bir satır düşerdi; ve müşteri "yorumumu yazdım" sanırdı.
 */
describe('ProductFeedbackInsert — boş değerlendirme yok', () => {
  const temel = {
    productId: '22222222-2222-4222-8222-222222222222',
    customerId: '33333333-3333-4333-8333-333333333333',
    context: 'purchase' as const,
  };

  it('üçü de boşsa REDDEDİLİR', () => {
    expect(ProductFeedbackInsertSchema.safeParse(temel).success).toBe(false);
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, rating: null, vote: null, comment: null }).success).toBe(false);
  });

  it('YALNIZ BOŞLUKTAN ibaret yorum sayılmaz', () => {
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, comment: '   ' }).success).toBe(false);
  });

  it('üçünden biri yeter', () => {
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, rating: 4 }).success).toBe(true);
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, vote: 'like' }).success).toBe(true);
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, comment: 'Çok iyiydi' }).success).toBe(true);
  });

  it('yıldız 1–5 dışına çıkamaz', () => {
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, rating: 0 }).success).toBe(false);
    expect(ProductFeedbackInsertSchema.safeParse({ ...temel, rating: 6 }).success).toBe(false);
  });
});
