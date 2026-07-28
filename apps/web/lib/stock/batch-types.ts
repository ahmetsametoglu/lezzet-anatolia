import type { StockBatchDetail } from '@lezzet/types';
import type { ExpiryFlag, OfferDecision } from '@lezzet/domain-core';

// Parti görünümünün TİPİ ayrı dosyada: türetmesi (`batch-view`) `server-only` ve DB servisine
// bağlı, ama tipi client komponentlerinin de görmesi gerekiyor (teklif diyaloğu, kartlar). Tek
// dosyada dursaydı client tarafı sunucu modülünü sürüklerdi.

/**
 * Parti satırı — `StockBatchDetail`'i türetir, üstüne SUNUCUDA verilmiş kararları ekler.
 *
 * `listPriceCents` ve `suggestedOfferCents` yalnız karar bekleyen partilerde doludur: fiyat okuması
 * yalnız onlar için yapılır. Fiyatı girilmemiş varyantta ikisi de `null` — sayı UYDURULMAZ, ekran
 * eksikliği söyler.
 */
export type BatchView = StockBatchDetail & {
  /** Ürün ve boy adı çözülmüş hâlde ("Fıstıklı Baklava · 1 kg") — dil yedek zinciri tek yerde. */
  title: string;
  productName: string;
  variantLabel: string;
  flag: ExpiryFlag;
  decision: OfferDecision;
  /** Kalan raf ömrü %; ürünün toplam raf ömrü girilmemişse `null` (eşik kararı verilmez). */
  remainingPercent: number | null;
  /** Son tarihe kalan gün — geçmişse negatif. */
  daysLeft: number;
  /** Girişte MLOR eşiğinin altında kabul edilmiş mi — teklif kararına bağlam. */
  belowMlor: boolean;
  listPriceCents: number | null;
  suggestedOfferCents: number | null;
  offerPriceCents: number | null;
  purchasePriceCents: number | null;
  /**
   * Kararın verildiği EŞİKLER, satırla birlikte taşınır (`Setting`, 0016). Ekran bunları yeniden
   * okumaz ve sabit yazmaz: "%30 indirim öneriliyor" ile "MLOR eşiğinin (%75) altında" cümlelerinin,
   * kararı üreten sayının aynısını söylemesi gerekir. Ayar değişince metin de değişir.
   */
  offerDiscountPercent: number;
  mlorPercent: number;
};
