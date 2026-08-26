// Elle sipariş girişi (09.8) — TELEFONLA/DM'den gelen siparişin masada yazıldığı ekranın tipleri.
//
// **Yerinde satış BURADA DEĞİL** (kullanıcı kararı 26.08): depo kapısında ve kuryenin aracından
// yapılan satış native uygulamanın kurye/depo bölümünün işi — `DOMAIN §17` "Admin yerinde satış
// yapmaz". Bu ekranın müşterisi telefondadır, malı kuryeyle ya da kargoyla gidecektir.
//
// Para her yerde KURUŞ (STACK §8).
import type { Channel, CustomerType, PaymentMethod } from '@lezzet/types';

/** Müşteri arama sonucu — operatör telefonu ya da adı yazarak bulur. */
export interface CustomerPickOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: CustomerType;
  /**
   * Fiyatın okunacağı GEÇERLİ kanal — onaysız şirket B2C'dir (`effectiveChannelOf`, DOMAIN §10).
   * Ekran bunu yalnız GÖSTERİR ("B2B fiyatları"); karar sunucuda verilir ve fiyat da orada çözülür.
   */
  channel: Channel;
  /** Doğrulanmamış kayıt (WhatsApp/elle açılmış) — operatör kimin karşısında olduğunu bilmeli. */
  isDraft: boolean;
}

/** Müşterinin adresi — sipariş deposu ve teslimat günü bundan çözülür. */
export interface AddressPickOption {
  id: string;
  /** Tek satır künye: "1 rue du Marché, 67000 Strasbourg". */
  label: string;
  recipient: string;
}

/**
 * Kalem seçicisinin satırı — **fiyat MÜŞTERİYE GÖRE çözülmüş** gelir (özel → grup → kanal).
 *
 * Maliyet ve hedef marj da burada: marj-altı uyarısı operatör fiyatı yazarken anında çıkmalı ve
 * her tuşta sunucuya gitmek o uyarıyı kullanılamaz yapardı. Üçü de yalnız KARAR GİRDİSİDİR;
 * kararın kendisini motor verir (`isBelowTargetMargin`).
 */
export interface VariantPickRow {
  variantId: string;
  title: string;
  /** Müşteriye çözülmüş liste fiyatı (kanal tabanında); `null` = bu müşteriye satışa kapalı. */
  listPriceCents: number | null;
  /** Yenileme maliyeti (HT); `null` = ölçülemedi — marj uyarısı o hâlde SUSAR, sıfır varsaymaz. */
  costCents: number | null;
  /** Kanalın geçerli hedef marjı (`targetMarginFor`); `null` = hedef tanımlı değil. */
  targetMarginPercent: number | null;
  vatRate: number;
  /** Siparişin deposunda kullanılabilir adet; `null` = depo henüz belli değil (adres seçilmemiş). */
  availableQty: number | null;
}

/** Formdaki bir kalem — seçilen ürün + operatörün yazdıkları. */
export interface NewOrderLine {
  variantId: string;
  title: string;
  qty: number;
  /** Motorun çözdüğü liste fiyatı — pazarlık izinin "neydi" tarafı; ekranda üstü çizili gösterilir. */
  listPriceCents: number;
  /** Operatörün yazdığı fiyat. Liste ile eşitse pazarlık YOKTUR ve iz de yazılmaz. */
  unitPriceCents: number;
  costCents: number | null;
  targetMarginPercent: number | null;
  vatRate: number;
}

/** Sunucunun adresten çözdüğü teslimat — gün listesi ve yöntem kümesi ekranın uyduracağı şeyler değil. */
export interface DeliveryContext {
  deliveryType: 'route' | 'shipping';
  /** Rota içi teslimatın yaklaşan günleri; kargoda BOŞ — tarih taşıyıcıya bağlı, söz verilmez. */
  availableDates: string[];
  /** Bu müşteri + adres için AÇIK ödeme yöntemleri (motor söyler; kapıda ödeme tavanı dahil). */
  paymentMethods: PaymentMethod[];
  /** Vadeli satış açık mı — profilin yetkisi ve limiti motorda çözülür. */
  creditAvailable: boolean;
  /** Siparişin çıkacağı depo (adresin posta kodundan) — kalem seçicisinin stok sayısı buna bağlı. */
  warehouseId: string | null;
}

/** Yeni müşteri kaydı — telefonla gelen müşterinin hesabı olmayabilir, o yüzden auth'suz açılır. */
export interface NewCustomerInput {
  name: string;
  phone: string;
  email: string | null;
  type: CustomerType;
}

/** Yeni adres — alıcı ve telefon ZORUNLU (22.08): kurye kapıda kimi soracağını bilmek zorunda. */
export interface NewAddressInput {
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
}
