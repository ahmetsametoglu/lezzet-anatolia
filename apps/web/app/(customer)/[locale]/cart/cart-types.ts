import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { EmptyCartContext } from '@/lib/cart/empty-cart';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
// Ortak sepet sözlüğü, native sepetle aynı metin; aynı gerekçeyle değer bağı.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import cartMessages from '@lezzet/i18n/customer/cart';

// Sepet tip/sözleşme modülü (view DEĞİL — gerçek view'lar cart.desktop/cart.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/** Telefon görünümünün metni — `@lezzet/i18n/customer/cart` (web'e özgü cümleler `Messages`ta kalır). */
export type CartCopy = LocalizedCopy<typeof cartMessages>;

export interface CartViewProps {
  t: Messages;
  locale: Locale;
  /**
   * Masaüstü boş sepetinin öneri alanı: sunucu sepetin boş olup olmadığını bilemez ve tasarım boş ekranın tek adımda gelmesini
   * istediği için sepet doluyken de okunur. Telefon çatalı onu kullanmaz, orada önerisiz hâli gelir.
   */
  emptyContext: EmptyCartContext;
}
