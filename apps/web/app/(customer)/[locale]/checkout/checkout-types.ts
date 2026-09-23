import type { AddressCheckOutcome, CheckoutServicePointsOutcome, CheckoutSnapshot } from '@lezzet/application';
import type { Address, PaymentMethod } from '@lezzet/types';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// Ortak ödeme sözlüğü — native ödeme ekranıyla AYNI metin (CLAUDE §2 istisnası, 14.09).
import type checkoutMessages from '@lezzet/i18n/customer/checkout';
import { isSplitCart, type CartView } from '@/lib/cart/cart-types';
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
  /** Sepette seçilen adres — burada değişmez, okunur (13.09). */
  addressId: string | null;
  deliveryDate: string | null;
  /**
   * Seçilen kargo servisinin kodu (07.12) — tutar DEĞİL. Fiyat sunucudan gelir; ekran yalnız
   * hangi seçeneğin işaretli olduğunu tutar.
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
   * Bu sipariş sepetin bir PARÇASI mı — kargo grubundan açıldı VE kapıya giden kalemler sepette
   * kalıyor (19.7 · `isSeparateOrder`). Ekran bunu SÖYLEMEK zorunda: iki checkout birbirinin
   * tıpatıp aynısı görünürse müşteri hangisini verdiğini bilemez ve "kapıya giden kalemlerim
   * nerede" diye sorar. Yalnız kargo kalemi taşıyan sepette ise söylenecek bir şey yok — orada
   * "ayrı sipariş" demek yalan olur.
   */
  separateOrder: boolean;
  /** Girişli müşterinin e-postası — kimlik satırı ("… olarak devam ediyorsunuz") bunu yazar. */
  customerEmail: string;
  busy: boolean;
  error: string | null;
  onSelectDate: (date: string) => void;
  /**
   * Kargo servisi seçimi (07.12) — seçim SUNUCUYA gider ve anlık görüntü yeniden çözülür, çünkü
   * ücret ve toplam ona bağlı. İstemci tarafında bir fiyat hesabı YOKTUR.
   */
  onSelectShipping: (code: string) => void;
  /** Haritadan nokta seçildi: noktanın servisi seçilen servis olur ve ücret yeniden çözülür. */
  onSelectServicePoint: (point: SelectedServicePoint) => void;
  /** Eve teslim ↔ teslim noktası; eve dönülünce nokta bırakılır ve eve giden en ucuz servis seçilir. */
  onSelectShippingMode: (mode: 'home' | 'point') => void;
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
  onConfirm: () => void;
  /** Kart ödemesi seçiliyse ekranın ödeme bloğuna yerleştireceği düğüm; değilse null. */
  paymentSlot: React.ReactNode;
  /** Seçili adresin künyesi — adres adımı, özetteki soğuk zincir cümlesi ve fatura bilgisi için. */
  selectedAddress: Address | null;
  /**
   * Adres doğrulamasının sonucu (11.11) — `null` = söylenecek bir şey yok. Yalnız MÜŞTERİYE
   * söylenecek üç hâl buraya ulaşır: `confirmed` ve `unknown` istemcide elenir.
   */
  addressNotice: AddressCheckOutcome | null;
  /** Teklif kabul edildi — kaydın posta kodu ve şehri düzelir, adres yeniden doğrulanır. */
  onAcceptAddressFix: () => void;
  /** Teklif reddedildi — bir vazgeçiş değil BEYAN; kayıttaki öneri etiketi silinmez. */
  onDismissAddressNotice: () => void;
}

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
 * "AYRI sipariş" bandının ve başlığının tek koşulu (19.7): kargo checkout'u açık VE sepet bölünmüş.
 *
 * **`shippingOrder` tek başına yetmiyor:** sepet yalnız kargo kalemi taşırken de kargo checkout'unu
 * açıyor (`shippingOnly` → `?group=shipping`), çünkü siparişin türü ve ücreti o bayraktan geliyor.
 * Bayrağa bakan bant o sepette "kapıya giden kalemleriniz sepette bekliyor" diyordu — sepette
 * kapıya giden kalem yokken (kullanıcı ölçtü 14.09: "Ev · 67380 · kargoyla", her kalem kargoda).
 * Bayrak kalemleri ve fiyatı belirlemeye devam ediyor; ekrana söyleneni sepetin kendisi belirliyor.
 */
