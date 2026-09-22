import { describe, expect, it } from 'vitest';
import { PointsReasonEnum } from '@lezzet/types';
import { POINTS_SETTING_KEYS, canEarnPoints, canRedeem, feedbackPointsReason, nextRedemption } from './points';

describe('puan kazanımı', () => {
  // Taban tavana tabi bir sebep, çünkü tavan sınamalarının ölçtüğü kural tam olarak bu; taban tavan dışı olsaydı testler ölçtükleri kural yokken de geçerdi.
  const base = { customerType: 'individual' as const, reason: 'feedback_candidate' as const, actionPoints: 20, earnedToday: 0, dailyCap: 100 };

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

/**
 * Tavan yalnız para ödenmeden yapılabilen eylemleri kapsar. Blok, kural olmadan doğan arızayı çiviler: tavan kısmi
 * uygulanmadığı için büyük davet ödülleri tavana takılıp hiç yazılamazdı.
 */
describe('günlük tavanın kapsamı', () => {
  const paid = { customerType: 'individual' as const, earnedToday: 0, dailyCap: 100 };

  it('GETİREN ödülü tavanı görmez — 500 puan, tavan 100', () => {
    expect(canEarnPoints({ ...paid, reason: 'referral', actionPoints: 500 })).toEqual({ allowed: true, points: 500 });
  });

  it('KOMŞU ödülü tavanı görmez — tavan dolmuşken bile yazılır', () => {
    expect(canEarnPoints({ ...paid, reason: 'neighbor', actionPoints: 100, earnedToday: 100 })).toEqual({
      allowed: true,
      points: 100,
    });
  });

  it('arkasında ödenmiş sipariş olan öteki ödüller de tavan dışında (yorum · alım-sonrası beğeni)', () => {
    expect(canEarnPoints({ ...paid, reason: 'review', actionPoints: 20, earnedToday: 99 })).toEqual({ allowed: true, points: 20 });
    expect(canEarnPoints({ ...paid, reason: 'feedback_purchase', actionPoints: 5, earnedToday: 99 })).toEqual({
      allowed: true,
      points: 5,
    });
  });

  it('BEDAVA yapılabilen ikisi tavana tabidir — ziyaret ve keşif oyu', () => {
    expect(canEarnPoints({ ...paid, reason: 'visit', actionPoints: 10, earnedToday: 95 })).toEqual({
      allowed: false,
      reason: 'daily_cap',
    });
    expect(canEarnPoints({ ...paid, reason: 'feedback_candidate', actionPoints: 2, earnedToday: 99 })).toEqual({
      allowed: false,
      reason: 'daily_cap',
    });
  });

  it('B2B hâlâ hiçbir sebepten kazanmaz — tavan muafiyeti bunu delmez', () => {
    expect(canEarnPoints({ ...paid, customerType: 'company', reason: 'referral', actionPoints: 500 })).toEqual({
      allowed: false,
      reason: 'b2b',
    });
  });
});

describe('kupona çevirme', () => {
  const base = { customerType: 'individual' as const, balance: 600, minimum: 500, maximum: 2000, centValue: 1 };

  it('eşiği geçen bakiye çevrilir; karşılığı puan × kuruş değeri', () => {
    expect(canRedeem(base)).toEqual({ allowed: true, pointsSpent: 600, valueCents: 600 });
  });

  it('tavanın üstündeki bakiyede yalnız tavan çevrilir — fazlası bakiyede kalır', () => {
    expect(canRedeem({ ...base, balance: 3000 })).toEqual({ allowed: true, pointsSpent: 2000, valueCents: 2000 });
  });

  it('düğmenin söylediği çevirme: eşik altında eşik, aralıkta bakiye, tavan üstünde tavan', () => {
    expect(nextRedemption({ ...base, balance: 300 })).toEqual({ points: 500, valueCents: 500 });
    expect(nextRedemption({ ...base, balance: 610 })).toEqual({ points: 610, valueCents: 610 });
    expect(nextRedemption({ ...base, balance: 3000 })).toEqual({ points: 2000, valueCents: 2000 });
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
  });

  it('KEŞİF metinle bile yorum puanına TERFİ ETMEZ — her hâlükârda aday puanı (karar 6)', () => {
    // Keşif kartı metin taşısa da aday puanıdır; keşif akışına metin alanı eklendiği gün on kat puan dağıtan kapı açılmasın.
    expect(feedbackPointsReason({ context: 'candidate', hasText: true })).toBe('feedback_candidate');
  });

  it('metinsiz kayıt bağlamının puanını alır', () => {
    expect(feedbackPointsReason({ context: 'purchase', hasText: false })).toBe('feedback_purchase');
    expect(feedbackPointsReason({ context: 'candidate', hasText: false })).toBe('feedback_candidate');
  });

  /** Ölçüt enum'dan türer, sabit sayıdan değil: sayı tutsa bile eksik anahtar sessizce geçerdi. */
  it('her kazanım sebebinin bir ayar anahtarı vardır', () => {
    expect(POINTS_SETTING_KEYS.review).toBe('points_review');
    expect(POINTS_SETTING_KEYS.feedback_candidate).toBe('points_feedback_candidate');

    // `order` da dışarıda: sipariş puanı kaldırıldı, sebep yalnız GEÇMİŞİ adlandırmak için
    // enum'da durur — kazanılamaz, dolayısıyla ayar anahtarı da yok (tipin künyesi).
    const kazanilabilir = PointsReasonEnum.options.filter((r) => r !== 'redemption' && r !== 'manual' && r !== 'order');
    expect(Object.keys(POINTS_SETTING_KEYS).sort()).toEqual([...kazanilabilir].sort());
    // Her anahtar `points_` önekli ve sebebiyle aynı adı taşır — ayar tablosuyla eşleşmenin şartı.
    for (const reason of kazanilabilir) expect(POINTS_SETTING_KEYS[reason]).toBe(`points_${reason}`);
  });
});
