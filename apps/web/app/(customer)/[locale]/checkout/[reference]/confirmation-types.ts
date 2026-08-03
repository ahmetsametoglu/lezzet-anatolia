import type { Locale } from '@lezzet/i18n';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PaymentMethod } from '@lezzet/types';
import type { StorefrontImage } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

export type Messages = LocalizedCopy<typeof messages>;

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
  locale: Locale;
  view: ConfirmationView;
  /** Mobil yerleşim (cihaz forku — `md:` yok). */
  compact: boolean;
}
