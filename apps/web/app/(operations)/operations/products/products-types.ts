// Ürünler ekranının view-model'leri: RSC okur ve bu serileştirilebilir tiplere indirger, istemci yalnız bunları görür. Tipler şemadan
// türer (`ProductView = Product & {türetilen}`), alan yeniden yazılmaz.
import type {
  BarcodeKind,
  Category,
  Channel,
  Collection,
  KeysetCursor,
  LocalizedText,
  Product,
  ProductStatus,
  ProductVariant,
  ProductWithRelations,
} from '@lezzet/types';
import type { BatchView } from '@lezzet/application';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { StockWarehouseSplit } from '@/lib/stock/level-rows';
import { resolveLocalizedText } from '@lezzet/types';
import { slugify } from '@lezzet/helper';
import { LOCALES } from '@lezzet/i18n';
import type { ImageFrameSources } from '@lezzet/application';
import type { ProductTab } from './products-paths';

// Durum tipi `@lezzet/types`'tadır; sayfa dosyaları tek yerden alsın diye burada yeniden dışa verilir.
export { type ProductStatus } from '@lezzet/types';

/**
 * Satırın stok özeti, boyların toplamı. Parti ayrıntısı yok, çünkü liste satır başına parti okumasını ödeyemez; `null` okunmadı
 * demektir, sıfır değil.
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
 * Satırın fiyat özeti, birincil boyun (ilk aktif boy) satırı; marj `toPriceRows`tan gelir ki iki ekran aynı marjı iki formülle
 * hesaplamasın. Yalnız yöneticide dolar, çünkü fiyat ve maliyet başka role çizilmez.
 */
export interface ProductPriceSummary {
  /** Tutarların geldiği boy — fiyat yazıldığında satırın değişip değişmeyeceği buna bakar. */
  variantId: string;
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
 * Açılan satırın boy ayrıntısı, yalnız listeye gelmeyen alanlar; boy adı, SKU ve ölçüler `ProductView.variants` ile zaten gelir ve
 * kırılım açılır açılmaz dolu çizilir.
 */
export interface VariantRowDetail {
  variantId: string;
  /** Dış dünyanın kodları (EAN/GTIN); boş dizi "eşleme yok" demektir. */
  barcodes: Array<{ code: string; kind: BarcodeKind }>;
  /** Malı olan depolar — stok ekranının kırılımıyla aynı şekil. */
  warehouses: StockWarehouseSplit[];
  availableQty: number;
  /** En yakın son tarihli parti; cümlesini ekran kurar (`expiryParts`), sunucu biçimlendirme yapmaz. */
  nearest: BatchView | null;
  /** Boyun fiyat satırı, fiyat ekranınınkiyle aynı şekil, çünkü kırılımın hücreleri ve çift tıkla açılan tam form aynı satırı okur. */
  price: PriceRow | null;
}

/** Ürün view-model — DB `Product`'ı türetir; yalnız türetilmiş/join alanlar eklenir. */
export type ProductView = Product & {
  imageUrl: string | null; // R2 public okuma URL'i, `?v=` sürüm damgalı (yoksa placeholder) — özgün dosya, düzenleme formu bununla
  thumbUrl: string | null; // liste/önizleme küçük resmi — CDN kare@200, operatörün kadrajıyla (`thumbnailImageUrl`)
  categoryName: string; // çözülmüş kategori adı ya da '—' (join)
  variants: ProductVariant[]; // ürünün varyantları
  countryRates: ProductWithRelations['countryRates']; // ürünün öteki ülkelerdeki KDV oranları (ürün formu okur)
  collectionNames: string[]; // girdiği koleksiyon adları (join)
  stock: ProductStockSummary | null; // depo kapsamındaki toplam (okunmadıysa null)
  price: ProductPriceSummary | null; // birincil boyun fiyat/marj özeti (yalnız yöneticide)
};

// Kategori view-model'i: `count` kategorideki ürün sayısı, `frames` liste hücresinin CDN çerçeveleri; `imageUrl` düzenleme formunun
// özgün dosyasıdır.
export type CategoryView = Category & { count: number; imageUrl: string | null; frames: ImageFrameSources | null };
// Koleksiyon adı olan ürün listesidir (DOMAIN §13); üyelik kimlikleri vitrin sırasındadır ve üyelik penceresini ön-doldurur. `count`
// bağımsız sayaç değil, `productIds.length`ten türer ve katalog tablosunun ortak alanı olduğu için ayrıca taşınır.
export type CollectionView = Collection & { count: number; productIds: string[]; imageUrl: string | null; frames: ImageFrameSources | null };

/** Katalog satırı — kategori ve koleksiyon aynı alanları taşır; tek tablo/dialog bunu tüketir. */
export type CatalogRow = CategoryView | CollectionView;

// Paket formunun tipleri formun yanındadır (paket formu ortak alanda); sayfa kodu değişmesin diye buradan yeniden dışa verilir.
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

/**
 * Katalog satırı arama terimine uyuyor mu; kategori ve koleksiyon listeleri bütün hâlinde geldiği için istemcide süzülür. Eşleşme
 * `slugify` üzerinden, üç dilin adı birden taranır, ki aksan ve Türkçe harf farkı yutulsun.
 */
export function matchesCatalogFilter(row: { name: LocalizedText; slug: string }, term: string): boolean {
  const needle = slugify(term);
  if (!needle) return true;
  const haystack = [...LOCALES.map((l) => row.name[l] ?? ''), row.slug].map((s) => slugify(s)).join(' ');
  return haystack.includes(needle);
}

/**
 * Bu ürünün kalemi olduğu paketler; ürünü pasife almak paketi de satılamaz kılar ve ilişki görünmezse paket sessizce vitrinden düşer.
 * Türetme istemcide, çünkü paketler kalemleriyle zaten gelmiştir.
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
   * Aileler üyeleriyle tam gelir, çünkü operatörün elle kurduğu tavanlı bir kümedir. Sağ raydaki "öteki çeşitler" de aynı veriden
   * beslenir, ikinci okuma iki ayrı gerçek doğururdu.
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
   * Aile içi etiket ("Limonlu"), üç dilli ve müşteriye görünen budur. Ürün adından türetilemez, çünkü ortak eki kırpmak "Çilekli Kek"
   * ile "Kek Dilimi"nde bozulur.
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
 * products-client'ın tuttuğu durum ve eylemler; masaüstü görünümü bunu tüketir. Süzgeçler sunucudadır: `products` süzülmüş gelir ve
 * liste sayfa sayfa büyür (`onLoadMore`).
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
  /** Fiyat yazıldı; satırın özeti yerinde düzelir ve liste yeniden okunmaz, çünkü yazarken ekran oynamamalı. */
  onLocalPrice: (productId: string, variantId: string, channel: Channel, amountCents: number, row: PriceRow) => void;
}
