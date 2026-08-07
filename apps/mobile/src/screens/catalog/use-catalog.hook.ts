import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategory, CatalogProduct, CatalogSort } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchCategories, fetchProducts } from '@/lib/api/catalog';
import { appMetrics } from '@/theme/metrics';

/*
  KATALOG VERİSİ — kategori rayı (tek tur) + keyset sayfalı ürün listesi + ARAMA ve SIRALAMA.

  SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): `nextCursor` saklanır ve bir sonraki istekte aynen
  geri verilir; `null` gelene kadar liste büyür. İmleç OPAKTIR — içi okunmaz, yorumlanmaz.

  ESKİMİŞ CEVAP KORUMASI (`generation`): süzgeç değişince ya da yenileme başlayınca sayaç artar;
  uçuşta olan eski istekler döndüğünde sayacı tutmadıkları için sonuçları YAZILMAZ. Bu bir incelik
  değil zorunluluk: "Baklava" çipine basıp hemen "Tümü"ne dönen müşteri, ilk isteğin geç gelen
  cevabıyla yanlış listeyi görürdü ve çip "Tümü"de kalırdı. Aynı koruma arama için de geçerli ve
  orada DAHA da gerekli: harf harf yazan bir parmak, her harf için bir uçuş demektir.

  ── YAZILAN ARAMA ile İSTENEN ARAMA AYRI TUTULUR ────────────────────────────
  `searchText` kutunun gösterdiği metindir ve her tuşta değişir; `filters.search` ise UCA GİDEN
  değerdir ve ancak parmak durunca (`searchDebounceMs`) güncellenir. İkisini tek durumda tutmak
  şu somut arızayı doğururdu: müşteri yazarken listenin sonuna gelirse, kuyruk isteği HENÜZ
  istenmemiş bir arama metniyle atılır ve iki farklı sorgunun sayfaları aynı listeye karışırdı.

  HATA YUTULMAZ: ilk yük düşerse ekran hata durumuna geçer (yeniden dene ile aynı sorguyu tekrar
  eder); KUYRUK düşerse liste yerinde kalır ve listenin sonunda tekrar-dene çıkar. İkisi ayrı
  ayrı taşınır çünkü ikisi ayrı şey: biri "hiç veri yok", öteki "devamı gelmedi".
*/

/** İlk yükün üç hâli — kuyruk (sonraki sayfa) durumu ayrı taşınır. */
type CatalogStatus = 'loading' | 'ready' | 'error';

/**
 * UCA GİDEN süzgeç kümesi. Tek nesne, çünkü üçü BİRLİKTE bir sorguyu tarif eder; ayrı ayrı
 * durumlarda tutulsalardı "hangi üçlüyle istendi" sorusunun cevabı yükün kendisinde olmazdı.
 */
interface CatalogFilters {
  /** Kategori SLUG'ı; `null` = "Tümü". */
  category: string | null;
  /** Aranan metin; boş dize = arama yok (uca hiç gitmez). */
  search: string;
  sort: CatalogSort;
}

/** Uç kendi varsayılanını (`featured`) zaten taşıyor; buradaki başlangıç onunla AYNI olmalı. */
const DEFAULT_SORT: CatalogSort = 'featured';

