import { describe, expect, it } from 'vitest';
import type { CandidateDemandRow } from '@/lib/feedback/product-feedback';
import { agoMinutesOf, starsOf, toCandidateCards } from './feedback-read';
import { signedCount, trustLabel } from './feedback-labels';
import { parseFeedbackUrl, feedbackUrl } from './feedback-url';

// Geri Bildirim ekranının saf katmanı — DB'siz, birim projesinde koşar.

describe('yıldız gösterimi', () => {
  it('puanı dolu/boş yıldıza çevirir', () => {
    expect(starsOf(5)).toBe('★★★★★');
    expect(starsOf(3)).toBe('★★★☆☆');
    expect(starsOf(1)).toBe('★☆☆☆☆');
  });

  it('PUAN VERİLMEMİŞSE hiç yıldız çizmez — sıfır yıldız DEĞİL', () => {
    // Metin yazıp puan vermeyen müşteri var. "☆☆☆☆☆" göstermek "en düşük puanı verdi" diye
    // okunur ve moderatörü yanıltır (CLAUDE.md §1: ölçülemeyen değer sıfır değildir).
    expect(starsOf(null)).toBe('');
  });

  it('sınır dışı puanı kırpar (bozuk veri ekranı bozmaz)', () => {
    expect(starsOf(9)).toBe('★★★★★');
    expect(starsOf(0)).toBe('☆☆☆☆☆');
  });
});

describe('yaş hesabı', () => {
  const now = Date.parse('2026-08-03T12:00:00Z');

  it('geçen dakikayı verir', () => {
    expect(agoMinutesOf('2026-08-03T11:00:00Z', now)).toBe(60);
  });

  it('GELECEKTEKİ damga negatif dönmez', () => {
    // Saat kayması ya da sunucu/istemci farkı bir damgayı geleceğe atabilir; "-3 dk önce" yazan
    // bir etiket, veriyi bozuk göstermek yerine ekranı bozuk gösterir.
    expect(agoMinutesOf('2026-08-03T12:30:00Z', now)).toBe(0);
  });
});

describe('güvenilirlik etiketi', () => {
  it('üç kovaya ayırır ve sayıyı GÖSTERMEZ', () => {
    expect(trustLabel(0.9).label).toBe('yüksek');
    expect(trustLabel(0.5).label).toBe('orta');
    expect(trustLabel(0.1).label).toBe('düşük');
  });

  it('eşik değerleri alt kovaya değil ÜST kovaya girer', () => {
    expect(trustLabel(0.7).label).toBe('yüksek');
    expect(trustLabel(0.4).label).toBe('orta');
  });
});

describe('işaretli sayı', () => {
  it('artıyı açıkça yazar — pano hem sevileni hem sevilmeyeni taşıyor', () => {
    expect(signedCount(184)).toBe('+184');
    expect(signedCount(-12)).toBe('-12');
    expect(signedCount(0)).toBe('0');
  });
});

describe('aday panosu', () => {
  const row = (productId: string, weightedLikes: number): CandidateDemandRow => ({
    productId,
    dislikeCount: 0,
    identifiedLikeCount: weightedLikes,
    signal: { weightedLikes, rawLikes: weightedLikes, trust: 0.8 },
  });

  it('çubuğu EN YÜKSEK talebe göre oranlar, sabit tavana göre değil', () => {
    const cards = toCandidateCards([row('a', 100), row('b', 50)], new Map());
    expect(cards[0]!.barPct).toBe(100);
    expect(cards[1]!.barPct).toBe(50);
  });

  it('sıra numarası kapının SIRASINI izler, yeniden sıralamaz', () => {
    const cards = toCandidateCards([row('a', 10), row('b', 90)], new Map());
    expect(cards.map((c) => c.rank)).toEqual([1, 2]);
    expect(cards[0]!.productId).toBe('a');
  });

  it('ürün adı çözülemezse satır DÜŞMEZ, kimliğin kısası yazılır', () => {
    const cards = toCandidateCards([row('abcdef12-3456', 5)], new Map());
    expect(cards[0]!.productName).toBe('abcdef12');
  });

  it('hiç talep yoksa sıfıra bölme olmaz', () => {
    expect(toCandidateCards([row('a', 0)], new Map())[0]!.barPct).toBe(0);
  });
});

describe('adres sözleşmesi', () => {
  it('varsayılanları YAZMAZ (temiz adres)', () => {
    expect(feedbackUrl({ tab: 'moderation', rs: 'pending', sd: 'desc' })).toBe('/operations/feedback');
  });

  it('YÖNÜ yalnız skor sekmesinde taşır', () => {
    expect(feedbackUrl({ tab: 'scores', rs: 'pending', sd: 'asc' })).toBe('/operations/feedback?tab=scores&sd=asc');
    expect(feedbackUrl({ tab: 'scores', rs: 'pending', sd: 'desc' })).toBe('/operations/feedback?tab=scores');
  });

  it('yığını YALNIZ moderasyon sekmesinde taşır', () => {
    // Başka sekmede taşınsaydı adres o sekmede hiçbir şey anlatmayan bir parametre gösterirdi.
    expect(feedbackUrl({ tab: 'points', rs: 'approved', sd: 'asc' })).toBe('/operations/feedback?tab=points');
    expect(feedbackUrl({ tab: 'moderation', rs: 'approved', sd: 'desc' })).toBe('/operations/feedback?rs=approved');
  });

  it('tanınmayan değer sessizce varsayılana düşer — bozuk bağlantı ekranı kırmaz', () => {
    expect(parseFeedbackUrl({ tab: 'uydurma', rs: 'yok', sd: 'yan' })).toEqual({ tab: 'moderation', rs: 'pending', sd: 'desc' });
  });

  it('gidiş-dönüş aynı adresi verir', () => {
    const url = feedbackUrl({ tab: 'candidates', rs: 'pending', sd: 'desc' });
    expect(parseFeedbackUrl({ tab: 'candidates' })).toEqual({ tab: 'candidates', rs: 'pending', sd: 'desc' });
    expect(url).toBe('/operations/feedback?tab=candidates');
  });
});
