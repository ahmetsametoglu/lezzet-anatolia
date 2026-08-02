/**
 * Transfer önerisi (19.3) — DOMAIN §17 / C9. **Sistem önerir, operatör karar verir.**
 *
 * ── ÖLÇÜ FİİLİ DEĞİL KULLANILABİLİR ──────────────────────────────────────────
 * Sevk edilebilecek miktar, müşteriye söz verilmemiş olandır. Fiiliye bakan bir öneri, rezerve
 * edilmiş malı başka şehre yollamayı teklif eder; operatör onaylarsa sipariş karşılanamaz hâle
 * gelir (RPC de reddeder, ama önerinin en baştan yanlış olmaması gerekir).
 *
 * ── YOLDA ÖMÜR YANAR ─────────────────────────────────────────────────────────
 * FEFO burada körü körüne uygulanmaz: hedefe ulaşım süresi kadar bile ömrü kalmayan parti
 * ÖNERİLMEZ. "En yakın tarihliyi gönder" kuralı, uzağa gönderilen malın yolda bozulmasına yol
 * açar — kural doğru, uygulandığı yer yanlış olurdu.
 *
 * Ama bu bir UYARIDIR, ENGEL DEĞİL: operatör kısa ömürlü partiyi bilerek gönderebilir (hedefte
 * kampanya var, orada hızlı tüketilecek). Sistem bilgiyi verir, kararı almaz.
 *
 * Saf: partileri ve süreyi çağıran verir.
 */

import { daysBetween } from '@lezzet/helper';

export interface TransferBatchInput {
  stockId: string;
  variantId: string;
  /** ISO tarih (YYYY-MM-DD). */
  expiryDate: string;
  /** Partideki fiili miktar. */
  physicalQty: number;
  /** Bu partiye çıpalı aktif rezervasyon (near-expiry teklif satırı). */
  pinnedReservedQty?: number;
}

export interface TransferSuggestionInput {
  batches: readonly TransferBatchInput[];
  /** Varyant başına sevk edilmek istenen miktar. */
  wantedQty: number;
  /** Deponun o varyanttaki kullanılabilir toplamı (fiili − tüm aktif rezervasyon). */
  availableQty: number;
  /** Hedefe ulaşım süresi (gün) — parametrik; ayardan gelir. */
  transitDays: number;
  /** Bugün (ISO tarih) — takvim dışarıdan verilir, motor saat okumaz. */
  today: string;
}

export interface TransferSuggestionLine {
  stockId: string;
  qty: number;
  /** Bu parti hedefe varmadan (ya da varır varmaz) son tarihine giriyor mu. */
  arrivesNearExpiry: boolean;
}

export interface TransferSuggestion {
  lines: readonly TransferSuggestionLine[];
  /** Önerilebilen toplam — istenenden az olabilir. */
  suggestedQty: number;
  /**
   * İstenen karşılanamadıysa sebebi. `insufficient_available` gerçek bir sınırdır (mal sözlü),
   * `no_suitable_batch` ise yalnız ömür uyarısıyla elenen partiler kaldığında doğar — operatör
   * uyarıyı görmezden gelip elle seçebilir.
   */
  shortReason: 'none' | 'insufficient_available' | 'no_suitable_batch';
}

// `daysBetween` `@lezzet/helper`'da (denetim A6). Buradaki yerel tanım ham milisaniyeyi
// `floor`'luyordu — "kaç 24 saat geçti" demekti, "kaç gün sonra" değil. Aynı parti saat kaça göre
// sevkte bozulur ya da bozulmaz görünürdü. Ortak tanım iki ucu da gün başına indiriyor.

/**
 * FEFO sırasında sevk önerisi.
 *
 * Sıra "önce süresi dolan" kalır (depo mantığı değişmez), ama ulaşım süresini geçmeyecek partiler
 * ÖNCE denenir; uygun parti kalmazsa kısa ömürlüler uyarı işaretiyle önerilir — hiç öneri
 * vermemek, operatörü listeyi elle taramaya bırakmak olurdu.
 */
export function transferDecision(input: TransferSuggestionInput): TransferSuggestion {
  const { batches, wantedQty, availableQty, transitDays, today } = input;

  // Sevk kullanılabiliri aşamaz: söz verilmiş mal yola çıkmaz.
  const cap = Math.max(0, Math.min(wantedQty, availableQty));
  if (cap === 0) {
    return { lines: [], suggestedQty: 0, shortReason: 'insufficient_available' };
  }

  const fefo = [...batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const freeQty = (b: TransferBatchInput) => Math.max(0, b.physicalQty - (b.pinnedReservedQty ?? 0));
  const expiresInTransit = (b: TransferBatchInput) => daysBetween(today, b.expiryDate) <= transitDays;

  const lines: TransferSuggestionLine[] = [];
  let remaining = cap;

  // İki tur: önce yolda bozulmayacaklar, sonra (gerekirse) uyarılı olanlar.
  for (const shortLived of [false, true]) {
    for (const b of fefo) {
      if (remaining <= 0) break;
      if (expiresInTransit(b) !== shortLived) continue;
      const takeable = Math.min(freeQty(b), remaining);
      if (takeable <= 0) continue;
      lines.push({ stockId: b.stockId, qty: takeable, arrivesNearExpiry: shortLived });
      remaining -= takeable;
    }
  }

  const suggestedQty = cap - remaining;
  const shortReason =
    suggestedQty >= wantedQty
      ? 'none'
      : cap < wantedQty
        ? 'insufficient_available'
        : 'no_suitable_batch';

  return { lines, suggestedQty, shortReason };
}
