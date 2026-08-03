import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { ProductScore } from '@lezzet/domain-core';
import type { StorefrontProductDetail, StorefrontVariant } from '@/lib/storefront/storefront-types';
import type { PublishedReview } from '@/lib/feedback/product-feedback';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Ürün detay tip/sözleşme modülü (view DEĞİL — gerçek view'lar product.desktop/product.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Yorum bölümünün TEK girdisi — sunucuda çözülüp aşağı iner.
 *
 * Bileşen sunucu bileşeni OLAMAZ (`product-client` cihaz çatalı için `'use client'`), bu yüzden
 * veri sayfada okunur ve prop olarak geçer. Kendi başına bir action çağırmak her ürün sayfasında
 * ikinci bir tur atmak olurdu.
 */
/**
 * "Tüm yorumlar" panelinin sayfa boyu — tasarımın kuralı ("Sayfalama 10'ar").
 *
 * Ürün detayındaki `REVIEW_PAGE_SIZE = 3` ile karıştırılmamalı: o **seçki**, bu **liste**. İkisi
 * ayrı sayılar çünkü ayrı sorulara cevap veriyorlar — sayfadaki üç yorum bir tadımlık, paneldeki
 * on tane okunacak bir küme.
 *
 * Burada duruyor çünkü iki taraf da okuyor: server action (sorgu limiti) ve panel (footer'daki
 * "N / M gösteriliyor" sayısı). Action dosyası `'use server'` olduğu için sabit orada duramaz —
 * o dosya yalnız async fonksiyon dışa verebilir.
 */
export const REVIEW_PANEL_PAGE_SIZE = 10;

export interface ReviewsData {
  score: ProductScore;
  /** İlk sayfa — tasarım ürün detayında ÜÇ yorum gösteriyor. */
  reviews: PublishedReview[];
  /** Onaylı yorum sayısı; "tümü" bağlantısı buna bakar. */
  total: number;
  /** Bu müşteri bu ürüne yazabilir mi (satın almış ve girişli). */
  canReview: boolean;
  /** Yazdıysa formu ikinci kez açmayız — düzenleme akışı ayrı bir iştir. */
  alreadyWrote: boolean;
}

export interface ProductViewProps {
  t: Messages;
  locale: Locale;
  product: StorefrontProductDetail;
  /** Seçili boy — stok rozeti, fiyat ve besin tablosunun net ağırlığı bundan türer. Varyantsız ürün yok. */
  selected: StorefrontVariant | null;
  onSelect: (variantId: string) => void;
  reviews: ReviewsData;
}
