
/**
 * Banka satırının eşleştirilmesi (12.4 · 12.13) — **öneri üretir, karar VERMEZ.**
 *
 * Yanlış eşleşen bir satır parayı başka bir siparişin ödemesi yapar: o sipariş "ödendi" görünürken
 * gerçekte ödeyen müşteri hâlâ borçlu kalır ve kimse fark etmez. Bu yüzden burada üretilen her şey
 * **öneri**dir; uygulamayı insan onaylar (DOMAIN §9: "öneri + elle onay; tam otomatik değil").
 *
 * ── HEDEF YALNIZ SİPARİŞ DEĞİL (12.13 · kullanıcı kararı 13.09) ──────────────
 * Ekstredeki her satırın bir karşılığı olmalı: sipariş tahsilatı, açık belge (fatura), mal kabul
 * (tedarikçi borcu), transferin öteki yakası, müşteri iadesi ya da o hesaba ekstreden ÖNCE elle
 * yazılmış hareket. Motor hedefin türünün ne anlama geldiğini BİLMEZ; üç şeyi karşılaştırır —
 * referans açıklamada geçiyor mu, tutar tutuyor mu, tarih yakın mı — ve yönü uymayan adayı hiç
 * değerlendirmez. Adayı kuran (uygulama katmanı) türü ve yönü söyler.
 */

export type MatchKind = 'order' | 'refund' | 'document' | 'intake' | 'transfer' | 'provisional';

export interface MatchCandidate {
  kind: MatchKind;
  /** Hedefin kimliği: sipariş, belge, mal kabul, transfer ucu ya da elle yazılmış hareket. */
  id: string;
  /** Bankanın açıklamasında geçebilecek referans (sipariş no, belge no). Yoksa `null`. */
  referenceNo: string | null;
  /**
   * Adayın kapatacağı tutar **cent**: siparişin açık bakiyesi, belgenin açık kalanı, transferin ya da
   * elle yazılanın tutarı. Sıfır ya da eksi aday tutar puanı almaz (kapatacak bir şey yok).
   */
  amountCents: number;
  /** Adayın günü: satış günü, belge tarihi, transferin/elle yazılanın değer tarihi. */
  date: string;
  /** Adayın kapattığı BANKA yönü: tahsilat `in`, ödeme `out`. Ters yöndeki satıra hiç önerilmez. */
  direction: 'in' | 'out';
  /** Açıklamada aranacak adlar (müşteri, karşı taraf, tedarikçi, elle yazılanın açıklaması). */
  nameHints?: readonly (string | null | undefined)[];
}

export interface MatchSuggestion {
  kind: MatchKind;
  id: string;
  /** 0–1. Yüksek olması onayı kaldırmaz, yalnız sıraya koyar. */
  score: number;
  /** Neden önerildi — operatör "neden bu?" diye sormasın. */
  reasons: Array<'reference_in_label' | 'exact_amount' | 'close_amount' | 'same_day' | 'near_date' | 'name_in_label'>;
}

/** Tarih penceresi (gün): banka satırı satıştan sonra düşer, havale bazen günler sonra. */
const WINDOW_DAYS = 10;
/** Bu eşiğin altındaki öneri gösterilmez — zayıf öneri, operatörü yanlış onaya sürükler. */
export const MATCH_THRESHOLD = 0.4;
/** Bundan kısa bir ad ipucu aranmaz: "SA" gibi bir parça her açıklamada geçer. */
const MIN_HINT_LENGTH = 3;

function dayGapBetween(a: string, b: string): number {
  const ms = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(Math.round(ms / 86_400_000));
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Bir banka satırı için öneriler — en güçlüden zayıfa, eşik altı elenmiş, türler karışık.
 *
 * **Referans numarası açıklamada geçiyorsa** neredeyse kesindir (numara rastgeledir, tesadüfen
 * eşleşmez) — ama tutar tutmuyorsa yine de tam puan verilmez: müşteri eksik ödemiş olabilir ve o
 * bir karardır, tahmin değil.
 *
 * **Yön kapısı adaydadır:** sipariş tahsilatı yalnız girişe, belge ödemesi belgenin yönüne,
 * transferin öteki yakası ucun tersine uyar. Kural burada tek satırdır; hangi türün hangi yöne
 * uyduğunu adayı kuran söyler.
 */
export function suggestMatches(
  row: { valueDate: string; amountCents: number; direction: 'in' | 'out'; label: string; reference?: string | null },
  candidates: readonly MatchCandidate[],
): MatchSuggestion[] {
  const haystack = normalize(`${row.label} ${row.reference ?? ''}`);
  const { amountCents: rowCents } = row; // hareket cent döndürüyor (02.9) — çeviri kalmadı

  return candidates
    .map((candidate) => {
      if (candidate.direction !== row.direction) return null;

      const reasons: MatchSuggestion['reasons'] = [];
      let score = 0;

      const referenceMatched = !!candidate.referenceNo && haystack.includes(normalize(candidate.referenceNo));
      const dayGap = dayGapBetween(row.valueDate, candidate.date);

      // **Tarih kapısı:** referans geçmiyorsa pencere dışındaki aday hiç değerlendirilmez.
      // Yoksa altı ay önceki bir siparişle tutarı tutan her satır öneri olurdu — tutar tesadüfen
      // eşleşir, referans eşleşmez. Referans varsa zaman kısıtı kalkar: numara rastgeledir.
      if (!referenceMatched && dayGap > WINDOW_DAYS) return null;

      if (referenceMatched) {
        reasons.push('reference_in_label');
        score += 0.6;
      }

      const { amountCents } = candidate; // çağıran cent veriyor (02.9) — çeviri kalmadı
      if (amountCents > 0 && amountCents === rowCents) {
        reasons.push('exact_amount');
        score += 0.4;
      } else if (amountCents > 0 && Math.abs(amountCents - rowCents) <= Math.max(50, Math.round(amountCents * 0.01))) {
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

      const hintMatched = (candidate.nameHints ?? []).some((hint) => {
        const needle = hint ? normalize(hint.trim()) : '';
        return needle.length >= MIN_HINT_LENGTH && haystack.includes(needle);
      });
      if (hintMatched) {
        reasons.push('name_in_label');
        score += 0.15;
      }

      return { kind: candidate.kind, id: candidate.id, score: Math.round(Math.min(1, score) * 100) / 100, reasons };
    })
    .filter((s): s is MatchSuggestion => s !== null && s.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Öneri **tek başına** mı, yoksa yakın rakipleri mi var. İki aday birbirine yakınsa (aynı tutar,
 * aynı gün, iki farklı hedef) otomatik onay teklifi bile edilmez — operatör hangisi olduğunu
 * bilmeden onaylarsa parayı yanlış yere bağlar.
 */
export function isUnambiguous(suggestions: readonly MatchSuggestion[]): boolean {
  if (suggestions.length === 0) return false;
  if (suggestions.length === 1) return true;
  return suggestions[0]!.score - suggestions[1]!.score >= 0.2;
}
