import { act, renderHook, waitFor } from '@testing-library/react-native';

import { catalogCategory, catalogProduct } from './catalog-fixture';
import { useCatalog } from './use-catalog.hook';
import { appMetrics } from '@/theme/metrics';

/*
  GERÇEK AĞ YOK: `fetch` sarmalanıp taklit ediliyor, ama zarf istemcisi (`apiFetch`) ve Zod
  sözleşmesi GERÇEK — testin doğruladığı şey sorgu dizesinin kuruluşu ve imlecin gidiş-dönüşü de
  olsun. Hook'un kendisini taklit eden bir test, tam da kırılabilecek yeri atlardı.

  RNTL v14 ASENKRON: `renderHook`/`act` birer söz döndürür ve beklenmezse React "act(...) ortamı
  yok" diye uyarır, `result` de kurulmaz.
*/

function okResponse(data: unknown): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data, error: null }),
  } as unknown as Response;
}

function failResponse(error: string, status = 500): Response {
  return {
    status,
    headers: { get: () => null },
    json: async () => ({ data: null, error }),
  } as unknown as Response;
}

const categories = { categories: [catalogCategory(1, 'baklava', 'Baklava'), catalogCategory(2, 'zeytin', 'Zeytin')] };
const page = (products: number[], nextCursor: string | null) => ({
  products: products.map((index) => catalogProduct(index)),
  total: 40,
  nextCursor,
});

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Çağrılan adresler — sorgu dizesinin doğru kurulduğu buradan okunur. */
const requestedUrls = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));

const categoryCalls = (): string[] => requestedUrls().filter((url) => url.includes('/categories'));

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => fetchMock.mockReset());

/** Açılış: kategori rayı + ilk sayfa aynı turda istenir (sıra garanti değil, adresle eşlenir). */
function mockOpening(first = page([1, 2], 'cursor-2')) {
  fetchMock.mockImplementation((url) => Promise.resolve(String(url).includes('/categories') ? okResponse(categories) : okResponse(first)));
}

/** `null` = posta kodu yok (yer bilinmiyor) — bu dosyadaki testlerin hiçbiri yere bağlı değil. */
async function openCatalog(locale: 'tr' | 'fr' | 'de' = 'fr') {
  const { result } = await renderHook(() => useCatalog(locale, null));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  return result;
}

