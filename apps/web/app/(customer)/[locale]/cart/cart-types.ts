import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { EmptyCartContext } from '@/lib/cart/empty-cart';
import type { CustomerAwaitingPayment } from '@/lib/order/customer-orders';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
// Ortak sepet sözlüğü — native sepetle AYNI metin (CLAUDE §2 istisnası, 14.09); aynı gerekçeyle değer bağı.
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
   * Boş sepetin öneri alanı. Sunucuda okunur ve sepet DOLU olsa da taşınır: sayfa boş olup
   * olmadığını sunucuda bilemez (ziyaretçinin sepeti tarayıcıda yaşar), tasarım ise boş ekranın
   * TEK ADIMDA gelmesini istiyor — ikinci tura bırakılsa kahraman çizilir, öneri sonradan patlardı.
   */
  emptyContext: EmptyCartContext;
  /**
   * Ödemesi beklenen kart siparişi (07.18) — sunucuda okunur, yalnız girişli müşteride dolu. Sepet ancak
   * sipariş onaylanınca boşalıyor: ödemenin sonucu gelmemişken dolu sepet "hiç ödemedim" gibi okunuyordu
   * (kullanıcı bildirimi 14.09). Bant durumu sepetin başında söyler ve ödeme sayfasına götürür.
   */
  awaitingPayment: CustomerAwaitingPayment | null;
}
