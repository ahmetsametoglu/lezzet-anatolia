import { describe, expect, it } from 'vitest';
import { meetsReviewMinimum, pendingFeedbackComments, previousFeedbackComments, previousFeedbackVotes, reviewWordCount } from './flow';

describe('önceki oylar', () => {
  // Yalnız yorum taşıyan kart oylanmış sayılırsa akış o kartı atlar; bu test o hâlde kırmızıya döner.
  it('yalnız oy taşıyan kartlar sayılır, yorumlu ama oysuz kart cevapsız kalır', () => {
    const votes = previousFeedbackVotes([
      { productId: 'baklava', existing: { vote: 'like' } },
      { productId: 'borek', existing: { vote: null, comment: 'Hamuru çok iyiydi' } },
      { productId: 'lokum', existing: null },
    ]);
    expect(votes).toEqual({ baklava: 'like' });
  });
});

describe('önceki yorumlar', () => {
  // Yeniden açılan akışta yorum başka ürünün alanına ya da boş metin olarak düşerse müşteri yazdığını kaybolmuş sanır; bu test kırmızıya döner.
  it('yalnız dolu yorumlar kendi ürününe tohumlanır', () => {
    const comments = previousFeedbackComments([
      { productId: 'baklava', existing: { vote: 'like', comment: '  Şerbeti tam kıvamında  ' } },
      { productId: 'borek', existing: { vote: 'dislike', comment: '   ' } },
      { productId: 'lokum', existing: null },
    ]);
    expect(comments).toEqual({ baklava: 'Şerbeti tam kıvamında' });
  });
});

describe('gönderilecek yorumlar', () => {
  // Değişmemiş yorum yeniden gönderilirse onaylanmış yorum moderasyona geri düşer ve ürün sayfasından kaybolur; bu test kırmızıya döner.
  it('yalnız yeni ve değişmiş metin gider, aynı ve boş metin gitmez', () => {
    const cards = [
      { productId: 'baklava', existing: { vote: 'like' as const, comment: 'Şerbeti tam kıvamında' } },
      { productId: 'borek', existing: { vote: 'like' as const, comment: 'Hamuru güzeldi' } },
      { productId: 'lokum', existing: null },
      { productId: 'kunefe', existing: null },
    ];
    const pending = pendingFeedbackComments(cards, {
      baklava: ' Şerbeti tam kıvamında ',
      borek: 'Hamuru biraz sertti',
      lokum: 'Çok taze geldi',
      kunefe: '   ',
    });
    expect(pending).toEqual([
      { productId: 'borek', text: 'Hamuru biraz sertti' },
      { productId: 'lokum', text: 'Çok taze geldi' },
    ]);
  });
});

describe('yorumun alt sınırı', () => {
  // Nokta, boşluk ya da tek harf tekrarı kelime sayılırsa puanlı yorum tek tuşla geçilir; bu test kırmızıya döner.
  it('noktalama, rakam ve tek harf tekrarı kelime sayılmaz', () => {
    expect(reviewWordCount('.')).toBe(0);
    expect(reviewWordCount('   ')).toBe(0);
    expect(reviewWordCount('aaa aaa')).toBe(0);
    expect(reviewWordCount('5 ... !!')).toBe(0);
    expect(reviewWordCount('a b')).toBe(0);
  });

  // Gerçek iki kelime eşiğin altında kalırsa müşterinin "Çok iyi" yorumu reddedilir; bu test kırmızıya döner.
  it('iki kelimelik gerçek yorum iki kelimelik sınırı geçer, tek kelime geçmez', () => {
    expect(reviewWordCount('Çok iyi!')).toBe(2);
    expect(meetsReviewMinimum('Çok iyi!', 2)).toBe(true);
    expect(meetsReviewMinimum('Sertti', 2)).toBe(false);
    expect(meetsReviewMinimum('Très bon, croustillant', 2)).toBe(true);
    expect(meetsReviewMinimum('Sehr lecker', 2)).toBe(true);
  });
});
