import { describe, expect, it } from 'vitest';
import { PointsReasonEnum } from '@lezzet/types';
import { POINTS_SETTING_KEYS, canEarnPoints, canRedeem, feedbackPointsReason } from './points';

describe('puan kazanımı', () => {
  const base = { customerType: 'individual' as const, actionPoints: 20, earnedToday: 0, dailyCap: 100 };

  it('son kullanıcı kazanır', () => {
    expect(canEarnPoints(base)).toEqual({ allowed: true, points: 20 });
  });

  it('B2B kazanmaz — toptancının zaten özel fiyatı var', () => {
    expect(canEarnPoints({ ...base, customerType: 'company' })).toEqual({ allowed: false, reason: 'b2b' });
  });

  it('günlük tavan aşılırsa puan verilmez', () => {
    expect(canEarnPoints({ ...base, earnedToday: 90 })).toEqual({ allowed: false, reason: 'daily_cap' });
  });

  it('tavan KISMİ uygulanmaz — ya tamamı ya hiç', () => {
    // Tam sınıra oturan aksiyon geçer.
    expect(canEarnPoints({ ...base, earnedToday: 80 })).toEqual({ allowed: true, points: 20 });
    // Bir puan taşan aksiyon hiç yazılmaz; müşteri yarın TAM puanla döner.
    expect(canEarnPoints({ ...base, earnedToday: 81 })).toEqual({ allowed: false, reason: 'daily_cap' });
  });

  it('değeri sıfır olan aksiyon puan doğurmaz', () => {
    expect(canEarnPoints({ ...base, actionPoints: 0 })).toEqual({ allowed: false, reason: 'no_value' });
  });
});

describe('kupona çevirme', () => {
  const base = { customerType: 'individual' as const, balance: 600, minimum: 500, centValue: 1 };

  it('eşiği geçen bakiye çevrilir; karşılığı puan × kuruş değeri', () => {
    expect(canRedeem(base)).toEqual({ allowed: true, pointsSpent: 600, valueCents: 600 });
  });

  it('istenen miktar kadar çevrilebilir — kalanı birikmeye devam eder', () => {
    expect(canRedeem({ ...base, requestedPoints: 500 })).toEqual({ allowed: true, pointsSpent: 500, valueCents: 500 });
  });

  it('eşik altı çevrilemez', () => {
    expect(canRedeem({ ...base, balance: 300 })).toEqual({ allowed: false, reason: 'below_minimum' });
    expect(canRedeem({ ...base, requestedPoints: 400 })).toEqual({ allowed: false, reason: 'below_minimum' });
  });

  it('bakiyeden fazlası çevrilemez', () => {
    expect(canRedeem({ ...base, requestedPoints: 900 })).toEqual({ allowed: false, reason: 'insufficient_balance' });
  });

  it('B2B çeviremez', () => {
    expect(canRedeem({ ...base, customerType: 'company' })).toEqual({ allowed: false, reason: 'b2b' });
  });
});

describe('geri bildirimin puan sebebi', () => {
  it('metin yazan yorum puanı alır — biçim değil İÇERİK belirler', () => {
    expect(feedbackPointsReason({ context: 'purchase', hasText: true })).toBe('review');
    expect(feedbackPointsReason({ context: 'candidate', hasText: true })).toBe('review');
  });

  it('metinsiz kayıt bağlamının puanını alır', () => {
    expect(feedbackPointsReason({ context: 'purchase', hasText: false })).toBe('feedback_purchase');
    expect(feedbackPointsReason({ context: 'candidate', hasText: false })).toBe('feedback_candidate');
  });

  /**
   * Ölçüt ENUM'DAN türer, sabit sayıdan değil. Önce `toHaveLength(5)` yazıyordu ve bu, korumak
   * istediği şeyi korumuyordu: yeni bir kazanım sebebi eklendiğinde test "6 ≠ 5" diye düşer, ama
   * cümlesi ("her sebebin anahtarı var") hâlâ doğru olabilir — yani gürültü üretir, hata değil.
   * Tersi daha kötü: anahtar EKLENİP sebep eklenmeseydi sayı yine tutar, sessizce geçerdi.
   */
  it('her kazanım sebebinin bir ayar anahtarı vardır', () => {
    expect(POINTS_SETTING_KEYS.review).toBe('points_review');
    expect(POINTS_SETTING_KEYS.feedback_candidate).toBe('points_feedback_candidate');

    const kazanilabilir = PointsReasonEnum.options.filter((r) => r !== 'redemption' && r !== 'manual');
    expect(Object.keys(POINTS_SETTING_KEYS).sort()).toEqual([...kazanilabilir].sort());
    // Her anahtar `points_` önekli ve sebebiyle aynı adı taşır — ayar tablosuyla eşleşmenin şartı.
    for (const reason of kazanilabilir) expect(POINTS_SETTING_KEYS[reason]).toBe(`points_${reason}`);
  });
});
