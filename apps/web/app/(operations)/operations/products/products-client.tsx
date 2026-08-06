'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { loadMoreProductsAction } from './actions/list';
import { ProductFormDialog } from './tabs/product/product-form-dialog';
import { ProductsDesktop } from './products.desktop';
import { productsUrl, type ProductsUrlState } from './products-url';
import type { ProductTab } from './products-paths';
import type { ProductsData, ProductView, StatusFilter } from './products-types';

// Ürünler ekranı client kökü: tek durum ağacı burada, modal görünümün üstünde. Operasyon web'i
// masaüstü-yalnız; mobil deneyim native uygulamada (`docs/uygulama`).
//
// SÜZGEÇ AKIŞI: süzgeç bir client durumu DEĞİL, URL durumudur (STACK §6). Kullanıcı süzgeci değiştirince
// URL yazılır → RSC yeniden okur → süzülmüş İLK SAYFA gelir. Burada client-side filtreleme YOK.
// Arama yazarken her tuşta sunucuya gitmemek için giriş yerel tutulur ve URL'e GECİKMELİ yazılır.

interface ProductsClientProps {
  data: ProductsData;
  /** URL'den çözülmüş ekran durumu (sekme + süzgeçler) — sunucu doğrulamış hâlde verir. */
  urlState: ProductsUrlState;
}

export function ProductsClient({ data, urlState }: ProductsClientProps) {
  const router = useRouter();
  /**
   * Süzgeç/sekme turu sürüyor mu — `router.replace` bir RSC okumasıdır (bu sayfada 5 paralel sorgu) ve
   * dönene kadar ekranda hiçbir karşılık yoktu. (Bağımsız ajan denetimi, 30.07.)
   */
  const [pending, startNav] = useTransition();

  // Sekme SUNUCUYA GİTMEZ (yalnız hangi panelin çizildiğini değiştirir) → sığ yazım (replaceState).
  // Süzgeçler ise RSC'yi yeniden okutur (router.replace), çünkü veriyi sunucu süzüyor.
  const [tab, setTab] = useState<ProductTab>(urlState.tab);
  useEffect(() => setTab(urlState.tab), [urlState.tab]);

  // Oluşturma niyeti de ADRESTE (`new=1`) ama SIĞ yazılır (sekmeden farklı olarak): bir form açmak
  // yeni veri gerektirmez — `router.replace` RSC'yi yeniden okutur, yani boşuna veritabanına gidilir.
  // Neden adres — yenilemede form açık kalır, link doğrudan forma düşer ve sekme değişince niyet
  // ayrı bir sıfırlama etkisine gerek kalmadan TEK yerde düşer (aşağıda, onTab'da).
  const [creating, setCreating] = useState(urlState.creating);
  useEffect(() => setCreating(urlState.creating), [urlState.creating]);

  const writeUrl = (patch: Partial<ProductsUrlState>) => {
    window.history.replaceState(null, '', productsUrl({ ...urlState, tab, creating, ...patch }));
  };

  const onTab = (next: ProductTab) => {
    // Sekme değişimi SIĞ yazılır: dört sekme de aynı okumadan besleniyor (paket özeti tek RPC ile
    // geliyor), yani sunucuya gitmenin getireceği bir veri yok. Bir ara sekmeye bağlı okuma denendi
    // ve gerçek gezinme gerekti; okuma özete inince o gerekçe ortadan kalktı — sekme yine anında.
    //
    // Sekme değişince oluşturma niyeti VE arama düşer. Niyet: "Kategori ekle"ye basıp Paketler'e geçen
    // operatörün önünde kategori formu kalmaz. Arama: terim sekmeye bağlı ("börek" ürün araması,
    // kategori listesinde anlamsız) — taşınsaydı yeni sekme sebebi görünmeyen bir süzgeçle açılırdı.
    setTab(next);
    setCreating(false);
    resetSearch();

    // Terim VARSA sığ yazım yetmez: `replaceState` sunucuya gitmez, gelen veri hâlâ eski terimle
    // süzülüdür. Kutu boşalır, çip kalmaz, ama liste ve başlık sayaçları süzülü kalırdı — görünmez
    // bir süzgeç. Devamını yükleyen action da adresi (artık terimsiz) okuduğu için ikinci sayfa
    // SÜZÜLMEMİŞ gelir ve liste kendi içinde tutarsızlaşırdı.
    if (urlState.q) {
      startNav(() => router.replace(productsUrl({ ...urlState, tab: next, creating: false, q: '' }), { scroll: false }));
      return;
    }
    writeUrl({ tab: next, creating: false, q: '' });
  };

  const setCreatingIntent = (next: boolean) => {
    setCreating(next);
    writeUrl({ creating: next });
  };

  /** Süzgeç değişimi: URL'e yaz + RSC'yi yeniden okut (süzülmüş ilk sayfa gelir). */
  const applyFilters = (patch: Partial<ProductsUrlState>) => {
    startNav(() => router.replace(productsUrl({ ...urlState, ...patch, tab }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli — mekanizma ortak (`useSearchDraft`).
  const { draft: search, onDraft: onSearch, reset: resetSearch } = useSearchDraft(urlState.q, (q) => applyFilters({ q }));

  // ── Sayfalama: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin
  // satırları yeni listede kalır.
  const [extraPages, setExtraPages] = useState<ProductView[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraPages([]);
    setCursor(data.nextCursor);
  }, [data.products, data.nextCursor]);

  const products = [...data.products, ...extraPages];

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

  // Seçim KİMLİKLE tutulur, kayıt taze listeden türetilir (kopya tutulursa güncelleme yansımaz).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // DÜZENLEME adreste değil: seçili satıra bağlı, seçim de yerel. Yalnız düzenlemeyi adrese taşımak
  // yarım iş olurdu (link açılır, hangi kaydın düzenlendiği bilinmez). Oluşturma ise satır gerektirmez.
  const [editing, setEditing] = useState(false);
  const selected = products.find((p) => p.id === selectedId) ?? products[0] ?? null;

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
    navPending: pending,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    selectedId: selected?.id ?? null,
    onSelect: setSelectedId,
    creating,
    openCreate: () => setCreatingIntent(true),
    closeCreate: () => setCreatingIntent(false),
    openEdit: () => setEditing(true),
  };

  // ÜRÜN formu burada; kategori/koleksiyon formları kendi sekme modüllerinde. Kabuk yalnız niyeti
  // taşır, hangi formun açıldığını bilmez.
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
          onClose={() => (productDialog === 'create' ? setCreatingIntent(false) : setEditing(false))}
        />
      ) : null}
    </>
  );
}
