import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, waitFor } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { renderShell } from '@/testing/render-shell';

import { meFixture } from '@/screens/operations/me-fixture';

/*
  SUNUCUNUN REDDETTİĞİ OTURUM, GERÇEK ROTA AĞACINDA (21.304) — zincirin tamamı GERÇEK: kök düzen
  ve oradaki istekler, operasyon kapısı, `authorizedFetch`in tazeleme dalı, oturum sonu
  (`lib/auth/session-end`), kökteki giriş kancası, giriş rotasının `notice` süzgeci ve giriş
  ekranının cümlesi. Taklit edilen yalnız TEL (`fetch`) ve supabase istemcisi; ikincisi gerçeğin
  iki davranışını taşıyor: çıkış oturumu boşaltıp `SIGNED_OUT` yayar, oturum yokken tazeleme
  "oturum yok" der.

  Cihazda ölçülen tablo (10.09): oturum sunucuda silinmiş, korunan uçlar 401, auth sunucusu
  tazelemeye `refresh_token_not_found` diyor. Eski hâlde personel ekranlarda "Bağlantı ya da sunucu
  sorunu" okudu, jetonun süresi dolana kadar kabukta kaldı, sonra sessizce vitrine düştü.

  Bu dosya ilk tasarımı da düşürdü: sebep kapıda tutuluyordu ve ret, kapı daha monte olmadan
  kökteki bir istekten geldiğinde personel yine vitrine düştü. Karar o yüzden köke taşındı.

  İkinci test kararın öteki yüzü: auth sunucusuna ULAŞILAMIYORSA oturum ölü değildir ve kimse
  dışarı atılmaz.

  `renderRouter` sahte zamanlayıcı kurar (`jest.useFakeTimers`): bekleme `setTimeout`la değil,
  gözlenebilir bir koşulla (`waitFor`) yapılır — ilk yazımda o yüzden test 15 sn asılı kaldı.

  Dosya `src/app/` içine konamaz — expo-router o klasördeki her `.tsx`i rota sayar (kabuk
  testlerinin künyesi).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

// İlk-açılış kapısı tamamlanmış sayılır (operasyon kabuğu testinin aynı gerekçesi).
jest.mock('@/lib/onboarding/onboarding-store');

/** Cihazdaki oturum — çıkış onu boşaltır ve abonelere `SIGNED_OUT` yayar (supabase'in sırası). */
let mockSession: { access_token: string } | null = null;
/** Auth sunucusunun tazelemeye cevabı — iki testin ayırdığı tek şey bu. */
let mockRefreshError: unknown = null;
const mockAuthListeners = new Set<(event: string, session: null) => void>();
const mockSignOut = jest.fn(async (_options: { scope: string }) => {
  mockSession = null;
  mockAuthListeners.forEach((listener) => listener('SIGNED_OUT', null));
  return { error: null };
});
/** Oturum yokken gerçek istemci ağa çıkmaz, "oturum yok" der — tazeleme ancak oturum varken sorulur. */
const mockRefreshSession = jest.fn(async () => {
  const { AuthSessionMissingError } = jest.requireActual('@supabase/supabase-js');
  return { data: { session: null }, error: mockSession === null ? new AuthSessionMissingError() : mockRefreshError };
});
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: () => mockRefreshSession(),
      signOut: (options: { scope: string }) => mockSignOut(options),
      onAuthStateChange: (listener: (event: string, session: null) => void) => {
        mockAuthListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(listener) } } };
      },
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

/**
 * Kapı açılır (kimlik + kapsam), öteki her korunan uç 401 — oturum sunucuda silinmiş, kökteki
 * istekler (sepet, push kaydı) de aynı cevabı alıyor.
 */
function serverAfterRevocation(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const path = new URL(String(input)).pathname;
  if (path === '/api/v1/me') return Promise.resolve(reply(200, { data: meFixture(['courier']), error: null }));
  if (path === '/api/v1/operations/scope') {
    return Promise.resolve(reply(200, { data: { warehouses: [], resolvedId: null }, error: null }));
  }
  return Promise.resolve(reply(401, { data: null, error: 'unauthorized' }));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(serverAfterRevocation);
  mockSignOut.mockClear();
  mockRefreshSession.mockClear();
  mockAuthListeners.clear();
  mockSession = { access_token: 'test-token' };
  mockRefreshError = null;
});

describe('sunucunun reddettiği oturum (21.304)', () => {
  it('auth sunucusu tazelemeyi KESİN reddederse giriş ekranı SEBEBİYLE açılır', async () => {
    mockRefreshError = new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found');

    const { app } = await renderShell('/courier');

    await waitFor(() => expect(app).toHavePathname('/login'));
    expect(await screen.findByTestId('login-notice')).toHaveTextContent(
      'Oturumunuz sona erdi — devam etmek için yeniden doğrulanın.',
    );
    // Tek kapanış: aynı anda düşen istekler aynı kapanışı paylaştı, ikinci `SIGNED_OUT` doğmadı.
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('auth sunucusuna ULAŞILAMAZSA oturum korunur — kesinti personeli kabuktan atmaz', async () => {
    mockRefreshError = new AuthRetryableFetchError('Bad Gateway', 502);

    const { app } = await renderShell('/courier');

    expect(await screen.findByTestId('operations-section-courier')).toBeOnTheScreen();
    // Korunan okumalar 401 alıp tazelemeyi sordu; cevabın işlenmesi aynı tur içinde biter.
    await waitFor(() => expect(mockRefreshSession).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(app).toHavePathname('/courier');
    expect(screen.queryByTestId('login-notice')).toBeNull();
  });
});
