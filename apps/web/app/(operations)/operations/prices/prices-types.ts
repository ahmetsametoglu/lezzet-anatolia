// Fiyat ekranı view-model'leri (09.5) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: gerçekleşen marj, hedefin altında olup
// olmadığı, hangi kanalın dar olduğu — hepsi `domain-core/pricing`'in cevabıdır. Client yeniden
// hesaplasaydı marjın TANIMI iki yerde yaşardı; proje tek tanım kullanır (DOMAIN "hedef marj").
//
// Para ekranda hep KURUŞ (cent) taşınır (STACK §8). Kanalın tabanı farklıdır ve bu bilgi satırda
// yazılıdır: b2c KDV DAHİL, b2b hariç — ikisini aynı sayı sanmak marjı kaydırır.
import type { Channel, KeysetCursor, ProductStatus } from '@lezzet/types';
import type { PriceScope, PriceTab } from './prices-url';

/** Bir kanalın liste fiyatı — kendi tabanında. `null` = o kanalda fiyat YOK (satışa kapalı). */
export interface ChannelPriceCell {
  amountCents: number | null;
  /** Fiyatın geçerlilik başlangıcı — "ne zamandan beri bu fiyat" sorusu ekranda yanıtlanabilsin. */
  validFrom: string | null;
}

/**
 * Fiyat listesinin satırı — satır BOYDUR (satılabilir birim), ama kararın yarısı üründen gelir
 * (KDV oranı, hedef marj, otomatik fiyat anahtarı).
 */
export interface PriceRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  /** Listede görünen tam ad — "Fıstıklı Baklava · 1 kg". */
  title: string;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa fiyatı yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  b2c: ChannelPriceCell;
  b2b: ChannelPriceCell;
  /**
   * Eldeki partilerin ağırlıklı ortalama alış fiyatı (KDV hariç). `null` = hiç fiyatlı parti yok —
   * "bilmiyorum", sıfır değil: maliyeti sıfır saymak marjı sonsuz gösterirdi.
   */
  costCents: number | null;
  /** Kanallar içindeki EN DAR marj — uyarının ölçütü (bkz. `tightestMargin`). */
  marginPercent: number | null;
  /** Dar marjın hangi kanaldan geldiği — tek sayının hangi fiyata ait olduğu görünsün. */
  marginChannel: Channel | null;
  targetMarginPercent: number | null;
  /** Hedefin altında mı; maliyet ya da hedef bilinmiyorsa karar YOKTUR (`null`). */
  belowTarget: boolean | null;
  autoPrice: boolean;
  /** Ürünün KDV oranı (yüzde) — diyalog marjı bu tabana göre çevirir. */
  vatRate: number;
  /** En az bir kanalda fiyat yok — "o kanalda satışa kapalı" göstergesi. */
  missingPrice: boolean;
}

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
  validFrom: string;
}

/**
 * Genel indirim oranı tanımlı müşteri — çözüm sırasının İKİNCİ basamağı. Oran burada yazılmaz,
 * yalnız kimlerde olduğu izlenir (oranın sahibi müşteri kaydıdır).
 */
export interface DiscountCustomerRow {
  customerId: string;
  customerName: string;
  isCompany: boolean;
  discountPercent: number;
}

/** Kategori seçeneği — süzgeç menüsünü besler (tavanı sınırlı, tek turda gelir). */
export interface CategoryOption {
  id: string;
  name: string;
}

/**
 * Başlık sayaçları. **Yüklenmiş sayfa üzerinden** hesaplanır ve ekran bunu böyle söyler: marj bir
 * karardır, SQL süzgecine çevrilemez; tüm katalogun marjını saymak katalogun tamamını taşımak
 * demektir. Tam sayım ayrı bir tur (okuma fonksiyonu) — o gelene kadar sayaç, yalan söylemek
 * yerine kapsamını yazar.
 */
export interface PriceCounts {
  /** Görünen satır sayısı (yüklenmiş sayfalar). */
  rows: number;
  priced: number;
  below: number;
  missing: number;
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface PricesData {
  /** Fiyat listesinin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır. */
  rows: PriceRow[];
  nextCursor: KeysetCursor | null;
  /** Şu an geçerli TÜM özel fiyatlar — sayfalanmaz (admin'in eliyle büyüyen küme). */
  customerPrices: CustomerPriceRow[];
  discountCustomers: DiscountCustomerRow[];
  categories: CategoryOption[];
}

/** prices-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir. */
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
  onLoadMore: () => void;
  /** Fiyat diyaloğunu bu boy için aç. */
  onEdit: (variantId: string) => void;
}

/**
 * Listede görünen tam ad. Boy adı BOŞ olabilir (tek boylu üründe varsayılan varyantın etiketi
 * boştur) — o zaman ayraç da yazılmaz.
 */
export function titleOf(productName: string, variantLabel: string): string {
  return variantLabel ? `${productName} · ${variantLabel}` : productName;
}
