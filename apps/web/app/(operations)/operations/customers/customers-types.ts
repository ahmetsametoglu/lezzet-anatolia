import type { B2bSignal, SignalTone } from '@lezzet/domain-core';
import type { Country, CustomerType, KeysetCursor, OrderStatus, PaymentStatus, PreferredLanguage } from '@lezzet/types';
import type { CustomerScope, CustomersUrlState } from './customers-url';

// Müşteri ekranının view-model'i (09.9). Tipler ŞEMADAN türetilmeye çalışılmaz burada: satır bir
// `UserProfile` değil, onun ekran için indirgenmiş hâlidir (baş harfler türetilir, roller düşer,
// pazarlama izni bu dilimde hiç taşınmaz). Entity'nin kendisi gerektiğinde `UserProfile` kullanılır.

/** Liste satırı — tasarımın üç kolonu (Müşteri · Tip · Durum) bunun üstünde kurulur. */
export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: CustomerType;
  country: Country;
  /** Avatar baş harfleri — addan TÜRETİLİR, saklanmaz. */
  initials: string;
  /** Taslak: WhatsApp telefonuyla kendiliğinden açılmış, eksik bilgili, birleştirme adayı. */
  isDraft: boolean;
  /** B2B self-servis kayıt onayı; B2C'de `null` (sorulmamış bir soru). */
  b2bApproved: boolean | null;
  creditEnabled: boolean;
  /**
   * Vadesi geçmiş açık borcu VAR MI — listedeki kırmızı "Gecikmiş" rozetinin dayanağı.
   *
   * Satırda taşınıyor çünkü tasarım onu LİSTEDE istiyor: gecikmiş müşteriyi bulmak için tek tek
   * seçip panele bakmak gerekmemeli. Kolon değil karar (`isOverdue`), ama sayfanın açık vadeli
   * siparişleri zaten tek turda okuyor (başlık sayacı için) — aynı okumadan üretiliyor, ek tur yok.
   */
  hasOverdue: boolean;
  /** Mailin dili — düzenleme formunun alanı; listede gösterilmez ama satırla birlikte taşınır. */
  preferredLanguage: PreferredLanguage;
  /** Vergi numarası — yalnız şirkette anlamlı; VIES doğrulaması 09.11'in işi. */
  vatNumber: string | null;
  createdAt: string;
}

/**
 * Başlık sayaçları — SUNUCUDAN gelir, yüklenmiş sayfadan türetilmez. Türetilseydi "312 müşteri"
 * yazan şeridin altında 30 satır görünürdü (sipariş ve ürün ekranlarında ölçülüp düzeltilen hata).
 *
 * "Gecikmiş vade" bir kolon DEĞİL, siparişlerden türeyen bir karar (`isOverdue`): açık vadeli
 * siparişlerin tamamı tek turda okunup motora sorulur ve sayılan şey SİPARİŞ değil MÜŞTERİ.
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

/** Müşterinin adresi — rota-içi mi kargo mu, TÜRETİLMİŞ hâliyle. */
export interface CustomerAddressRow {
  id: string;
  label: string | null;
  line: string;
  postalCode: string;
  city: string;
  country: Country;
  isDefault: boolean;
}

/** Bir pazarlama izninin GÖRÜNÜMÜ — salt okunur (GDPR kanıtı: ne zaman, nereden). */
export interface ConsentView {
  granted: boolean;
  at: string | null;
  source: string | null;
}

/** Müşteriye özel kupon — puan çevriminden doğanlar dahil. */
export interface PersonalCouponRow {
  id: string;
  name: string;
  /** Yüzde indirimde oran, sabit tutarda KURUŞ (tür `isPercent` ile ayrılır). */
  value: number;
  isPercent: boolean;
  codes: string[];
  usedCount: number;
  maxUses: number | null;
  validTo: string | null;
  isActive: boolean;
}

/**
 * Seçili müşterinin türetilmiş bilgisi — SEÇİMLE birlikte okunur, listeyle değil.
 *
 * Liste 30 satır getirirken her satır için bu turu atmak N+1'in en pahalı hâli olurdu; tasarım da bu
 * bilgileri satırda değil önizleme panelinde gösteriyor. Yani "yalnız seçileni oku" bir kısıt değil,
 * tasarımın kendi kararı.
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
  discountPercent: number | null;
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
 * `Düzenle` formunun girdisi — şemadan türetilen alanların ekran karşılığı.
 *
 * Son iki alan (kapıda ödeme, indirim oranı) bir tur panelde ayrı ayrı yazılıyordu; forma taşındı
 * (kullanıcı kararı 30.07). Aynı formda olmaları tek kaydetme demek: operatör üç ayrı yazma yerine
 * bir kez onaylıyor.
 */
