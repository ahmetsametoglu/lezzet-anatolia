import type { B2bApplicationStatus } from '@lezzet/domain-core';
import type { Address, Consent, CustomerPriceBasis, CustomerType, KeysetCursor, OrderStatus, PaymentStatus, UserProfile } from '@lezzet/types';
import type { CustomerScope, CustomersUrlState, MarketingChannelFilter } from './customers-url';

// Müşteri ekranının view-model'i: veride duran alan `Pick`lenir, hesaplanan alan yazılır (CLAUDE §1).

/**
 * Liste satırı; varlıktan indirgenir. `b2bApproved` yerine `b2bStatus` taşınır, çünkü `false` hem bekleyeni hem reddedileni
 * anlatır ve ayrımı motor yapar (`b2bStatusOf`).
 */
export type CustomerRow = Pick<
  UserProfile,
  | 'id'
  | 'name'
  | 'phone'
  | 'email'
  | 'type'
  | 'country'
  | 'isDraft'
  | 'creditEnabled'
  | 'preferredLanguage'
  | 'vatNumber'
  | 'createdAt'
  /**
   * GDPR silme damgası; satırda şart, yoksa silinmiş hesap yarım taslakla aynı görünürdü.
   */
  | 'anonymizedAt'
> & {
  /** Başvurunun dört hâli (`none · pending · approved · rejected`) — motordan gelir, ekranda türetilmez. */
  b2bStatus: B2bApplicationStatus;
  /** Avatar baş harfleri — addan TÜRETİLİR, saklanmaz. */
  initials: string;
  /**
   * Vadesi geçmiş açık borç var mı: listedeki "Gecikmiş" rozeti; sayfanın zaten okuduğu açık vadeli siparişlerden türer.
   */
  hasOverdue: boolean;
};

/**
 * Başlık sayaçları sunucudan gelir, yüklenmiş sayfadan türetilmez; "gecikmiş vade" siparişlerden türeyen müşteri sayısıdır.
 */
export interface CustomerCounts {
  total: number;
  draft: number;
  /** Vadesi geçmiş açık borcu olan MÜŞTERİ sayısı (sipariş sayısı değil) — tasarımın üçüncü sayacı. */
  overdue: number;
}

/** Müşterinin son siparişleri — önizleme panelinin alt bloğu; satır sipariş detayına köprüdür. */
export interface CustomerOrderRow {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  totalCents: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  href: string;
}

/**
 * Müşterinin adresi, panelde tek satır: `line` `line1` + `line2`den türer.
 */
export type CustomerAddressRow = Pick<Address, 'id' | 'label' | 'postalCode' | 'city' | 'country' | 'isDefault' | 'isBilling'> & {
  /** `line1` + `line2` — ekran iki kolonu değil, tek okunur adres satırını gösterir. */
  line: string;
};

/**
 * Pazarlama izninin salt okunur görünümü; şemanın kendisi, çünkü GDPR kanıtının kopyası alan düşürebilirdi.
 */
export type ConsentView = Consent;

/** Müşteriye özel kupon — puan çevriminden doğanlar dahil. */
export interface PersonalCouponRow {
  id: string;
  name: string;
  /** Tipine göre biri dolu, öteki `null`. */
  percent: number | null;
  amountCents: number | null;
  codes: string[];
  usedCount: number;
  maxUses: number | null;
  validTo: string | null;
  isActive: boolean;
}

/**
 * Seçili müşterinin türetilmiş bilgisi, seçimle okunur; liste satır başına bu turu atmamalı.
 */
