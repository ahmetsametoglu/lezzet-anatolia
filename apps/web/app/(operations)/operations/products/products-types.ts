// Ürünler ekranı view-model'leri — RSC (page.tsx) DB'den okur, serileştirilebilir bu tiplere indirger;
// client yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR: ProductView = Product & {türetilen}; alanlar
// yeniden yazılmaz (no-duplication, schemas-single-source). Durum/dolu-dil gibi saf türevler client'ta
// yardımcıyla hesaplanır (taşınmaz). Dil yapısı @lezzet/i18n'de, alerjen packages/types'ta.
import type {
  BundleWithItems,
  Category,
  Collection,
  KeysetCursor,
  LocalizedText,
  Product,
  ProductStatus,
  ProductVariant,
} from '@lezzet/types';
import { slugify } from '@lezzet/helper';
import { LOCALES, type Locale } from '@lezzet/i18n';
import type { ProductTab } from './products-paths';

// Durum tipi ve türetimi `@lezzet/types`'ta (servis de aynı türetimi süzgeç olarak sorguya çeviriyor)
// — burada yalnız yeniden dışa verilir ki sayfa dosyaları tek yerden (products-types) alsın.
export { type ProductStatus } from '@lezzet/types';

/** Ürün view-model — DB `Product`'ı türetir; yalnız türetilmiş/join alanlar eklenir. */
export type ProductView = Product & {
  imageUrl: string | null; // R2 public okuma URL'i, `?v=` sürüm damgalı (yoksa placeholder)
  categoryName: string; // çözülmüş kategori adı ya da '—' (join)
  variants: ProductVariant[]; // ürünün varyantları
  collectionNames: string[]; // girdiği koleksiyon adları (join)
};

// Kategori view-model — `count` bu kategorideki ürün sayısı; `imageUrl` görselin public okuma URL'i
// (kategori görseli anasayfa şeridinde görünür: web 3:2 kart, mobil daire).
export type CategoryView = Category & { count: number; imageUrl: string | null };
// Koleksiyon = adı olan ürün listesi (DOMAIN §13) → üyelik id'leri view-model'in parçası (vitrin
// sırasında); üyelik dialogu bunlarla ön-dolar. `count` bağımsız sayaç DEĞİL, productIds.length'ten
// türer (RSC'de bir kez); katalog tablosunun ortak alanı olduğu için ayrıca taşınır. `imageUrl` kapak
// görselinin public okuma URL'i (imageKey ham anahtar; URL `publicImageUrl` ile kurulur).
export type CollectionView = Collection & { count: number; productIds: string[]; imageUrl: string | null };

/** Katalog satırı — kategori ve koleksiyon aynı alanları taşır; tek tablo/dialog bunu tüketir. */
export type CatalogRow = CategoryView | CollectionView;

/**
 * Paket view-model — `BundleWithItems`'ı türetir (kalemler gömülü geldi, N+1 yok). `itemLabels`
 * kalemlerin "ürün · boy" adları: kalem yalnız `variantId` taşır, ad çözümü RSC'de yapılır ki client
 * varyant havuzunu tarayarak ad aramasın (liste satırı içeriği özetliyor).
 */
export type BundleView = BundleWithItems & {
  imageUrl: string | null;
  itemLabels: string[];
};

/**
 * Bir satılabilir birim — "Ürün · boy". Ürün listesi SAYFALI olduğu için paket seçicisi ona
 * dayanamaz (ikinci sayfadaki ürün pakete eklenemezdi); bu havuz ayrı ve TAM okunur.
 *
 * HAVUZ İKİ İŞ GÖRÜR ve kümeleri AYNI DEĞİL: (a) pakete YENİ eklenebilecekler — yalnız aktif,
 * (b) pakette DURAN kalemin adı — hepsi. Havuz aktifle sınırlıyken pasif ürünün kalemi adsız kalıyor
 * ve ekran onu "silinmiş" sanıyordu; oysa `bundle_item.variant_id` FK'si `restrict`, yani pakette
 * duran varyant SİLİNEMEZ. Bu yüzden havuz artık pasifi de taşır, eklenebilirliği `addable` söyler.
 */
export interface VariantOption {
  variantId: string;
  label: string;
  imageUrl: string | null;
  /**
   * Liste fiyatı (b2c, KDV dahil €) — paketin verdiği indirim ancak buna göre görülebilir. `null` =
   * o varyanta henüz fiyat girilmemiş; sayı UYDURULMAZ, ekran eksikliği söyler.
   */
  listPrice: number | null;
  /** Pakete YENİ eklenebilir mi (ürün aktif + boy aktif). Pasif olan yine adıyla görünür. */
  addable: boolean;
  /** Eklenemiyorsa sebebi — "pasif ürün" · "aday ürün" · "pasif boy". Duran kalemde işaret olur. */
  blockedReason: string | null;
}

// ── Saf türevler (client-güvenli) — Product'tan hesaplanır, taşınmaz ──
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

/** RSC'nin client'a geçirdiği tüm veri. */
export interface ProductsData {
  /** Ürünlerin İLK SAYFASI — süzgeçler sunucuda uygulanmıştır (STACK §6). Devamı action ile eklenir. */
  products: ProductView[];
  /** Sonraki sayfanın imleci; null ise liste bitti. */
  nextCursor: KeysetCursor | null;
  /** Başlık sayaçları — liste sayfalandığı için client türetemez, sunucudan gelir. */
  counts: { total: number; candidate: number; incomplete: number };
  /** Kategori ve koleksiyon TAM gelir: tavanı onlarla sınırlı, açılır menüyü besliyor (STACK §6). */
  categories: CategoryView[];
  collections: CollectionView[];
  /** Paketler TAM gelir — kürelenmiş kısa bir seçki (müşteri tarafında da sıralama/filtre yok). */
  bundles: BundleView[];
  /** Pakete eklenebilecek birimlerin TAM havuzu — ürün listesi sayfalı olduğu için ayrı okunur. */
  variantPool: VariantOption[];
}

/**
 * Katalog varlığı türü — kategori ve koleksiyon aynı düz/sıralı deseni paylaşır (çok dilli ad · slug ·
 * sortOrder · isActive), bu yüzden tek action seti + tek dialog `kind` ile çatallanır (no-duplication).
 */
export type CatalogKind = 'category' | 'collection';

/** Durum süzgeci: bir durum ya da 'all' (tümü). */
export type StatusFilter = ProductStatus | 'all';

/**
 * products-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir.
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
  /** Ürünü satışa aç/kapa (kalıcı; mobil hızlı iş). */
  onToggleActive: (id: string, isActive: boolean) => void;
}
