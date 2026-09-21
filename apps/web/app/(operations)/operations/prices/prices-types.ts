// Fiyat ekranı view-model'leri; kararlar sunucuda verilir ve satırla taşınır ki marjın tanımı tek yerde kalsın.
// Para cent taşınır (STACK §8); b2c KDV dahil, b2b hariç.
import type { Channel, CustomerPriceBasis, DiscountScope, DiscountTrigger, DiscountType, KeysetCursor, LocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { BatchView } from '@/lib/stock/batch-types';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { PriceScope, PriceTab } from './prices-url';

// Fiyat satırı tipleri `lib/pricing/price-rows`ta; buradaki yeniden ihraç sayfanın import yollarını korur.
export type { PriceRow } from '@/lib/pricing/price-rows';

/** Müşteriye özel fiyat satırı — çözüm sırasının en üstündeki basamak. */
export interface CustomerPriceRow {
  priceId: string;
  customerId: string;
  customerName: string;
  /** B2B mi (şirket bilgisi dolu) — satırın altındaki bağlam. */
  isCompany: boolean;
  variantId: string;
  variantTitle: string;
  channel: Channel;
  specialCents: number;
  /** Aynı kanalın liste fiyatı — özel fiyatın ne kadar altında olduğu görünsün. `null` = liste yok. */
  listCents: number | null;
  /** Karar bağlamı (bkz. `VariantOption`): düzenlerken de "bu fiyatla ne kalıyor" görünmeli. */
  costCents: number | null;
  vatRate: number;
  targetMarginPercent: number | null;
  validFrom: string;
}

/**
 * Genel fiyat kuralı tanımlı müşteri; kural burada yazılmaz, yalnız kimlerde olduğu izlenir (sahibi müşteri kaydıdır).
 */
export interface PriceRuleCustomerRow {
  customerId: string;
  customerName: string;
  isCompany: boolean;
  basis: CustomerPriceBasis;
  percent: number;
}

/**
 * Fiyat grubu satırı (B2B alt kademesi); üye sayısı "silebilir miyim" ve "kaç müşteri etkilenir" sorularına cevap verir.
 */
export interface PriceGroupRow {
  id: string;
  name: string;
  /** B2B listeden düşülen yüzde. */
  percentOff: number;
  memberCount: number;
}

/** Kuponun bir kapısı: kod, hangi dil için yazıldığı ve kaç kez tuttuğu. */
export interface DiscountCodeRow {
  id: string;
  code: string;
  /** Kodun dili; `null` = dilden bağımsız. */
  locale: Locale | null;
  /** Bu kapıdan kaç kez girildi — kotayı BÖLMEZ, kuralın toplamının içindedir. */
  usedCount: number;
}

/**
 * İndirim satırı — kural + ÇÖZÜLMÜŞ bağlam. Kapsam hedefinin adı, kişisel kuponun sahibi ve kullanım
 * sayısı satırla birlikte gelir: liste "kategori: <uuid>" ya da "3/10 kullanıldı" diye yazamıyorsa
 * operatör kuralı okumak için başka ekrana gitmek zorunda kalır.
 */
export interface DiscountRow {
  id: string;
  name: string;
  /** Müşteriye görünen ad — düzenleme formunu doldurur; verilmemişse `null`. */
  publicLabel: LocalizedText | null;
  trigger: DiscountTrigger;
  /**
   * Kuponun kodları; hepsi aynı kotayı açar, her kod kaç kez tuttuğunu taşır. Kampanyada boş dizi.
   */
  codes: DiscountCodeRow[];
  type: DiscountType;
  /** Tipine göre biri dolu, öteki `null`: yüzde oran, sabit tutar cent. */
  percent: number | null;
  amountCents: number | null;
  scope: DiscountScope;
  /** Kapsam hedefinin adı ("Baklava"); sepet kapsamında boş. */
  scopeName: string;
  /**
   * Kapsam hedefinin kimliği; ad insan için, kimlik form için. Yalnız ad taşınsa kapsamlı kural düzenlenemezdi.
   */
  categoryId: string | null;
  collectionId: string | null;
  minBasketCents: number | null;
  firstOrderOnly: boolean;
  validFrom: string | null;
  validTo: string | null;
  /** Kişisel kuponun sahibi — herkese açıksa `null`. */
  customerName: string | null;
  maxUses: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  isActive: boolean;
  /**
   * Kural BUGÜN uygulanabilir mi — pasiflik, tarih aralığı ve kullanım tavanı birlikte. Ekran
   * "Aktif" yazıp uygulanmayan bir kupon göstermemeli: operatör sorunu ancak müşteri şikâyet
   * edince öğrenirdi.
   */
  liveNow: boolean;
  /** Neden yürürlükte değil — tek cümle ("kullanım sınırı doldu"). Yürürlükteyse boş. */
  dormantReason: string;
}

// `DiscountFormInput` formun kendi dosyasındadır, çünkü girdiyi üreten `discountInputOf` orada ve form iki yüzeyin ortağı.

/** Kategori seçeneği — süzgeç menüsünü besler (tavanı sınırlı, tek turda gelir). */
export interface CategoryOption {
  id: string;
  name: string;
}

/**
 * Özel fiyat formunun boy seçeneği — havuz DİYALOG AÇILINCA okunur, sayfa açılışında değil.
 * Katalogun tamamını her sayfa yüklemesinde taşımanın karşılığı yok; seçici yalnız form açılınca
 * gerekiyor (paket formunun deseni).
 */
export interface VariantOption {
  variantId: string;
  title: string;
  /** Pasif/aday ürünün boyu — seçilebilir ama ekran bunu söyler. */
  sellable: boolean;
  /**
   * KARAR BAĞLAMI — özel fiyat verilirken "kâr mı zarar mı" sorusunun cevabı bu üç alandan çıkar:
   * kanal listesi (indirim mi zam mı), maliyet ve hedef marj (bu fiyatla ne kalıyor).
   * Seçicinin okuması zaten sunucuda; aynı turda gelmezlerse operatör sayısız karar verir.
   */
  listCents: Record<Channel, number | null>;
  /** Yenileme maliyeti (kuruş) — ekranın geri kalanıyla AYNI taban (`readCostBasis`). */
  costCents: number | null;
  vatRate: number;
  targetMarginPercent: number | null;
}

/**
 * Başlık sayaçları, yüklenmiş sayfadan; marj SQL süzgecine çevrilemez ve ekran kapsamını yazar.
 */
export interface PriceCounts {
  /** Görünen satır sayısı (yüklenmiş sayfalar). */
  rows: number;
  priced: number;
  below: number;
  missing: number;
}

/**
 * Vitrinde görünmeyen aktif ürün sayısı, kanal başına; `PriceCounts.missing` sayfadaki boyları, bu katalogdaki ürünleri sayar.
 */
export interface HiddenFromStorefront {
  b2c: number;
  b2b: number;
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface PricesData {
  /** Fiyat listesinin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır. */
  rows: PriceRow[];
  nextCursor: KeysetCursor | null;
  /** Şu an geçerli TÜM özel fiyatlar — sayfalanmaz (admin'in eliyle büyüyen küme). */
  customerPrices: CustomerPriceRow[];
  priceRuleCustomers: PriceRuleCustomerRow[];
  /** Fiyat grupları; sayfalanmaz, operatörün eliyle büyür. */
  priceGroups: PriceGroupRow[];
  /**
   * Karar bekleyen TÜM partiler — sayfalanmaz. Stok ekranıyla AYNI kaynaktan (`toBatchViews`) gelir;
   * bir partiyi kaçırmak imhalık malı satmaktır.
   */
  offers: BatchView[];
  /** Kupon ve otomatik kampanyalar — sayfalanmaz (operatörün eliyle büyüyen küme). */
  discounts: DiscountRow[];
  categories: CategoryOption[];
  /** Kapsam seçicisinin koleksiyon seçenekleri — yalnız kupon sekmesi okunduğunda dolu. */
  collections: CategoryOption[];
  /** Vitrinde görünmeyen ürün sayısı; yalnız kanal sekmesinde dolu. */
  hiddenFromStorefront: HiddenFromStorefront | null;
}

/** prices-client'ın tuttuğu durum + eylemler; masaüstü görünümü bunu tüketir. */
export interface PricesViewProps {
  data: PricesData;
  /** Süzgeçten geçmiş liste (`data.rows` ham ilk sayfadır — sayaçlar ondan çıkar). */
  rows: PriceRow[];
  counts: PriceCounts;
  tab: PriceTab;
  onTab: (t: PriceTab) => void;
  search: string;
  onSearch: (q: string) => void;
  catFilter: string;
  onCatFilter: (id: string) => void;
  scope: PriceScope;
  onScope: (s: PriceScope) => void;
  hasMore: boolean;
  loadingMore: boolean;
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * `loadingMore`dan AYRI: o listenin KUYRUĞU, bu listenin TAMAMININ yenilenmesi.
   */
  navPending: boolean;
  onLoadMore: () => void;
  /** Fiyat diyaloğunu bu boy için aç. */
  onEdit: (variantId: string) => void;
  /** Özel fiyat diyaloğu: satır verilirse düzenleme, `null` ise yeni kayıt. */
  onEditCustomerPrice: (row: CustomerPriceRow | null) => void;
  /** Fiyat grubu diyaloğu: satır verilirse düzenleme, `null` ise yeni grup. */
  onEditPriceGroup: (row: PriceGroupRow | null) => void;
  /** Teklif diyaloğunu bu parti için aç — stok ekranıyla aynı diyalog, aynı karar. */
  onOpenOffer: (stockId: string) => void;
  /** İndirim formu: satır verilirse düzenleme, `null` ise yeni kural. */
  onEditDiscount: (row: DiscountRow | null) => void;
}

