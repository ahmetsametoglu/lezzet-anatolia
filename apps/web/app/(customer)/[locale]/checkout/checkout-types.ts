import type { AddressCheckOutcome, CheckoutSnapshot } from '@lezzet/application';
import type { Address, CheckoutServicePoints, PaymentMethod } from '@lezzet/types';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// Telefon görünümü native ödeme ekranıyla aynı metni kullanır (CLAUDE §2).
import type checkoutMessages from '@lezzet/i18n/customer/checkout';
import { entryOf, isSplitCart, type CartEntry, type CartLine, type CartView } from '@/lib/cart/cart-types';
import type messages from './messages.json';

/** Sayfa metinleri — şekli JSON'un kendisinden TÜRER, elle interface yazılmaz (CLAUDE.md §2). */
export type Messages = (typeof messages)['tr'];

/** Telefon görünümünün metni — `@lezzet/i18n/customer/checkout` (web'e özgü cümleler `Messages`ta kalır). */
export type CheckoutCopy = LocalizedCopy<typeof checkoutMessages>;

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
  /** Sepette seçilen adres — burada değişmez, okunur. */
  addressId: string | null;
  deliveryDate: string | null;
  /**
   * Seçilen kargo servisinin kodu, tutar değil: fiyat sunucudan gelir, ekran yalnız işaretli seçeneği tutar.
   */
  shippingOptionCode: string | null;
  /** Haritadan seçilen teslim noktası ve onun servisi; eve teslimde `null`. */
  servicePoint: SelectedServicePoint | null;
  /** Müşterinin seçtiği teslim türü; `point` iken nokta seçilmeden sipariş onaylanmaz. */
  shippingMode: 'home' | 'point';
  paymentMethod: PaymentMethod | null;
  /** Vadeli satın alma işaretlendi mi — ödeme yöntemi değil, siparişin bayrağı. */
  onAccount: boolean;
  marketingConsent: boolean;
}

export interface CheckoutViewProps extends StepProps {
  cart: CartView;
  snapshot: CheckoutSnapshot;
  state: CheckoutState;
  /**
   * Bu sipariş sepetin bir parçası mı (`isSeparateOrder`): iki checkout aynı görünürse müşteri hangisini verdiğini bilemez.
   * Yalnız kargo kalemi taşıyan sepette "ayrı sipariş" demek yanlış olur.
   */
  separateOrder: boolean;
  /** Girişli müşterinin e-postası — kimlik satırı ("… olarak devam ediyorsunuz") bunu yazar. */
  customerEmail: string;
  busy: boolean;
  error: string | null;
  onSelectDate: (date: string) => void;
  /**
   * Kargo servisi seçimi sunucuya gider ve anlık görüntü yeniden çözülür, çünkü ücret ve toplam ona bağlı; istemcide fiyat
   * hesabı yok.
   */
  onSelectShipping: (code: string) => void;
  /** Haritadan nokta seçildi: noktanın servisi seçilen servis olur ve ücret yeniden çözülür. */
  onSelectServicePoint: (point: SelectedServicePoint) => void;
  /** Eve teslim ↔ teslim noktası; eve dönülünce nokta bırakılır ve eve giden en ucuz servis seçilir. */
  onSelectShippingMode: (mode: 'home' | 'point') => void;
  onSelectPayment: (method: PaymentMethod, onAccount: boolean) => void;
  onToggleConsent: (value: boolean) => void;
  /**
   * Sepetin ilk okuması bitti mi: özet kalem satırlarını sepetten çizer ve okuma bitmeden boş özet "siparişiniz yok" gibi
   * okunur.
   */
  cartReady: boolean;
  /**
   * Sepet okuması düştü mü; `cartReady`den ayrı, çünkü biri "cevap geldi" öbürü "cevap gelmedi" der. Ayrılmasa düşen okuma
   * kalemsiz bir özet ve etkin bir onay düğmesi çizerdi.
   */
  cartFailed: boolean;
  /**
   * Adım verisinin (adres · teslimat · ödeme) ilk okuması bitti mi: bitmeden adım çizmek henüz bilinmeyen bir hüküm verdirir.
   */
  snapshotReady: boolean;
  onConfirm: () => void;
  /** Kart ödemesi seçiliyse ekranın ödeme bloğuna yerleştireceği düğüm; değilse null. */
  paymentSlot: React.ReactNode;
  /** Seçili adresin künyesi — adres adımı, özetteki soğuk zincir cümlesi ve fatura bilgisi için. */
  selectedAddress: Address | null;
  /**
   * Adres doğrulamasının sonucu; `null` söylenecek bir şey yok demektir, `confirmed` ve `unknown` istemcide elenir.
   */
  addressNotice: AddressCheckOutcome | null;
  /** Teklif kabul edildi — kaydın posta kodu ve şehri düzelir, adres yeniden doğrulanır. */
  onAcceptAddressFix: () => void;
  /** Teklif reddedildi — bir vazgeçiş değil BEYAN; kayıttaki öneri etiketi silinmez. */
  onDismissAddressNotice: () => void;
}

