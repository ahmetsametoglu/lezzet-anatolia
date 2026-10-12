// Ürünler ekranı view-model'leri — RSC (page.tsx) DB'den okur, serileştirilebilir bu tiplere indirger;
// client yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR: ProductView = Product & {türetilen}; alanlar
// yeniden yazılmaz (no-duplication, schemas-single-source). Durum/dolu-dil gibi saf türevler client'ta
// yardımcıyla hesaplanır (taşınmaz). Dil yapısı @lezzet/i18n'de, alerjen packages/types'ta.
import type {
  BarcodeKind,
  Category,
  Collection,
  KeysetCursor,
  LocalizedText,
  Product,
  ProductStatus,
  ProductVariant,
} from '@lezzet/types';
import type { BatchView } from '@lezzet/application';
import type { StockWarehouseSplit } from '@/lib/stock/level-rows';
import { resolveLocalizedText } from '@lezzet/types';
import { slugify } from '@lezzet/helper';
import { LOCALES, type Locale } from '@lezzet/i18n';
import type { ImageFrameSources } from '@lezzet/application';
import type { ProductTab } from './products-paths';

// Durum tipi ve türetimi `@lezzet/types`'ta (servis de aynı türetimi süzgeç olarak sorguya çeviriyor)
// — burada yalnız yeniden dışa verilir ki sayfa dosyaları tek yerden (products-types) alsın.
export { type ProductStatus } from '@lezzet/types';

/**
 * Satırın STOK özeti — boyların toplamı. Parti ayrıntısı (son tarih, parti numarası) burada YOK:
 * onu okumak partileri çekmek demek ve liste bunu satır başına ödeyemez — satır açılınca gelir.
 * `null` "okunmadı" demektir (ölçülemeyen değer sıfır değildir, CLAUDE §1).
 */
export interface ProductStockSummary {
  /** Kapsamdaki depolarda kullanılabilir toplam (fiili eksi ayrılmış). */
  availableQty: number;
  /** Malı olan depo sayısı; 0 ise hiçbir depoda yok. */
  warehouseCount: number;
  /** En az bir boy asgari eşiğin altında mı — eşik kuralı `toLevelRows`ta, burada yeniden yazılmaz. */
  belowMin: boolean;
}

/**
 * Satırın FİYAT özeti — birincil boyun (ilk aktif boy) satırı. Marj ve hedef karşılaştırması
 * `toPriceRows`tan gelir; fiyat ekranı ile ürünler ekranı aynı marjı iki ayrı formülle hesaplamaz.
 * `null` yalnız yöneticide dolar: fiyat ve maliyet başka role çizilmez.
 */
export interface ProductPriceSummary {
  /** Kanal tabanında tutarlar: b2c KDV dahil, b2b KDV hariç (DOMAIN §5). */
  b2cCents: number | null;
  b2bCents: number | null;
  /** Birincil boyun marjı; maliyet bilinmiyorsa `null` ("sıfır marj" değil). */
  marginPercent: number | null;
  /** Hedef marjın altında mı; hedef yoksa `null`. */
  belowTarget: boolean | null;
  autoPrice: boolean;
}

/**
 * AÇILAN SATIRIN boy ayrıntısı — yalnız listeye gelmeyen alanlar. Boy adı, SKU, net miktar,
 * porsiyon ve ambalaj ölçüsü burada YOK: onlar `ProductView.variants` ile zaten gelmiştir ve
 * kırılım açılır açılmaz dolu çizilir. Buradakiler ise sunucudan tek turda istenir.
 */
export interface VariantRowDetail {
  variantId: string;
  /** Dış dünyanın kodları (EAN/GTIN); boş dizi "eşleme yok" demektir. */
  barcodes: Array<{ code: string; kind: BarcodeKind }>;
  /** Malı olan depolar — stok ekranının kırılımıyla aynı şekil. */
  warehouses: StockWarehouseSplit[];
  availableQty: number;
  /** En yakın son tarihli parti; cümlesini ekran kurar (`expiryLine`), sunucu biçimlendirme yapmaz. */
  nearest: BatchView | null;
  b2cCents: number | null;
  b2bCents: number | null;
  /** Satır içi fiyat düzenlemesinde marjı CANLI hesaplamak için; `null` = maliyet bilinmiyor. */
  costCents: number | null;
  vatRate: number;
}

/** Ürün view-model — DB `Product`'ı türetir; yalnız türetilmiş/join alanlar eklenir. */
export type ProductView = Product & {
  imageUrl: string | null; // R2 public okuma URL'i, `?v=` sürüm damgalı (yoksa placeholder) — ÖZGÜN dosya, düzenleme formu bununla
  thumbUrl: string | null; // liste/önizleme küçük resmi — CDN kare@200, operatörün kadrajıyla (05.37 · `thumbnailImageUrl`)
  categoryName: string; // çözülmüş kategori adı ya da '—' (join)
  variants: ProductVariant[]; // ürünün varyantları
  collectionNames: string[]; // girdiği koleksiyon adları (join)
  stock: ProductStockSummary | null; // depo kapsamındaki toplam (okunmadıysa null)
  price: ProductPriceSummary | null; // birincil boyun fiyat/marj özeti (yalnız yöneticide)
};

