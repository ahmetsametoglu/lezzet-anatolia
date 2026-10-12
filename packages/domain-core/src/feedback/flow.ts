import type { FeedbackVote } from '@lezzet/types';

/** Akışın okuduğu kart: ürün ve varsa önceki cevap. */
interface FlowCard {
  productId: string;
  existing: { vote: FeedbackVote | null; comment?: string | null } | null;
}

/**
 * Önceki oylar: yarıda bırakılan akış kaldığı yerden sürer. Yalnız oy sayılır, çünkü yalnız yorum taşıyan kart hâlâ
 * cevapsızdır.
 */
export function previousFeedbackVotes(cards: readonly FlowCard[]): Record<string, FeedbackVote> {
  const entries: [string, FeedbackVote][] = [];
  for (const card of cards) {
    if (card.existing?.vote != null) entries.push([card.productId, card.existing.vote]);
  }
  return Object.fromEntries(entries);
}

/** Önceki yorumlar: akış yeniden açılınca müşterinin yazdığı metin kendi ürününün alanında durur. */
export function previousFeedbackComments(cards: readonly FlowCard[]): Record<string, string> {
  const entries: [string, string][] = [];
  for (const card of cards) {
    const comment = card.existing?.comment?.trim();
    if (comment) entries.push([card.productId, comment]);
  }
  return Object.fromEntries(entries);
}

/**
 * Gönderilecek yorumlar: yalnız yeni ya da değişmiş metin. Aynı metni yeniden yazmak onaylanmış yorumu moderasyon kuyruğuna geri
 * sokardı; silinen metin gönderilmez, çünkü akış yorum silmez.
 */
export function pendingFeedbackComments(
  cards: readonly FlowCard[],
  comments: Readonly<Record<string, string>>,
): Array<{ productId: string; text: string }> {
  const pending: Array<{ productId: string; text: string }> = [];
  for (const card of cards) {
    const text = (comments[card.productId] ?? '').trim();
    const before = card.existing?.comment?.trim() ?? '';
    if (text.length > 0 && text !== before) pending.push({ productId: card.productId, text });
  }
  return pending;
}

/** Yorumun alt sınırının ayar anahtarı; değer kelime sayısıdır. */
export const REVIEW_MIN_WORDS_KEY = 'review_min_words';
/** Ayar satırı yokken geçerli alt sınır. */
export const REVIEW_MIN_WORDS_DEFAULT = 2;

/**
 * Yorumdaki sayılan kelimeler: en az iki harfli ve en az iki farklı harften kurulu sözcükler. Noktalama, rakam ve "aaa" gibi tek
 * harf tekrarı sayılmaz, çünkü puan kazandıran yorumun boşlukla ya da tek tuşla geçilmemesi isteniyor.
 */
export function reviewWordCount(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/u)) {
    const letters = token.match(/\p{L}/gu) ?? [];
    if (letters.length >= 2 && new Set(letters.map((letter) => letter.toLowerCase())).size >= 2) count += 1;
  }
  return count;
}

/** Yorum alt sınırı karşılıyor mu; boş metin yorum değildir ve bu soruya girmez. */
export function meetsReviewMinimum(text: string, minWords: number): boolean {
  return reviewWordCount(text) >= minWords;
}
