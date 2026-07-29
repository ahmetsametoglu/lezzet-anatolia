import { describe, expect, it } from 'vitest';
import {
  EMPTY_PRODUCT_SCORE,
  MIN_FEEDBACK_FOR_CONFIDENCE,
  canModerate,
  initialFeedbackStatus,
  productScoreOf,
} from './feedback-score';

describe('moderasyon metnin işidir', () => {
  it('metinsiz kayıt doğrudan yayına girer, kuyruğa düşmez', () => {
    expect(initialFeedbackStatus(null)).toBe('approved');
    expect(initialFeedbackStatus('   ')).toBe('approved');
  });

  it('metinli kayıt kuyruğa düşer', () => {
    expect(initialFeedbackStatus('Fıstık cömertti.')).toBe('pending');
  });

  it('okunacak bir şey yoksa moderasyon da yapılamaz', () => {
    expect(canModerate('approved', 'rejected', false)).toEqual({ allowed: false, reason: 'nothing_to_read' });
  });

  it('metinli yorum onaylanır, reddedilir, geri çekilir', () => {
    expect(canModerate('pending', 'approved', true)).toEqual({ allowed: true });
    expect(canModerate('pending', 'rejected', true)).toEqual({ allowed: true });
    expect(canModerate('approved', 'rejected', true)).toEqual({ allowed: true });
    expect(canModerate('rejected', 'approved', true)).toEqual({ allowed: true });
  });

  it('"karar verilmemiş" hâline geri dönülemez', () => {
    expect(canModerate('approved', 'pending', true)).toEqual({ allowed: false, reason: 'not_allowed' });
  });

  it('aynı duruma geçiş ayrı bir sebeptir', () => {
    expect(canModerate('approved', 'approved', true)).toEqual({ allowed: false, reason: 'same_status' });
  });
});

describe('ürün skoru — iki ölçü, tek puan', () => {
  it('yalnız yıldız varsa sonuç yıldız ortalamasıdır', () => {
    const score = productScoreOf({ ratingAvg: 4.3, ratingCount: 10, likeCount: 0, dislikeCount: 0 });
    expect(score.average).toBe(4.3);
    expect(score.stars).toBe(4.5);
    expect(score.likeRatio).toBeNull();
  });

  it('yalnız beğeni varsa oran 1–5 aralığına eşlenir', () => {
    // %100 beğeni → 5
    expect(productScoreOf({ ratingAvg: null, ratingCount: 0, likeCount: 8, dislikeCount: 0 }).average).toBe(5);
    // %0 beğeni → 1
    expect(productScoreOf({ ratingAvg: null, ratingCount: 0, likeCount: 0, dislikeCount: 4 }).average).toBe(1);
    // %50 beğeni → 3
    expect(productScoreOf({ ratingAvg: null, ratingCount: 0, likeCount: 5, dislikeCount: 5 }).average).toBe(3);
  });

  it('çok beğeni + az yıldız → sonucu beğeniler belirler', () => {
    // 5 yorum 5 yıldız, 60 kaydırmanın 30'u beğeni (oran %50 → 3 puan).
    const score = productScoreOf({ ratingAvg: 5, ratingCount: 5, likeCount: 30, dislikeCount: 30 });
    // (5×5 + 3×60) / 65 ≈ 3.15 — beğeni kütlesi ağır basar.
    expect(score.average).toBeCloseTo(3.15, 2);
  });

  it('çok yıldız + az beğeni → sonucu yıldızlar belirler', () => {
    const score = productScoreOf({ ratingAvg: 4.5, ratingCount: 40, likeCount: 0, dislikeCount: 3 });
    // (4.5×40 + 1×3) / 43 ≈ 4.26
    expect(score.average).toBeCloseTo(4.26, 2);
  });

  it('hiç beyan yoksa puan null — sıfır DEĞİL', () => {
    expect(productScoreOf({ ratingAvg: null, ratingCount: 0, likeCount: 0, dislikeCount: 0 })).toEqual(EMPTY_PRODUCT_SCORE);
  });

  it('yıldız ortalaması ayrı da okunabilir — operasyon ikisini ayırt etmeli', () => {
    const score = productScoreOf({ ratingAvg: 2, ratingCount: 4, likeCount: 20, dislikeCount: 0 });
    expect(score.ratingAvg).toBe(2);
    expect(score.likeRatio).toBe(1);
    // Birleşik puan ikisinin arasında kalır.
    expect(score.average).toBeGreaterThan(2);
    expect(score.average).toBeLessThan(5);
  });

  it('güven eşiği biçime değil kişi sayısına bakar', () => {
    // İki yıldız + bir beğeni = üç beyan → güvenilir.
    expect(productScoreOf({ ratingAvg: 5, ratingCount: 2, likeCount: 1, dislikeCount: 0 }).confident).toBe(true);
    expect(productScoreOf({ ratingAvg: 5, ratingCount: 2, likeCount: 0, dislikeCount: 0 }).confident).toBe(false);
    expect(MIN_FEEDBACK_FOR_CONFIDENCE).toBe(3);
  });
});
