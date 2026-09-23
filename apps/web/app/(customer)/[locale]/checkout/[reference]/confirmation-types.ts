import type { CardPaymentState } from '@lezzet/domain-core';
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
 * Checkout ailesinin ortak sözcükleri aile kökünden okunur (onay ekranı checkout'un devamı); sipariş özetinin sözcükleri ise
 * sepet ve sipariş detayında da çizildiği için nötr bir sözlükte.
 */
export type SharedCopy = LocalizedCopy<typeof checkoutMessages>;

/**
 * Sipariş alındı ekranının görünüm modeli: sunucuda bir kez çözülür, iki cihaz dalı aynı türetilmiş cevapları okur. Tutarlar cent.
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
   * Sağlayıcı ödemesinin iade damgası, `null` = iade yok. İptal sebebi "para geri verildi mi" sorusunu cevaplamaz; damga
   * tarih, çünkü müşteriye iade günü söylenebilmeli.
   */
  refundedAt: string | null;
  /** "Bankanızdan onay bekliyoruz" YALNIZ kart ödemesinde doğru; kapıda ödemede beklenen banka yok. */
  awaitingCard: boolean;
  /**
   * Sağlayıcının söylediği, yalnız ödemesi beklenen kart taslağında: `paid` para alındı, `processing` banka işliyor, `incomplete`
   * tamamlanmadı. `null` = sorulamadı, ekran "onaylanıyor"da kalır.
   */
  paymentState: CardPaymentState | null;
  onRoute: boolean;
  /** Gel-al: müşteri depodan alır — gün yok, kargo yok; kart depoyu ve aranacak numarayı yazar. */
  pickup: { warehouseName: string; addressLine: string; phoneDisplay: string } | null;
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
  /**
   * Komşu daveti; `null` = kargo, kesinleşmemiş sipariş ya da kesimi dolmuş sefer. Tek nesne, çünkü adres varsa kontenjan da
   * vardır; `remainingUses` sunucuda sayılır, sıfır "doldu" demektir.
   */
  neighborInvite: { url: string; remainingUses: number; maxUses: number } | null;
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
