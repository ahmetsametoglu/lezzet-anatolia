import { formatPrice } from '@lezzet/helper';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

  it('tükendi: bar stok anahtarına döner, anahtar basılınca söz verir', async () => {
    const so = { stockStatus: 'out_of_stock' as const, soldOut: true };
    await renderProduct(productDetail({ variants: [productVariant(1, so), productVariant(2, so)] }));

    expect(screen.queryByTestId('product-add')).toBeNull();
    const alert = screen.getByTestId('product-stock-alert');
    expect(alert).toHaveTextContent('Stok gelince haber ver');
    await fireEvent.press(alert);
    expect(alert).toHaveTextContent('✓ Haber verilecek');
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
