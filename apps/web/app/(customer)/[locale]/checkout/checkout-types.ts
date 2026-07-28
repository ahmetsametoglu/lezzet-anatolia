import type { Address, PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { CartView } from '@/lib/cart/cart-types';
import type { CheckoutSnapshot } from './actions';
import type messages from './messages.json';

/** Sayfa metinleri — şekli JSON'un kendisinden TÜRER, elle interface yazılmaz (CLAUDE.md §2). */
export type Messages = (typeof messages)['tr'];

/**
 * Üç adımın ortak sözleşmesi. Masaüstü ve mobil AYNI blokları çizer, yalnız yerleşim ayrışır
 * (cihaz forku bir yerleşim kararıdır, mantık kararı değil) — bu yüzden bloklar `compact`
 * bayrağıyla tek yerde yazılır ve iki dosyada kopyalanmaz.
 */
interface StepProps {
  t: Messages;
  locale: Locale;
  compact?: boolean;
}

/** Ekranın tuttuğu tüm seçim durumu — tek nesne, çünkü üçü birbirini etkiliyor. */
export interface CheckoutState {
  addressId: string | null;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod | null;
  /** Vadeli satın alma işaretlendi mi — ödeme yöntemi değil, siparişin bayrağı. */
  onAccount: boolean;
  marketingConsent: boolean;
}

export interface CheckoutViewProps extends StepProps {
  cart: CartView;
  snapshot: CheckoutSnapshot;
  state: CheckoutState;
  /** Doğrulanmış oturum var mı — yoksa "adım 0" çizilir, sonrakiler soluk başlıklarıyla bekler. */
  authenticated: boolean;
  /** Girişli müşterinin e-postası — kimlik satırı ("… olarak devam ediyorsunuz") bunu yazar. */
  customerEmail: string;
  busy: boolean;
  error: string | null;
  onSelectAddress: (id: string) => void;
  onSelectDate: (date: string) => void;
  onSelectPayment: (method: PaymentMethod, onAccount: boolean) => void;
  onToggleConsent: (value: boolean) => void;
  /**
   * Sepetin ilk okuması bitti mi. Özet kalem satırlarını sepetten çiziyor; okuma bitmeden orada
   * boş bir kutu göstermek "sipariş özetiniz yok" gibi okunuyordu — iskelet çizilir.
   */
  cartReady: boolean;
  onAddAddress: (input: NewAddressInput) => Promise<void>;
  onConfirm: () => void;
  /** Adım 0 doğrulandı — sayfa tazelenir, adımlar açılır. */
  onVerified: () => void;
  /** Kart ödemesi seçiliyse ekranın ödeme bloğuna yerleştireceği düğüm; değilse null. */
  paymentSlot: React.ReactNode;
  /** Seçili adresin künyesi — özetteki soğuk zincir cümlesi ve fatura bilgisi için. */
  selectedAddress: Address | null;
}

/**
 * Yeni adres — alan sırası **K33** (envanter) ile birebir ve SABİT:
 * başlık · alıcı adı · sokak ve numara · kapı/kat/zil · posta kodu + şehir · telefon · ülke · varsayılan.
 */
export interface NewAddressInput {
  /** "Ev", "İş" — kart başlığı olur; boş bırakılabilir, o zaman şehir başlık olur. */
  label?: string;
  /** Alıcı: adrese GİDEN kişi, hesabın sahibi olmak zorunda değil (hediye, iş adresi). */
  recipient?: string;
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  phone?: string;
  /** Ülke K33'te SALT OKUNUR ("Fransa") — bugün tek ülkeye teslim ediyoruz, seçim sunmak yalan olurdu. */
  makeDefault?: boolean;
}
