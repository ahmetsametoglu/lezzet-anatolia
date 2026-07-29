import { describe, expect, it, vi } from 'vitest';
import { FEEDBACK_DELAY_DAYS, feedbackOutcomeOf, feedbackToken, isDueForFeedback } from './invite';

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

describe('davetin zamanı', () => {
  it('teslimden 10 gün sonra davet zamanıdır', () => {
    expect(isDueForFeedback({ status: 'delivered', deliveredAt: daysAgo(FEEDBACK_DELAY_DAYS) })).toBe(true);
    expect(isDueForFeedback({ status: 'completed', deliveredAt: daysAgo(15) })).toBe(true);
  });

  it('erken sorulmaz — müşteri henüz denememiş olabilir', () => {
    expect(isDueForFeedback({ status: 'delivered', deliveredAt: daysAgo(3) })).toBe(false);
  });

  it('teslim edilmemiş sipariş davet almaz', () => {
    expect(isDueForFeedback({ status: 'out_for_delivery', deliveredAt: null })).toBe(false);
    // Teslim damgası olsa bile durum uygun değilse (iade edilmiş) sorulmaz.
    expect(isDueForFeedback({ status: 'returned', deliveredAt: daysAgo(20) })).toBe(false);
    expect(isDueForFeedback({ status: 'cancelled', deliveredAt: null })).toBe(false);
  });

  it('bekleme süresi parametrik', () => {
    expect(isDueForFeedback({ status: 'delivered', deliveredAt: daysAgo(4), delayDays: 3 })).toBe(true);
  });
});

describe('davet anahtarı', () => {
  it('16 karakter, okunabilir alfabeden', () => {
    expect(feedbackToken()).toMatch(/^[34679ACDEFGHJKLMNPQRTUVWXY]{16}$/);
  });

  it('rastgelelik dışarıdan verilebilir — biçim sınanabilsin', () => {
    expect(feedbackToken(() => 0)).toBe('3'.repeat(16));
  });

  it('varsayılan üreteç `Math.random` DEĞİL — öngörülebilir token oturum çalar', () => {
    // Token oturum yerine geçiyor. `Math.random` (xorshift128+) kriptografik değildir ve aynı
    // üreteci paylaşan sipariş referansı + kupon kodu üzerinden iç durumu geri çözülebilir.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const token = feedbackToken();
    spy.mockRestore();

    // `Math.random` kullanılsaydı sabitlenmiş 0 ile hepsi ilk harf olurdu.
    expect(token).not.toBe('3'.repeat(16));
    expect(token).toMatch(/^[34679ACDEFGHJKLMNPQRTUVWXY]{16}$/);
  });

  it('iki token aynı olmaz', () => {
    expect(new Set(Array.from({ length: 50 }, () => feedbackToken())).size).toBe(50);
  });
});

describe('akış sonu', () => {
  const link = { hasReviewLink: true };

  it('memnun müşteri dış değerlendirmeye davet edilir', () => {
    expect(feedbackOutcomeOf({ likeCount: 5, dislikeCount: 0, ...link })).toBe('review_invite');
    expect(feedbackOutcomeOf({ likeCount: 4, dislikeCount: 1, ...link })).toBe('review_invite'); // %80
  });

  it('memnun OLMAYAN müşteri dışarı yönlendirilmez — yolu talep girişidir', () => {
    expect(feedbackOutcomeOf({ likeCount: 3, dislikeCount: 2, ...link })).toBe('report_issue'); // %60
    expect(feedbackOutcomeOf({ likeCount: 0, dislikeCount: 3, ...link })).toBe('report_issue');
  });

  it('hiç değerlendirme yapmadan bitiren müşteriye sade teşekkür', () => {
    expect(feedbackOutcomeOf({ likeCount: 0, dislikeCount: 0, ...link })).toBe('thanks');
  });

  it('değerlendirme bağlantısı ayarlı değilse davet gösterilmez', () => {
    expect(feedbackOutcomeOf({ likeCount: 5, dislikeCount: 0, hasReviewLink: false })).toBe('thanks');
  });

  it('eşik parametrik', () => {
    expect(feedbackOutcomeOf({ likeCount: 3, dislikeCount: 2, ...link, minRatio: 0.5 })).toBe('review_invite');
  });
});
