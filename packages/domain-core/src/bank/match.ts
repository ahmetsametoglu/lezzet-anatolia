import { toCents } from '@lezzet/helper';

/**
 * Banka satırının eşleştirilmesi (12.4) — **öneri üretir, karar VERMEZ.**
 *
 * Yanlış eşleşen bir satır parayı başka bir siparişin ödemesi yapar: o sipariş "ödendi" görünürken
 * gerçekte ödeyen müşteri hâlâ borçlu kalır ve kimse fark etmez. Bu yüzden burada üretilen her şey
 * **öneri**dir; uygulamayı insan onaylar (DOMAIN §9: "öneri + elle onay; tam otomatik değil").
 */

export interface MatchCandidate {
  orderId: string;
  referenceNo: string | null;
  /** Siparişin AÇIK bakiyesi (tahsil edilmesi kalan) — eşleşme bunun üstünde aranır. */
  outstanding: number;
  /** Satışın gerçekleştiği gün. */
  saleDate: string;
  customerName?: string | null;
}

export interface MatchSuggestion {
  orderId: string;
  /** 0–1. Yüksek olması onayı kaldırmaz, yalnız sıraya koyar. */
  score: number;
  /** Neden önerildi — operatör "neden bu?" diye sormasın. */
  reasons: Array<'reference_in_label' | 'exact_amount' | 'close_amount' | 'same_day' | 'near_date' | 'customer_in_label'>;
}

/** Tarih penceresi (gün): banka satırı satıştan sonra düşer, havale bazen günler sonra. */
const WINDOW_DAYS = 10;
/** Bu eşiğin altındaki öneri gösterilmez — zayıf öneri, operatörü yanlış onaya sürükler. */
export const MATCH_THRESHOLD = 0.4;

function dayGapBetween(a: string, b: string): number {
  const ms = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round(ms / 86_400_000));
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Bir banka satırı için sipariş önerileri — en güçlüden zayıfa, eşik altı elenmiş.
 *
 * **Referans numarası açıklamada geçiyorsa** neredeyse kesindir (numara rastgeledir, tesadüfen
 * eşleşmez) — ama tutar tutmuyorsa yine de tam puan verilmez: müşteri eksik ödemiş olabilir ve o
 * bir karardır, tahmin değil.
 *
 * Yalnız PARA GİRİŞİ eşleştirilir: sipariş tahsilatı içeri gelir. Çıkışlar gider/tedarikçi
 * ödemesidir, onların eşleştirmesi başka bir sorudur.
 */
export function suggestOrderMatches(
  row: { valueDate: string; amount: number; direction: 'in' | 'out'; label: string; reference?: string | null },
  candidates: readonly MatchCandidate[],
): MatchSuggestion[] {
  if (row.direction !== 'in') return [];

  const haystack = normalize(`${row.label} ${row.reference ?? ''}`);
  const rowCents = toCents(row.amount);

  return candidates
    .map((candidate) => {
      const reasons: MatchSuggestion['reasons'] = [];
      let score = 0;

      const referenceMatched = !!candidate.referenceNo && haystack.includes(normalize(candidate.referenceNo));
      const dayGap = dayGapBetween(row.valueDate, candidate.saleDate);

      // **Tarih kapısı:** referans geçmiyorsa pencere dışındaki sipariş hiç değerlendirilmez.
      // Yoksa altı ay önceki bir siparişle tutarı tutan her satır öneri olurdu — tutar tesadüfen
      // eşleşir, referans eşleşmez. Referans varsa zaman kısıtı kalkar: numara rastgeledir.
      if (!referenceMatched && dayGap > WINDOW_DAYS) return null;

      if (referenceMatched) {
        reasons.push('reference_in_label');
        score += 0.6;
      }

      const outstandingCents = toCents(candidate.outstanding);
      if (outstandingCents > 0 && outstandingCents === rowCents) {
        reasons.push('exact_amount');
        score += 0.4;
      } else if (outstandingCents > 0 && Math.abs(outstandingCents - rowCents) <= Math.max(50, Math.round(outstandingCents * 0.01))) {
        // %1 ya da 50 cent'lik tolerans: banka masrafı/yuvarlama farkı eşleşmeyi öldürmesin.
        reasons.push('close_amount');
        score += 0.2;
      }

      if (dayGap === 0) {
        reasons.push('same_day');
        score += 0.2;
      } else if (dayGap <= WINDOW_DAYS) {
        reasons.push('near_date');
        score += 0.2 * (1 - dayGap / WINDOW_DAYS);
      }

      if (candidate.customerName && haystack.includes(normalize(candidate.customerName))) {
        reasons.push('customer_in_label');
        score += 0.15;
      }

      return { orderId: candidate.orderId, score: Math.round(Math.min(1, score) * 100) / 100, reasons };
    })
    .filter((s): s is MatchSuggestion => s !== null && s.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.orderId.localeCompare(b.orderId));
}

/**
 * Öneri **tek başına** mı, yoksa yakın rakipleri mi var. İki aday birbirine yakınsa (aynı tutar,
 * aynı gün, iki farklı sipariş) otomatik onay teklifi bile edilmez — operatör hangisi olduğunu
 * bilmeden onaylarsa parayı yanlış siparişe bağlar.
 */
export function isUnambiguous(suggestions: readonly MatchSuggestion[]): boolean {
  if (suggestions.length === 0) return false;
  if (suggestions.length === 1) return true;
  return suggestions[0]!.score - suggestions[1]!.score >= 0.2;
}