// Kategori view-model — `count` bu kategorideki ürün sayısı; `imageUrl` görselin public okuma URL'i
// (kategori görseli anasayfa şeridinde görünür: masaüstü web 3:2 kart, mobil webde daire).
// `frames` liste hücresinin CDN çerçeveleri (05.37) — `imageUrl` düzenleme formunun özgün dosyası olarak kalır.
export type CategoryView = Category & { count: number; imageUrl: string | null; frames: ImageFrameSources | null };
// Koleksiyon = adı olan ürün listesi (DOMAIN §13) → üyelik id'leri view-model'in parçası (vitrin
// sırasında); üyelik dialogu bunlarla ön-dolar. `count` bağımsız sayaç DEĞİL, productIds.length'ten
// türer (RSC'de bir kez); katalog tablosunun ortak alanı olduğu için ayrıca taşınır. `imageUrl` kapak
// görselinin public okuma URL'i (imageKey ham anahtar; URL `publicImageUrl` ile kurulur).
export type CollectionView = Collection & { count: number; productIds: string[]; imageUrl: string | null; frames: ImageFrameSources | null };

/** Katalog satırı — kategori ve koleksiyon aynı alanları taşır; tek tablo/dialog bunu tüketir. */
export type CatalogRow = CategoryView | CollectionView;

/**
 * ── PAKET FORMUNUN TİPLERİ ARTIK FORMUN YANINDA (22.18) ─────────────────────
 * `BundleView` ve `VariantOption` buradan `components/operation/form/bundle-form/types.ts`e taşındı,
 * çünkü paket formu ortak alana çıktı: onu artık ürün sayfası da asistan kuyruğu da kullanıyor ve
 * bir komponentin sayfa klasöründen tip okuması ters yönlü bir bağımlılıktır (`docs:check §3e`).
 *
 * Buradan yeniden ihraç ediliyorlar ki SAYFA KODU değişmesin — tanım tek, adres iki değil.
 */
import type { BundleView } from '@/components/operation/form/bundle-form/types';

export type { BundleView } from '@/components/operation/form/bundle-form/types';

// ── Saf türevler (client-güvenli) — Product'tan hesaplanır, taşınmaz ──
/**
 * Boyun ekrandaki adı: etiketi varsa o, yoksa net miktarı. Tek boylu üründe etiket bilerek BOŞTUR
 * (müşteri seçici görmez), ama operasyon listesi o boyu da bir adla anmak zorunda.
 */
export function sizeLabel(variant: ProductVariant): string {
  const label = resolveLocalizedText(variant.label);
  if (label) return label;
  return variant.netQuantity != null && variant.netUnit ? `${variant.netQuantity} ${variant.netUnit}` : '—';
}

/** Adı DOLU olan içerik dilleri — "diller" göstergesi. */
export function filledContentLangs(name: LocalizedText): Locale[] {
  return LOCALES.filter((l) => name[l]?.trim());
}

/**
 * Katalog satırı arama terimine uyuyor mu — kategori/koleksiyon araması CLIENT'ta süzülür, çünkü bu
 * listeler sayfalı değil, bütün hâlinde geliyor (küçük ve sürükle-sıralanabilir). Ürün araması ise
 * sunucuda kalır: orası keyset paginasyonlu.
 *
 * Eşleşme `slugify` üzerinden: aksan ve Türkçe harf farkı yutulur ("boregi" → "su-boregi" bulur) ve
 * ÜÇ dilin adı birden taranır — operatör FR adını yazsa da kaydı bulur. Yeni bir normalleştirici
 * yazılmadı; slug üreticisi zaten bu işi tek yerde yapıyor.
 */
export function matchesCatalogFilter(row: { name: LocalizedText; slug: string }, term: string): boolean {
  const needle = slugify(term);
  if (!needle) return true;
  const haystack = [...LOCALES.map((l) => row.name[l] ?? ''), row.slug].map((s) => slugify(s)).join(' ');
  return haystack.includes(needle);
}

/**
 * Bu ürünün kalemi olduğu paketler. Ürünü pasife almak paketi doğrudan bozar (paket ancak tüm
 * kalemleri satılabilirse satılabilir), ama ilişki ekranda hiç görünmüyordu: operatör ürünü kapatıp
 * paketin sessizce vitrinden düştüğünü sonradan öğreniyordu. Türetme saf ve client'ta — paketler
 * kalemleriyle birlikte zaten gelmiş durumda (ek sorgu yok).
 */
