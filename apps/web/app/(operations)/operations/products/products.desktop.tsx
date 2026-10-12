'use client';

import { Button } from '@/components/operation/ui/button';
import { PlusIcon } from '@/components/operation/ui/icons';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Tabs } from '@/components/operation/ui/tabs';
import { CatalogTab } from './tabs/catalog/catalog-tab';
import { FamilyTab } from './tabs/family/family-tab';
import { PackagesTab } from './tabs/package/package-tab';
import { ProductsTab } from './tabs/product/product-tab.desktop';
import { COUNTRY_LABELS } from '@lezzet/types';
import { PRODUCT_TABS, PRODUCT_TAB_LABEL, type ProductTab } from './products-paths';
import type { ProductsViewProps } from './products-types';
import { RATE_COUNTRIES } from './products-url';

// Ürünler kabuğu: ortak üst bar ve sekmeler; sekme içerikleri kendi klasörlerinde, bu dosya yalnız yönlendirir. Kategoriler ve
// Koleksiyonlar aynı katalog modülüdür, yalnız `kind` ile ayrışır.

// Sıra ve ad `products-paths.ts`ten gelir, çünkü `loading.tsx` de aynı kaynağı okur ve iskelet sekme sayısını tutturmalı.
const TABS = PRODUCT_TABS.map((key) => ({ key, label: PRODUCT_TAB_LABEL[key] }));

// "Yeni …" düğmesinin etiketi sekmeden gelir; sekme adından türetilemez, çünkü sekme adı çoğul ("Kategoriler"), eylem tekildir.
const CREATE_LABEL: Record<ProductTab, string> = {
  products: 'Ürün',
  categories: 'Kategori',
  collections: 'Koleksiyon',
  packages: 'Paket',
  families: 'Aile',
};

// Arama sekmeye bağlıdır ve yer tutucu neyin arandığını söyler.
const SEARCH_PLACEHOLDER: Record<ProductTab, string> = {
  products: 'Ürün ara…',
  categories: 'Kategori ara…',
  collections: 'Koleksiyon ara…',
  packages: 'Paket ara…',
  families: 'Aile ara…',
};

export function ProductsDesktop(props: ProductsViewProps) {
  const { data, tab, onTab, search, onSearch, creating, openCreate, closeCreate } = props;
  // Sayaçlar sunucudan gelir, çünkü liste sayfalıdır ve görünen satırlardan türetilen sayı yanlış olurdu; süzgeç varsa süzülmüştür.
  const { total, candidate, incomplete } = data.counts;
  const rateGaps = RATE_COUNTRIES.map((country) => ` · ${data.rateGaps[country] ?? 0} ${COUNTRY_LABELS[country]} oranı eksik`).join('');

  // Alt başlık sekmeye aittir; katalog sayaçları istemcide doğrudur, çünkü o listeler bütün hâlinde gelir.
  const SUBTITLE: Record<ProductTab, string> = {
    products: `${total} ürün · ${candidate} aday · ${incomplete} beyan eksik${rateGaps}`,
    categories: `${data.categories.length} kategori`,
    collections: `${data.collections.length} koleksiyon`,
    packages: `${data.bundles.length} paket`,
    families: `${data.families.length} aile · ${data.families.reduce((sum, f) => sum + f.memberCount, 0)} üye`,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Ürünler" subtitle={SUBTITLE[tab]} />

      <Tabs
        items={TABS}
        active={tab}
        onSelect={onTab}
        action={
          <>
            {/* Paketlerde arama yok; kilitli kutu "birazdan çalışır" izlenimi verirdi. */}
            {tab === 'packages' ? null : (
              <SearchInput value={search} onChange={onSearch} placeholder={SEARCH_PLACEHOLDER[tab]} className="w-56" />
            )}
            <Button variant="dark" size="sm" onClick={openCreate}>
              <PlusIcon />
              {CREATE_LABEL[tab]}
            </Button>
          </>
        }
      />

      {tab === 'products' && <ProductsTab {...props} />}
      {tab === 'categories' && (
        <CatalogTab kind="category" rows={data.categories} filter={search} creating={creating} onCreateClose={closeCreate} />
      )}
      {tab === 'collections' && (
        <CatalogTab
          kind="collection"
          rows={data.collections}
          withMembers
          filter={search}
          creating={creating}
          onCreateClose={closeCreate}
        />
      )}
      {tab === 'packages' && (
        <PackagesTab bundles={data.bundles} creating={creating} onCreateClose={closeCreate} />
      )}
      {tab === 'families' && (
        <FamilyTab rows={data.families} filter={search} creating={creating} onCreateClose={closeCreate} />
      )}
    </div>
  );
}
