import type { Address, PaymentMethod } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { CartView } from '@/lib/cart/cart-types';
/**
 * Adres girdisinin şekli ORTAK forma aittir (`components/customer/delivery/address-form`) — checkout
 * ile hesap sayfası aynı formu kullanıyor. Tip de orada yaşar; burada yalnız yeniden dışa açılır,
 * iki tanım bir gün ayrışırdı (CLAUDE.md §1).
 */
import type { AddressDefaults, NewAddressInput } from '@/components/customer/delivery/address-form';
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
  /**
   * Seçilen kargo servisinin kodu (07.12) — tutar DEĞİL. Fiyat sunucudan gelir; ekran yalnız
   * hangi seçeneğin işaretli olduğunu tutar.
   */
  shippingOptionCode: string | null;
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
  /**
   * YENİ adres formunun ön-dolu açılacağı künye (kullanıcı kararı 22.08) — hesabın adı ve numarası.
   * `undefined` = kimlik okunamadı; alanlar boş açılır ve müşteriden istenir.
   *
   * Kuralı ekran KURMAZ, `addressDefaultsOf` üretir: hesap sayfası da aynı kaynaktan besleniyor ve
   * iki yerde elle yazılsaydı biri bir gün telefonu ham E.164 geçirirdi.
   */
  addressDefaults: AddressDefaults | undefined;
  busy: boolean;
  error: string | null;
  onSelectAddress: (id: string) => void;
  onSelectDate: (date: string) => void;
  /**
   * Kargo servisi seçimi (07.12) — seçim SUNUCUYA gider ve anlık görüntü yeniden çözülür, çünkü
   * ücret ve toplam ona bağlı. İstemci tarafında bir fiyat hesabı YOKTUR.
   */
  onSelectShipping: (code: string) => void;
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

/**
 * Siparişin verilememe SEBEBİ — sepettekinin checkout karşılığı (`lib/cart` → `cartBlockReason`).
 *
 * **Neden ayrı bir birlik:** buradaki engeller sepettekilerin üstüne iki tane daha ekliyor ve
 * ikisi de ADRESİN cevabı — teslimat çözülemiyor (`delivery.blocked`: rota dışı + soğuk zincir)
 * ve adres hiç seçilmemiş. Sepet bunları soramaz, çünkü sepette adres yok.
 *
 * **Neden tek yerde:** aynı karar iki yerde AYRI yazılmıştı ve ikisi tutmuyordu —
 * `OrderSummary` beş koşula bakıyor, kart ödemesinin formu üçüne. Yani sepette gönderilemeyen bir
 * kalem varken kartsız yolun düğmesi pasifken **kart formu açık kalıyordu**: müşteri kart
 * bilgilerini giriyor, basıyor ve reddi ancak sunucudan öğreniyordu. Para açığı değil (sunucu
 * `confirmCheckoutAction`'da aynı kontrolü yapıyor ve reddediyor), ama gereksiz bir emek ve iki
 * yoldan biri müşteriye önceden söylüyor, öteki söylemiyordu.
 *
 * **Sıra anlamlı:** önce "cevap yok" hâlleri (sepet okunamadı, adres seçilmedi) — bunlar
 * bilinmezliktir, hüküm değil; sonra teslimat, en sonra tutar. Sepetteki sıranın aynısı: kalem
 * çıkarılınca tutar da değişir.
 */
// Sepet tarafındaki eşiyle aynı gerekçeyle dışa açılmıyor: bugün sebebi adıyla anan çağıran yok
// (`!== null` yetiyor), `checkout_blocked` atıcısı (08.9) geldiğinde açılır.
type CheckoutBlockReason = 'cart_unreachable' | 'address_missing' | 'undeliverable_line' | 'min_basket';

export function checkoutBlocker(input: {
  cartFailed: boolean;
  /** Sepet görünümünün "çıkarılmadan geçilemez satır var" cevabı. */
  cartHasBlocked: boolean;
  snapshot: CheckoutSnapshot;
  addressId: string | null;
}): CheckoutBlockReason | null {
  if (input.cartFailed) return 'cart_unreachable';
  // Ödeme bloğu adresin cevabıdır: adres yokken `null` gelir ve o hâl bir engel DEĞİL, henüz
  // sorulmamış bir sorudur — adı da onu söylemeli.
  if (!input.addressId || !input.snapshot.payment) return 'address_missing';
  if (input.snapshot.delivery?.blocked || input.cartHasBlocked) return 'undeliverable_line';
  if (!input.snapshot.payment.minBasketOk) return 'min_basket';
  return null;
}
