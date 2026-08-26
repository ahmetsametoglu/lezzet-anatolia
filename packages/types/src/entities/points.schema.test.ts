import { describe, expect, it } from 'vitest';
import { PointsEntryInsertSchema } from './points.schema';

/**
 * **Sıfır puanlı hareket yazılamaz.** Kural görünürde küçük, sonucu değil: puan defteri bir
 * TOPLAMDIR ve sıfırlık satır o toplamı değiştirmez — yani hiçbir soruya cevap vermeden defteri
 * büyütür. Daha kötüsü, "aynı ürüne bir kez puan" kısmi tekil indeksi (`0028`) bir sıfır satırıyla
 * TÜKETİLİR: müşteri gerçek puanını artık alamaz, çünkü kayıt zaten var.
 */
describe('PointsEntryInsert — sıfır hareket yok', () => {
  const temel = { customerId: '11111111-1111-4111-8111-111111111111', reason: 'review' as const };

  it('sıfır puan REDDEDİLİR', () => {
    expect(PointsEntryInsertSchema.safeParse({ ...temel, points: 0 }).success).toBe(false);
  });

  it('EKSİ puan geçerlidir — harcama ve düzeltme de bir harekettir', () => {
    expect(PointsEntryInsertSchema.safeParse({ ...temel, points: -50, reason: 'redemption' }).success).toBe(true);
  });

  it('ondalık puan reddedilir — defter tamsayıdır', () => {
    expect(PointsEntryInsertSchema.safeParse({ ...temel, points: 2.5 }).success).toBe(false);
  });
});