export interface CustomerDetail {
  customerId: string;
  /** Ciro (kuruş) — `order_counts()` toplamı, satır taramadan. */
  revenueCents: number;
  orderCount: number;
  /**
   * Ortalama ödeme günü — sipariş tarihinden İLK tahsilata kaç gün. `null` = hiç tahsilat hareketi
   * yok, yani ÖLÇÜLEMEDİ (sıfır değil: "0 gün" = "anında ödüyor" diye okunur ve vade kararını ters
   * yöne çeker, CLAUDE.md §1).
   */
  avgPaymentDays: number | null;
  /** Ortalamanın kaç siparişten çıktığı — tek siparişlik ortalama karar dayanağı değildir. */
  paidOrderCount: number;
  /**
   * Vadeyi AŞARAK ödenmiş sipariş sayısı (pencere içinde) — "kaç kez geciktirdi".
   * `overdueCount`tan ayrı: o şu anki açık borcu, bu geçmiş alışkanlığı ölçer.
   */
  latePaymentCount: number;
  /** Karnenin baktığı sipariş penceresi; ekran bunu YAZAR (sessiz tavan yok). */
  scorecardWindow: number;
  /** Ödenmemiş vadeli siparişlerin toplamı (kuruş) — borcun TAMAMINDAN. */
  openBalanceCents: number;
  overdueCount: number;
  /** Yürürlükteki vade süresi (gün): müşteriye özel varsa o, yoksa ayardan. */
  termDays: number;
  /** Ayardan gelen GENEL varsayılan — form "boş bırakırsan bu geçerli" derken bunu yazar. */
  defaultTermDays: number;
  /** Müşteriye özel vade süresi — `null` = ayarın varsayılanı geçerli. */
  customTermDays: number | null;
  creditEnabled: boolean;
  /** Vade limiti (kuruş); `null` = limit tanımlı değil (sınırsız DEĞİL — tanımsız). */
  creditLimitCents: number | null;
  codAllowed: boolean;
  /** Genel fiyat kuralı; ikisi birlikte dolu ya da boş. */
  priceRuleBasis: CustomerPriceBasis | null;
  priceRulePercent: number | null;
  /** Fiyat grubu üyeliği; `null` grupsuz, düz B2B liste. */
  priceGroupId: string | null;
  /** Seçenek listesi karta detayla gelir: gruplar Fiyatlar ekranında yönetilir, burada atanır. */
  priceGroupOptions: { id: string; name: string; percentOff: number }[];
  addresses: CustomerAddressRow[];
  consent: { email: ConsentView | null; whatsapp: ConsentView | null };
  /** Puan bakiyesi — TÜRETİLMİŞ (defterden). Puan yalnız B2C'de anlamlı (DOMAIN §14). */
  pointsBalance: number | null;
  personalCoupons: PersonalCouponRow[];
  /** Edinim: ilk siparişteki kaynak + getiren müşterinin adı. */
  acquisitionSource: string | null;
  referredByName: string | null;
  openTicketCount: number;
  ticketCount: number;
  lastOrders: CustomerOrderRow[];
}

/**
 * `Düzenle` formunun girdisi; kapıda ödeme ve fiyat kuralı aynı formda tek kayıtla gider.
 */
export type CustomerEditInput = Pick<
  UserProfile,
  | 'name'
  | 'phone'
  | 'email'
  | 'preferredLanguage'
  | 'country'
  | 'type'
  | 'vatNumber'
  | 'codAllowed'
  /** Genel fiyat kuralı; `null` kuralı kaldırır. */
  | 'priceRuleBasis'
  | 'priceRulePercent'
  /** Fiyat grubu üyeliği; `null` = grupsuz (düz B2B liste). */
  | 'priceGroupId'
>;

/** Vade/limit formunun girdisi. Limit KURUŞ (STACK §8), vade süresi GÜN. */
export interface CreditFormInput {
  creditEnabled: boolean;
  creditLimitCents: number | null;
  paymentTermDays: number | null;
}

export interface CustomersData {
  rows: CustomerRow[];
  nextCursor: KeysetCursor | null;
  counts: CustomerCounts;
}

/** Masaüstü görünümünün sözleşmesi — tek durum ağacı client kökünde. */
export interface CustomersViewProps {
  data: CustomersData;
  rows: CustomerRow[];
  urlState: CustomersUrlState;
  search: string;
  onSearch: (q: string) => void;
  onScope: (scope: CustomerScope) => void;
  onType: (type: CustomerType | 'all') => void;
  /** Pazarlama kanalı — yalnız `scope === 'marketing'` iken çizilir (kapsamı da birlikte yazar). */
  onChannel: (mc: MarketingChannelFilter) => void;
  hasMore: boolean;
  loadingMore: boolean;
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * `loadingMore`dan AYRI: o listenin KUYRUĞU, bu listenin TAMAMININ yenilenmesi.
   */
  navPending: boolean;
  onLoadMore: () => void;
  /** Seçili müşteri kimliği — kayıt taze listeden türetilir (kopya tutulmaz). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Seçili müşterinin türetilmiş bilgisi; okuma sürerken `null`. */
  detail: CustomerDetail | null;
  detailLoading: boolean;
  /**
   * Detay okuması düştüyse sebebi; `detail === null` "henüz gelmedi" ile "gelemedi"yi birlikte taşır, ekran ayırmalı.
   */
  detailError: string | null;
  /**
   * Sipariş kartı özet diyaloğunu açar; kartın içindeki kod ayrı bağdır ve detay sayfasına gider.
   */
  onOpenOrder: (orderId: string) => void;
  /** Vade/limit diyaloğunu açar. */
  onEditCredit: () => void;
  /**
   * Müşteri bilgisi düzenleme diyaloğu; kapıda ödeme izni ve fiyat kuralı da bu formda.
   */
  onEdit: () => void;
  /**
   * B2B kontrol kartı diyaloğu; yalnız şirket müşterisinde çizilir.
   */
  onOpenB2b: () => void;
  /** GDPR silme onay diyaloğunu açar; silinmiş kayıtta düğme çizilmez. */
  onGdprDelete: () => void;
  /** Yazma işlemi sürüyor (anahtar/kaydet düğmeleri kilitlenir). */
  saving: boolean;
  /** Son yazma hatası — sessiz düşen bir kaydetme, operatörün yanlış sandığı bir limittir. */
  saveError: string | null;
}
