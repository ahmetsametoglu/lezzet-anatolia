// Ürünler ekranı view-model'leri — RSC (page.tsx) DB'den okur, serileştirilebilir bu tiplere indirger;
// client yalnız bunları görür. TİPLER ŞEMADAN TÜRETİLİR: ProductView = Product & {türetilen}; alanlar
// yeniden yazılmaz (no-duplication, schemas-single-source). Durum/dolu-dil gibi saf türevler client'ta
// yardımcıyla hesaplanır (taşınmaz). Dil yapısı @lezzet/i18n'de, alerjen packages/types'ta.
import type { Category, Collection, LocalizedText, Product, ProductVariant } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';

export type ProductStatus = 'active' | 'passive' | 'candidate';

/** Ürün view-model — DB `Product`'ı türetir; yalnız türetilmiş/join alanlar eklenir. */
export type ProductView = Product & {
  imageUrl: string | null; // R2 signed okuma URL'i (yoksa placeholder)
  categoryName: string; // çözülmüş kategori adı ya da '—' (join)
  variants: ProductVariant[]; // ürünün varyantları
  collectionNames: string[]; // girdiği koleksiyon adları (join)
};

// Kategori view-model — `count` bu kategorideki ürün sayısı; `imageUrl` görselin imzalı okuma URL'i
// (kategori görseli anasayfa şeridinde görünür: web 3:2 kart, mobil daire).
export type CategoryView = Category & { count: number; imageUrl: string | null };
// Koleksiyon = adı olan ürün listesi (DOMAIN §13) → üyelik id'leri view-model'in parçası (vitrin
// sırasında); üyelik dialogu bunlarla ön-dolar. `count` bağımsız sayaç DEĞİL, productIds.length'ten
// türer (RSC'de bir kez); katalog tablosunun ortak alanı olduğu için ayrıca taşınır. `imageUrl` kapak
// görselinin imzalı okuma URL'i (imageKey ham anahtar; R2 private bucket).
export type CollectionView = Collection & { count: number; productIds: string[]; imageUrl: string | null };

/** Katalog satırı — kategori ve koleksiyon aynı alanları taşır; tek tablo/dialog bunu tüketir. */
export type CatalogRow = CategoryView | CollectionView;

// ── Saf türevler (client-güvenli) — Product'tan hesaplanır, taşınmaz ──
export function productStatus(p: { isCandidate: boolean; isActive: boolean }): ProductStatus {
  if (p.isCandidate) return 'candidate';
  return p.isActive ? 'active' : 'passive';
}
/** Adı DOLU olan içerik dilleri — "diller" göstergesi. */
export function filledContentLangs(name: LocalizedText): Locale[] {
  return LOCALES.filter((l) => name[l]?.trim());
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface ProductsData {
  products: ProductView[];
  categories: CategoryView[];
  collections: CollectionView[];
}

// Sekme kimlikleri TEK KAYNAK: tip bu listeden TÜRETİLİR (elle union yazılmaz) ve aynı liste URL
// parametresini doğrulamak için çalışma anında da kullanılır (`?tab=` → yenilemede doğru sekme).
export const PRODUCT_TABS = ['products', 'categories', 'collections', 'packages'] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

/** URL'den gelen ham değeri güvenli sekmeye çevirir (tanınmayan/boş → 'products'). */
export function parseProductTab(raw: string | string[] | undefined): ProductTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PRODUCT_TABS.find((t) => t === v) ?? 'products';
}

/**
 * Katalog varlığı türü — kategori ve koleksiyon aynı düz/sıralı deseni paylaşır (çok dilli ad · slug ·
 * sortOrder · isActive), bu yüzden tek action seti + tek dialog `kind` ile çatallanır (no-duplication).
 */
export type CatalogKind = 'category' | 'collection';

/** Durum süzgeci: bir durum ya da 'all' (tümü). */
export type StatusFilter = ProductStatus | 'all';

/** products-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir. */
export interface ProductsViewProps {
  data: ProductsData;
  /** Süzgeçlerden (arama + kategori + durum + beyan-eksik) geçmiş ürünler — listelerde bu gösterilir. */
  visibleProducts: ProductView[];
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
  selectedId: string | null;
  onSelect: (id: string) => void;
  openCreate: () => void;
  openEdit: () => void;
  /** Ürünü satışa aç/kapa (kalıcı; mobil hızlı iş). */
  onToggleActive: (id: string, isActive: boolean) => void;
}