describe('useCatalog', () => {
  it('cevap gelene kadar yükleniyor durumunda kalır (ekran iskeleti bunu okur)', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    const { result } = await renderHook(() => useCatalog('fr', null));

    expect(result.current.status).toBe('loading');
    expect(result.current.products).toHaveLength(0);
  });

  it('açılışta kategori rayını ve ilk sayfayı getirir', async () => {
    mockOpening();

    const result = await openCatalog();

    expect(result.current.categories).toHaveLength(2);
    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-1', 'urun-2']);
    expect(result.current.hasMore).toBe(true);
    // Dil HER istekte gider: uç dilsiz çağrıyı 400'le reddediyor.
    expect(requestedUrls().every((url) => url.includes('locale=fr'))).toBe(true);
  });

  it('imleçle ikinci sayfayı EKLER, imleç bitince liste kapanır', async () => {
    mockOpening();
    const result = await openCatalog();

    fetchMock.mockResolvedValueOnce(okResponse(page([3, 4], null)));
    await act(() => result.current.loadMore());

    // İmleç OPAK: sunucudan geleni yorumlamadan geri veriyoruz.
    expect(requestedUrls().at(-1)).toContain('cursor=cursor-2');
    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-1', 'urun-2', 'urun-3', 'urun-4']);
    expect(result.current.hasMore).toBe(false);
  });

  it('liste bittiğinde kuyruk isteği ATILMAZ (imleç yok)', async () => {
    mockOpening(page([1], null));
    const result = await openCatalog();
    const before = fetchMock.mock.calls.length;

    await act(() => result.current.loadMore());

    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it('çip seçimi süzgeci değiştirir: kategori sorguya girer ve liste TAZELENİR (eklenmez)', async () => {
    mockOpening();
    const result = await openCatalog();

    fetchMock.mockResolvedValueOnce(okResponse(page([7], null)));
    await act(() => result.current.selectCategory('baklava'));

    expect(result.current.activeCategory).toBe('baklava');
    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-7']);
    expect(requestedUrls().at(-1)).toContain('category=baklava');
    // Kategori rayı yeniden OKUNMAZ: doğal tavanlı küme, tek turluk (CLAUDE §1).
    expect(categoryCalls()).toHaveLength(1);
  });

  it('"Tümü"ye dönünce kategori süzgeci sorgudan tamamen düşer', async () => {
    mockOpening();
    const result = await openCatalog();

    fetchMock.mockResolvedValueOnce(okResponse(page([7], null)));
    await act(() => result.current.selectCategory('baklava'));

    fetchMock.mockResolvedValueOnce(okResponse(page([1, 2], null)));
    await act(() => result.current.selectCategory(null));

    expect(result.current.activeCategory).toBeNull();
    expect(requestedUrls().at(-1)).not.toContain('category=');
  });

  it('aynı çipe tekrar basmak yeni istek ATMAZ', async () => {
    mockOpening();
    const result = await openCatalog();

    fetchMock.mockResolvedValueOnce(okResponse(page([7], null)));
    await act(() => result.current.selectCategory('baklava'));
    const before = fetchMock.mock.calls.length;

    await act(() => result.current.selectCategory('baklava'));

    expect(fetchMock.mock.calls).toHaveLength(before);
  });

  it('ilk yük düşerse hata durumuna geçer; yeniden dene AYNI sorguyu tekrarlar', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(String(url).includes('/categories') ? okResponse(categories) : failResponse('server_error')),
    );
    const { result } = await renderHook(() => useCatalog('de', null));
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockOpening();
    await act(() => result.current.retry());

    expect(result.current.status).toBe('ready');
    expect(result.current.products).toHaveLength(2);
  });

  it('kategori rayı düşerse ekran SÜZGEÇSİZ açılmaz — hata durumu', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(String(url).includes('/categories') ? failResponse('server_error') : okResponse(page([1], null))),
    );

    const { result } = await renderHook(() => useCatalog('fr', null));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('ağ yokken hata durumu — istek hiç atılamadığında da (status null) aynı kapı', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const { result } = await renderHook(() => useCatalog('fr', null));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('yenileme: liste baştan okunur, kategori rayı da tazelenir, gösterge kapanır', async () => {
    mockOpening();
    const result = await openCatalog('tr');

    mockOpening(page([9], null));
    await act(() => result.current.refresh());

    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-9']);
    expect(result.current.refreshing).toBe(false);
    expect(categoryCalls()).toHaveLength(2);
  });

  it('kuyruk düşerse liste YERİNDE kalır ve tekrar denenebilir (kuyruk yutulmaz)', async () => {
    mockOpening();
    const result = await openCatalog();

    fetchMock.mockResolvedValueOnce(failResponse('server_error'));
    await act(() => result.current.loadMore());

    expect(result.current.tailFailed).toBe(true);
    expect(result.current.status).toBe('ready');
    expect(result.current.products).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    fetchMock.mockResolvedValueOnce(okResponse(page([3], null)));
    await act(() => result.current.loadMore());

    expect(result.current.products).toHaveLength(3);
    expect(result.current.tailFailed).toBe(false);
  });

  it('sıralama seçimi sorguya girer ve süzgeç düğmesini "etkin" yapar', async () => {
    mockOpening();
    const result = await openCatalog();

    // Varsayılan sıralamada süzgeç düğmesi SÖNÜK: rayda görünmeyen bir süzgeç yok demektir.
    expect(result.current.filtersActive).toBe(false);

    fetchMock.mockResolvedValueOnce(okResponse(page([3], null)));
    await act(() => result.current.selectSort('priceDesc'));

    expect(requestedUrls().at(-1)).toContain('sort=priceDesc');
    expect(result.current.filtersActive).toBe(true);
  });

  it('yazılan metin ANINDA görünür, uca GECİKMEYLE gider (her tuş bir uçuş değildir)', async () => {
    jest.useFakeTimers();
    try {
      mockOpening();
      const result = await openCatalog();
      const before = fetchMock.mock.calls.length;

      await act(() => result.current.search('bak'));

      // Kutu yazdığını hemen gösterir; istek henüz atılmadı.
      expect(result.current.searchText).toBe('bak');
      expect(fetchMock.mock.calls).toHaveLength(before);

      fetchMock.mockResolvedValueOnce(okResponse(page([6], null)));
      await act(() => jest.advanceTimersByTime(appMetrics.searchDebounceMs));

      expect(requestedUrls().at(-1)).toContain('q=bak');
    } finally {
      jest.useRealTimers();
    }
  });

  it('yaz-sil: metin başladığı yere dönerse yeni okuma YAPILMAZ', async () => {
    jest.useFakeTimers();
    try {
      mockOpening();
      const result = await openCatalog();
      const before = fetchMock.mock.calls.length;

      await act(() => result.current.search('b'));
      await act(() => result.current.search(''));
      await act(() => jest.advanceTimersByTime(appMetrics.searchDebounceMs));

      expect(fetchMock.mock.calls).toHaveLength(before);
      expect(result.current.searchText).toBe('');
    } finally {
      jest.useRealTimers();
    }
  });

  it('süzgeç değişince UÇUŞTAKİ eski cevap yazılmaz (eskimiş koşu düşer)', async () => {
    mockOpening();
    const result = await openCatalog();

    // "baklava" isteği cevabını GEÇ verecek; arada "zeytin" seçilecek.
    let resolveSlow: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveSlow = resolve)));
    await act(() => result.current.selectCategory('baklava'));

    fetchMock.mockResolvedValueOnce(okResponse(page([5], null)));
    await act(() => result.current.selectCategory('zeytin'));
    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-5']);

    // Geç gelen cevap ekrana YAZILMAZ: seçili çip "zeytin", liste de onun.
    await act(() => resolveSlow?.(okResponse(page([1, 2, 3], 'gec-imlec'))));

    expect(result.current.activeCategory).toBe('zeytin');
    expect(result.current.products.map((product) => product.slug)).toEqual(['urun-5']);
    expect(result.current.hasMore).toBe(false);
  });
});