export function isSeparateOrder(shippingOrder: boolean, cart: Pick<CartView, 'lines'>): boolean {
  return shippingOrder && isSplitCart(cart);
}

/** Haritanın noktaları; `off` = sağlayıcı yapılandırılmamış, harita açılmaz. Tip `'use server'` dosyasında durmaz: Turbopack oradaki tip ihracını değer sanıyor. */
export type ServicePointsResult = CheckoutServicePointsOutcome | { status: 'off' };

/** Sunucunun döndürdüğü teslim noktası. */
export type CheckoutServicePoint = Extract<ServicePointsResult, { status: 'ok' }>['points'][number];

/** Haritada seçilen nokta: nokta + onu taşıyan servisin kodu. */
export type SelectedServicePoint = CheckoutServicePoint & { optionCode: string };

type ShippingOption = NonNullable<CheckoutSnapshot['shipping']>['options'][number];

/** Taşıyıcı başına noktaya teslim eden en ucuz servis: haritadaki her nokta kendi taşıyıcısının bu fiyatıyla görünür. */
export function pointOptionsByCarrier(options: readonly ShippingOption[]): Map<string, ShippingOption> {
  const byCarrier = new Map<string, ShippingOption>();
  for (const option of options) {
    if (!option.needsServicePoint) continue;
    const current = byCarrier.get(option.carrierCode);
    if (!current || option.priceCents < current.priceCents) byCarrier.set(option.carrierCode, option);
  }
  return byCarrier;
}

/** Listede seçilebilen servisler: noktaya gidenler listede değil haritada seçilir. BEKLEYEN(K.28): telefon görünümünde harita yok. */
export function selectableShippingOptions<T extends { needsServicePoint: boolean }>(options: readonly T[]): T[] {
  return options.filter((o) => !o.needsServicePoint);
}

/** Teslim noktası türü seçili ama nokta seçilmemiş mi — onay düğmesi ve kart uyarısı aynı sorudan okur. */
export function servicePointMissing(state: Pick<CheckoutState, 'shippingMode' | 'servicePoint'>): boolean {
  return state.shippingMode === 'point' && state.servicePoint === null;
}

/**
 * Harita listesinin sırası: en ucuz başta, aynı fiyattakiler yakından uzağa. Aynı taşıyıcının her noktası aynı fiyatı taşıdığı
 * için bu "en ucuz taşıyıcının en yakın noktaları" demektir. Servisi olmayan taşıyıcının noktası listeye girmez.
 */
export function orderServicePoints(
  points: readonly CheckoutServicePoint[],
  byCarrier: ReadonlyMap<string, { code: string; priceCents: number }>,
): SelectedServicePoint[] {
  return points
    .flatMap((p) => {
      const option = byCarrier.get(p.carrierCode);
      return option ? [{ point: { ...p, optionCode: option.code }, price: option.priceCents }] : [];
    })
    .sort((a, b) => a.price - b.price || (a.point.distanceM ?? Infinity) - (b.point.distanceM ?? Infinity))
    .map((x) => x.point);
}

/**
 * Açılış saatleri, aynı saatlere sahip ardışık günler birleşik: "Pzt–Cmt 08:00 - 12:00 · Paz kapalı". Sağlayıcının günleri
 * "0" pazartesiden başlar; gün adı dilin kendi kısaltmasıdır. Hiç saat yoksa `null` — bilinmiyor, "kapalı" değil.
 */
export function openingLines(times: Record<string, string[]> | null, locale: string, closed: string): string[] | null {
  if (!times || Object.values(times).every((slots) => slots.length === 0)) return null;
  const monday = Date.UTC(2024, 0, 1);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const nameOf = (i: number) => day.format(new Date(monday + i * 86_400_000));
  const hoursOf = (i: number) => {
    const slots = times[String(i)] ?? [];
    return slots.length > 0 ? slots.join(', ') : closed;
  };
  const lines: string[] = [];
  let from = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && hoursOf(i) === hoursOf(from)) continue;
    const range = from === i - 1 ? nameOf(from) : `${nameOf(from)}–${nameOf(i - 1)}`;
    lines.push(`${range} ${hoursOf(from)}`);
    from = i;
  }
  return lines;
}
