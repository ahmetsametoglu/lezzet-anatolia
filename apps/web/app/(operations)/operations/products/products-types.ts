// Ürünler ekranı view-model'leri — RSC (page.tsx) DB'den okur, serileştirilebilir bu tiplere indirger;
// client (products-client + desktop/mobile) yalnız bunları görür. Servis/DB tipleri client'a sızmaz.

export type ProductStatus = 'active' | 'passive' | 'candidate';
export type LangCode = 'TR' | 'FR' | 'DE';

export const ALL_LANGS: LangCode[] = ['TR', 'FR', 'DE'];

export interface VariantView {
  id: string;
  label: string;
  netWeightG: number | null;
  sku: string | null;
  isActive: boolean;
}

/** Bir ürünün tüm ekran ihtiyacı: liste satırı + seçili panel + düzenle formu tek nesnede. */
export interface ProductView {
  id: string;
  name: string; // çözülmüş görünen ad (TR öncelikli)
  slug: string;
  categoryId: string | null;
  category: string; // çözülmüş kategori adı ya da '—'
  status: ProductStatus;
  variantCount: number;
  /** Adı DOLU olan diller — "diller" göstergesi (TR·FR·DE). */
  filledLangs: LangCode[];
  descriptionText: string; // TR açıklama (modal metin alanı)
  vatRate: number;
  dateType: 'DLC' | 'DDM';
  shelfLifeDays: number | null;
  shippable: boolean;
  netWeightG: number | null; // varsayılan (ilk) varyantın net ağırlığı
  collections: string[]; // ürünün girdiği koleksiyon adları
  variants: VariantView[];
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  count: number; // bu kategorideki ürün sayısı
  isActive: boolean;
}

export interface CollectionView {
  id: string;
  name: string;
  slug: string;
  count: number; // koleksiyondaki ürün sayısı
  isActive: boolean;
}

/** RSC'nin client'a geçirdiği tüm veri. */
export interface ProductsData {
  products: ProductView[];
  categories: CategoryView[];
  collections: CollectionView[];
}

export type ProductTab = 'products' | 'categories' | 'collections' | 'packages';

/** Durum süzgeci: bir durum ya da 'all' (tümü). */
export type StatusFilter = ProductStatus | 'all';

/** products-client'ın tuttuğu durum + eylemler; desktop/mobile görünümleri bunu tüketir. */
export interface ProductsViewProps {
  data: ProductsData;
  /** Süzgeçlerden (arama + kategori + durum + beyan-eksik) geçmiş ürünler — listelerde bu gösterilir. */
  visibleProducts: ProductView[];
  tab: ProductTab;
  onTab: (t: ProductTab) => void;
  /** Arama metni (ada göre süzer). */
  search: string;
  onSearch: (q: string) => void;
  /** Kategori süzgeci: kategori id'si ya da 'all'. */
  catFilter: string;
  onCatFilter: (id: string) => void;
  /** Durum süzgeci ('+ durum' çipi). */
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  /** Yalnız beyan/dil eksik olanları göster ('beyan eksik' çipi). */
  onlyIncomplete: boolean;
  onToggleIncomplete: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  openCreate: () => void;
  openEdit: () => void;
  /** Ürünü satışa aç/kapa (kalıcı; mobil hızlı iş). */
  onToggleActive: (id: string, isActive: boolean) => void;
}
