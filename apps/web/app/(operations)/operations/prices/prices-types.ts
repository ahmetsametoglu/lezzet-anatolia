// Fiyat ekranı view-model'leri (09.5) — RSC okur, serileştirilebilir bu tiplere indirger; client
// yalnız bunları görür.
//
// KARARLAR SUNUCUDA verilir ve satırla birlikte taşınır: gerçekleşen marj, hedefin altında olup
// olmadığı, hangi kanalın dar olduğu — hepsi `domain-core/pricing`'in cevabıdır. Client yeniden
// hesaplasaydı marjın TANIMI iki yerde yaşardı; proje tek tanım kullanır (DOMAIN "hedef marj").
//
// Para ekranda hep KURUŞ (cent) taşınır (STACK §8). Kanalın tabanı farklıdır ve bu bilgi satırda
// yazılıdır: b2c KDV DAHİL, b2b hariç — ikisini aynı sayı sanmak marjı kaydırır.
import type { Channel, DiscountScope, DiscountTrigger, DiscountType, KeysetCursor, LocalizedText, ProductStatus } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { BatchView } from '@/lib/stock/batch-types';
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
  /** Ürün görseli (public URL) — satır başındaki küçük görsel; yoksa placeholder ikon (`Thumbnail`). */
  imageUrl: string | null;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa fiyatı yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  b2c: ChannelPriceCell;
  b2b: ChannelPriceCell;
  /**
   * Yenileme maliyeti: SON alış fiyatı (KDV hariç) — "bunu yeniden almak kaça". `null` = hiç alış yok —
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
  /**
   * Son alış geçmişten belirgin saptıysa dolu — otomatik fiyat bu satırda BEKLER, karar admin'in.
   * `null` = taban güvenilir (ya da hiç maliyet yok; onu `costCents` söyler).
   */
  costJump: { medianCents: number; deviationPercent: number } | null;
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
  /** Karar bağlamı (bkz. `VariantOption`): düzenlerken de "bu fiyatla ne kalıyor" görünmeli. */
  costCents: number | null;
  vatRate: number;
  targetMarginPercent: number | null;
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
   * Kuponun KAPILARI — bir kuralın birden çok kodu olur (dil başına bir tane gibi) ve hepsi aynı
   * kotayı açar. Kampanyada boş dizi. Her kod kaç kez tuttuğunu da taşır: liste "hangi dil karşılık
   * buldu" sorusunu ayrı bir ekrana gitmeden yanıtlar.
   */
  codes: DiscountCodeRow[];
  type: DiscountType;
  /** Tipine göre biri dolu, öteki `null` (02.9): yüzde oran, sabit tutar **cent**. */
  percent: number | null;
  amountCents: number | null;
  scope: DiscountScope;
  /** Kapsam hedefinin adı ("Baklava"); sepet kapsamında boş. */
  scopeName: string;
  /**
   * Kapsam hedefinin KİMLİĞİ — satır bir tur yalnız adı taşıyordu ve düzenleme formu hedef kutusunu
   * boş açıyordu. Sonuç sessiz bir çıkmazdı: kategori/koleksiyon kapsamlı bir kuralı düzenlemeye
   * açan operatör "Kapsam hedefi seçilmeli" engelini hiç kaldıramıyor, kaydet düğmesi kilitli
   * kalıyordu (bulundu 10.08, form gövdesi ayrılırken). Ad İNSAN içindir, kimlik FORM içindir;
   * ikisi ayrı sorulara cevap veriyor ve biri ötekinin yerine geçemez.
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

// `DiscountFormInput` BURADA DEĞİL, formun kendi dosyasında
// (`components/operation/form/discount-form.tsx`, 22.10): girdiyi üreten `discountInputOf` orada ve
// ikisi tek sözleşmenin iki ucu. Ayrı dosyalarda dururlarsa bir gün biri alan ekler, öteki bilmez.
// Ayrıca form artık iki yüzeyin ortağı; tipini fiyat ekranının görünüm dosyasında tutmak, ortak bir
// komponenti bir sayfaya bağımlı kılardı (`STACK §7`).

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
  /** Teklif diyaloğunu bu parti için aç — stok ekranıyla aynı diyalog, aynı karar. */
  onOpenOffer: (stockId: string) => void;
  /** İndirim formu: satır verilirse düzenleme, `null` ise yeni kural. */
  onEditDiscount: (row: DiscountRow | null) => void;
}