export function bundlesUsingVariants(bundles: BundleView[], variantIds: string[]): BundleView[] {
  if (variantIds.length === 0) return [];
  const wanted = new Set(variantIds);
  return bundles.filter((b) => b.variantIds.some((id) => wanted.has(id)));
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface ProductsData {
  /** Ürünlerin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır (STACK §6). Devamı action ile eklenir. */
  products: ProductView[];
  /** Sonraki sayfanın imleci; null ise liste bitti. */
  nextCursor: KeysetCursor | null;
  /**
   * `?p=` ile seçili ürünün HEDEFLİ okuması — liste sayfalı olduğundan seçili ürün ilk sayfada
   * olmayabilir; önizleme o zaman buradan beslenir. `null` = parametre yok ya da ürün silinmiş.
   */
  pinned: ProductView | null;
  /** Başlık sayaçları — liste sayfalandığı için client türetemez, sunucudan gelir. */
  counts: { total: number; candidate: number; incomplete: number };
  /** Kategori ve koleksiyon TAM gelir: tavanı onlarla sınırlı, açılır menüyü besliyor (STACK §6). */
  categories: CategoryView[];
  collections: CollectionView[];
  /** Paketler TAM gelir ama ÖZET olarak — kalemler diyalog açılınca okunur. */
  bundles: BundleView[];
  /**
   * Aileler ÜYELERİYLE BİRLİKTE tam gelir (`CLAUDE §1`): aile operatörün elle kurduğu, doğal tavanı
   * olan bir küme — sayfalanmaz, tek turda okunur. Üyeler burada çünkü sağ raydaki "öteki çeşitler"
   * bloğu da aynı veriden besleniyor; ikinci bir okuma iki ayrı gerçek doğururdu.
   */
  families: FamilyView[];
}

/** Ailenin listedeki satırı — adı, üyeleri ve sırası. */
export interface FamilyView {
  id: string;
  name: string;
  isActive: boolean;
  memberCount: number;
  /** `familyPosition` sırasında — sıra ailenin kararı, ürünün `sortOrder`'ı DEĞİL (o katalog sırası). */
  members: FamilyMemberView[];
}

export interface FamilyMemberView {
  productId: string;
  /** Ürünün kendi adı ("Limonlu kek") — operasyon tek dilli. */
  productName: string;
  /**
   * Aile içi etiket ("Limonlu") — ÜÇ DİLLİ ve müşteriye görünen budur.
   *
   * Ürün adından türetilemez: ortak eki kırpmak "Çilekli Kek" ile "Kek Dilimi"nde bozulur. Bu yüzden
   * ayrı alan ve `family_id` doluyken veri kısıtı zorunlu kılıyor.
   */
  label: LocalizedText;
  imageUrl: string | null;
  status: ProductStatus;
}

/**
 * Katalog varlığı türü — kategori ve koleksiyon aynı düz/sıralı deseni paylaşır (çok dilli ad · slug ·
 * sortOrder · isActive), bu yüzden tek action seti + tek dialog `kind` ile çatallanır (no-duplication).
 */
export type CatalogKind = 'category' | 'collection';

/** Durum süzgeci: bir durum ya da 'all' (tümü). */
export type StatusFilter = ProductStatus | 'all';

/**
 * products-client'ın tuttuğu durum + eylemler; masaüstü görünümü bunu tüketir.
 *
 * Süzgeçler artık SUNUCUDA uygulanıyor (STACK §6): `visibleProducts` diye ayrı bir client-süzülmüş
 * liste YOK — `products` zaten süzülmüş gelir, kullanıcı süzgeci değiştirince URL yazılır ve RSC
 * yeniden okur. Liste sayfa sayfa büyür (`onLoadMore`).
 */
export interface ProductsViewProps {
  data: ProductsData;
  /** Görünen ürünler: ilk sayfa + eklenmiş sayfalar (hepsi sunucu süzgecinden geçmiş). */
  products: ProductView[];
  tab: ProductTab;
  onTab: (t: ProductTab) => void;
  search: string;
  onSearch: (q: string) => void;
  /** Kategori süzgeci: kategori id'si ya da 'all'. */
  catFilter: string;
  onCatFilter: (id: string) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  onlyIncomplete: boolean;
  onToggleIncomplete: () => void;
  /** Devam eden sayfa var mı + yükleyici; infinite scroll tetikleyicisi bunları kullanır. */
  hasMore: boolean;
  loadingMore: boolean;
  /**
   * Süzgeç/sekme turu sürüyor — tablo gövdesi soluklaşır (satır varsa) ya da iskelete döner (yoksa).
   * `loadingMore`dan AYRI: o listenin KUYRUĞU, bu listenin TAMAMININ yenilenmesi.
   */
  navPending: boolean;
  onLoadMore: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Oluşturma niyeti — adreste yaşar (`new=1`), NE oluşturulacağını `tab` söyler. Sekme çubuğundaki
   * tek düğme bunu açar; formu sekmenin kendi modülü çizer.
   */
  creating: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  openEdit: () => void;
}
