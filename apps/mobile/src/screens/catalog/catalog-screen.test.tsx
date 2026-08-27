import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CATALOG_SORTS } from '@lezzet/types';

import { CatalogScreen } from './catalog-screen';
import { catalogCategory, catalogProduct } from './catalog-fixture';
import messages from './messages.json';

/*
  EKRAN TESTİ — durumların hepsi (iskelet · veri · boş · hata) ve çip süzgeci. Hook TAKLİT
  EDİLMEZ: gerçek hook + taklit `fetch` ile koşuyor, yani ekranın gördüğü veri gerçekten
  sözleşmeden geçmiş oluyor.

  RNTL v14 tuzağı: aynı testte İKİNCİ bir `render` öncekini söker — her test tek render kullanır
  ve durumu `fetch` taklidiyle kurar.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın en üstüne kaldırılıyor ve Babel
// yalnız bu önekli değişkenlere kapanış izni veriyor (yoksa tanımsız değişken hatası).
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (href: unknown) => mockPush(href) }) }));

const t = messages.tr;

function okResponse(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function failResponse(): Response {
  return {
    status: 500,
    headers: { get: () => null },
    json: async () => ({ data: null, error: 'server_error' }),
  } as unknown as Response;
}

const categories = { categories: [catalogCategory(1, 'baklava', 'Baklava')] };
const page = (
  products: ReturnType<typeof catalogProduct>[],
  nextCursor: string | null,
  activeCollection: { slug: string; name: string } | null = null,
) => ({
  products,
  total: products.length,
  nextCursor,
  // Sözleşmede ZORUNLU ve nullable (21.64): koleksiyon süzgeci yokken uç `null` döner.
  activeCollection,
  // Aynı kural kampanya için de (08.44): kesitte kampanya yoksa `null` — ekran cümleyi çizmez.
  campaign: null,
});

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Çağrılan adresler — sorgu dizesinin doğru kurulduğu buradan okunur. */
const requestedUrls = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));

