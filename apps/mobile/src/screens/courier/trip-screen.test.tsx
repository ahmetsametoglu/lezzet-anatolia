import { render, screen, waitFor } from '@testing-library/react-native';
import type { CourierDayResponse } from '@lezzet/types';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { courierDay, courierDayRun, courierStop, dayCloseDraft } from './courier-fixture';
import { CourierTripScreen } from './trip-screen';

/*
  K · SEFER KÜNYESİ (v3:1367) — "ne taşıyorum" ekranı.

  ── NE ÖLÇÜLÜYOR ────────────────────────────────────────────────────────────
  Üç sayının da GÜN LİSTESİNDEN türediği. Yeni bir "özet" ucu açılmadı; kutu sayısı durakların
  içinden, tahsilat sayısı kapıda parası kalan duraklardan geliyor. Bir gün biri bu üçünü ayrı
  bir uçtan okumaya kalkarsa, iki ekran aynı seferi iki farklı sayıyla anlatır — test o ayrışmayı
  yakalar.

  Aracın ADI ve rota zinciri de ölçülüyor (30.08): ad varsa ad, araç yoksa "atanmamış", depo adı
  okunamazsa sebebi — üçü ayrı cümle, çünkü üçü ayrı şey.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

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

const STOP_A = '00000000-0000-4000-8000-000000000001';
const STOP_B = '00000000-0000-4000-8000-000000000002';
const STOP_C = '00000000-0000-4000-8000-000000000003';

/** Üç duraklı sefer: üç kutu (2 + 1 + 0) ve kapıda parası kalan tek durak. */
function tripDay(overrides: Partial<Omit<CourierDayResponse, 'stops'>> = {}): CourierDayResponse {
  return courierDay([
    courierStop(1, {
      orderId: STOP_A,
      boxes: [
        { boxNo: 1, code: 'KT-26-AAAAAAAAAA', loadedAt: null },
        { boxNo: 2, code: 'KT-26-BBBBBBBBBB', loadedAt: null },
      ],
      payment: { dueAmountCents: 4200, expectedMethod: 'cash' },
    }),
    courierStop(2, {
      orderId: STOP_B,
      boxes: [{ boxNo: 1, code: 'KT-26-CCCCCCCCCC', loadedAt: null }],
      payment: { dueAmountCents: null, expectedMethod: null },
    }),
    courierStop(3, { orderId: STOP_C, payment: { dueAmountCents: 0, expectedMethod: null } }),
  ], overrides);
}

function mockDay(day: CourierDayResponse) {
  fetchMock.mockImplementation((url) => {
    const address = String(url);
    if (address.includes('/day-close')) return Promise.resolve(okResponse(dayCloseDraft()));
    if (address.includes('/courier/routes')) return Promise.resolve(okResponse({ date: '2026-08-08', routes: [] }));
    return Promise.resolve(okResponse(day));
  });
}

async function renderTrip() {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['courier'],
        userName: 'Musa Kaya',
        userEmail: 'musa@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      <CourierTripScreen />
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('courier-trip-loading')).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('K · sefer künyesi', () => {
  it('üç sayı da durak listesinden türer: 3 durak · 3 kutu · 1 tahsilat', async () => {
    mockDay(tripDay());

    await renderTrip();

    expect(screen.getByTestId('courier-trip-stops')).toHaveTextContent('3');
    expect(screen.getByTestId('courier-trip-boxes')).toHaveTextContent('3');
    // Borcu `null` olan da, `0` olan da tahsilat DEĞİLDİR — kapıda para istenmez.
    expect(screen.getByTestId('courier-trip-collections')).toHaveTextContent('1');
  });

  /*
    ARAÇ VE ROTA ZİNCİRİ (30.08 · uyuşmazlık #12 kapandı).

    30.08'e kadar ekran "araç künyesi bu ekrana ulaşmıyor" yazıyordu — alan sözleşmede yoktu.
    Şimdi var (`vehicleLabel` künyede, `warehouseName` günün seferinde) ve testler ÜÇ hâli birden
    tutuyor: ad varsa ad, araç yoksa "atanmamış", ad okunamazsa sebebi.
  */
  it('aracın ADI yazılır — kurye uuid’den hangi araca gideceğini çıkaramaz', async () => {
    mockDay(tripDay({ run: courierDayRun({ vehicleId: '00000000-0000-4000-8000-000000000900', vehicleLabel: 'FR-482-BX · soğutmalı panelvan' }) }));

    await renderTrip();

    expect(screen.getByTestId('courier-trip-vehicle')).toHaveTextContent(/FR-482-BX · soğutmalı panelvan/);
  });

  it('ARAÇSIZ sefer ile ADI OKUNAMAYAN araç ayrı cümleler', async () => {
    // Araç kaydı zorunlu değil: araçsız sefer bir eksik değil, meşru bir kurulum.
    mockDay(tripDay({ run: courierDayRun({ vehicleId: null, vehicleLabel: null }) }));

    await renderTrip();

    expect(screen.getByTestId('courier-trip-vehicle')).toHaveTextContent(/araç atanmamış/);
  });

  it('rota zinciri "nereden nereye" der — çıkış deposu + bölge', async () => {
    mockDay(tripDay({ run: courierDayRun({ warehouseName: 'Strasbourg Merkez', zoneName: 'Krutenau' }) }));

    await renderTrip();

    expect(screen.getByTestId('courier-trip-route')).toHaveTextContent(/Strasbourg Merkez → Krutenau/);
  });

  it('depo adı OKUNAMAZSA sebep yazılır — uydurma bir ad kuryeyi yanlış rampaya gönderir', async () => {
    mockDay(tripDay({ run: courierDayRun({ warehouseName: null }) }));

    await renderTrip();

    // "Bilinmiyor"u boş satıra düşürmek, kuryeye "depo yok" dedirtirdi (CLAUDE §1).
    expect(screen.getByTestId('courier-trip-route')).toHaveTextContent(/Çıkış deposu okunamadı/);
  });

  it('açık sefer yoksa künye çizilmez; ekran boş hâli gösterir', async () => {
    mockDay(courierDay([], { run: null }));

    await renderTrip();

    expect(screen.getByTestId('courier-trip-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('courier-trip-card')).toBeNull();
    expect(screen.queryByTestId('courier-trip-cta')).toBeNull();
  });
});
