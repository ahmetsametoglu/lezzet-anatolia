import { describe, expect, it } from 'vitest';
import { TrustEntryInsertSchema } from './trust.schema';

// Sıfır puanlı satır toplamı değiştirmez ama `(müşteri, sebep, kaynak)` tekilliğini tüketir: ağırlık sonradan açılırsa olay artık
// deftere yazılamazdı.
describe('TrustEntryInsert — sıfır hareket yok', () => {
  const temel = {
    customerId: '11111111-1111-4111-8111-111111111111',
    refId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-09-28T10:00:00Z',
  };

  it('sıfır puan reddedilir', () => {
    expect(TrustEntryInsertSchema.safeParse({ ...temel, reason: 'order_delivered', points: 0 }).success).toBe(false);
  });

  it('eksi puan geçerlidir — ceza da bir harekettir', () => {
    expect(TrustEntryInsertSchema.safeParse({ ...temel, reason: 'delivery_unreachable', points: -10 }).success).toBe(true);
  });
});
