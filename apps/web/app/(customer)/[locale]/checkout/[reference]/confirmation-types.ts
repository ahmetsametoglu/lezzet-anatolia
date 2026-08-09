import type { Locale } from '@lezzet/i18n';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PaymentMethod } from '@lezzet/types';
import type { StorefrontImage } from '@lezzet/application';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import checkoutMessages from '../messages.json';

export type Messages = LocalizedCopy<typeof messages>;

/**
 * **Checkout AİLESİNİN ortak sözcükleri — aile kökünden okunur** (08.20).
 *
 * "Kapıya teslim · ücretsiz / Kargo" ve "Ödeme" başlığı iki ekranda da aynı blokun kelimeleri;
 * onay ekranı bunların birebir kopyasını taşıyordu. Kopya sessizce ayrışır: checkout'ta bir
 * kelimeyi değiştiren, onay ekranının eskisinde kaldığını göremez.
 *
 * Aile kökünün sözlüğü okunuyor, üçüncü bir dosya AÇILMADI: desen `support`ta zaten var (alt rota
 * `../messages.json`'u okur) ve buradaki ilişki de aynı — onay ekranı checkout'un devamı.
 *
 * ⚠ **SİPARİŞ ÖZETİNİN sözcükleri artık BURADAN GELMİYOR** (08.20'nin ikinci turu, 08.08):
 * "Sipariş özeti · İndirim · Teslimat · Ücretsiz · Genel toplam · KDV dahildir" nötr bir sözlüğe
 * taşındı (`components/customer/ui/summary-messages.json`). Aile bağı DOĞRUYDU ama YETMİYORDU:
 * aynı blok sepette ve sipariş detayında da çiziliyor ve o ikisi checkout ailesinin dışında.
 * Onları buraya bağlamak, sipariş geçmişini ödeme akışına bağımlı kılardı.
 *
 * **Kalan üçü checkout'a ÖZGÜ:** `delivery.route`/`delivery.shipping` teslimat seçeneğinin kendi
 * cümleleri, `payment.title` ödeme adımının başlığı. Bunlar sipariş detayında yok.
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
   * **Sağlayıcı ödemesinin İADE DAMGASI** — `null` ise iade yok (07.14).
   *
   * Bulunan arıza şuydu: iptal edilmiş her siparişte ekran *"Ödeme tamamlanmadı — kartınızdan
   * tahsilat yapılmadı"* diyordu. Üç yolun ikisinde doğru, birinde YANLIŞ: parası çekilip
   * **otomatik iade edilmiş** siparişte de aynı cümle çıkıyordu. İade ekstreye günler sonra düşer;
   * o aralıkta müşteri "tahsilat yapılmadı" okur ama hesabında para eksiktir.
   *
   * **İlk çözüm iptal SEBEBİNİ okuyordu ve yetmiyordu** — ölçüldü: `out_of_stock` iki ayrı yolda
   * yazılıyor (kartta para çekilmiş, kapıda ödemede hiç çekilmemiş), ayrıca webhook'un "zaten iptal
   * edilmiş siparişe geç gelen ödeme" dalı parayı iade ederken sebebi `superseded` bırakıyordu —
   * yani düzeltilen yalanın dar bir kopyası orada duruyordu. Arka uç kolonu ikiye ayırdı: sebep
   * "neden iptal oldu" sorusunun, damga "para çekilip geri verildi mi" sorusunun cevabı.
   *
   * **Bayrak değil TARİH:** "ekstremde görünmüyor" diyen müşteriye iade tarihi söylenebilsin.
   */
  refundedAt: string | null;
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
 * **Soruyu SEBEBE değil DAMGAYA soruyoruz** ve arada bir tur var: kural önce
 * `out_of_stock + online` diye kurulmuştu, çünkü elimizdeki tek alan iptal sebebiydi. O ikili bugün
 * de doğru cevap verirdi ama EKSİK kalırdı — parayı iade eden ikinci webhook dalı sebebi
 * `superseded` bırakıyor. Damga iki dalın da geçtiği tek ayakta yazılıyor (`refundProviderPayment`,
 * iadeden SONRA), yani "para geri verildi mi" sorusunun tek dayanağı var.
 *
 * `cancelled` koşulu duruyor: damga bugün yalnız iptal edilmiş siparişlerde doğuyor, ama cümleyi
 * kuran şey iptaldir — ayakta bir siparişe geçmiş bir iade damgası yüzünden iptal cümlesi kurulmaz.
 */
export function isRefundedCancellation(view: Pick<ConfirmationView, 'cancelled' | 'refundedAt'>): boolean {
  return view.cancelled && view.refundedAt !== null;
}
