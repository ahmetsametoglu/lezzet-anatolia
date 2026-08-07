import type { Locale } from '@lezzet/i18n';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { OrderCancelReason, PaymentMethod } from '@lezzet/types';
import type { StorefrontImage } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import checkoutMessages from '../messages.json';

export type Messages = LocalizedCopy<typeof messages>;

/**
 * **Sipariş özetinin ORTAK sözcükleri — aile kökünden okunur** (08.20).
 *
 * "Sipariş özeti · İndirim · Teslimat · Ücretsiz · Genel toplam · Fiyatlara KDV dahildir" ile
 * "Kapıya teslim · ücretsiz / Kargo" ve "Ödeme" başlığı iki ekranda da AYNI blokun kelimeleri;
 * onay ekranı bunların birebir kopyasını taşıyordu (üç dilde 30 satır). Kopya sessizce ayrışır:
 * checkout'ta "Genel toplam"ı değiştiren, onay ekranının eski kelimede kaldığını göremez — üstelik
 * iki bloku ÇİZEN komponent zaten ortak (`SummaryRow`).
 *
 * Aile kökünün sözlüğü okunuyor, üçüncü bir dosya AÇILMADI: desen `support`ta zaten var (alt rota
 * `../messages.json`'u okur) ve buradaki ilişki de aynı — onay ekranı checkout'un devamı.
 *
 * **Tamamı taşınmadı, taşınamazdı:** `summary` isim alanının yarısı checkout'a özel (`submit`,
 * `terms`, `minBasket`, `coldChain`…) ve `delivery.title` iki ekranda FARKLI ("Teslimat günü" ile
 * "Teslimat"). Taşınan yalnız üç dilde de birebir aynı olanlar.
 */
export type SharedCopy = LocalizedCopy<typeof checkoutMessages>;

/**
 * Sipariş alındı ekranının GÖRÜNÜM MODELİ — sunucuda bir kez çözülür, iki cihaz dalı aynı nesneyi
 * okur (08.13 · cihaz forku).
 *
 * **Ham `Order` taşınmıyor** ve bu bilinçli: ekranın sorduğu şey "sipariş kesinleşti mi", "kart
 * bekleniyor mu", "kapıya mı gidiyor" — hepsi durum makinesinden TÜRETİLMİŞ cevaplar. Türetmeyi
 * iki dala bırakmak, aynı kuralın iki kopyasını doğururdu; ikisi bir gün ayrışır ve mobil ekran
 * masaüstünden farklı bir gerçek anlatırdı.
 *
 * Tutarlar CENT: `formatPrice` cent bekliyor ve euro/cent dönüşümü tek yerde (sunucuda) yapılır.
 */
