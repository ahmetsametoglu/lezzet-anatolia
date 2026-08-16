import type { StockAdjustmentReason } from '@lezzet/types';

// İmha/fire sebep sözlüğü — İKİ yüzeyin ortak metni (16.08): stok ekranının çıkışlar sekmesi ve
// ürünler önizlemesinin stok bakışı (parti geçmişi paneli) aynı Türkçeyi basar. `stock-labels`tan
// taşındı; oradaki re-export sayfa içi kullanım yerlerinin yolunu korur.

/** İmha/fire sebebinin Türkçesi — DB enum'u operatöre ham görünmez. */
export const LOSS_REASON: Record<StockAdjustmentReason, string> = {
  expired: 'Tarihi geçti',
  damaged: 'Hasar / soğuk zincir',
  count_diff: 'Sayım farkı',
  lost: 'Kayıp',
  return_restock: 'İade → stoğa döndü',
};
