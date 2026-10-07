import { describe, expect, it } from 'vitest';
import { feedbackReviewTarget, previousFeedbackVotes } from './flow';

describe('önceki oylar', () => {
  // Yalnız yorum taşıyan kart oylanmış sayılırsa akış o kartı atlar; bu test o hâlde kırmızıya döner.
  it('yalnız oy taşıyan kartlar sayılır, yorumlu ama oysuz kart cevapsız kalır', () => {
    const votes = previousFeedbackVotes([
      { productId: 'baklava', existing: { vote: 'like' } },
      { productId: 'borek', existing: { vote: null } },
      { productId: 'lokum', existing: null },
    ]);
    expect(votes).toEqual({ baklava: 'like' });
  });
});

describe('tek yorumun ürünü', () => {
  // Yorum beğenilmemiş ürüne yazılırsa müşterinin cümlesi o ürünün sayfasında yanlış yerde yayınlanır; bu test kırmızıya döner.
  it('ilk beğenilen karta yazılır, öndeki beğenilmeyen kart atlanır', () => {
    const cards = [{ productId: 'borek' }, { productId: 'baklava' }, { productId: 'lokum' }];
    expect(feedbackReviewTarget(cards, { borek: 'dislike', baklava: 'like', lokum: 'like' })).toBe('baklava');
  });

  // Beğeni yokken hedef boş dönerse yazılan yorum sessizce kaybolur; bu test o hâlde kırmızıya döner.
  it('hiç beğeni yoksa ilk karta yazılır, kart yoksa hedef yoktur', () => {
    expect(feedbackReviewTarget([{ productId: 'borek' }, { productId: 'lokum' }], { borek: 'dislike', lokum: 'dislike' })).toBe('borek');
    expect(feedbackReviewTarget([], {})).toBeNull();
  });
});
