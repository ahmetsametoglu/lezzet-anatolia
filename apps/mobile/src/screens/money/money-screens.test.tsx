import { render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { MoneyDayEnd, MoneyOverview } from '@lezzet/types';
import { MoneyDayEndScreen } from './day-end-screen';
import { MoneyTrackingScreen } from './money-screen';
import { moneyCopy } from './copy';

/*
  PARA EKRANLARI TESTİ (21.12 Dilim A · M1/M2) — hook taklit edilmez, ağ FETCH seviyesinde sahte,
  cevaplar sözleşme şeklinde.

  Çivilenen kararlar:
  · Bekleyen satır KALAN tutarı ve yöntemi söyler; referanssız satır "referanssız" der (uydurulmaz).
  · Hesap satırları defterdeki ADIYLA çizilir — iki sabit satıra indirgenmez.
  · M2'de kapanan sefer yoksa fark 0 DEĞİL "soru sorulmadı"dır (`noRun` cümlesi).
  · Fark varsa İŞARETLİ yazılır — eksi "eksik" demektir, mutlak değere indirgenmez.
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

const t = moneyCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function overviewData(overrides: Partial<MoneyOverview> = {}): MoneyOverview {
  return {
    pending: [
      {
        orderId: '00000000-0000-4000-8000-000000000001',
        referenceNo: 'LA-26-TEST01',
        customerName: 'Restaurant Bosphore',
        status: 'out_for_delivery',
        kind: 'door',
        remainingCents: 4200,
        method: 'cash',
      },
      {
        orderId: '00000000-0000-4000-8000-000000000002',
        referenceNo: null,
        customerName: 'L. Petit',
        status: 'delivered',
        kind: 'partial',
        remainingCents: 1290,
        method: 'card',
      },
    ],
    todayByMethod: [
      { method: 'online', cents: 61_280 },
      { method: 'cash', cents: 8650 },
    ],
    courierFloat: { cashCents: 7800, cardCents: 2250, chequeCents: 0 },
    accounts: [
      { name: 'Kasa', type: 'cash', cents: 41_230 },
      { name: 'Revolut', type: 'bank', cents: 821_477 },
      { name: 'Stripe', type: 'provider', cents: 12_000 },
    ],
    ...overrides,
  };
}

function dayEndData(overrides: Partial<MoneyDayEnd> = {}): MoneyDayEnd {
  return {
    date: '2026-08-26',
    collectedCents: 73_980,
    refundCents: -1290,
    courierHandoverCents: 6800,
    discrepancy: { expectedCents: 7800, countedCents: 6800 },
    unmatchedMovementCount: 0,
    ...overrides,
  };
}

async function renderScreen(node: React.ReactElement, loadingTestId: string) {
  await render(
    <OperationsSessionProvider value={{ sections: ['money'], userName: 'Meral T.', userEmail: 'meral@lezzetanatolia.fr' }}>
      {node}
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId(loadingTestId)).toBeNull());
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('M1 · tahsilat izleme', () => {
  it('bekleyen satırlar kalan tutar + yöntemle; hesaplar defterdeki adıyla', async () => {
    fetchMock.mockResolvedValue(ok(overviewData()));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByText('LA-26-TEST01')).toBeOnTheScreen();
    expect(screen.getByText('Kapıda 42,00 € · nakit')).toBeOnTheScreen();
    // Kısmi ödenmiş satır KALANI söyler ve referanssız hâli uydurmaz.
    expect(screen.getByText('Kalan 12,90 € · kart')).toBeOnTheScreen();
    expect(screen.getByText(t.track.pending.noRef)).toBeOnTheScreen();
    // Hesaplar adlarıyla — üçüncü hesap (Stripe) iki sabit satıra indirgenip yutulmuyor.
    for (const name of ['Kasa', 'Revolut', 'Stripe']) {
      expect(screen.getByText(name)).toBeOnTheScreen();
    }
  });

  it('bekleyen yoksa boş cümle; bugün tahsilat yoksa kırılım da yokluğu söyler', async () => {
    fetchMock.mockResolvedValue(ok(overviewData({ pending: [], todayByMethod: [] })));

    await renderScreen(<MoneyTrackingScreen />, 'money-tracking-loading');

    expect(screen.getByTestId('money-pending-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('money-today-empty')).toBeOnTheScreen();
  });
});

describe('M2 · gün sonu', () => {
  it('fark İŞARETLİ yazılır — eksik para fazlayla aynı cümleye sokulmaz', async () => {
    fetchMock.mockResolvedValue(ok(dayEndData()));

    await renderScreen(<MoneyDayEndScreen />, 'money-day-end-loading');

    // 6800 − 7800 = −1000 → "−10,00 €" (işaret veriden).
    expect(screen.getByText(/\u221210,00\s?€/u)).toBeOnTheScreen();
    expect(screen.getByText(/Beklenen 78,00 €/u)).toBeOnTheScreen();
  });

  it('kapanan sefer yoksa fark 0 DEĞİL "soru sorulmadı"dır', async () => {
    fetchMock.mockResolvedValue(ok(dayEndData({ discrepancy: null })));

    await renderScreen(<MoneyDayEndScreen />, 'money-day-end-loading');

    expect(screen.getByText(t.dayEnd.discrepancy.noRun)).toBeOnTheScreen();
  });
});
