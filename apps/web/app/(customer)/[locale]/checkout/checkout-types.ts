import type { Address, PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { CartView } from '@/lib/cart/cart-types';
/**
 * Adres girdisinin şekli ORTAK forma aittir (`components/customer/delivery/address-form`) — checkout
 * ile hesap sayfası aynı formu kullanıyor. Tip de orada yaşar; burada yalnız yeniden dışa açılır,
 * iki tanım bir gün ayrışırdı (CLAUDE.md §1).
 */
import type { NewAddressInput } from '@/components/customer/delivery/address-form';
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
  /**
   * Sepetin KARGO grubundan açılan ikinci sipariş mi (19.7). Ekran bunu SÖYLEMEK zorunda: iki
   * checkout birbirinin tıpatıp aynısı görünürse müşteri hangisini verdiğini bilemez ve "kapıya
   * giden kalemlerim nerede" diye sorar. Cevap sepette bekliyor olmaları — ama söylenmezse
   * kaybolmuş gibi okunur.
   */
  shippingOrder: boolean;
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
  /**
   * Sepet okuması DÜŞTÜ mü. `cartReady` ile karıştırılmaz: biri "cevap geldi", öbürü "cevap
   * gelmedi". Ayrımı yapmayan checkout, okuma düşünce kalemsiz ve 0,00 €'luk bir özet çizip
   * "Siparişi onayla"yı ETKİN bırakıyordu — müşteri basınca `empty_cart` reddi alıyordu.
   * Sepet sayfası bu ayrımı zaten yapıyor (`CartUnreachable`), checkout yapmıyordu (29.07 denetimi).
   */
  cartFailed: boolean;
  /**
   * Adım verisinin (adres · teslimat · ödeme) ilk okuması bitti mi. Üçü de seçili adresin cevabı ve
   * istemcide çözülüyor; bitmeden adım çizmek "kayıtlı adresiniz yok" gibi HENÜZ BİLİNMEYEN bir
   * hüküm verdiriyordu.
   */
  snapshotReady: boolean;
  onAddAddress: (input: NewAddressInput) => Promise<void>;
  /** Var olan adresi düzenle — checkout'tan çıkmadan (kullanıcı bildirimi, 01.08). */
  onUpdateAddress: (addressId: string, input: NewAddressInput) => Promise<void>;
  onConfirm: () => void;
  /** Adım 0 doğrulandı — sayfa tazelenir, adımlar açılır. */
  onVerified: () => void;
  /** Kart ödemesi seçiliyse ekranın ödeme bloğuna yerleştireceği düğüm; değilse null. */
  paymentSlot: React.ReactNode;
  /** Seçili adresin künyesi — özetteki soğuk zincir cümlesi ve fatura bilgisi için. */
  selectedAddress: Address | null;
}


export type { NewAddressInput };
