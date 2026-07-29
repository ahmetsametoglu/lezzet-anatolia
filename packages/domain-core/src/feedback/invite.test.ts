import { describe, expect, it } from 'vitest';
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
});

describe('akış sonu', () => {
  const link = { hasGoogleLink: true };

  it('memnun müşteri Google değerlendirmesine davet edilir', () => {
    expect(feedbackOutcomeOf({ likeCount: 5, dislikeCount: 0, ...link })).toBe('google_review');
    expect(feedbackOutcomeOf({ likeCount: 4, dislikeCount: 1, ...link })).toBe('google_review'); // %80
  });

  it('memnun OLMAYAN müşteri Google\'a yönlendirilmez — yolu talep girişidir', () => {
    expect(feedbackOutcomeOf({ likeCount: 3, dislikeCount: 2, ...link })).toBe('report_issue'); // %60
    expect(feedbackOutcomeOf({ likeCount: 0, dislikeCount: 3, ...link })).toBe('report_issue');
  });

  it('hiç değerlendirme yapmadan bitiren müşteriye sade teşekkür', () => {
    expect(feedbackOutcomeOf({ likeCount: 0, dislikeCount: 0, ...link })).toBe('thanks');
  });

  it('Google bağlantısı ayarlı değilse davet gösterilmez', () => {
    expect(feedbackOutcomeOf({ likeCount: 5, dislikeCount: 0, hasGoogleLink: false })).toBe('thanks');
  });

  it('eşik parametrik', () => {
    expect(feedbackOutcomeOf({ likeCount: 3, dislikeCount: 2, ...link, minRatio: 0.5 })).toBe('google_review');
  });
});
