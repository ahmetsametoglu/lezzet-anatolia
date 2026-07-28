/**
 * Eksik karşılamada ÖNERİ (10.3) — DOMAIN §8. Saf karar: yazım yok, para gösterimi yok.
 *
 * Depocu bir kalemi tam karşılayamadığında iki yol vardır: **müşteriye sor** ("kalanı göndereyim
 * mi, iptal mi?") ya da **kalanı gönder** (fark otomatik çözülür). Sistem önerir, **kararı insan
 * verir** — tasarımın açık kuralı budur.
 *
 * Ölçüt neden ikili (oran + tutar)? Tek başına oran, 40 €'luk bir kalemin yarısını "önemsiz"
 * sayardı; tek başına tutar, ucuz ama siparişin tamamını oluşturan bir kalemi kaçırırdı. İkisinden
 * biri eşiği aşarsa müşteriye sorulur — yani şüphede insana danışılır.
 *
 * **Tutar buradan DIŞARI ÇIKMAZ.** Karar girdisi olarak kullanılır ama dönen değerde yer almaz:
 * depo ekranı parayı görmemelidir (tasarım: "eksik kararındaki fark iadesi bile tutar olarak
 * gösterilmez"). Motorun cevabı bir tavsiyedir, bir fiyat değil.
 */

export type ShortfallAction = 'ask_customer' | 'send_rest';

export interface ShortfallInput {
  orderedQty: number;
  /** Fiilen toplanabilen adet. 0 = kalem hiç karşılanamadı. */
  pickedQty: number;
  /** Eksik adedin parasal değeri (cent) — yalnız KARAR girdisi; dönen değerde görünmez. */
  missingValueCents: number;
  /** Eşikler `Setting`'ten gelir; varsayılanlar burada (kodda sabit yok, çağıran geçebilir). */
  thresholds?: {
    /** Bu oranı aşan eksik müşteriye sorulur (varsayılan 0.5 — kalemin yarısı). */
    ratio?: number;
    /** Bu tutarı aşan eksik müşteriye sorulur (varsayılan 15 €). */
    valueCents?: number;
  };
}

export interface ShortfallSuggestion {
  action: ShortfallAction;
  /** Öneriyi doğuran sebep — arayüz bunu sade bir cümleye çevirir, tutar yazmadan. */
  reason: 'complete' | 'line_fully_missing' | 'large_share' | 'high_value' | 'minor';
  missingQty: number;
}

const DEFAULT_RATIO = 0.5;
const DEFAULT_VALUE_CENTS = 1_500;

export function suggestShortfallAction(input: ShortfallInput): ShortfallSuggestion {
  const missingQty = Math.max(0, input.orderedQty - input.pickedQty);
  if (missingQty === 0) return { action: 'send_rest', reason: 'complete', missingQty: 0 };

  // Kalemin tamamı eksikse oran hesabına gerek yok: müşteri sipariş ettiği şeyi hiç almayacak.
  if (input.pickedQty === 0) return { action: 'ask_customer', reason: 'line_fully_missing', missingQty };

  const ratio = input.thresholds?.ratio ?? DEFAULT_RATIO;
  const valueCents = input.thresholds?.valueCents ?? DEFAULT_VALUE_CENTS;

  if (missingQty / input.orderedQty > ratio) return { action: 'ask_customer', reason: 'large_share', missingQty };
  if (input.missingValueCents > valueCents) return { action: 'ask_customer', reason: 'high_value', missingQty };

  // Küçük eksik: müşteriyi beklet­mek yerine kalanı gönder, farkı sistem çözer (07.8).
  return { action: 'send_rest', reason: 'minor', missingQty };
}
