import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategory, CatalogCollection, CatalogPage, CatalogProduct, CatalogSort } from '@lezzet/types';
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

  ── YER (POSTA KODU) SÜZGEÇ DEĞİL, OKUMANIN BAĞLAMIDIR ──────────────────────
  Kod `filters`e GİRMEZ: müşteri onu katalogda seçmiyor (kaynak cihazdaki kayıt) ve seçilmiş bir
  süzgeç gibi davranırsa "temizle" düğmesinin kapsamına girerdi. Yine de her isteğe eşlik eder —
  fiyat, teklif ve stok hâli depoya bağlı. Kod DEĞİŞİNCE liste baştan okunur ama SÜZGEÇLER
  KORUNUR (`filtersRef`): bölge değiştirmek, seçili kategoriyi ya da aramayı iptal etmek değildir.
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
  /**
   * Koleksiyon SLUG'ı; `null` = kesit yok (21.64). Kategoriden AYRI bir eksen ve ikisi birlikte
   * açık olabilir: bant çizilirken çip rayı gizlenmiyor, yani müşteri kesitin içinde daraltabiliyor
   * (kullanıcı kararı 16.08). Sorguyu uç AND'liyor.
   *
   * Süzgeç kümesine girmesinin ölçütü öteki üçüyle aynı: uca gidiyor, sayfalamayı sıfırlıyor,
   * `total`ı değiştiriyor.
   */
  collection: string | null;
  /** Aranan metin; boş dize = arama yok (uca hiç gitmez). */
  search: string;
  sort: CatalogSort;
  /**
   * "Adresime gönderilebilir" çipi (21.20) — VARSAYILAN KAPALI ve öteki süzgeçlerle aynı kümede
   * durur, çünkü aynı işi yapar: uca gider, sayfalamayı sıfırlar, `total`ı değiştirir.
   *
   * Posta kodunun kendisi buraya GİRMEZ (o okumanın bağlamı, süzgeç değil — yukarıdaki künye);
   * çip ise müşterinin KENDİ daraltmasıdır ve bir süzgeçtir.
   */
  onlyShippable: boolean;
}

/** Uç kendi varsayılanını (`featured`) zaten taşıyor; buradaki başlangıç onunla AYNI olmalı. */
const DEFAULT_SORT: CatalogSort = 'featured';

interface UseCatalogResult {
  status: CatalogStatus;
  categories: CatalogCategory[];
  /** Seçili kategori SLUG'ı; `null` = "Tümü". */
  activeCategory: string | null;
  /**
   * Etkin koleksiyon — bandın çizileceği tek kaynak; `null` = bant yok.
   *
   * ADI SUNUCUDAN gelir (`CatalogPage.activeCollection`), gezinme parametresinden DEĞİL: vitrin
   * bandı adı biliyor ama derin bağlantıyla gelen ya da dili değişen bir ekran bilmez, ve ad dile
   * göre çözülüyor. Slug ile ad böylece hep aynı cevaptan çıkar; ikisini ayrı kaynaklardan almak,
   * bir gün "Bayram Sofrası" yazıp başka bir kesiti listelemenin yolu olurdu.
   */
  activeCollection: CatalogCollection | null;
  /**
   * **Etkin kesitin kampanyası** (08.44) — `null` = yok ya da süzgeç yok. Karar sunucunun
   * (`getCatalogData` → `readScopeCampaigns`); ekran yalnız cümleye döker.
   */
  campaign: CatalogPage['campaign'];
  /** Arama kutusunun GÖSTERDİĞİ metin (uca gitmiş olması gerekmez). */
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
  /**
   * Koleksiyon kesiti — `null` bandın çarpısıdır (kesitten çık, katalogun tamamına dön), slug ise
   * vitrin bandından gelen istektir. Kategorinin ikizi: TEK kapı, iki yön.
   *
   * Öteki süzgeçlere DOKUNMAZ: müşteri kesitin içinde bir kategori seçtiyse o seçim onundur ve
   * bandı kapatmak onu da iptal etmek anlamına gelmez.
   */
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

/**
 * @param postalCode Cihazdaki saklı posta kodu (`lib/onboarding`); `null` = kod hiç girilmemiş.
 * Yerin SORUSUDUR, cevabı sunucu verir — vitrinle aynı desen (`use-home.hook.ts`). Kod değişince
 * katalog yeniden okunur: eski liste kalırsa müşteri başka bir bölgenin fiyatına bakar.
 */
export function useCatalog(locale: Locale, postalCode: string | null): UseCatalogResult {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>({
    category: null,
    /* Başlangıç DEĞERİ olarak dışarıdan alınmıyor: sekme mount kalıyor (navigatör tembel), yani
       ikinci kez banda basıldığında yeni bir mount olmuyor ve `useState`in başlangıcı hiç
       koşmuyordu. Banttan gelen istek kategoriyle AYNI kapıdan, bir etkiyle uygulanıyor. */
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
        fetchProducts({
          locale,
          category: next.category,
          collection: next.collection,
          search: next.search,
          sort: next.sort,
          onlyShippable: next.onlyShippable,
          postalCode,
        }),
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
      /* Bant HER ilk sayfada tazelenir, yalnız açılışta değil: koleksiyon kalkınca `null` gelir ve
         bandın kendiliğinden sönmesi gerekir. Kuyruk cevabında okunmaz — orada değeri aynıdır ve
         yazmak bant metnini boşuna yeniden çizerdi. */
      setActiveCollection(pageResult.data.activeCollection);
      setCampaign(pageResult.data.campaign);
      setProducts(pageResult.data.products);
      setCursor(pageResult.data.nextCursor);
      setStatus('ready');
    },
    [locale, postalCode],
  );

  /* Etkinin okuduğu GÜNCEL süzgeçler. Ref, çünkü etkinin bağımlılığı olsalardı her çip dokunuşu
     ikinci bir açılış yükü (kategori rayı dahil) tetiklerdi; `load`un içine kapansalardı da yeni
     `load` eski süzgeçle koşardı. Eşitleme AYRI ve ÖNCE gelen bir etkide: React etkileri yazım
     sırasına göre koşturur, yani aşağıdaki yük etkisi hep taze değeri görür. */
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
    }).then(
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
  }, [cursor, filters, loadingMore, locale, postalCode, status]);

  return {
    status,
    categories,
    activeCategory: filters.category,
    activeCollection,
    campaign,
    searchText,
    sort: filters.sort,
    onlyShippable: filters.onlyShippable,
    /* Kategori çipi bu sayıya GİRMEZ: rayda zaten seçili çip görünüyor ve süzgeç düğmesinin
       "etkin" hâli, rayda görünmeyen bir süzgecin var olduğunu söylemek içindir.

       KARGO SÜZGECİ ARTIK GİRER (kullanıcı isteği 10.08): çipken ekranda kendi seçili hâliyle
       duruyordu ve bu sayıya girmesi gereksizdi; süzgeç sayfasına taşınınca kapalı sayfanın
       arkasında görünmez oldu — düğmenin dolu hâli onun var olduğunu söyleyen TEK işaret.

       KOLEKSİYON GİRMEZ (21.64), ölçüt yine aynı: bant ekranda, adıyla ve çarpısıyla duruyor.
       Görünen bir süzgeci düğmede ikinci kez işaretlemek, müşteriye kapalı süzgeç sayfasında
       arayacağı bir şey varmış demek olurdu. */
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
