import { render, screen, waitFor } from '@testing-library/react-native';

import { AuthCallbackScreen } from './auth-callback-screen';

/*
  OAUTH DÖNÜŞ EKRANI — derin bağlantının işlendiği tek yer olduğunun kanıtı: kod başarıyla
  değişirse hesaba `replace` + karşılama toast'ı; ret adlı anahtarla login'e döner; kod hiç
  yoksa değişim DENENMEZ (elle açılmış URL'e istek harcanmaz).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: (to: unknown) => mockReplace(to) }) }));

const mockExchange = jest.fn(async (_code: string): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@/lib/auth/oauth', () => ({ exchangeOAuthCode: (code: string) => mockExchange(code) }));

const mockToast = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({ publishToast: (m: string) => mockToast(m) }));

beforeEach(() => {
  mockReplace.mockReset();
  mockExchange.mockClear();
  mockToast.mockReset();
});

describe('AuthCallbackScreen', () => {
  it('kodu oturuma çevirir; başarıda karşılama toast’ı basılır ve hesaba dönülür', async () => {
    await render(<AuthCallbackScreen code="pkce-kodu-1" />);

    expect(screen.getByTestId('auth-callback-busy')).toBeOnTheScreen();
    await waitFor(() => expect(mockExchange).toHaveBeenCalledWith('pkce-kodu-1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/account'));
    expect(mockToast).toHaveBeenCalledWith('Doğrulandı — hoş geldiniz ✓');
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