interface UseCatalogResult {
  status: CatalogStatus;
  categories: CatalogCategory[];
  /** Seçili kategori SLUG'ı; `null` = "Tümü". */
  activeCategory: string | null;
  /** Arama kutusunun GÖSTERDİĞİ metin (uca gitmiş olması gerekmez). */
  searchText: string;
  sort: CatalogSort;
  /** Varsayılandan sapan bir süzgeç var mı — süzgeç düğmesi bununla "etkin" görünür. */
  filtersActive: boolean;
  products: CatalogProduct[];
  /** Devam eden sayfa var mı (`nextCursor !== null`) — yoksa liste sonu yazısı çıkar. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Kuyruk isteği düştü — liste yerinde, devamı gelmedi. */
  tailFailed: boolean;
  refreshing: boolean;
  selectCategory: (slug: string | null) => void;
  /** Kutuya yazılan metin; uca gecikmeyle gider. */
  search: (text: string) => void;
  selectSort: (sort: CatalogSort) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

export function useCatalog(locale: Locale): UseCatalogResult {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>({ category: null, search: '', sort: DEFAULT_SORT });
  const [searchText, setSearchText] = useState('');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tailFailed, setTailFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu. Her yeni yük artırır; eski cevaplar sessizce düşer. */
  const generation = useRef(0);
  /** Bekleyen arama zamanlayıcısı — yeni tuş öncekini iptal eder. */
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /**
   * İlk sayfayı (ve gerekiyorsa kategori rayını) getirir.
   *
   * Kategoriler yalnız AÇILIŞTA ve YENİLEMEDE okunur, çip/arama/sıralama değişiminde okunmaz:
   * doğal tavanlı bir küme her süzgeç dokunuşunda yeniden çekilecek bir şey değil.
   */
  const load = useCallback(
    async (next: CatalogFilters, options: { withCategories: boolean; refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');
      setTailFailed(false);

      const [categoryResult, pageResult] = await Promise.all([
        options.withCategories ? fetchCategories(locale) : Promise.resolve(null),
        fetchProducts({ locale, category: next.category, search: next.search, sort: next.sort }),
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
    void load({ category: null, search: '', sort: DEFAULT_SORT }, { withCategories: true, refresh: false });
  }, [load]);

  // Ekrandan çıkarken bekleyen arama zamanlayıcısı iptal edilir: sökülmüş bir ekranın durumunu
  // güncelleyen bir zamanlayıcı, React'te sessiz bir sızıntıdır.
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  /**
   * Süzgeç değişimi ETKİYLE değil DOĞRUDAN tetiklenir: seçimin ne zaman yeni bir okuma başlattığı,
   * bir bağımlılık dizisinden değil buradan okunsun.
   */
  const applyFilters = useCallback(
    (next: CatalogFilters) => {
      setFilters(next);
      void load(next, { withCategories: false, refresh: false });
    },
    [load],
  );

  const selectCategory = useCallback(
    (slug: string | null) => {
      if (slug === filters.category) return;
      applyFilters({ ...filters, category: slug });
    },
    [applyFilters, filters],
  );

  const selectSort = useCallback(
    (sort: CatalogSort) => {
      if (sort === filters.sort) return;
      applyFilters({ ...filters, sort });
    },
    [applyFilters, filters],
  );

  const search = useCallback(
    (text: string) => {
      setSearchText(text);
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        // Metin ARADA geri alınmış olabilir (yaz-sil); o hâlde yeni bir okuma gerekmez.
        if (text.trim() === filters.search) return;
        applyFilters({ ...filters, search: text.trim() });
      }, appMetrics.searchDebounceMs);
    },
    [applyFilters, filters],
  );

  const refresh = useCallback(() => {
    void load(filters, { withCategories: true, refresh: true });
  }, [filters, load]);

  const retry = useCallback(() => {
    void load(filters, { withCategories: true, refresh: false });
  }, [filters, load]);

  const loadMore = useCallback(() => {
    // Liste bittiyse, zaten yükleniyorsa ya da ekranda veri yoksa kuyruk istenmez. `FlatList`
    // `onEndReached`i cömertçe tetikler; kapı burada.
    if (cursor === null || loadingMore || status !== 'ready') return;

    const run = generation.current;
    setLoadingMore(true);
    setTailFailed(false);

    void fetchProducts({ locale, category: filters.category, search: filters.search, sort: filters.sort, cursor }).then(
      (result) => {
        // Bu kuyruk artık BAŞKA bir listenin kuyruğu olabilir (süzgeç değişti) — yazılmaz.
        if (run !== generation.current) return;
        setLoadingMore(false);
        if (result.error !== null) {
          setTailFailed(true);
          return;
        }
        setProducts((current) => [...current, ...result.data.products]);
        setCursor(result.data.nextCursor);
      },
    );
  }, [cursor, filters, loadingMore, locale, status]);

  return {
    status,
    categories,
    activeCategory: filters.category,
    searchText,
    sort: filters.sort,
    /* Kategori çipi bu sayıya GİRMEZ: rayda zaten seçili çip görünüyor ve süzgeç düğmesinin
       "etkin" hâli, rayda görünmeyen bir süzgecin var olduğunu söylemek içindir. */
    filtersActive: filters.sort !== DEFAULT_SORT,
    products,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    selectCategory,
    search,
    selectSort,
    loadMore,
    refresh,
    retry,
  };
}
