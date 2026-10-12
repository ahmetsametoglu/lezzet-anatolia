// Telefonla ya da mesajla gelen siparişin masada yazıldığı ekranın tipleri; para kuruştur (STACK §8). Seçici satırları ve teslim
// bağlamı mobil sipariş girişiyle ortaktır (`staff-order-api.schema.ts`); burada yalnız masanın kendi görünümü durur.
import type { StaffCompanyPreview } from '@lezzet/application/customer/staff-customer';
import type { PaymentMethod, StaffCustomerOption, StaffDelivery, StaffPaymentOptions, StaffVariantRow } from '@lezzet/types';

/** Formdaki bir kalem: seçici satırı + operatörün yazdıkları; satışa kapalı satır kaleme dönmediği için liste fiyatı kesindir. */
export type NewOrderLine = Pick<StaffVariantRow, 'variantId' | 'title' | 'imageUrl' | 'costCents' | 'targetMarginPercent' | 'vatRate'> & {
  qty: number;
  /** Motorun çözdüğü liste fiyatı — pazarlık izinin "neydi" tarafı; ekranda üstü çizili gösterilir. */
  listPriceCents: number;
  /** Operatörün yazdığı fiyat. Liste ile eşitse pazarlık YOKTUR ve iz de yazılmaz. */
  unitPriceCents: number;
};

/** Masanın teslim bağlamı: adresin teslimi ve sepet boşken açık yöntemler; kesin tavan kontrolü sipariş yazılırken yapılır. */
export type DeliveryContext = StaffDelivery &
  Pick<StaffPaymentOptions, 'creditAvailable'> & {
    paymentMethods: PaymentMethod[];
  };

/** SIRET yazılınca okunan önizleme; aynı SIRET'li kayıtlar seçici satırı olarak gelir ki tek dokunuşla seçilsin. */
export type CompanyPreview = Omit<StaffCompanyPreview, 'existing'> & { existing: StaffCustomerOption[] };