export interface CustomerEditInput {
  name: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: PreferredLanguage;
  country: Country;
  type: CustomerType;
  vatNumber: string | null;
  codAllowed: boolean;
  /** Genel indirim oranı (%); `null` = oran kaldırılır (liste fiyatına döner). */
  discountPercent: number | null;
}

/** Mükerrer ADAYI — kesinlik iddiası yok; operatör kaydı açıp kendisi karar verir. */
export interface B2bDuplicateRow {
  id: string;
  name: string;
  phone: string | null;
  /** Taslak kayıt (WhatsApp telefonuyla açılmış) — mükerrer adaylarının en sık kaynağı. */
  isDraft: boolean;
}

/**
 * B2B onay KONTROL KARTI — profesyonel müşterinin başvuru diyaloğunun tamamı.
 *
 * Ayrı bir "başvuru" varlığı YOK: onay, müşteri kaydının bir alanıdır (`b2bApproved`) ve kart o kaydın
 * çevresindeki sinyalleri toplar. Bu yüzden tip `CustomerDetail`in içine gömülmedi — detay her seçimde
 * okunuyor, bu ise yalnız diyalog açılınca (dört okuma: profil, adres, bölgeler, mükerrer adayları).
 *
 * `signals`/`flag` tipleri MOTORDAN gelir (`@lezzet/domain-core`), burada yeniden yazılmaz.
 */
export interface B2bCheckView {
  customerId: string;
  name: string;
  /** Resmî künye adı (`company_info.legalName`) — ticari addan farklı olabilir. */
  legalName: string | null;
  siret: string | null;
  country: Country;
  phone: string | null;
  /** Tek satırlık adres; `null` = kayıtlı adresi yok. */
  addressLine: string | null;
  mapsHref: string | null;
  /** `null` = B2C (soru hiç sorulmadı), `false` = onay bekliyor, `true` = onaylı. */
  approved: boolean | null;
  signals: B2bSignal[];
  flag: { label: string; tone: SignalTone };
  duplicates: B2bDuplicateRow[];
}

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

/** İki cihaz görünümünün paylaştığı sözleşme (Sapma 3: tek durum ağacı client kökünde). */
export interface CustomersViewProps {
  data: CustomersData;
  rows: CustomerRow[];
  urlState: CustomersUrlState;
  search: string;
  onSearch: (q: string) => void;
  onScope: (scope: CustomerScope) => void;
  onType: (type: CustomerType | 'all') => void;
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
   * Detay okuması düştüyse sebebi. `detail === null` İKİ ayrı durumu temsil ediyor — "henüz gelmedi"
   * ve "gelemedi" — ve ikisi ekranda ayrı görünmek zorunda: birincisi iskelet, ikincisi hata.
   * Ayrılmadığı sürece düşen bir okuma, boş hâller aracılığıyla yalan söyler.
   */
  detailError: string | null;
  /**
   * Sipariş KARTINA tıklanınca özet diyaloğunu açar (detay sayfasına GİTMEZ).
   *
   * Kartın içindeki sipariş KODU ayrı bir bağdır ve detay sayfasına gider — iki niyet, iki hedef:
   * "şuna bir bakayım" ekranı kaybetmeden, "bunun üzerinde çalışacağım" tam sayfada. Karar
   * kullanıcının (30.07).
   */
  onOpenOrder: (orderId: string) => void;
  /** Vade/limit diyaloğunu açar (web ve mobil aynı diyaloğu paylaşır). */
  onEditCredit: () => void;
  /**
   * Müşteri bilgisi düzenleme diyaloğu — yalnız web (tasarım: geniş form). Kapıda ödeme izni ve
   * indirim oranı da bu formun içinde; panelde canlı kontrol YOK (kullanıcı kararı 30.07).
   */
  onEdit: () => void;
  /**
   * B2B kontrol kartı diyaloğunu açar — eski `/operations/b2b-approvals` sayfasının yerine
   * (kullanıcı kararı 30.07). Yalnız şirket müşterisinde çizilir.
   */
  onOpenB2b: () => void;
  /**
   * YALNIZ limiti yazar (mobilin satır-içi adımlayıcısı). Vade yetkisi ve süresi DEĞİŞMEZ — telefonda
   * yapılan iş "limiti oynat", yetkiyi açıp kapamak değil (tasarımın mobil kuralı).
   */
  onSaveCreditLimit: (cents: number | null) => void;
  /** Yazma işlemi sürüyor (anahtar/kaydet düğmeleri kilitlenir). */
  saving: boolean;
  /** Son yazma hatası — sessiz düşen bir kaydetme, operatörün yanlış sandığı bir limittir. */
  saveError: string | null;
}
