import type { StockMovementKind, StockWriteOffReason } from '@lezzet/types';

// Hareket sözlüğü — İKİ yüzeyin ortak metni (16.08): stok ekranının çıkışlar/mal kabul sekmeleri ve
// ürünler önizlemesinin stok bakışı (parti geçmişi paneli) aynı Türkçeyi basar. `stock-labels`tan
// taşındı; oradaki re-export sayfa içi kullanım yerlerinin yolunu korur.
//
// **İKİ SÖZLÜK, çünkü veride iki seviye var** (06.14): hareketin TİPİ (ne oldu) ve imhanın SEBEBİ
// (neden). Eskiden tek `LOSS_REASON` vardı ve içinde birbirine benzemeyen şeyler yan yanaydı —
// "Tarihi geçti" bir sebep, "Sayım farkı" bir olaydı; ekran ikisini aynı şeritte gösterdiği için
// operatör de aynı türden sanıyordu.

/** Hareket tipinin Türkçesi — DB enum'u operatöre ham görünmez. */
export const MOVEMENT_KIND: Record<StockMovementKind, string> = {
  intake: 'Mal kabul',
  transfer_in: 'Sevkiyat kabulü',
  transfer_out: 'Sevk',
  transfer_cancel: 'Sevk geri alındı',
  sale: 'Siparişe çıktı',
  counter_sale: 'Kapı satışı',
  return_restock: 'İade → stoğa döndü',
  write_off: 'Fire',
  count_diff: 'Sayım farkı',
};

/** İmhanın sebebi — yalnız `write_off` satırlarında dolu. */
export const WRITE_OFF_REASON: Record<StockWriteOffReason, string> = {
  expired: 'Tarihi geçti',
  damaged: 'Hasar / soğuk zincir',
  lost: 'Kayıp',
};

/**
 * Satırın operatöre söyleyeceği tek cümle: imhada SEBEBİ, ötekilerde TİPİ.
 *
 * "Fire" tek başına yetmiyor — depocunun sorduğu şey *neden* çöpe gitti; ama sayım farkının sebebi
 * yok ve olmayan bir alanı boş göstermek yerine tipin kendisi konuşuyor.
 */
export function movementLabel(kind: StockMovementKind, reason: StockWriteOffReason | null): string {
  return kind === 'write_off' && reason ? WRITE_OFF_REASON[reason] : MOVEMENT_KIND[kind];
}
