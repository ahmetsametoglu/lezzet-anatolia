'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { loadMoreProductsAction } from './actions/list';
import { ProductFormDialog } from './tabs/product/product-form-dialog';
import { ProductsDesktop } from './products.desktop';
import { productsUrl, type ProductsUrlState } from './products-url';
import type { ProductTab } from './products-paths';
import { marginAfterWrite } from './tabs/product/price-math';
import type { PriceRow } from '@/lib/pricing/price-rows';
import type { Channel, ProductVatRate } from '@lezzet/types';
import type { ProductPriceSummary, ProductsData, ProductView, StatusFilter } from './products-types';

// Ürünler ekranının istemci kökü: tek durum ağacı burada, pencere görünümün üstünde. Süzgeç istemci durumu değil adres durumudur
// (STACK §6): değişince adres yazılır ve RSC süzülmüş ilk sayfayı yeniden okur; arama her tuşta gitmesin diye gecikmeli yazılır.

interface ProductsClientProps {
  data: ProductsData;
  /** URL'den çözülmüş ekran durumu (sekme + süzgeçler) — sunucu doğrulamış hâlde verir. */
  urlState: ProductsUrlState;
}

export function ProductsClient({ data, urlState }: ProductsClientProps) {
  const router = useRouter();
  // Süzgeç ya da sekme turu sürüyor mu: `router.replace` bir RSC okumasıdır ve süre boyunca ekran bir karşılık vermeli.
  const [pending, startNav] = useTransition();

  // Sekme sunucuya gitmez, yalnız hangi panelin çizildiğini değiştirir (sığ yazım); süzgeçler RSC'yi yeniden okutur.
  const [tab, setTab] = useState<ProductTab>(urlState.tab);
  useEffect(() => setTab(urlState.tab), [urlState.tab]);

  // Oluşturma niyeti de adreste (`new=1`) ama sığ yazılır, çünkü form açmak yeni veri gerektirmez; adreste durur ki yenilemede form açık
  // kalsın ve sekme değişince niyet tek yerde düşsün.
  const [creating, setCreating] = useState(urlState.creating);
  useEffect(() => setCreating(urlState.creating), [urlState.creating]);

  const writeUrl = (patch: Partial<ProductsUrlState>) => {
    window.history.replaceState(null, '', productsUrl({ ...urlState, tab, creating, ...patch }));
  };

  const onTab = (next: ProductTab) => {
    // Sekmeler aynı okumadan beslenir, değişim sığ yazılır. Oluşturma niyeti ve arama düşer, çünkü ikisi de sekmeye bağlıdır ve
    // taşınsalar yeni sekme sebebi görünmeyen bir formla ya da süzgeçle açılırdı.
    setTab(next);
    setCreating(false);
    resetSearch();

    // Terim ya da ürün hedefi varsa sığ yazım yetmez: gelen veri hâlâ süzülüdür ve liste görünmez bir süzgeçle kalırdı; devamını
    // yükleyen eylem adresi terimsiz okuduğu için ikinci sayfa da süzülmemiş gelirdi.
    if (urlState.q || urlState.productId) {
      startNav(() => router.replace(productsUrl({ ...urlState, tab: next, creating: false, q: '', productId: '' }), { scroll: false }));
      return;
    }
    writeUrl({ tab: next, creating: false, q: '' });
  };

  const setCreatingIntent = (next: boolean) => {
    setCreating(next);
    writeUrl({ creating: next });
  };

  /** Süzgeç değişimi: adrese yazılır ve RSC süzülmüş ilk sayfayı yeniden okur. */
  const applyFilters = (patch: Partial<ProductsUrlState>) => {
    startNav(() => router.replace(productsUrl({ ...urlState, ...patch, tab }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli — mekanizma ortak (`useSearchDraft`).
  const { draft: search, onDraft: onSearch, reset: resetSearch } = useSearchDraft(urlState.q, (q) => applyFilters({ q }));

  // İlk sayfa sunucudan gelir, devamı eylemle eklenir; sunucu verisi değişince eklenen sayfalar sıfırlanır, yoksa eski süzgecin
  // satırları yeni listede kalırdı.
  const [extraPages, setExtraPages] = useState<ProductView[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraPages([]);
    setCursor(data.nextCursor);
  }, [data.products, data.nextCursor]);

  /**
   * Yerel fiyat yamaları, ürün kimliğiyle: yazılan fiyat satırın tutarını ve marjını yerinde düzeltir, çünkü yeniden okuma listeyi
   * baştan kurar ve kaydırmayı oynatırdı. Sunucu verisi yenilenince yamalar düşer.
   */
  const [pricePatches, setPricePatches] = useState<Record<string, ProductPriceSummary>>({});
  useEffect(() => setPricePatches({}), [data.products]);

  const products = [...data.products, ...extraPages].map((product) => {
    const patch = pricePatches[product.id];
    return patch ? { ...product, price: patch } : product;
  });

  /** Yazılan fiyat satıra yansır — yalnız BİRİNCİL boyun fiyatı satırın gösterdiği sayıdır. */
  const onLocalPrice = (productId: string, variantId: string, channel: Channel, amountCents: number, row: PriceRow) => {
    const current = products.find((product) => product.id === productId)?.price;
    if (!current || current.variantId !== variantId) return;
    setPricePatches((prev) => ({
      ...prev,
      [productId]: {
        ...current,
        [channel === 'b2c' ? 'b2cCents' : 'b2bCents']: amountCents,
        // Marj iki kanalın en darıdır; kuralı motordan okuyan tek yer `marginAfterWrite`.
        marginPercent: marginAfterWrite(row, channel, amountCents),
      },
    }));
  };

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreProductsAction(window.location.search, cursor)
      .then(({ data: page, error }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (error || !page) return;
        setExtraPages((prev) => [...prev, ...page.products]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  // Seçim kimlikle tutulur ve kayıt taze listeden türer; ilk değer adresten (`?p=`) gelir ki yenilemede korunsun, tıklamada sığ
  // yazılır, çünkü panel yüklenmiş listeden beslenir.
  const [selectedId, setSelectedId] = useState<string | null>(urlState.selected || null);
  const [editing, setEditing] = useState(false);
  const onSelect = (id: string) => {
    setSelectedId(id);
    writeUrl({ selected: id });
  };
  // Seçili ürün süzülmüş ilk sayfada olmayabilir; o zaman sunucunun hedefli okuması (`data.pinned`) geçer, yoksa adres başka ürünü
  // söylerken ekran ilk satırı gösterirdi.
  const selected =
    products.find((p) => p.id === selectedId) ??
    (selectedId && data.pinned?.id === selectedId ? data.pinned : null) ??
    products[0] ??
    null;

  // Adresteki ürünle (`?productId=`) liste sunucuda o ürüne süzülü gelir, satır seçilir ve düzenleme penceresi açılır. Açılış `ref` ile
  // bir kez yapılır, yoksa kapatılan pencere parametre düşene kadar yeniden açılırdı.
  const openedFromUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!urlState.productId || openedFromUrl.current === urlState.productId) return;
    if (!products.some((p) => p.id === urlState.productId)) return;
    openedFromUrl.current = urlState.productId;
    setSelectedId(urlState.productId);
    setEditing(true);
  }, [urlState.productId, products]);

  // Kapanışta adres hedefi düşer, yoksa liste tek ürüne süzülü kalırdı; seçim (`p=`) pencerenin ürününe devrolur ki ürün seçili ve
  // paylaşılabilir kalsın.
  const closeEdit = () => {
    setEditing(false);
    if (urlState.productId) applyFilters({ productId: '', selected: urlState.productId });
  };

  const view = {
    data,
    products,
    tab,
    onTab,
    search,
    onSearch,
    catFilter: urlState.cat,
    onCatFilter: (cat: string) => applyFilters({ cat }),
    statusFilter: urlState.status,
    onStatusFilter: (status: StatusFilter) => applyFilters({ status }),
    onlyIncomplete: urlState.incomplete,
    onToggleIncomplete: () => applyFilters({ incomplete: !urlState.incomplete }),
    rateGap: urlState.rateGap ?? null,
    onToggleRateGap: (country: ProductVatRate['country']) => applyFilters({ rateGap: urlState.rateGap === country ? null : country }),
    navPending: pending,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    // Açık satır ham durumdan gelir, `selected` türevinden değil: türevin "hiçbiri" hâli ilk satıra düşer ve kırılımı kapatmak onu
    // yeniden açardı.
    selectedId: selectedId || null,
    onSelect,
    creating,
    openCreate: () => setCreatingIntent(true),
    closeCreate: () => setCreatingIntent(false),
    openEdit: () => setEditing(true),
    onLocalPrice,
  };

  // Ürün formu burada, kategori ve koleksiyon formları kendi sekme modüllerindedir; kabuk yalnız niyeti taşır.
  const productDialog = tab === 'products' && creating ? 'create' : editing ? 'edit' : null;

  return (
    <>
      <ProductsDesktop {...view} />
      {productDialog ? (
        <ProductFormDialog
          key={`${productDialog}-${selected?.id ?? 'new'}`}
          mode={productDialog}
          product={selected}
          categories={data.categories}
          bundles={data.bundles}
          onClose={() => (productDialog === 'create' ? setCreatingIntent(false) : closeEdit())}
        />
      ) : null}
    </>
  );
}
