import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { ProductScore } from '@lezzet/domain-core';
import type { StorefrontProductDetail, StorefrontVariant } from '@lezzet/application';
import type { PublishedReview } from '@lezzet/types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

export type Messages = LocalizedCopy<typeof messages>;

/** Yorum bölümünün tek girdisi; sayfada okunup prop olarak iner, çünkü bileşen istemci tarafındadır. */
export interface ReviewsData {
  score: ProductScore;
  /** İlk sayfa, en yeni yorumlar. */
  reviews: PublishedReview[];
  /** Onaylı yazılı yorum sayısı; "tümü" bağlantısı buna bakar. */
  total: number;
  /** Bu müşteri bu ürüne yazabilir mi (satın almış ve girişli). */
  canReview: boolean;
  /** Yazdıysa form ikinci kez açılmaz. */
  alreadyWrote: boolean;
}

export interface ProductViewProps {
  t: Messages;
  locale: Locale;
  product: StorefrontProductDetail;
  /** Seçili boy — stok rozeti, fiyat ve besin tablosunun net ağırlığı bundan türer. Varyantsız ürün yok. */
  selected: StorefrontVariant | null;
  onSelect: (variantId: string) => void;
  /** Bakılan çeşidin aile içi etiketi ("Fıstıklı") — ailesiz üründe null. Boy başlığına bağlam verir. */
  familyLabel: string | null;
  /** Ürün hiç alınamıyor — çeşit bloğunun başlığı ve aktif işareti buna bakar (`family-block`). */
  unavailable: boolean;
  reviews: ReviewsData;
}
