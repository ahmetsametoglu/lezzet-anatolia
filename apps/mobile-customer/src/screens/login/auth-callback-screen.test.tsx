import { render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@lezzet/mobile-kit/src/lib/api/me';
import { meFixture } from '@lezzet/mobile-kit/src/testing/me-fixture';
import { AuthCallbackScreen } from './auth-callback-screen';

/*
  Oturum ve `/me` mock'u şart: ekran hesaba geçmeden önce profili okur, jetonu da supabase'den alır.
  Mock eksik kalırsa test gerçek akışı değil kendi kurgusunun patlamasını ölçer.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'access-1' } } }) } }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: (to: unknown) => mockReplace(to) }) }));

const mockExchange = jest.fn(async (_code: string): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@lezzet/mobile-kit/src/lib/auth/oauth', () => ({ exchangeOAuthCode: (code: string) => mockExchange(code) }));

const mockToast = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/* Ekran evi uygulamadan alır: müşteri uygulamasında hesap sekmesi, operasyonun dönüşü kendi girişinde. */
const ROUTES = {
  homeRoute: '/account' as const,
};

/** `/me` cevabı — fixture ortak (`mobile-kit/src/testing/me-fixture`); ikinci bir `Me` yazılmaz. */
function meReply(overrides: Partial<Me> = {}): Response {
  return {
    status: 200,
    headers: { get: () => null },
    json: async () => ({ data: meFixture(['customer'], overrides), error: null }),
  } as unknown as Response;
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  mockReplace.mockReset();
  mockExchange.mockClear();
  mockToast.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(meReply());
});

describe('AuthCallbackScreen', () => {
  it('kodu oturuma çevirir; başarıda karşılama toast’ı basılır ve hesaba dönülür', async () => {
    await render(<AuthCallbackScreen {...ROUTES} code="pkce-kodu-1" />);

    expect(screen.getByTestId('auth-callback-busy')).toBeOnTheScreen();
    await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('pkce-kodu-1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/account'));
    expect(mockToast).toHaveBeenCalledWith('Hoş geldiniz ✓');
  });

  /* Künye eksikliği girişin yolunu değiştirmez: ad ve telefon ilk siparişte istenir. Kardeş OTP testiyle aynı karar. */
  it('künyesi eksik müşteri de doğrudan hesaba gider — tamamlama akışına yollanmaz', async () => {
    fetchMock.mockResolvedValue(meReply({ phone: null }));
    await render(<AuthCallbackScreen {...ROUTES} code="pkce-kodu-1" />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/account'));
  });

  it('değişim reddi ADLI anahtarla login’e döner — toast basılmaz', async () => {
    mockExchange.mockResolvedValueOnce({ error: 'oauth_failed' });
    await render(<AuthCallbackScreen {...ROUTES} code="bozuk-kod" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'oauth_failed' } }),
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('kod yoksa değişim HİÇ denenmez, doğrudan login’e dönülür', async () => {
    await render(<AuthCallbackScreen {...ROUTES} code={null} />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'oauth_failed' } }),
    );
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
