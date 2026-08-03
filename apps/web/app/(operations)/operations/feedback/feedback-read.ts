import type { PointsBalance } from '@lezzet/types';
import type { CandidateDemandRow } from '@/lib/feedback/product-feedback';
import type { ModerationRowView } from '@/lib/feedback/moderation-read';
import type { CandidateCardView, ModerationCardView, PointsRowView } from './feedback-types';

// Geri Bildirim ekranının SAF dönüştürücüleri — DB'siz, `now` dışarıdan verilir, hepsi testli.
// Sayfa bunları çağırır; karar burada değil (motor `domain-core/feedback`), yalnız GÖSTERİM kararı.

/**
 * Yıldız metni — dolu/boş yıldızdan bir dizge.
 *
 * Sayı yerine yıldız çünkü tablo değil KART okunuyor: "4" bir ölçüt gibi, "★★★★☆" bir izlenim gibi
 * okunur ve moderasyon kararı izlenimle verilir. Yıldızsız kayıt (yalnız metin yazmış müşteri) boş
 * dize döner — sıfır yıldız GÖSTERMEZ, çünkü "puan vermedi" ile "bir yıldız verdi" aynı şey değil
 * (CLAUDE.md §1: ölçülemeyen değer sıfır değildir).
 */
export function starsOf(rating: number | null): string {
  if (rating === null) return '';
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/**
 * Geçen süre — "şimdi · 5 dk · 3 saat · dün · 4 gün".
 *
 * `format.agoShort` dakika alıyor; buradaki girdi bir ISO damga, o yüzden dönüşüm burada yapılır ve
 * TEK `now` ile: liste ve sayaçlar aynı ana göre okunmalı, yoksa aynı kayıt iki yerde farklı yaş
 * gösterir (aynı karar Talepler'de de verildi).
 */
export function agoMinutesOf(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 60_000);
}

/** Moderasyon satırları → kart görünümü. */
export function toModerationCards(rows: readonly ModerationRowView[], now: number, ago: (m: number) => string): ModerationCardView[] {
  return rows.map((row) => ({
    ...row,
    stars: starsOf(row.review.rating),
    agoLabel: ago(agoMinutesOf(row.review.createdAt, now)),
  }));
}

/**
 * Aday satırları → pano görünümü. Çubuk EN YÜKSEK talebe göre oranlanır, sabit bir tavana göre
 * değil: pano "hangisi önde" sorusunu cevaplıyor, "hedefin ne kadarı doldu" sorusunu değil. Sabit
 * tavan olsaydı zayıf bir dönemde bütün çubuklar boş görünür ve sıralama okunamaz olurdu.
 *
 * Liste kapıdan zaten ağırlıklı sinyale göre SIRALI gelir (`listCandidateDemand`); buradaki `rank`
 * o sıranın numarasıdır, yeni bir sıralama değil.
 */
export function toCandidateCards(rows: readonly CandidateDemandRow[], productNames: ReadonlyMap<string, string>): CandidateCardView[] {
  const top = rows[0]?.signal.weightedLikes ?? 0;
  return rows.map((row, i) => ({
    ...row,
    productName: productNames.get(row.productId) || row.productId.slice(0, 8),
    rank: i + 1,
    // Tek satırlık pano da okunabilir olmalı: tek aday varsa çubuğu dolu çizilir (kendi tavanı).
    barPct: top > 0 ? Math.round((row.signal.weightedLikes / top) * 100) : 0,
  }));
}

/** Puan bakiyeleri → tablo görünümü. */
export function toPointsRows(
  rows: readonly PointsBalance[],
  customerNames: ReadonlyMap<string, string>,
  now: number,
  ago: (m: number) => string,
): PointsRowView[] {
  return rows.map((row) => ({
    ...row,
    customerName: customerNames.get(row.customerId) || row.customerId.slice(0, 8),
    lastAgoLabel: ago(agoMinutesOf(row.lastActivityAt, now)),
  }));
}
