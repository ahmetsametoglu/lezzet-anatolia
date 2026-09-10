import { formatPrice } from '@lezzet/helper';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetCart, useCart } from '@/screens/customer-kit/cart-store';
import { ProductDetailScreen } from './product-detail-screen';
import { productDetail, productVariant } from './product-fixture';

/*
  ÜRÜN DETAY EKRANI — tel cevabı fixture'dan gelir (fetch mock'u): ekran GERÇEK istemci yolunu
  (`fetchProductDetail` → şema doğrulaması) katederek çizilir, hook ayrıca test edilmez.

  Cihaz dili tr-TR'ye sabitlenir ki assert edilen metinler koşulan makinenin diline bağlı olmasın.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), push: jest.fn(), setParams: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

/* KİMLİK ve YER testten kurulur (21.306): "gelince haber ver" yalnız ÇÖZÜLMÜŞ bir yerde çizilir ve
   girişli/misafir iki ayrı yol izler. Adlar `mock` ile başlamak ZORUNDA (jest hoisting). */
let mockMe: { status: 'ready'; me: { id: string; email: string } } | { status: 'guest'; me: null } = {
  status: 'guest',
  me: null,
};
jest.mock('@/screens/customer-kit/use-me.hook', () => ({
  ...jest.requireActual<object>('@/screens/customer-kit/use-me.hook'),
  useMe: () => ({ ...mockMe, refresh: () => undefined }),
}));
/* Cihazın posta kodu — `useSyncExternalStore` KARARLI bir anlık görüntü ister: nesne testte bir kez
   kurulur, her okumada aynısı döner. `null` = onboarding'de kod verilmedi (öteki testlerin hâli). */
let mockOnboarding: { postalCode: string } | null = null;
jest.mock('@/lib/onboarding/onboarding-store', () => ({
  ...jest.requireActual<object>('@/lib/onboarding/onboarding-store'),
  subscribeOnboarding: () => () => undefined,
  getOnboardingSnapshot: () => mockOnboarding,
}));
// Kayıt KORUNAN uçtan gider (`authorizedFetch` → Bearer): oturum sabit.
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'access-1' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'access-1' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function fail(status: number, error: string): Response {
  return { status, headers: { get: () => null }, json: async () => ({ data: null, error }) } as unknown as Response;
}

/** Sepeti okuyan küçük tanık — assert'ler ekrana değil depoya bakar. */
function CartProbe() {
  const cart = useCart();
  const line = cart.products[0];
  return <Text testID="cart-probe">{line === undefined ? 'empty' : `${line.id}:${line.quantity}`}</Text>;
}

