import { DISCOVER_UNDO_WINDOW_MS, formatPrice } from '@lezzet/helper';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CROP_CENTER } from '@lezzet/types';

import discoverMessages from '@lezzet/i18n/customer/discover';
import awardMessages from '@lezzet/i18n/customer/points-award';
import { DiscoverScreen } from './discover-screen';

/*
  Keşif bitişinin puan bloğu: yolda oy varken ekran eksik bir sayı yazmamalı. Oy düğmesi kullanılır, çünkü jest de düğme de
  aynı yoldan geçer ve jestin taklidi Reanimated mock'unun ötesine geçmez.
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));

/* Ekranın `locale` prop'u bir test kapısı, puan bloğu ise uygulamanın dilini okur; cihaz dili sabitlenmezse test iki dil
   birden çizer. */
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
      refreshSession: () =>
        Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
  }),
}));

jest.mock('@/lib/discover/pending-swipes-store', () => ({
  appendPendingSwipe: jest.fn(() => Promise.resolve()),
  clearPendingSwipes: jest.fn(() => Promise.resolve()),
  readPendingSwipes: jest.fn(() => Promise.resolve([])),
}));

const CANDIDATE_POINTS = 2;
/** Yazımdan sonraki bakiye — turun kazancından BAĞIMSIZ bir sayı (uçtan geliyor, toplanmıyor). */
const BALANCE_AFTER = 42;
const t = awardMessages.tr;

function okResponse(data: unknown): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({ data, error: null }),
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) =>
    Promise.resolve(
      String(url).includes('/vote')
        ? okResponse({ id: null, pointsAwarded: CANDIDATE_POINTS, balance: BALANCE_AFTER })
        : okResponse({
            reward: null,
            cards: [
              {
                productId: '00000001-0000-4000-8000-000000000000',
                name: 'Aday',
                description: null,
                image: { url: null, crop: CROP_CENTER, frames: null },
              },
            ],
          }),
    ),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DiscoverScreen — bitişteki puan çipi', () => {
  it('son oy hâlâ yoldayken SAYI yazmaz, beklemeyi söyler (MB-16)', async () => {
    await render(<DiscoverScreen signedIn locale="tr" />);
    await act(async () => {});

    await fireEvent.press(screen.getByTestId('discover-like'));
    await act(async () => {});

    // Tur bitti ama oy geri alma penceresinde: toplam henüz turun toplamı değil.
    expect(screen.getByTestId('discover-done')).toBeTruthy();
    expect(screen.getByTestId('discover-award-settling')).toHaveTextContent(t.settling);
    expect(screen.queryByTestId('discover-award')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(DISCOVER_UNDO_WINDOW_MS);
    });

    expect(screen.queryByTestId('discover-award-settling')).toBeNull();
    expect(screen.getByTestId('discover-award')).toBeTruthy();
    expect(screen.getByText(t.points.replace('{points}', String(CANDIDATE_POINTS)))).toBeTruthy();
    // "Ne kadar kazandı" tek başına yetmez, güncel toplam da yazılır.
    expect(screen.getByText(t.total.replace('{points}', String(BALANCE_AFTER)))).toBeTruthy();
  });

  it('girişsiz turda bekleme cümlesi de çizilmez — ödülün sahibi yok', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).includes('/vote')
          ? okResponse({ id: '00000002-0000-4000-8000-000000000000', pointsAwarded: null, balance: null })
          : okResponse({
              reward: null,
              cards: [
                {
                  productId: '00000001-0000-4000-8000-000000000000',
                  name: 'Aday',
                  description: null,
                  image: { url: null, crop: CROP_CENTER, frames: null },
                },
              ],
            }),
      ),
    );

    await render(<DiscoverScreen signedIn={false} locale="tr" />);
    await act(async () => {});

    await fireEvent.press(screen.getByTestId('discover-like'));
    await act(async () => {});

    expect(screen.queryByTestId('discover-award-settling')).toBeNull();
    expect(screen.queryByTestId('discover-award')).toBeNull();
    // Girişsizin karşılığı puan çipi değil, giriş daveti.
    expect(screen.getByTestId('discover-login')).toBeTruthy();
  });

  // Ziyaretçinin bitişi biriken puanı parasıyla teklif etmezse ya da hesap açmayı ana eylem yapmazsa kırmızıya döner.
  it('girişsiz turun bitişi biriken puanı parasıyla teklif eder, ana eylem hesap açmak', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).includes('/vote')
          ? okResponse({ id: '00000002-0000-4000-8000-000000000000', pointsAwarded: null, balance: null })
          : okResponse({
              reward: { pointsPerCard: CANDIDATE_POINTS, centValue: 5 },
              cards: [
                {
                  productId: '00000001-0000-4000-8000-000000000000',
                  name: 'Aday',
                  description: null,
                  image: { url: null, crop: CROP_CENTER, frames: null },
                },
              ],
            }),
      ),
    );

    await render(<DiscoverScreen signedIn={false} locale="tr" />);
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('discover-like'));
    await act(async () => {
      jest.advanceTimersByTime(DISCOVER_UNDO_WINDOW_MS);
    });

    const offer = discoverMessages.tr.offer;
    const money = formatPrice(CANDIDATE_POINTS * 5, 'tr');
    expect(screen.getByText(offer.body.replace('{points}', String(CANDIDATE_POINTS)).replace('{money}', money))).toBeTruthy();
    expect(screen.getByTestId('discover-offer')).toBeTruthy();
    expect(screen.queryByTestId('discover-login')).toBeNull();
  });
});