export interface ConfirmationView {
  /** Yolda taşınan kimlik SİPARİŞ KİMLİĞİDİR — takip bağı da bununla kurulur. */
  orderId: string;
  /** Referans numarası ancak ilk kalıcı durumda doğar; taslakta `null`. */
  referenceNo: string | null;
  createdAt: string;
  /** Sipariş KESİNLEŞTİ mi (taslak değil, iptal değil) — "ödendi" ile aynı şey DEĞİL (DOMAIN §7). */
  placed: boolean;
  cancelled: boolean;
  /**
   * **İptalin SEBEBİ** (07.14) — ekran iptalde buna göre farklı cümle kurar.
   *
   * Bulunan arıza şuydu: iptal edilmiş her siparişte ekran *"Ödeme tamamlanmadı — kartınızdan
   * tahsilat yapılmadı"* diyordu. Üç yolun ikisinde doğru, birinde YANLIŞ: stok kalmadığı için
   * parası çekilip **otomatik iade edilmiş** siparişte de aynı cümle çıkıyordu. İade ekstreye
   * günler sonra düşer; o aralıkta müşteri "tahsilat yapılmadı" okur ama hesabında para eksiktir.
   *
   * **Sebep TEK BAŞINA yetmiyor ve bu ölçüldü.** `cancel_reason = 'out_of_stock'` iki ayrı yolda
   * yazılıyor: webhook'un iade dalında (kart — para çekildi) ve kapıda/vadeli ödemede rezervasyon
   * tutmayınca (`checkout/actions.ts` — para HİÇ çekilmedi, sipariş `draft`ta kaldı). Sebebi tek
   * başına okuyup "iade edildi" demek, ikinci yolda yeni bir yalan üretirdi. Ayrım ödeme
   * yöntemiyle birlikte kuruluyor: **`out_of_stock` + `online`**.
   *
   * `null` sebep nötr cümleye düşer — "sebep yazılmadı" demek, "tahsilat yapılmadı" demek değil.
   */
  cancelReason: OrderCancelReason | null;
  /** "Bankanızdan onay bekliyoruz" YALNIZ kart ödemesinde doğru; kapıda ödemede beklenen banka yok. */
  awaitingCard: boolean;
  onRoute: boolean;
  deliveryDate: string | null;
  onAccount: boolean;
  /** Taslak siparişte yöntem henüz seçilmemiş olabilir — `null` "kart değil" demektir, "kapıda" değil. */
  paymentMethod: PaymentMethod | null;
  totalCents: number;
  discountCents: number;
  /** Kampanya adı SİPARİŞTEKİ kopyadan çözülmüş hâliyle; boşsa satır genel adında kalır. */
  discountName: string;
  shippingFeeCents: number;
  /** Müşterinin ADI (ilk ad kutlama başlığında) ve e-postası — profilden, sipariş satırından değil. */
  customerFirstName: string;
  customerEmail: string;
  /** Adresin ANLIK GÖRÜNTÜSÜ: müşteri adresini sonradan düzenlerse bu sipariş nereye gittiğini unutmaz. */
  address: { label?: string; line1?: string; line2?: string; postalCode?: string; city?: string } | null;
  lines: ConfirmationLine[];
}

export interface ConfirmationLine {
  id: string;
  name: string;
  /** Varyant etiketi ("500 g") — yoksa yalnız adet yazılır. */
  unit: string;
  image: StorefrontImage | null;
  qty: number;
  lineTotalCents: number;
}

/** İki cihaz dalının ortak sözleşmesi — yerleşim ayrışır, veri ayrışmaz. */
export interface ConfirmationViewProps {
  t: Messages;
  /** Aile kökünün sözlüğü — özetin ortak sözcükleri (künye yukarıda). */
  shared: SharedCopy;
  locale: Locale;
  view: ConfirmationView;
  /** Mobil yerleşim (cihaz forku — `md:` yok). */
  compact: boolean;
}

/**
 * **Parası iade edilmiş bir iptal mi** — onay ekranının iptalde hangi cümleyi kuracağı (07.14).
 *
 * Saf ve ayrı bir fonksiyon, çünkü bu kural bir kez YANLIŞ kuruldu: ekran yalnız "iptal mi" diye
 * sorup üç yolun hepsine *"kartınızdan tahsilat yapılmadı"* diyordu. Kuralı bir satır ifade olarak
 * sayfanın içinde bırakmak, aynı yanlışın ikinci kez sessizce kurulmasına açık kapı bırakırdı.
 *
 * **İki koşul birden şart.** `out_of_stock` sebebi İKİ ayrı yolda yazılıyor:
 *   · webhook'un iade dalı — kart, para çekildi ve geri verildi
 *   · kapıda/vadeli ödemede rezervasyon tutmadı — para HİÇ çekilmedi, sipariş `draft`ta kaldı
 * Sebebi tek başına okumak ikincisinde yeni bir yalan üretirdi.
 */
export function isRefundedCancellation(view: Pick<ConfirmationView, 'cancelled' | 'cancelReason' | 'paymentMethod'>): boolean {
  return view.cancelled && view.cancelReason === 'out_of_stock' && view.paymentMethod === 'online';
}
