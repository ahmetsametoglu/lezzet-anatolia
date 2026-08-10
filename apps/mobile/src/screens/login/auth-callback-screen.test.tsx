import { render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@/lib/api/me';
import { meFixture } from '@/screens/operations/me-fixture';
import { AuthCallbackScreen } from './auth-callback-screen';

/*
  OAUTH DÖNÜŞ EKRANI — derin bağlantının işlendiği tek yer olduğunun kanıtı: kod başarıyla
  değişirse hesaba `replace` + karşılama toast'ı; ret adlı anahtarla login'e döner; kod hiç
  yoksa değişim DENENMEZ (elle açılmış URL'e istek harcanmaz). Künyesi eksik müşteride hesap
  yerine tamamlama akışına gidilir (kullanıcı kararı 10.08).

  OTURUM VE `/me` MOCK'U ŞART: ekran hesaba geçmeden ÖNCE profili okuyor (yarış künyesi kaynak
  dosyada) ve o yol jetonu supabase'den alıyor. Mock eksik bırakılınca test gerçek akışı değil,
  kendi kurgusunun patlamasını ölçüyordu.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'access-1' } } }) } }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: (to: unknown) => mockReplace(to) }) }));

const mockExchange = jest.fn(async (_code: string): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@/lib/auth/oauth', () => ({ exchangeOAuthCode: (code: string) => mockExchange(code) }));

const mockToast = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({ publishToast: (m: string) => mockToast(m) }));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

/** `/me` cevabı — fixture ORTAK (`screens/operations/me-fixture`); ikinci bir `Me` yazılmaz. */
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
    await render(<AuthCallbackScreen code="pkce-kodu-1" />);

    expect(screen.getByTestId('auth-callback-busy')).toBeOnTheScreen();
    await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('pkce-kodu-1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/account'));
    expect(mockToast).toHaveBeenCalledWith('Doğrulandı — hoş geldiniz ✓');
  });

  it('künyesi eksik müşteri hesaba değil tamamlama akışına gider (dönüş yolu hesap)', async () => {
    fetchMock.mockResolvedValue(meReply({ phone: null }));
    await render(<AuthCallbackScreen code="pkce-kodu-1" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/profile-setup', params: { next: '/account' } }),
    );
    expect(mockReplace).not.toHaveBeenCalledWith('/account');
  });

  it('değişim reddi ADLI anahtarla login’e döner — toast basılmaz', async () => {
    mockExchange.mockResolvedValueOnce({ error: 'oauth_failed' });
    await render(<AuthCallbackScreen code="bozuk-kod" />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'oauth_failed' } }),
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('kod yoksa değişim HİÇ denenmez, doğrudan login’e dönülür', async () => {
    await render(<AuthCallbackScreen code={null} />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { notice: 'oauth_failed' } }),
    );
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
