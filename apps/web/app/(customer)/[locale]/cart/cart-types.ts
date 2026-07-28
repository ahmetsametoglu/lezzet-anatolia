import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { EmptyCartContext } from '@/lib/cart/empty-cart';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Sepet tip/sözleşme modülü (view DEĞİL — gerçek view'lar cart.desktop/cart.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface CartViewProps {
  t: Messages;
  locale: Locale;
  /**
   * Boş sepetin öneri alanı. Sunucuda okunur ve sepet DOLU olsa da taşınır: sayfa boş olup
   * olmadığını sunucuda bilemez (ziyaretçinin sepeti tarayıcıda yaşar), tasarım ise boş ekranın
   * TEK ADIMDA gelmesini istiyor — ikinci tura bırakılsa kahraman çizilir, öneri sonradan patlardı.
   */
  emptyContext: EmptyCartContext;
}