/** Kategori rayı hep gelir; ürün cevabını her test kendi kurar. */
function mockCatalog(products: unknown, secondPage?: unknown) {
  let productCalls = 0;
  fetchMock.mockImplementation((url) => {
    if (String(url).includes('/categories')) return Promise.resolve(okResponse(categories));
    productCalls += 1;
    return Promise.resolve(okResponse(productCalls === 1 || secondPage === undefined ? products : secondPage));
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockPush.mockReset();
});

describe('CatalogScreen', () => {
  it('ilk yükte KARE kart iskeletini çizer (daire iskelet emekli — kullanıcı kararı 07.08)', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    await render(<CatalogScreen />);

    expect(screen.getByTestId('catalog-skeleton')).toBeOnTheScreen();
    expect(screen.queryByTestId('catalog-list')).toBeNull();
    // Yükleniyor halkası ekran okuyucuya da konuşur (iskeletin kendisi sessizdir).
    expect(screen.getByRole('progressbar', { name: t.loading })).toBeOnTheScreen();
  });

  it('veri gelince ızgarayı çizer: ad, cihazda biçimlenmiş fiyat ve çeşit satırı', async () => {
    mockCatalog(page([catalogProduct(1), catalogProduct(2, { variantCount: 3, purchaseMode: 'options', priceCents: 850 })], null));

    await render(<CatalogScreen />);

    await waitFor(() => expect(screen.getByTestId('catalog-list')).toBeOnTheScreen());
    expect(screen.getByText('Ürün 1')).toBeOnTheScreen();
    // Fiyat cihazda biçimlendi: sözleşme 1290 cent taşıyor, ekran "12,90 €" yazıyor.
    expect(screen.getByText('12,90 €')).toBeOnTheScreen();
    /* ÇOK BOYLU ÜRÜNDE "…'dan" (MB-20/1, 15.08): kartta yazan sayı en ucuz boyunundur, yani
       başlangıç fiyatıdır — eki yazmamak tutulamayacak bir söz olurdu. Tek boylu Ürün 1 düz
       yazılıyor, üç boylu Ürün 2 ekli; ikisi bir arada olmasa kural yarım çivilenirdi. */
    expect(screen.getByText("8,50 €'dan")).toBeOnTheScreen();
    /* Çeşit satırı yalnız ÇOK boylu üründe ve cümlesi cihazda kuruluyor (API sayı gönderir).
       Tek boylu ürün "1 seçenek" YAZMAZ. */
    expect(screen.getByText('3 seçenek')).toBeOnTheScreen();
    expect(screen.queryByText('1 seçenek')).toBeNull();
  });

  it('tükendi kartı rozetini gösterir; fiyatsız (satışa kapalı) ürün fiyat çipi ÇİZMEZ', async () => {
    mockCatalog(
      page(
        [
          catalogProduct(1, { soldOut: true, stockStatus: 'out_of_stock' }),
          catalogProduct(2, { priceCents: null, comparisonCents: null, stockId: null }),
        ],
        null,
      ),
    );

    await render(<CatalogScreen />);

    /* Rozet BÜYÜK HARFTE ve dönüşüm UYGULAMANIN diliyle: bu dosya `tr-FR` mock'luyor, yani
       "Tükendi" → "TÜKENDİ" (noktalı İ). Stilin `textTransform`una bırakılsaydı dönüşümü Android
       native CİHAZIN diliyle yapardı (ölçüldü 28.08 — `cart-line-row` künyesi). */
    await waitFor(() => expect(screen.getByText('TÜKENDİ')).toBeOnTheScreen());
    // İki üründen yalnız birinin fiyatı var.
    expect(screen.getAllByText('12,90 €')).toHaveLength(1);
  });

  it('liste bittiğinde "hepsi bu kadar" yazar (imleç yok)', async () => {
    mockCatalog(page([catalogProduct(1)], null));

    await render(<CatalogScreen />);

    await waitFor(() => expect(screen.getByText(t.listEnd)).toBeOnTheScreen());
  });

  it('devamı varken liste sonu yazısı ÇIKMAZ, kuyruk istenince sayfa eklenir', async () => {
    mockCatalog(page([catalogProduct(1)], 'imlec-2'), page([catalogProduct(2)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
    expect(screen.queryByText(t.listEnd)).toBeNull();

    await fireEvent(screen.getByTestId('catalog-list'), 'endReached');

    await waitFor(() => expect(screen.getByText('Ürün 2')).toBeOnTheScreen());
    expect(screen.getByText(t.listEnd)).toBeOnTheScreen();
  });

  it('boş sonuç: boş durum çıkar; süzgeç yokken "tüm katalog" düğmesi de çıkmaz', async () => {
    mockCatalog(page([], null));

    await render(<CatalogScreen />);

    await waitFor(() => expect(screen.getByTestId('catalog-empty')).toBeOnTheScreen());
    expect(screen.getByText(t.empty.title)).toBeOnTheScreen();
    expect(screen.queryByTestId('catalog-clear-filter')).toBeNull();
  });

  it('hata durumu: mesaj + yeniden dene; basılınca liste gelir', async () => {
    fetchMock.mockImplementation((url) => Promise.resolve(String(url).includes('/categories') ? okResponse(categories) : failResponse()));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByTestId('catalog-error')).toBeOnTheScreen());
    expect(screen.getByText(t.error.title)).toBeOnTheScreen();

    mockCatalog(page([catalogProduct(1)], null));
    await fireEvent.press(screen.getByTestId('catalog-retry'));

    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
  });

  it('çip seçimi süzgeci değiştirir: kategori sorguya girer, liste tazelenir, çip seçili olur', async () => {
    mockCatalog(page([catalogProduct(1)], null), page([catalogProduct(9)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
    // "Tümü" başlangıçta seçili — seçim a11y'ye de gider.
    expect(screen.getByRole('button', { name: t.all, selected: true })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Baklava' }));

    await waitFor(() => expect(screen.getByText('Ürün 9')).toBeOnTheScreen());
    expect(screen.queryByText('Ürün 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Baklava', selected: true })).toBeOnTheScreen();
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('category=baklava');
  });

  it('süzgeçli boş sonuçta "tüm katalog" düğmesi çıkar ve süzgeci kaldırır', async () => {
    mockCatalog(page([catalogProduct(1)], null), page([], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: 'Baklava' }));
    await waitFor(() => expect(screen.getByTestId('catalog-empty')).toBeOnTheScreen());

    expect(screen.getByTestId('catalog-clear-filter')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('catalog-clear-filter'));

    await waitFor(() => expect(screen.getByRole('button', { name: t.all, selected: true })).toBeOnTheScreen());
  });

  it('arama kutusuna yazmak `q` parametresini uca taşır — ama HER TUŞTA değil', async () => {
    mockCatalog(page([catalogProduct(1)], null), page([catalogProduct(4)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
    const callsBefore = fetchMock.mock.calls.length;

    await fireEvent.changeText(screen.getByTestId('catalog-search'), 'bak');

    // Kutu ANINDA yazdığını gösterir; uç henüz çağrılmaz (gecikme penceresi).
    expect(screen.getByTestId('catalog-search').props.value).toBe('bak');
    expect(fetchMock.mock.calls).toHaveLength(callsBefore);

    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('q=bak'));
    await waitFor(() => expect(screen.getByText('Ürün 4')).toBeOnTheScreen());
  });

  it('boş arama sorguya HİÇ girmez — "arama yok" ile "boş dize aradım" aynı şey değil', async () => {
    mockCatalog(page([catalogProduct(1)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());

    expect(requestedUrls().some((url) => url.includes('q='))).toBe(false);
  });

  it('süzgeç düğmesi sıralama sayfasını açar; seçim uca gider ve sayfa kapanır', async () => {
    mockCatalog(page([catalogProduct(1)], null), page([catalogProduct(5)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('catalog-filter'));
    expect(screen.getByTestId('catalog-sort-featured')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('catalog-sort-priceAsc'));

    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('sort=priceAsc'));
    // Seçim ANINDA uygulanır ve sayfa kapanır — ayrı bir "Göster" düğmesi ekranda duranın kopyası olurdu.
    expect(screen.queryByTestId('catalog-sort-featured')).toBeNull();
    await waitFor(() => expect(screen.getByText('Ürün 5')).toBeOnTheScreen());
  });

  it('sıralama seçenekleri ŞEMADAN türer — elle yazılmış bir liste değil', async () => {
    mockCatalog(page([catalogProduct(1)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByText('Ürün 1')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('catalog-filter'));

    for (const option of CATALOG_SORTS) {
      expect(screen.getByTestId(`catalog-sort-${option}`)).toBeOnTheScreen();
    }
    // Seçili olma bilgisi ekran okuyucuya da gider (görsel ✓ tek başına yetmez).
    expect(screen.getByRole('button', { name: t.sort.featured, selected: true })).toBeOnTheScreen();
  });

  it('karta basınca ürün detay rotasına slug ile gider', async () => {
    mockCatalog(page([catalogProduct(1)], null));

    await render(<CatalogScreen />);
    await waitFor(() => expect(screen.getByTestId('product-urun-1')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('product-urun-1'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[slug]', params: { slug: 'urun-1' } });
  });
});
