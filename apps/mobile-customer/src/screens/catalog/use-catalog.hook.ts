import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategory, CatalogCollection, CatalogPage, CatalogProduct, CatalogSort, Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchCategories, fetchProducts } from '@/lib/api/catalog';
import { appMetrics } from '@lezzet/mobile-kit/src/theme/metrics';

/*
  Eski cevap koruması (`generation`) zorunludur: çipe basıp hemen geri dönen ya da harf harf yazan müşteri, geç gelen cevapla yanlış listeyi görürdü.
  Posta kodu süzgeç değil okumanın bağlamıdır: "temizle"nin kapsamına girmez, kod değişince liste baştan okunur ama süzgeçler korunur.
*/

/** İlk yükün üç hâli — kuyruk (sonraki sayfa) durumu ayrı taşınır. */
type CatalogStatus = 'loading' | 'ready' | 'error';

/** Uca giden süzgeçler tek nesnededir, çünkü birlikte bir sorguyu tarif ederler ve yükün hangi kümeyle istendiği kendisinde kalır. */
interface CatalogFilters {
  /** Kategori SLUG'ı; `null` = "Tümü". */
  category: string | null;
  /** Koleksiyon slug'ı; `null` = kesit yok. Kategoriden ayrı bir eksendir, ikisi birlikte açık olabilir ve uç kesişimi döner. */
  collection: string | null;
  /** Aranan metin; boş dize = arama yok (uca hiç gitmez). */
  search: string;
  sort: CatalogSort;
  /** "Adresime gönderilebilir" çipi müşterinin kendi daraltmasıdır, bu yüzden posta kodunun aksine süzgeç kümesinde durur. */
  onlyShippable: boolean;
}

/** Uç kendi varsayılanını (`featured`) zaten taşıyor; buradaki başlangıç onunla AYNI olmalı. */
const DEFAULT_SORT: CatalogSort = 'featured';

interface UseCatalogResult {
  status: CatalogStatus;
  categories: CatalogCategory[];
  /** Seçili kategori SLUG'ı; `null` = "Tümü". */
  activeCategory: string | null;
  /** Bandın tek kaynağı; ad sunucunun cevabından gelir, çünkü derin bağlantıyla gelen ya da dili değişen ekran adı bilmez ve ayrı kaynaktan gelen ad slug'dan ayrışabilir. */
  activeCollection: CatalogCollection | null;
  /** Etkin kesitin kampanyası; `null` = yok. Kararı sunucu verir, ekran yalnız cümleye döker. */
  campaign: CatalogPage['campaign'];
  /** Kutunun gösterdiği metin; uca giden `filters.search`ten ayrıdır, yoksa yazarken atılan kuyruk isteği iki sorgunun sayfalarını karıştırırdı. */
  searchText: string;
  sort: CatalogSort;
  /** "Adresime gönderilebilir" açık mı — çip seçili hâlini bundan okur. */
  onlyShippable: boolean;
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
  /** `null` bandın çarpısı, slug vitrin bandının isteğidir; öteki süzgeçlere dokunmaz, çünkü kesit içinde seçilen kategori müşterinindir. */
  selectCollection: (slug: string | null) => void;
  /** Kutuya yazılan metin; uca gecikmeyle gider. */
  search: (text: string) => void;
  selectSort: (sort: CatalogSort) => void;
  /** Çipi aç/kapat. Ekran kapatmayı da çağırır: yer rota İÇİNE dönünce çip kaybolur ve görünmeyen
   *  bir süzgecin açık kalması listeyi sessizce daraltırdı. */
  setOnlyShippable: (value: boolean) => void;
  loadMore: () => void;
  refresh: () => void;
  retry: () => void;
}

