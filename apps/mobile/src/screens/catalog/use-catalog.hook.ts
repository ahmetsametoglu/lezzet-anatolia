import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategory, CatalogProduct } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchCategories, fetchProducts } from '@/lib/api/catalog';

/*
  KATALOG VERİSİ — kategori rayı (tek tur) + keyset sayfalı ürün listesi.

  SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): `nextCursor` saklanır ve bir sonraki istekte aynen
  geri verilir; `null` gelene kadar liste büyür. İmleç OPAKTIR — içi okunmaz, yorumlanmaz.

  ESKİMİŞ CEVAP KORUMASI (`generation`): süzgeç değişince ya da yenileme başlayınca sayaç artar;
  uçuşta olan eski istekler döndüğünde sayacı tutmadıkları için sonuçları YAZILMAZ. Bu bir incelik
  değil zorunluluk: "Baklava" çipine basıp hemen "Tümü"ne dönen müşteri, ilk isteğin geç gelen
  cevabıyla yanlış listeyi görürdü ve çip "Tümü"de kalırdı.

  HATA YUTULMAZ: ilk yük düşerse ekran hata durumuna geçer (yeniden dene ile aynı sorguyu tekrar
  eder); KUYRUK düşerse liste yerinde kalır ve listenin sonunda tekrar-dene çıkar. İkisi ayrı
  ayrı taşınır çünkü ikisi ayrı şey: biri "hiç veri yok", öteki "devamı gelmedi".
*/

/** İlk yükün üç hâli — kuyruk (sonraki sayfa) durumu ayrı taşınır. */
type CatalogStatus = 'loading' | 'ready' | 'error';

interface UseCatalogResult {
  status: CatalogStatus;
  categories: CatalogCategory[];
  /** Seçili kategori SLUG'ı; `null` = "Tümü". */
  activeCategory: string | null;
  products: CatalogProduct[];
  /** Devam eden sayfa var mı (`nextCursor !== null`) — yoksa liste sonu yazısı çıkar. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Kuyruk isteği düştü — liste yerinde, devamı gelmedi. */
  tailFailed: boolean;
  refreshing: boolean;
  selectCategory: (slug: string | null) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useCatalog(locale: Locale): UseCatalogResult {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu. Her yeni yük artırır; eski cevaplar sessizce düşer. */
  const generation = useRef(0);

  /**
   * İlk sayfayı (ve gerekiyorsa kategori rayını) getirir.
   *
   * Kategoriler yalnız AÇILIŞTA ve YENİLEMEDE okunur, çip değişiminde okunmaz: doğal tavanlı bir
   * küme her süzgeç dokunuşunda yeniden çekilecek bir şey değil.
   */
  const load = useCallback(
    async (category: string | null, options: { withCategories: boolean; refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');
      setTailFailed(false);

      const [categoryResult, pageResult] = await Promise.all([
        options.withCategories ? fetchCategories(locale) : Promise.resolve(null),
        fetchProducts({ locale, category }),
      ]);
      if (run !== generation.current) return;

      setRefreshing(false);
      // Uçuşta kalmış bir kuyruk isteği varsa göstergesi burada kapanır: onun cevabı artık
      // yazılmayacak (sayaç değişti), yani gösterge kendi kendine sönmezdi.
      setLoadingMore(false);

      /* Kategori rayı düşerse ekran süzgeçsiz AÇILMAZ, hata gösterir. Sessizce daha geniş bir
         liste sunmak, müşteriye seçim yaptığını sanan bir arayüz vermek olurdu — üstelik ray
         boşken bunu anlamasının bir yolu da yok. */
      if (pageResult.error !== null || categoryResult?.error != null) {
        setStatus('error');
        return;
      }

      if (categoryResult !== null) setCategories(categoryResult.data.categories);
      setProducts(pageResult.data.products);
      setCursor(pageResult.data.nextCursor);
      setStatus('ready');
    },
    [locale],
  );

  // Açılış yükü. `load` yalnız dile bağlı olduğu için bu etki bir kez koşar.
  useEffect(() => {
    void load(null, { withCategories: true, refresh: false });
  }, [load]);

  const selectCategory = useCallback(
    (slug: string | null) => {
      if (slug === activeCategory) return;
      setActiveCategory(slug);
      // Süzgeç değişimi ETKİYLE değil doğrudan tetiklenir: seçimin ne zaman yeni bir okuma
      // başlattığı, bir bağımlılık dizisinden değil buradan okunsun.
      void load(slug, { withCategories: false, refresh: false });
    },
    [activeCategory, load],
  );

  const refresh = useCallback(() => {
    void load(activeCategory, { withCategories: true, refresh: true });
  }, [activeCategory, load]);

  const retry = useCallback(() => {
    void load(activeCategory, { withCategories: true, refresh: false });
  }, [activeCategory, load]);

  const loadMore = useCallback(() => {
    // Liste bittiyse, zaten yükleniyorsa ya da ekranda veri yoksa kuyruk istenmez. `FlatList`
    // `onEndReached`i cömertçe tetikler; kapı burada.
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchProducts({ locale, category: activeCategory, cursor }).then((result) => {
      // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (süzgeç değişti) — yazılmaz.
      if (run !== generation.current) return;
      setLoadingMore(false);
      if (result.error !== null) {
        setTailFailed(true);
        return;
      }
      setProducts((current) => [...current, ...result.data.products]);
      setCursor(result.data.nextCursor);
    });
  }, [activeCategory, cursor, loadingMore, locale, status]);

  return {
    status,
    categories,
    activeCategory,
    products,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    selectCategory,
    loadMore,
    refresh,
    retry,
  };
}
