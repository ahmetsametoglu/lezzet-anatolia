'use client';

import { Button } from '@/components/operation/ui/button';
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

// "Yeni …" düğmesinin etiketi sekmeden gelir — düğme sekme çubuğunun sağında durur ve neyi
// yarattığını sekme söyler. Etiketler TABS ile aynı sırayı izler ama ondan TÜRETİLEMEZ: sekme adı
// çoğuldur ("Kategoriler"), eylem tekildir ("+ Kategori").
const CREATE_LABEL: Record<ProductTab, string> = {
  products: 'Ürün',
  categories: 'Kategori',
  collections: 'Koleksiyon',
  packages: 'Paket',
};

// Arama da sekmeye BAĞLI: yer tutucu neyin arandığını söyler. Eskiden tek bir "Ürün ara…" kutusu
// başlıkta duruyor ve hangi sekme açık olursa olsun ÜRÜNDE arıyordu — kutu yalan söylüyordu.
const SEARCH_PLACEHOLDER: Record<ProductTab, string> = {
  products: 'Ürün ara…',
  categories: 'Kategori ara…',
  collections: 'Koleksiyon ara…',
  packages: 'Paket ara…',
};

export function ProductsDesktop(props: ProductsViewProps) {
  const { data, tab, onTab, search, onSearch, creating, openCreate, closeCreate } = props;
  // Sayaçlar SUNUCUDAN gelir: liste sayfalı olduğu için client görünen satırlardan türetemez
  // (türetse "12 ürün" yazıp 30 satır gösterirdi). Süzgeç uygulanmışsa sayaçlar da süzülmüştür.
  const { total, candidate, incomplete } = data.counts;

  // Alt başlık da sekmeye ait: her sekmede "70 ürün · 6 aday" yazmak, kategori listesine bakarken
  // ürün sayaçlarını okutmaktı. Katalog sayaçları client'ta doğru — o listeler bütün hâlinde geliyor.
  const SUBTITLE: Record<ProductTab, string> = {
    products: `${total} ürün · ${candidate} aday · ${incomplete} beyan eksik`,
    categories: `${data.categories.length} kategori`,
    collections: `${data.collections.length} koleksiyon`,
    packages: 'Paket modeli sonraki dilimde',
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
            {/* Paketlerde arama YOK: aranacak veri yok. Kutuyu kilitli göstermek "birazdan çalışır"
                izlenimi verirdi. */}
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
          products={data.products}
          filter={search}
          creating={creating}
          onCreateClose={closeCreate}
        />
      )}
      {tab === 'packages' && <PackagesTab />}
    </div>
  );
}