/** Yer değişince katalog yeniden okunur, çünkü eski liste kalırsa müşteri başka bir bölgenin fiyatına bakar. */
export function useCatalog(
  locale: Locale,
  postalCode: string | null,
  pickupWarehouseId: string | null = null,
  country: Country | null = null,
): UseCatalogResult {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>({
    category: null,
    /* Dışarıdan başlangıç değeri alınmaz, çünkü sekme mount kalır ve ikinci bant isteğinde `useState` başlangıcı koşmaz; istek
       kategoriyle aynı kapıdan bir etkiyle uygulanır. */
    collection: null,
    search: '',
    sort: DEFAULT_SORT,
    onlyShippable: false,
  });
  /** Bandın adı — cevabın kendisinden; süzgeç `null`ken sunucu da `null` döner. */
  const [activeCollection, setActiveCollection] = useState<CatalogCollection | null>(null);
  const [campaign, setCampaign] = useState<CatalogPage['campaign']>(null);
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

  /** Kategoriler yalnız açılışta ve yenilemede okunur, çünkü doğal tavanlı küme her süzgeç dokunuşunda yeniden çekilecek bir şey değil. */
  const load = useCallback(
    async (next: CatalogFilters, options: { withCategories: boolean; refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');
      setTailFailed(false);

      const [categoryResult, pageResult] = await Promise.all([
        options.withCategories ? fetchCategories(locale) : Promise.resolve(null),
        fetchProducts({
          locale,
          category: next.category,
          collection: next.collection,
          search: next.search,
          sort: next.sort,
          onlyShippable: next.onlyShippable,
          postalCode,
          country,
          pickupWarehouseId,
        }),
      ]);
      if (run !== generation.current) return;

      setRefreshing(false);
      // Uçuşta kalan kuyruk isteğinin göstergesi burada kapanır, çünkü sayaç değiştiği için onun cevabı yazılmaz ve gösterge
      // kendi sönmezdi.
      setLoadingMore(false);

      /* Kategori rayı düşerse ekran süzgeçsiz AÇILMAZ, hata gösterir. Sessizce daha geniş bir
         liste sunmak, müşteriye seçim yaptığını sanan bir arayüz vermek olurdu — üstelik ray
         boşken bunu anlamasının bir yolu da yok. */
      if (pageResult.error !== null || categoryResult?.error != null) {
        setStatus('error');
        return;
      }

      if (categoryResult !== null) setCategories(categoryResult.data.categories);
      /* Bant HER ilk sayfada tazelenir, yalnız açılışta değil: koleksiyon kalkınca `null` gelir ve
         bandın kendiliğinden sönmesi gerekir. Kuyruk cevabında okunmaz — orada değeri aynıdır ve
         yazmak bant metnini boşuna yeniden çizerdi. */
      setActiveCollection(pageResult.data.activeCollection);
      setCampaign(pageResult.data.campaign);
      setProducts(pageResult.data.products);
      setCursor(pageResult.data.nextCursor);
      setStatus('ready');
    },
    [country, locale, pickupWarehouseId, postalCode],
  );

  /* Ref, çünkü süzgeçler etkinin bağımlılığı olsa her çip dokunuşu ikinci bir açılış yükü tetiklerdi. Eşitleme ayrı ve önce gelen
     etkide, çünkü React etkileri yazım sırasıyla koşturur ve yük etkisi böylece taze değeri görür. */
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  /* Açılış yükü — ve dil/POSTA KODU değiştiğinde yeniden okuma (`load` kimliği o ikisine bağlı).
     Süzgeçler sıfırlanmaz: bölge değiştirmek seçili kategoriyi iptal etmek değildir. */
  useEffect(() => {
    void load(filtersRef.current, { withCategories: true, refresh: false });
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

  const selectCollection = useCallback(
    (slug: string | null) => {
      if (slug === filters.collection) return;
      applyFilters({ ...filters, collection: slug });
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

  const setOnlyShippable = useCallback(
    (value: boolean) => {
      if (value === filters.onlyShippable) return;
      applyFilters({ ...filters, onlyShippable: value });
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

    // Kuyruk da AYNI yerle istenir: sayfalar farklı depoların fiyatlarını taşırsa tek liste iki
    // bölgenin katalogu olur.
    void fetchProducts({
      locale,
      category: filters.category,
      collection: filters.collection,
      search: filters.search,
      sort: filters.sort,
      onlyShippable: filters.onlyShippable,
      cursor,
      postalCode,
      country,
      pickupWarehouseId,
    }).then(
      (result) => {
        // Süzgeç değiştiyse bu kuyruk başka bir listenindir, yazılmaz.
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
  }, [country, cursor, filters, loadingMore, locale, pickupWarehouseId, postalCode, status]);

  return {
    status,
    categories,
    activeCategory: filters.category,
    activeCollection,
    campaign,
    searchText,
    sort: filters.sort,
    onlyShippable: filters.onlyShippable,
    /* Kategori ve koleksiyon sayılmaz, çünkü ikisi ekranda kendi seçili hâliyle görünür; kargo süzgeci süzgeç sayfasında gizli
       kaldığı için sayılır. */
    filtersActive: filters.sort !== DEFAULT_SORT || filters.onlyShippable,
    products,
    hasMore: cursor !== null,
    loadingMore,
    tailFailed,
    refreshing,
    selectCategory,
    selectCollection,
    search,
    selectSort,
    setOnlyShippable,
    loadMore,
    refresh,
    retry,
  };
}
