'use client';

import { PlusIcon } from '@/components/operation/ui/icons';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Tabs } from '@/components/operation/ui/tabs';
import { CatalogTab } from './tabs/catalog/catalog-tab';
import { PackagesTab } from './tabs/package/package-tab';
import { ProductsTab } from './tabs/product/product-tab.desktop';
import type { ProductTab } from './products-paths';
import type { ProductsViewProps } from './products-types';

// Ürünler — web ("Veri Masası") KABUĞU: ortak üst bar (PageHeader) + O2 sekmeler; sekme içerikleri
// kendi klasörlerinde (tabs/product · tabs/catalog · tabs/package) — bu dosya yalnız yönlendirir.
// Kategoriler ve Koleksiyonlar AYNI katalog modülüdür, yalnız `kind` ile ayrışır (no-duplication).

const TABS: Array<{ key: ProductTab; label: string }> = [
  { key: 'products', label: 'Ürünler' },
  { key: 'categories', label: 'Kategoriler' },
  { key: 'collections', label: 'Koleksiyonlar' },
  { key: 'packages', label: 'Paketler' },
];

export function ProductsDesktop(props: ProductsViewProps) {
  const { data, tab, onTab, search, onSearch, openCreate } = props;
  // Sayaçlar SUNUCUDAN gelir: liste sayfalı olduğu için client görünen satırlardan türetemez
  // (türetse "12 ürün" yazıp 30 satır gösterirdi). Süzgeç uygulanmışsa sayaçlar da süzülmüştür.
  const { total, candidate, incomplete } = data.counts;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Ürünler"
        subtitle={`${total} ürün · ${candidate} aday · ${incomplete} beyan eksik`}
      >
        <SearchInput value={search} onChange={onSearch} placeholder="Ürün ara…" className="w-56" />
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-ops-btn bg-ops-ink px-3.5 py-2 font-ops-mono text-[12.5px] font-medium text-ops-card hover:bg-ops-ink-hover"
        >
          <PlusIcon />
          Ürün
        </button>
      </PageHeader>

      <Tabs items={TABS} active={tab} onSelect={onTab} />

      {tab === 'products' && <ProductsTab {...props} />}
      {tab === 'categories' && <CatalogTab kind="category" rows={data.categories} />}
      {tab === 'collections' && <CatalogTab kind="collection" rows={data.collections} products={data.products} />}
      {tab === 'packages' && <PackagesTab />}
    </div>
  );
}
