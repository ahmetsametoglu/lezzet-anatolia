import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LoginScreen } from './login-screen';

/*
  HIZLI DOĞRULAMA — GERÇEK akış telden (fetch mock'u): kod isteği + doğrulama istemci yolunu
  (`lib/auth/otp` → zarf + şema) katederek koşar; başarıda oturum cihaza yazılır (supabase mock'u
  bunu kanıtlar). Cihaz dili tr'ye sabit — assert edilen cümleler makine diline bağlı olmasın.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockSetSession = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({ auth: { setSession: mockSetSession } }),
}));

const mockGoogle = jest.fn(async (): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@/lib/auth/oauth', () => ({ signInWithGoogle: () => mockGoogle() }));

/** Üç yollu seçim aşamasından e-posta yoluna iner — akış testlerinin ortak girişi. */
async function toEmailStage() {
  await fireEvent.press(screen.getByTestId('login-email'));
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const SESSION = {
  session: {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    expiresAt: null,
    tokenType: 'bearer',
  },
};

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  mockRouter.back.mockReset();
  mockSetSession.mockClear();
  mockGoogle.mockClear();
});

describe('hızlı doğrulama', () => {
  it('seçim aşaması ÜÇ yolu çizer; WhatsApp bilgi verir, oturum kurmaz', async () => {
    await render(<LoginScreen />);

    expect(screen.getByTestId('login-google')).toBeOnTheScreen();
    expect(screen.getByTestId('login-whatsapp')).toBeOnTheScreen();
    expect(screen.getByTestId('login-email')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('login-whatsapp'));
    expect(screen.getByTestId('login-notice')).toHaveTextContent('WhatsApp ile giriş çok yakında.');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('Google yolu gerçek OAuth akışını çağırır; başarıda ekran kapanır', async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() => expect(mockGoogle).toHaveBeenCalled());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it('Google arızasında seçim aşamasına dönülür ve sebep söylenir', async () => {
    mockGoogle.mockResolvedValueOnce({ error: 'google_unavailable' });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() =>
      expect(screen.getByTestId('login-notice')).toHaveTextContent('Google ile giriş şu an kullanılamıyor — e-posta ile deneyin.'),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('geçersiz e-posta UCA GİTMEDEN yakalanır', async () => {
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'yanlış-adres');
    await fireEvent.press(screen.getByTestId('login-send'));

    expect(screen.getByText('Geçerli bir e-posta adresi girin.')).toBeOnTheScreen();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kod isteği başarılıysa kod aşamasına geçer', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: true, error: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));

    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());
    expect(screen.getByText(/ayse@example\.com/)).toBeOnTheScreen();
  });

  it('bekleme cezası (429) TEK kaynaktan söylenir: sayaç düğmede, düğme kilitli, ayrı hata satırı yok', async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '42' : null) },
      json: async () => ({ data: null, error: 'cooldown' }),
    } as unknown as Response);
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));

    await waitFor(() => expect(screen.getByTestId('login-send')).toHaveTextContent('Biraz bekleyin (42 sn)'));
    // Donmuş bir "bekleyin" cümlesi ayrıca basılMAZ (kullanıcı bulgusu 08.08).
    expect(screen.queryByText(/Yeni kod için biraz bekleyin/)).toBeNull();

    // Kilitliyken basmak yeni istek atmaz.
    await fireEvent.press(screen.getByTestId('login-send'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('yanlış kod: hata söylenir, alan temizlenir, akış kod aşamasında kalır', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    fetchMock.mockResolvedValueOnce(reply(401, { data: null, error: 'invalid_code' }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '111111');

    await waitFor(() => expect(screen.getByText('Kod yanlış — yeniden deneyin.')).toBeOnTheScreen());
    expect(screen.getByTestId('login-code-input').props.value).toBe('');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('doğru kod: oturum cihaza yazılır ve ekran kapanır', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    fetchMock.mockResolvedValueOnce(reply(200, { data: SESSION, error: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '123456');

    await waitFor(() =>
      expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' }),
    );
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it('biçimsiz kod (6 haneden az) UCA HİÇ gitmez', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '123');

    expect(fetchMock).toHaveBeenCalledTimes(1); // yalnız kod İSTEĞİ; doğrulama çağrısı yok
  });
});