async function renderProduct(body: unknown = productDetail()) {
  fetchMock.mockResolvedValue(ok(body));
  await render(<ProductDetailScreen slug="el-acmasi-kol-boregi" />);
  await waitFor(() => expect(screen.queryByTestId('product-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.back.mockReset();
  mockRouter.push.mockReset();
  mockRouter.setParams.mockReset();
  resetCart();
});

describe('ürün detayı', () => {
  it('başlık, kategori üstbaşlığı ve İLK boyun fiyat rozeti çizilir', async () => {
    await renderProduct();

    expect(screen.getByRole('header', { name: 'El Açması Kol Böreği' })).toBeOnTheScreen();
    expect(screen.getByText('BÖREKLER')).toBeOnTheScreen();
    // İlk boy 8,90 € — rozet ve CTA toplamı aynı satırdan okur (biçim `formatPrice`ın işi, birebir).
    expect(screen.getByTestId('product-price')).toHaveTextContent(formatPrice(890, 'tr'));
    expect(screen.getByTestId('product-add')).toHaveTextContent(`Sepete ekle · ${formatPrice(890, 'tr')}`);
  });

  it('boy seçimi fiyatı, CTA toplamını ve adedi birlikte günceller', async () => {
    await renderProduct();

    await fireEvent.press(screen.getByTestId('product-qty-increase'));
    expect(screen.getByTestId('product-add')).toHaveTextContent(`Sepete ekle · ${formatPrice(1780, 'tr')}`);

    // İkinci boy 17,80 € — seçim adet sayacını 1'e döndürür (şablon `pq:1`).
    await fireEvent.press(screen.getByTestId(`product-variant-${productVariant(2).id}`));
    expect(screen.getByTestId('product-price')).toHaveTextContent(formatPrice(1780, 'tr'));
    expect(screen.getByTestId('product-qty')).toHaveTextContent('1');
    expect(screen.getByTestId('product-add')).toHaveTextContent(`Sepete ekle · ${formatPrice(1780, 'tr')}`);
  });

  it('sepete ekle seçili boyu ve adedi depoya yazar', async () => {
    fetchMock.mockResolvedValue(ok(productDetail()));
    await render(
      <>
        <ProductDetailScreen slug="el-acmasi-kol-boregi" />
        <CartProbe />
      </>,
    );
    await waitFor(() => expect(screen.queryByTestId('product-loading')).toBeNull());

    await fireEvent.press(screen.getByTestId('product-qty-increase'));
    await fireEvent.press(screen.getByTestId('product-add'));

    expect(screen.getByTestId('cart-probe')).toHaveTextContent(`el-acmasi-kol-boregi-${productVariant(1).id}:2`);
  });

  it('içindekiler akordeonu alerjen kodlarını görünen ada çözer', async () => {
    await renderProduct();

    await fireEvent.press(screen.getByTestId('product-acc-ingredients'));

    expect(screen.getByTestId('product-allergens')).toHaveTextContent('Alerjenler: Gluten, Süt, Yumurta');
    expect(screen.getByText('Aynı tesiste Sert kabuklu yemişler işlenmektedir.')).toBeOnTheScreen();
  });

  it('aile çipi yeni sayfa AÇMAZ — aynı rotanın parametresini günceller (kullanıcı kararı 08.08)', async () => {
    await renderProduct();

    await fireEvent.press(screen.getByTestId('product-family-ispanakli-kol-boregi'));

    expect(mockRouter.setParams).toHaveBeenCalledWith({ slug: 'ispanakli-kol-boregi' });
    expect(mockRouter.push).not.toHaveBeenCalled();

    // Bakılan çeşidin çipi ise HİÇBİR yere götürmez (v3: fiyat yerine "Bakıyorsunuz").
    await fireEvent.press(screen.getByTestId('product-family-el-acmasi-kol-boregi'));
    expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
  });

  it('kargosuz ürün bölge-içi uyarısını taşır', async () => {
    await renderProduct(productDetail({ shippable: false }));

    expect(screen.getByTestId('product-noship')).toBeOnTheScreen();
  });

  it('404 "ürün bulunamadı" der — ağ arızası hâliyle karıştırılmaz', async () => {
    fetchMock.mockResolvedValue(fail(404, 'product_not_found'));
    await render(<ProductDetailScreen slug="olmayan-urun" />);

    await waitFor(() => expect(screen.getByTestId('product-missing')).toBeOnTheScreen());
    expect(screen.getByText('Ürün bulunamadı')).toBeOnTheScreen();
  });

  it('ağ hatasında tekrar dene aynı isteği yeniden atar', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValue(ok(productDetail()));
    await render(<ProductDetailScreen slug="el-acmasi-kol-boregi" />);

    await waitFor(() => expect(screen.getByTestId('product-error')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('product-error-action'));

    await waitFor(() => expect(screen.getByRole('header', { name: 'El Açması Kol Böreği' })).toBeOnTheScreen());
  });
});

/*
  "GELİNCE HABER VER" (21.306) — düğme artık GERÇEK bir kayıt bırakıyor (`POST /me/stock-notices`).
  Eskiden yerel bir anahtardı: "✓ Haber verilecek" diyor, hiçbir şey yazmıyordu (ölçüldü 10.09).
  Bar da yalnız olguyu söylüyor: "yakında yeniden gelecek" sözünün arkasında hiçbir veri yoktu.
*/
describe('ürün detayı — gelince haber ver', () => {
  const PLACE = {
    kind: 'resolved',
    place: { country: 'FR', postalCode: '67000', placeName: 'Strasbourg', places: ['Strasbourg'], inRoute: true },
  };
  const SIGNED_IN = { status: 'ready' as const, me: { id: 'customer-1', email: 'ayse@example.com' } };

  function soldOutDetail() {
    const so = { stockStatus: 'out_of_stock' as const, soldOut: true };
    return productDetail({ variants: [productVariant(1, so), productVariant(2, so)] });
  }

  /** Üç uç, tek mock: ürün · yer · kayıt. URL'e bakmayan bir mock üçüne aynı cevabı verirdi. */
  function routeFetch(noticeBody: unknown = { status: 'ok' }) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/places/by-postal-code')) return ok(PLACE);
      if (url.includes('/me/stock-notices')) return ok(noticeBody);
      return ok(soldOutDetail());
    });
  }

  const noticeCall = () => fetchMock.mock.calls.find(([url]) => String(url).includes('/me/stock-notices'));

  async function renderSoldOut() {
    await render(<ProductDetailScreen slug="el-acmasi-kol-boregi" />);
    await waitFor(() => expect(screen.queryByTestId('product-loading')).toBeNull());
  }

  beforeEach(() => {
    mockOnboarding = { postalCode: '67000' };
    mockMe = { status: 'guest', me: null };
  });

  afterEach(() => {
    mockOnboarding = null;
  });

  it('bar yalnız OLGUYU söyler — "yakında yeniden gelecek" sözü yok', async () => {
    routeFetch();
    await renderSoldOut();

    expect(screen.queryByTestId('product-add')).toBeNull();
    const bar = within(screen.getByTestId('product-bar'));
    expect(bar.getByText('Tükendi')).toBeOnTheScreen();
    expect(bar.queryByText(/yakında/)).toBeNull();
  });

  it('girişli müşteri: tek dokunuşta GERÇEK kayıt — gövdede boy ve yer var, e-posta YOK', async () => {
    mockMe = SIGNED_IN;
    routeFetch({ status: 'ok' });
    await renderSoldOut();

    await fireEvent.press(await screen.findByTestId('product-stock-alert'));

    expect(await screen.findByTestId('product-stock-alert-recorded')).toHaveTextContent('✓ Not aldık');
    expect(JSON.parse(String(noticeCall()?.[1]?.body))).toEqual({
      variantId: productVariant(1).id,
      country: 'FR',
      postalCode: '67000',
    });
  });

  it('kayıt ALINMAZSA düğme geri gelir — alınmamış bekleyiş alınmış gibi gösterilmez', async () => {
    mockMe = SIGNED_IN;
    routeFetch({ status: 'place_unknown' });
    await renderSoldOut();

    await fireEvent.press(await screen.findByTestId('product-stock-alert'));

    await waitFor(() => expect(noticeCall()).toBeDefined());
    expect(await screen.findByTestId('product-stock-alert')).toBeOnTheScreen();
    expect(screen.queryByTestId('product-stock-alert-recorded')).toBeNull();
  });

  it('misafir: kayıt yerine DOĞRULAMA çekmecesi açılır — ağa kayıt isteği gitmez', async () => {
    routeFetch();
    await renderSoldOut();

    await fireEvent.press(await screen.findByTestId('product-stock-alert'));

    expect(await screen.findByTestId('product-stock-notice-sheet')).toBeOnTheScreen();
    expect(noticeCall()).toBeUndefined();
  });

  it('yer BİLİNMİYORSA düğme çizilmez — nereye haber vereceğimizi bilmeden kayıt alınmaz', async () => {
    mockOnboarding = null;
    routeFetch();
    await renderSoldOut();

    expect(screen.getByTestId('product-bar')).toBeOnTheScreen();
    expect(screen.queryByTestId('product-stock-alert')).toBeNull();
  });
});
