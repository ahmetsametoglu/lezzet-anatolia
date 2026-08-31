import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CourierVanCandidate, CourierVanStockLine } from '@lezzet/types';

import { CourierVanStockScreen } from './van-stock-screen';

/*
  K · ARACA SERBEST ÜRÜN (v3:19).

  ── NE ÖLÇÜLÜYOR ────────────────────────────────────────────────────────────
  Ekranın taşıdığı tek karar "ne alayım" ve ona ÜÇ yoldan varılıyor: barkod okutma, ürün arama ve
  sık koyulanlar şeridi. İlk ikisi 31.08'e kadar HİÇ ÇİZİLMEMİŞTİ — şeritte olmayan bir ürünü
  araca almanın yolu yoktu ve şerit tavanlı bir seçki (12 satır).

  Ayrıca üç bilgi kararın kendisi ve üçü de eksikti: şerit kartının "araçta N" hâli (kurye aynı
  üründen ikinci kez alıp almadığını göremiyordu), araçtaki satırın "depoda kalan"ı (artırırken
  depoyu boşaltıp boşaltmadığı) ve ✕ (adedi tek tek sıfıra indirmek geri koymanın adı değil).
*/

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
}));

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function okResponse(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const VAN = '00000000-0000-4000-8000-000000000900';
const SOBIYET = '00000000-0000-4000-8000-000000000901';
const BAKLAVA = '00000000-0000-4000-8000-000000000902';

const candidate = (overrides: Partial<CourierVanCandidate> = {}): CourierVanCandidate => ({
  variantId: SOBIYET,
  name: 'Şöbiyet',
  variantLabel: '500 g',
  available: 12,
  onVan: 0,
  ...overrides,
});

const vanLine = (overrides: Partial<CourierVanStockLine> = {}): CourierVanStockLine => ({
  variantId: SOBIYET,
  name: 'Şöbiyet',
  variantLabel: '500 g',
  qty: 3,
  available: 9,
  ...overrides,
});

/** Ekranın tek okuması; arama da AYNI uca gider (yalnız `q` süzgeciyle). */
function mockVanStock(
  body: { onVan?: CourierVanStockLine[]; candidates?: CourierVanCandidate[]; vehicleWarehouseId?: string | null } = {},
  search: CourierVanCandidate[] = [],
) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('q=')) {
      return Promise.resolve(okResponse({ vehicleWarehouseId: VAN, onVan: [], candidates: search }));
    }
    if (address.includes('/van-stock/take') || address.includes('/van-stock/return')) {
      return Promise.resolve(okResponse({ status: 'ok', variantId: SOBIYET, movedQty: 1, vanQty: 4 }));
    }
    return Promise.resolve(
      okResponse({
        vehicleWarehouseId: body.vehicleWarehouseId === undefined ? VAN : body.vehicleWarehouseId,
        onVan: body.onVan ?? [],
        candidates: body.candidates ?? [candidate()],
      }),
    );
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('K · araca serbest ürün', () => {
  it('OKUTMA ve ARAMA kapıları çizilir — şerit tek yol değil', async () => {
    mockVanStock();

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId('courier-van-scan')).toBeOnTheScreen());

    /* İkisi de 31.08'e kadar YOKTU: şerit tavanlı (12 satır) ve rampada kurye ürünü listeden
       aramaz, kutunun üstündeki kodu okutur. */
    expect(screen.getByTestId('courier-van-search')).toBeOnTheScreen();
  });

  it('şerit kartı ADI ve BOYU ayrı yazar, araçta olan ürün HÂLİNİ söyler', async () => {
    mockVanStock({ candidates: [candidate({ onVan: 3, available: 9 })] });

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId(`courier-van-take-${SOBIYET}`)).toBeOnTheScreen());

    const card = screen.getByTestId(`courier-van-take-${SOBIYET}`);
    expect(card).toHaveTextContent(/500 g · depoda 9/);
    /* Kart araçta olan üründe de "dokun, araca al" diyordu — kurye ikinci kez alıp almadığını
       hiçbir yerde göremiyordu (tur 31.08). */
    expect(card).toHaveTextContent(/araçta 3/);
  });

  it('araçtaki satır DEPODA KALANI ve alma sonrası kalacağı söyler; ✕ toptan geri koyar', async () => {
    mockVanStock({ onVan: [vanLine()] });

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId(`courier-van-line-${SOBIYET}`)).toBeOnTheScreen());

    const line = screen.getByTestId(`courier-van-line-${SOBIYET}`);
    expect(line).toHaveTextContent(/500 g · depoda kalan 9/);
    expect(line).toHaveTextContent(/Alındıktan sonra depoda 8 kalır/);

    /* ✕ ADEDİ SIFIRA İNDİRMEK DEĞİL, satırı toptan geri koymaktır: adedi tek tek düşürmek
       kuryeye aynı işi üç kez yaptırırdı. */
    await fireEvent.press(screen.getByTestId(`courier-van-remove-${SOBIYET}`));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/van-stock/return'));
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ variantId: SOBIYET, qty: 3 });
    });
  });

  it('depoda kalan SIFIRSA cümle değişir — pasif düğmenin sebebi düğmede yazmaz', async () => {
    mockVanStock({ onVan: [vanLine({ available: 0 })] });

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId(`courier-van-line-${SOBIYET}`)).toBeOnTheScreen());

    expect(screen.getByTestId(`courier-van-line-${SOBIYET}`)).toHaveTextContent(/Depoda kalanın tamamı/);
  });

  it('SAYAÇ iki sayı taşır — "beş adet" kaç ürüne dağıldığını söylemiyordu', async () => {
    mockVanStock({ onVan: [vanLine({ qty: 3 }), vanLine({ variantId: BAKLAVA, name: 'Baklava', qty: 2 })] });

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId(`courier-van-line-${BAKLAVA}`)).toBeOnTheScreen());

    expect(screen.getByText('2 kalem · 5 adet')).toBeOnTheScreen();
  });

  it('ARAMA aynı uca `q` ile gider ve sonuçtan alınabilir', async () => {
    mockVanStock({}, [candidate({ variantId: BAKLAVA, name: 'Baklava', variantLabel: '450 g', available: 4 })]);

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId('courier-van-search')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-van-search'));
    await fireEvent.changeText(screen.getByTestId('courier-van-search-input'), 'bakla');

    await waitFor(() => expect(screen.getByTestId(`courier-van-take-${BAKLAVA}`)).toBeOnTheScreen());
    /* İkinci bir uç açılmadı: soru aynı ("depodan ne alabilirim"), yalnız süzgeci var. */
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=bakla'))).toBe(true);
  });

  it('OKUTMA kodu KİMLİK olarak gönderir — çeviriyi uç yapar', async () => {
    mockVanStock();

    await render(<CourierVanStockScreen />);
    await waitFor(() => expect(screen.getByTestId('courier-van-scan')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('courier-van-scan'));
    await fireEvent(screen.getByTestId('courier-van-scan-sheet'), 'scan', '8690000000001');

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/van-stock/take'));
      /* Barkod → varyant eşlemesi `variant_barcode`ta ve istemcinin oraya erişimi YOK; kodu
         istemcide çözmeye çalışmak ikinci bir sözleşme kurmak olurdu. */
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ code: '8690000000001', qty: 1 });
    });
  });

  it('ARAÇ DEPOSU YOKSA ekran sebebini söyler, boş bir liste göstermez', async () => {
    mockVanStock({ vehicleWarehouseId: null });

    await render(<CourierVanStockScreen />);

    await waitFor(() => expect(screen.getByTestId('courier-van-stock-no-vehicle')).toBeOnTheScreen());
    expect(screen.queryByTestId('courier-van-scan')).toBeNull();
  });
});
