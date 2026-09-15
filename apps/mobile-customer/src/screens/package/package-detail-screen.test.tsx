import { formatPrice } from '@lezzet/helper';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetCart, useCart } from '@/screens/customer-kit/cart-store';
import { PackageDetailScreen } from './package-detail-screen';
import { packageDetail } from './package-fixture';

/*
  PAKET DETAY EKRANI — tel cevabı fixture'dan gelir (fetch mock'u): ekran GERÇEK istemci yolunu
  (`fetchPackageDetail` → şema doğrulaması) katederek çizilir, hook ayrıca test edilmez
  (ürün detay testinin deseni birebir).

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

/** Sepetin PAKET satırını okuyan küçük tanık — assert'ler ekrana değil depoya bakar. */
function CartProbe() {
  const cart = useCart();
  const line = cart.bundles[0];
  return <Text testID="cart-probe">{line === undefined ? 'empty' : `${line.id}:${line.quantity}:${line.unitCents}`}</Text>;
}

async function renderPackage(body: unknown = packageDetail()) {
  fetchMock.mockResolvedValue(ok(body));
  await render(<PackageDetailScreen slug="bayram-sofrasi-paketi" />);
  await waitFor(() => expect(screen.queryByTestId('package-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.back.mockReset();
  mockRouter.push.mockReset();
  resetCart();
});

describe('paket detayı', () => {
  it('başlık, ad, tek fiyat ve CTA toplamı çizilir; içerik satırı ad + boy + adet taşır', async () => {
    await renderPackage();

    expect(screen.getByRole('header', { name: 'Hazır Paket' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Bayram Sofrası Paketi' })).toBeOnTheScreen();
    // Fiyat satırı tek Text: tutar + "tek paket fiyatı · KDV dahil" eki (v3:20) birlikte okunur.
    expect(screen.getByTestId('package-price')).toHaveTextContent(`${formatPrice(4990, 'tr')} tek paket fiyatı · KDV dahil`);
    expect(screen.getByTestId('package-add')).toHaveTextContent(`Paketi sepete ekle · ${formatPrice(4990, 'tr')}`);

    // Satır etiketi ad + boy (sapma 4); tek boylu üründe yalnız ad, ayraç uydurulmaz.
    // (Satır kapsayıcısı baş harf + adet + oku da içerir → kısmi eşleşme regex'le.)
    expect(screen.getByTestId('package-item-fistikli-baklava')).toHaveTextContent(/Fıstıklı Baklava · 500 g/);
    expect(screen.getByTestId('package-item-kunefe')).toHaveTextContent(/Künefe(?! ·)/);
    expect(screen.getByTestId('package-item-kunefe')).toHaveTextContent(/×2/);
    // "İçerik değiştirilemez" notu statik metindir — sözleşmeden değil sözlükten gelir.
    expect(screen.getByText(/Paket bütün olarak eklenir; içeriği değiştirilemez\./)).toBeOnTheScreen();
  });

  it('adet sayacı CTA toplamını günceller; 1 tabanı ve 20 tavanı vardır (v3 kuralı)', async () => {
    await renderPackage();

    await fireEvent.press(screen.getByTestId('package-qty-increase'));
    expect(screen.getByTestId('package-qty')).toHaveTextContent('2');
    expect(screen.getByTestId('package-add')).toHaveTextContent(`Paketi sepete ekle · ${formatPrice(9980, 'tr')}`);

    // Taban: 1'in altına inilmez.
    await fireEvent.press(screen.getByTestId('package-qty-decrease'));
    await fireEvent.press(screen.getByTestId('package-qty-decrease'));
    expect(screen.getByTestId('package-qty')).toHaveTextContent('1');

    // Tavan: 20'de durur (şablon `Math.min(20, …)`).
    for (let i = 0; i < 25; i++) await fireEvent.press(screen.getByTestId('package-qty-increase'));
    expect(screen.getByTestId('package-qty')).toHaveTextContent('20');
  });

  it('paketi sepete ekle: paket satırı depoya TEK fiyatla yazılır, tekrar eklemede adet toplanır', async () => {
    fetchMock.mockResolvedValue(ok(packageDetail()));
    await render(
      <>
        <PackageDetailScreen slug="bayram-sofrasi-paketi" />
        <CartProbe />
      </>,
    );
    await waitFor(() => expect(screen.queryByTestId('package-loading')).toBeNull());

    await fireEvent.press(screen.getByTestId('package-qty-increase'));
    await fireEvent.press(screen.getByTestId('package-add'));
    // Satırın kimliği paketin UUID'si — slug DEĞİL (21.21): sunucu sepetindeki adresi budur.
    expect(screen.getByTestId('cart-probe')).toHaveTextContent(`${packageDetail().id}:2:4990`);

    // Aynı paket ikinci kez eklenince satır ÇOĞALMAZ, adet toplanır (`addBundle` kuralı).
    await fireEvent.press(screen.getByTestId('package-add'));
    expect(screen.getByTestId('cart-probe')).toHaveTextContent(`${packageDetail().id}:4:4990`);
  });

  it('içerik satırına basınca ürün detayına gidilir (v3 `it.open`)', async () => {
    await renderPackage();

    await fireEvent.press(screen.getByTestId('package-item-su-boregi'));
    expect(mockRouter.push).toHaveBeenCalledWith('/product/su-boregi');
  });

  it('kargolanamayan paket bölge-içi uyarısını taşır; kargolanan taşımaz', async () => {
    await renderPackage(packageDetail({ shippable: false }));
    expect(screen.getByTestId('package-noship')).toBeOnTheScreen();

    await renderPackage();
    expect(screen.queryByTestId('package-noship')).toBeNull();
  });

  it('404 "paket bulunamadı" der — ağ arızası hâliyle karıştırılmaz', async () => {
    fetchMock.mockResolvedValue(fail(404, 'package_not_found'));
    await render(<PackageDetailScreen slug="olmayan-paket" />);

    await waitFor(() => expect(screen.getByTestId('package-missing')).toBeOnTheScreen());
    expect(screen.getByText('Paket bulunamadı')).toBeOnTheScreen();
  });

  it('ağ hatasında tekrar dene aynı isteği yeniden atar', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValue(ok(packageDetail()));
    await render(<PackageDetailScreen slug="bayram-sofrasi-paketi" />);

    await waitFor(() => expect(screen.getByTestId('package-error')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('package-error-action'));

    await waitFor(() => expect(screen.getByRole('header', { name: 'Bayram Sofrası Paketi' })).toBeOnTheScreen());
  });
});
