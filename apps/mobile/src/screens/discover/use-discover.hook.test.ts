import { act, renderHook } from '@testing-library/react-native';
import { CROP_CENTER } from '@lezzet/types';

import { useDiscover } from './use-discover.hook';

/*
  KEŞİF TURUNUN PUAN TOPLAMI — MB-16'nın ölçüm dosyası.

  ÖLÇÜLEN ARIZA (cihazda 11.08): 4 oy verildi, deftere 4 × 2 = 8 puan yazıldı, bitiş ekranı
  "+6 puan" dedi. Buradaki ilk test o farkı ÜRETİYOR ve sebebi adlandırıyor: son oy hâlâ geri
  alma penceresinde bekliyor, yani sunucuya HİÇ gitmemiş; toplam eksik değil, HENÜZ TAM DEĞİL.
  Fark bir hesap hatası olsaydı pencere dolduktan sonra da 6 kalırdı — kalmıyor, 8 oluyor.

  GERÇEK AĞ YOK ama zarf istemcisi (`apiFetch`) ve Zod sözleşmesi GERÇEK (`use-catalog.hook.test`
  deseni): taklit edilen tek şey `fetch`. Kaydırma deposu (SecureStore) taklit — cihaz deposu bu
  dosyanın konusu değil ve gerçeği yerel köprü ister.

  SAHTE ZAMANLAYICI + `await act`: geri alma penceresi bir `setTimeout`; `waitFor` kullanılsaydı
  RNTL kendi bekleme döngüsünde zamanı ilerletir ve pencereyi TESTİN İSTEMEDİĞİ bir anda doldururdu.
*/

/* Oturum kapısı taklit (`account-screen.test` deseni): keşif uçları `maybeAuthorizedFetch`ten
   geçiyor ve o da yerel Supabase istemcisini kuruyor — testte ne yerel köprü var ne env. */
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

/** Ayardaki kart başına keşif puanı (`points_feedback_candidate`) — ölçümdeki değer. */
const CANDIDATE_POINTS = 2;
const UNDO_WINDOW_MS = 6000;

const productId = (index: number): string => `0000000${index}-0000-4000-8000-000000000000`;

function okResponse(data: unknown): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve({ data, error: null }),
  } as unknown as Response;
}

const card = (index: number) => ({
  productId: productId(index),
  name: `Aday ${index}`,
  description: null,
  image: { url: null, crop: CROP_CENTER },
});

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** Sunucunun yazdığı puan — girişli müşteride dolu, girişsizde `null` (sözleşme). */
let awardPerVote: number | null = CANDIDATE_POINTS;
/** Yazımdan sonraki bakiye — puanla AYNI koşulda `null` (girişsiz kaydırmanın sahibi yok). */
let balanceAfterVote: number | null = 42;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  jest.useFakeTimers();
  awardPerVote = CANDIDATE_POINTS;
  balanceAfterVote = 42;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) =>
    Promise.resolve(
      String(url).includes('/vote')
        ? okResponse({ id: null, pointsAwarded: awardPerVote, balance: balanceAfterVote })
        : okResponse({ cards: [1, 2, 3, 4].map(card) }),
    ),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

async function openTour(signedIn = true) {
  const { result } = await renderHook(() => useDiscover('tr', signedIn));
  await act(async () => {});
  expect(result.current.status).toBe('ready');
  return result;
}

/** Bir kart kaydırılır; `settle` ise geri alma penceresi de doldurulur (oy sunucuya gider). */
async function swipe(
  result: { current: ReturnType<typeof useDiscover> },
  index: number,
  settle: boolean,
): Promise<void> {
  await act(async () => {
    result.current.vote({ productId: productId(index), vote: 'like' });
  });
  if (!settle) return;
  await act(async () => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
  });
}

describe('useDiscover — turun puan toplamı', () => {
  it('son oy penceredeyken toplam EKSİKTİR ve bunu `pointsSettling` ile söyler (MB-16 ölçümü)', async () => {
    const result = await openTour();

    await swipe(result, 1, true);
    await swipe(result, 2, true);
    await swipe(result, 3, true);
    await swipe(result, 4, false); // dördüncü oy: bitiş ekranı çizilir, oy hâlâ pencerede

    // Cihazda görülen "+6": üç oy yazıldı, dördüncü daha yola çıkmadı.
    expect(result.current.awardedPoints).toBe(3 * CANDIDATE_POINTS);
    // …ve ekran bunu bir TOPLAM sanmasın diye hâl açıkça söyleniyor.
    expect(result.current.pointsSettling).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    expect(result.current.awardedPoints).toBe(4 * CANDIDATE_POINTS);
    expect(result.current.pointsSettling).toBe(false);
  });

  it('yazım UÇUŞTAYKEN de toplam oturmamıştır — pencere dolmak yetmez', async () => {
    let releaseVote: (() => void) | null = null;
    fetchMock.mockImplementation((url) =>
      String(url).includes('/vote')
        ? new Promise<Response>((resolve) => {
            releaseVote = () => resolve(okResponse({ id: null, pointsAwarded: CANDIDATE_POINTS, balance: 42 }));
          })
        : Promise.resolve(okResponse({ cards: [1].map(card) })),
    );

    const result = await openTour();
    await swipe(result, 1, true);

    // Pencere doldu, istek yolda: sayı henüz yok ve "yok" ile "sıfır" karıştırılmıyor.
    expect(result.current.awardedPoints).toBeNull();
    expect(result.current.pointsSettling).toBe(true);

    await act(async () => {
      releaseVote?.();
    });

    expect(result.current.awardedPoints).toBe(CANDIDATE_POINTS);
    expect(result.current.pointsSettling).toBe(false);
  });

  it('geri alınan oy hiç gönderilmez — toplama da girmez', async () => {
    const result = await openTour();

    await swipe(result, 1, true);
    await swipe(result, 2, false);
    await act(async () => {
      result.current.undoLastVote();
    });
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    expect(result.current.awardedPoints).toBe(CANDIDATE_POINTS);
    expect(result.current.pointsSettling).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/vote'))).toHaveLength(1);
  });

  it('girişsiz turda puan SIFIR değil YOKTUR — bekleme hâli de bitmiş sayılır', async () => {
    awardPerVote = null;
    // Bakiye de `null`: ikisi sözleşmede AYNI koşula bağlı (kimliksiz kaydırmanın sahibi yok).
    balanceAfterVote = null;
    const result = await openTour(false);

    await swipe(result, 1, true);

    expect(result.current.awardedPoints).toBeNull();
    expect(result.current.balance).toBeNull();
    expect(result.current.pointsSettling).toBe(false);
  });
});
