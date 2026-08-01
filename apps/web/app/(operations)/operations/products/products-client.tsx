'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { loadMoreProductsAction } from './actions/list';
import { setProductStatusAction } from './tabs/product/actions';
import { ProductFormDialog } from './tabs/product/product-form-dialog';
import { ProductsDesktop } from './products.desktop';
import { ProductsMobile } from './products.mobile';
import { productsUrl, type ProductsUrlState } from './products-url';
import type { ProductTab } from './products-paths';
import type { ProductsData, ProductView, StatusFilter } from './products-types';

// Ürünler ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
// İlk boya sunucu cihaz ipucuyla; mount sonrası viewport'a göre düzeltilir. Modal her iki yüzeyin üstünde.
//
// SÜZGEÇ AKIŞI: süzgeç bir client durumu DEĞİL, URL durumudur (STACK §6). Kullanıcı süzgeci değiştirince
// URL yazılır → RSC yeniden okur → süzülmüş İLK SAYFA gelir. Burada client-side filtreleme YOK.
// Arama yazarken her tuşta sunucuya gitmemek için giriş yerel tutulur ve URL'e GECİKMELİ yazılır.

/** Arama kutusunun URL'e yazılma gecikmesi (ms) — parametrik; yazarken her tuşta sunucuya gidilmesin. */
const SEARCH_DEBOUNCE_MS = 350;

interface ProductsClientProps {
  data: ProductsData;
  device: Device;
  /** URL'den çözülmüş ekran durumu (sekme + süzgeçler) — sunucu doğrulamış hâlde verir. */
  urlState: ProductsUrlState;
}

export function ProductsClient({ data, device, urlState }: ProductsClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [, startTransition] = useTransition();
  /**
   * Süzgeç/sekme turu sürüyor mu — `router.replace` bir RSC okumasıdır (bu sayfada 5 paralel sorgu) ve
   * dönene kadar ekranda hiçbir karşılık yoktu. Yazma turunun `startTransition`'ından AYRI: ikisi aynı
   * bayrağı paylaşırsa bir kaydetme de listeyi soluklaştırırdı. (Bağımsız ajan denetimi, 30.07.)
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
    setSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);

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

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli. Sunucu değeri değişince yerel giriş eşitlenir.
  const [search, setSearch] = useState(urlState.q);
  useEffect(() => setSearch(urlState.q), [urlState.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
  };
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  // Aktiflik geçişi kalıcı (server action) — başarınca RSC listeyi tazeler (hata sessiz; sunucu = gerçek).
  // Anahtar iki durumlu, durum alanı üç: aday'a geçiş formdaki seçicide (kazayla adaylığa düşmesin).
  const onToggleActive = (id: string, isActive: boolean) => {
    startTransition(async () => {
      const { error } = await setProductStatusAction(id, isActive ? 'active' : 'passive');
      if (!error) router.refresh();
    });
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
    onToggleActive,
  };

  // ÜRÜN formu burada; kategori/koleksiyon formları kendi sekme modüllerinde. Kabuk yalnız niyeti
  // taşır, hangi formun açıldığını bilmez.
  const productDialog = tab === 'products' && creating ? 'create' : editing ? 'edit' : null;

  return (
    <>
      {resolvedDevice === 'mobile' ? <ProductsMobile {...view} /> : <ProductsDesktop {...view} />}
      {productDialog ? (
        <ProductFormDialog
          key={`${productDialog}-${selected?.id ?? 'new'}`}
          mode={productDialog}
          product={selected}
          categories={data.categories}
          bundles={data.bundles}
          device={resolvedDevice}
          onClose={() => (productDialog === 'create' ? setCreatingIntent(false) : setEditing(false))}
        />
      ) : null}
    </>
  );
}
