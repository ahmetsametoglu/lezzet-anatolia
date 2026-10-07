import type { FeedbackVote } from '@lezzet/types';

/** Akışın okuduğu kart: ürün ve varsa önceki cevap. */
interface FlowCard {
  productId: string;
  existing: { vote: FeedbackVote | null } | null;
}

/**
 * Önceki oylar: yarıda bırakılan akış ilk oysuz karttan sürer. Yalnız oy sayılır, çünkü yalnız yorum taşıyan kart hâlâ
 * cevapsızdır.
 */
export function previousFeedbackVotes(cards: readonly FlowCard[]): Record<string, FeedbackVote> {
  const entries: [string, FeedbackVote][] = [];
  for (const card of cards) {
    if (card.existing?.vote != null) entries.push([card.productId, card.existing.vote]);
  }
  return Object.fromEntries(entries);
}

/**
 * Akış sonundaki tek yorumun yazılacağı ürün: ilk beğenilen kart, beğeni yoksa ilk kart. Yorum ürün sayfasında yayınlandığı için
 * beğenilmemiş bir ürünün altına iliştirilmez; beğeni hiç yoksa da yorum kaybolmaz.
 */
export function feedbackReviewTarget(cards: readonly Pick<FlowCard, 'productId'>[], votes: Readonly<Record<string, FeedbackVote>>): string | null {
  const liked = cards.find((card) => votes[card.productId] === 'like');
  return (liked ?? cards[0])?.productId ?? null;
}
