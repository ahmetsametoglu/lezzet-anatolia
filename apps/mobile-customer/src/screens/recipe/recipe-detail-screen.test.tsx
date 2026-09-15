import { formatPrice } from '@lezzet/helper';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resetCart, useCart } from '@/screens/customer-kit/cart-store';
import { RecipeDetailScreen } from './recipe-detail-screen';
import { recipeDetail, recipeRow } from './recipe-fixture';

/*
  TARİF DETAY EKRANI — tel cevabı fixture'dan gelir (fetch mock'u): ekran GERÇEK istemci yolunu
  (`fetchRecipeDetail` → şema doğrulaması) katederek çizilir, hook ayrıca test edilmez (ürün
  ekranı testinin birebir deseni).

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

/** Sepeti okuyan küçük tanık — assert'ler ekrana değil depoya bakar (ürün testinin deseni). */
function CartProbe() {
  const cart = useCart();
  return (
    <Text testID="cart-probe">
      {cart.products.length === 0 ? 'empty' : cart.products.map((line) => `${line.id}:${line.quantity}`).join(',')}
    </Text>
  );
}

async function renderRecipe(body: unknown = recipeDetail()) {
  fetchMock.mockResolvedValue(ok(body));
  await render(
    <>
      <RecipeDetailScreen slug="citir-pazar-kahvaltisi" />
      <CartProbe />
    </>,
  );
  await waitFor(() => expect(screen.queryByTestId('recipe-loading')).toBeNull());
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

describe('tarif detayı', () => {
  it('başlık, üstbaşlık, süre·porsiyon rozeti ve üç bölüm çizilir', async () => {
    await renderRecipe();

    expect(screen.getByRole('header', { name: 'Çıtır Pazar Kahvaltısı' })).toBeOnTheScreen();
    expect(screen.getByText('SOFRADAN FİKİRLER')).toBeOnTheScreen();
    // Rozet iki parçayı ortalı noktayla birleştirir (v3: "{time} · {serves}").
    expect(screen.getByTestId('recipe-badge')).toHaveTextContent('35 dk · 4–5 kişilik');
    expect(screen.getByText('MALZEMELER — BİZDEN')).toBeOnTheScreen();
    expect(screen.getByText('EVİNİZDEN')).toBeOnTheScreen();
    expect(screen.getByText('HAZIRLANIŞI')).toBeOnTheScreen();
    // Evinizden satır = madde; hazırlanış numarasını EKRAN verir (1'den başlar).
    expect(screen.getByText('• Demlik çay')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('satır alt metni boy · fiyat; 2+ adette qty öneki eklenir (sapma 1)', async () => {
    await renderRecipe();

    expect(screen.getByText(`500 g tepsi · ${formatPrice(890, 'tr')}`)).toBeOnTheScreen();
    expect(screen.getByText(`2 × 1000 g tepsi · ${formatPrice(450, 'tr')}`)).toBeOnTheScreen();
  });

  it('satırdaki + tarifin adediyle sepete yazar; kimlik ürün detayıyla aynı şema', async () => {
    await renderRecipe();

    await fireEvent.press(screen.getByTestId(`recipe-add-${recipeRow(2).variantId}`));

    expect(screen.getByTestId('cart-probe')).toHaveTextContent(`mini-pide-${recipeRow(2).variantId}:2`);
  });

  it('tükendi satırda + yok, "Tükendi" var; satır yine ürüne götürür', async () => {
    await renderRecipe();

    const soldOutId = recipeRow(3).variantId;
    expect(screen.queryByTestId(`recipe-add-${soldOutId}`)).toBeNull();
    expect(screen.getByTestId(`recipe-soldout-${soldOutId}`)).toHaveTextContent('Tükendi');

    await fireEvent.press(screen.getByTestId(`recipe-row-${soldOutId}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/product/su-boregi');
  });

  it('hepsini ekle: yalnız eklenebilirler, adediyle; bar toplamı Σ qty × fiyat', async () => {
    await renderRecipe();

    // 890×1 + 450×2 = 1790; tükenen satır (1250) toplama girmez.
    expect(screen.getByTestId('recipe-add-all')).toHaveTextContent(`Malzemeleri sepete ekle · ${formatPrice(1790, 'tr')}`);

    await fireEvent.press(screen.getByTestId('recipe-add-all'));

    expect(screen.getByTestId('cart-probe')).toHaveTextContent(
      `el-acmasi-kol-boregi-${recipeRow(1).variantId}:1,mini-pide-${recipeRow(2).variantId}:2`,
    );
  });

  it('hiçbir satır eklenemiyorsa yapışkan bar çizilmez (sapma 3)', async () => {
    await renderRecipe(
      recipeDetail({
        rows: [recipeRow(1, { soldOut: true }), recipeRow(2, { priceCents: null })],
      }),
    );

    expect(screen.queryByTestId('recipe-bar')).toBeNull();
    // Fiyatsız satırda + da fiyat parçası da yok (sapma 2); satır boy etiketiyle durur.
    expect(screen.queryByTestId(`recipe-add-${recipeRow(2).variantId}`)).toBeNull();
    expect(screen.getByText('1000 g tepsi')).toBeOnTheScreen();
  });

  it('404 "tarif bulunamadı" der — ağ arızası hâliyle karıştırılmaz', async () => {
    fetchMock.mockResolvedValue(fail(404, 'recipe_not_found'));
    await render(<RecipeDetailScreen slug="olmayan-tarif" />);

    await waitFor(() => expect(screen.getByTestId('recipe-missing')).toBeOnTheScreen());
    expect(screen.getByText('Tarif bulunamadı')).toBeOnTheScreen();
  });

  it('ağ hatasında tekrar dene aynı isteği yeniden atar', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValue(ok(recipeDetail()));
    await render(<RecipeDetailScreen slug="citir-pazar-kahvaltisi" />);

    await waitFor(() => expect(screen.getByTestId('recipe-error')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('recipe-error-action'));

    await waitFor(() => expect(screen.getByRole('header', { name: 'Çıtır Pazar Kahvaltısı' })).toBeOnTheScreen());
  });
});