/**
 * Siparişin verilememe sebebi, sepettekinin checkout karşılığı: adresin seçilmemesi ve teslimatın çözülememesi yalnız burada
 * sorulur. Kart formu ve onay düğmesi aynı karardan okur; sıra önce bilinmezlik (sepet, adres), sonra teslimat, en son tutar.
 */
type CheckoutBlockReason = 'cart_unreachable' | 'address_missing' | 'undeliverable_line' | 'min_basket' | 'service_point_missing';

export function checkoutBlocker(input: {
  cartFailed: boolean;
  /** Sepet görünümünün "çıkarılmadan geçilemez satır var" cevabı. */
  cartHasBlocked: boolean;
  snapshot: CheckoutSnapshot;
  addressId: string | null;
  /** Teslim noktası seçildi ama nokta yok; verilmezse sorulmaz (telefon görünümünde nokta seçimi yok). */
  pointMissing?: boolean;
}): CheckoutBlockReason | null {
  if (input.cartFailed) return 'cart_unreachable';
  // Ödeme bloğu adresin cevabıdır: adres yokken `null` gelir ve o hâl bir engel DEĞİL, henüz
  // sorulmamış bir sorudur — adı da onu söylemeli.
  if (!input.addressId || !input.snapshot.payment) return 'address_missing';
  if (input.snapshot.delivery?.blocked || input.cartHasBlocked) return 'undeliverable_line';
  if (!input.snapshot.payment.minBasketOk) return 'min_basket';
  if (input.pointMissing) return 'service_point_missing';
  return null;
}

/**
 * Ödeme okumasına ve siparişe giden kalemler sepetin tamamıdır, çünkü siparişin grubunu sunucu seçer ve bu adrese gelemeyen kalemi
 * özette üstü çizili gösterebilmek için onu görmesi gerekir.
 */
export function checkoutEntriesOf(lines: readonly CartLine[]): CartEntry[] {
  return lines.map(entryOf);
}

/**
 * "Ayrı sipariş" bandının koşulu: kargo checkout'u açık ve sepet bölünmüş. `shippingOrder` tek başına yetmez, çünkü yalnız
 * kargo kalemi taşıyan sepet de kargo checkout'unu açar ve orada kapıda bekleyen kalem yoktur.
 */
export function isSeparateOrder(shippingOrder: boolean, cart: Pick<CartView, 'lines'>): boolean {
  return shippingOrder && isSplitCart(cart);
}

/** Listede seçilebilen servisler: noktaya gidenler listede değil haritada seçilir. BEKLEYEN(K.28): telefon görünümünde harita yok. */
export function selectableShippingOptions<T extends { needsServicePoint: boolean }>(options: readonly T[]): T[] {
  return options.filter((o) => !o.needsServicePoint);
}

/** Haritanın noktaları; `off` = sağlayıcı yapılandırılmamış, harita açılmaz. Tip `'use server'` dosyasında durmaz: Turbopack oradaki tip ihracını değer sanıyor. */
export type ServicePointsResult = CheckoutServicePoints;

/** Sunucunun döndürdüğü teslim noktası. */
export type CheckoutServicePoint = Extract<ServicePointsResult, { status: 'ok' }>['points'][number];

/** Haritada seçilen nokta: nokta + türünü kabul eden servisin kodu. */
export type SelectedServicePoint = CheckoutServicePoint & { optionCode: string };

/** Teslim noktası türü seçili ama nokta seçilmemiş mi — onay düğmesi ve kart uyarısı aynı sorudan okur. */
export function servicePointMissing(state: Pick<CheckoutState, 'shippingMode' | 'servicePoint'>): boolean {
  return state.shippingMode === 'point' && state.servicePoint === null;
}
