import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CROP_CENTER } from '@lezzet/types';

import awardMessages from '@/screens/customer-kit/points-award-messages.json';
import { DiscoverScreen } from './discover-screen';

/*
  KEŞİF BİTİŞİNİN PUAN BLOĞU (MB-16) — hook'un `pointsSettling` hâli ekranda ne çiziyor.

  Metinler ARTIK KİTİN sözlüğünde (`points-award-messages.json`): blok 15.08'de ortaklaştı, keşif
  ve geri bildirim aynı üç satırı çiziyor. Test o yüzden kitin sözlüğünü okuyor — ekranın kendi
  `messages.json`'unda bu anahtarlar yok.

  Neden ayrı bir ekran testi: arıza cihazda EKRANDA görüldü ("+6 puan"), hook'un dönüşünde değil.
  Hook testi sayının ne zaman tamamlandığını kilitler; burada kilitlenen şey ekranın o hâlde
  EKSİK BİR SAYI YAZMAMASI.

  Kaydırma jesti değil OY DÜĞMESİ kullanılıyor: ikisi de aynı `commit` yolundan geçiyor (ekranın
  kendi künyesi), jestin taklidi ise Reanimated mock'unun ötesine geçmez.
*/

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));

/* Ekranın `locale` PROP'u bir test/demo kapısı; kitin bloğu ise uygulamanın dilini (`useAppLocale`)
   okuyor — gerçek uygulamada ikisi aynı kaynak. Cihaz dili sabitlenmezse test iki dil birden çizer
   (ölçüldü: ekran tr, blok fr). Geri bildirim ekranının testi de aynı mock'u kuruyor. */
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

jest.mock('@/lib/auth/supabase', () => ({
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
const UNDO_WINDOW_MS = 6000;
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
            cards: [
              {
                productId: '00000001-0000-4000-8000-000000000000',
                name: 'Aday',
                description: null,
                image: { url: null, crop: CROP_CENTER },
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
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    expect(screen.queryByTestId('discover-award-settling')).toBeNull();
    expect(screen.getByTestId('discover-award')).toBeTruthy();
    expect(screen.getByText(t.points.replace('{points}', String(CANDIDATE_POINTS)))).toBeTruthy();
    // Kullanıcı isteği 15.08: "ne kadar kazandı" tek başına yetmiyor, "şu an ne kadar oldu" da yazmalı.
    expect(screen.getByText(t.total.replace('{points}', String(BALANCE_AFTER)))).toBeTruthy();
  });

  it('girişsiz turda bekleme cümlesi de çizilmez — ödülün sahibi yok', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        String(url).includes('/vote')
          ? okResponse({ id: '00000002-0000-4000-8000-000000000000', pointsAwarded: null, balance: null })
          : okResponse({
              cards: [
                {
                  productId: '00000001-0000-4000-8000-000000000000',
                  name: 'Aday',
                  description: null,
                  image: { url: null, crop: CROP_CENTER },
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
});
