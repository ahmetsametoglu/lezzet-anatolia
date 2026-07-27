import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontProductDetail } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Ürün detay tip/sözleşme modülü (view DEĞİL — gerçek view'lar product.desktop/product.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface ProductViewProps {
  t: Messages;
  locale: Locale;
  product: StorefrontProductDetail;
}
