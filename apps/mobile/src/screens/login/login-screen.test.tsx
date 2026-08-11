import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Me } from '@/lib/api/me';
import { meFixture } from '@/screens/operations/me-fixture';
import { LoginScreen } from './login-screen';

/*
  HIZLI DOĞRULAMA — GERÇEK akış telden (fetch mock'u): kod isteği + doğrulama istemci yolunu
  (`lib/auth/otp` → zarf + şema) katederek koşar; başarıda oturum cihaza yazılır (supabase mock'u
  bunu kanıtlar). Cihaz dili tr'ye sabit — assert edilen cümleler makine diline bağlı olmasın.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockSetSession = jest.fn(async () => ({ error: null }));
/* `getSession` de gerekli: doğrulama bitince ekran KÜNYEYİ okuyor (`fetchMe` → yetkili istek) ve
   o yol oturum jetonunu buradan alıyor. Eksik bırakılırsa test gerçek akışı değil, mock'un
   patlamasını ölçer. */
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      setSession: mockSetSession,
      getSession: async () => ({ data: { session: { access_token: 'access-1' } } }),
    },
  }),
}));

const mockGoogle = jest.fn(async (): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@/lib/auth/oauth', () => ({ signInWithGoogle: () => mockGoogle() }));

const mockDevSignIn = jest.fn(async (_email: string): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@/lib/auth/dev-login', () => ({
  DEV_ACCOUNTS: [
    { label: 'Müşteri', email: 'musteri@test.fr', operations: false },
    { label: 'Kurye', email: 'kurye@test.fr', operations: true },
  ],
  devSignIn: (email: string) => mockDevSignIn(email),
}));

// Toast deposu gerçek zamanlayıcı açıyor (2400 ms) — mock, koşu sonunda asılı tanıtıcı bırakmasın.
const mockToast = jest.fn();
jest.mock('@/lib/toast/toast-store', () => ({ publishToast: (m: string) => mockToast(m) }));

/** Üç yollu seçim aşamasından e-posta yoluna iner — akış testlerinin ortak girişi. */
async function toEmailStage() {
  await fireEvent.press(screen.getByTestId('login-email'));
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

/**
 * `/me` cevabı — künye kapısının okuduğu gövde. Fixture ORTAK (`screens/operations/me-fixture`):
 * ikinci bir `Me` yazmak, sözleşme değişince yalnız birinin kırılması demekti.
 */
function meReply(overrides: Partial<Me> = {}): Response {
  return reply(200, { data: meFixture(['customer'], overrides), error: null });
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
  mockRouter.replace.mockReset();
  mockSetSession.mockClear();
  mockGoogle.mockClear();
  mockDevSignIn.mockClear();
  mockToast.mockReset();
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

  it('Google yolu tarayıcıyı AÇAR ve ekranda bekleme kurmaz — devamı /auth/callback rotasının', async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() => expect(mockGoogle).toHaveBeenCalled());
    // Ekran kapanmaz, 'verifying' de basılmaz: dönüş derin bağlantısı rotada işlenir.
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.queryByTestId('login-busy')).toBeNull();
    expect(screen.getByTestId('login-google')).toBeOnTheScreen();
  });

  it('Google arızasında seçim aşamasında sebep söylenir', async () => {
    mockGoogle.mockResolvedValueOnce({ error: 'google_unavailable' });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-google'));

    await waitFor(() =>
      expect(screen.getByTestId('login-notice')).toHaveTextContent('Google ile giriş şu an kullanılamıyor — e-posta ile deneyin.'),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('OAuth dönüş rotasının bıraktığı adlı ret açılışta söylenir (initialNotice)', async () => {
    await render(<LoginScreen initialNotice="oauth_failed" />);

    expect(screen.getByTestId('login-notice')).toBeOnTheScreen();
  });

  it('dev test düğmeleri GERÇEK giriş akışını çağırır; başarı done akışına biner (toast + kapanış)', async () => {
    fetchMock.mockResolvedValue(meReply());
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-dev-müşteri'));
    await waitFor(() => expect(mockDevSignIn).toHaveBeenCalledWith('musteri@test.fr'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalled();
  });

  it('dev operasyon düğmesi KENDİ hesabıyla çağırır; ret seçim aşamasında söylenir', async () => {
    mockDevSignIn.mockResolvedValueOnce({ error: 'dev_session_failed' });
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-dev-kurye'));

    await waitFor(() => expect(mockDevSignIn).toHaveBeenCalledWith('kurye@test.fr'));
    await waitFor(() => expect(screen.getByTestId('login-notice')).toBeOnTheScreen());
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  /* 21.32'nin ASIL İDDİASI: personel müşteri sekmesine DÖNMEZ. Bu test olmadan yönlendirme sessizce
     kaybolabilirdi — `router.back()` de "giriş başarılı" gibi görünür ve arıza ancak cihazda,
     "operasyona giremiyorum" diye ortaya çıkardı (kullanıcı bulgusu 11.08). */
  it('PERSONEL girişi operasyon kabuğuna yönlenir, hesap sekmesine dönmez', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: meFixture(['courier']), error: null }));
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-dev-kurye'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/courier'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('MÜŞTERİ girişi operasyona GİTMEZ — bölümü olmayan rol geldiği ekrana döner', async () => {
    fetchMock.mockResolvedValue(meReply());
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-dev-müşteri'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockRouter.replace).not.toHaveBeenCalled();
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
    // Künyesi TAM müşteri: kapı açılmaz, ekran normal kapanır.
    fetchMock.mockResolvedValueOnce(meReply());
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
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  /* KÜNYE SORUSUNUN İLK ANI (kullanıcı kararı 10.08) — kapı artık uygulama AÇILIŞINDA değil,
     kimliğin kurulduğu anda çalışıyor. Ölçüt ad + telefon; burada telefon boş. */
  it('doğrulama bitti ama künye eksik: ekran kapanmaz, tamamlama akışına gidilir', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    fetchMock.mockResolvedValueOnce(reply(200, { data: SESSION, error: null }));
    fetchMock.mockResolvedValueOnce(meReply({ phone: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '123456');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/profile-setup' }));
    expect(mockRouter.back).not.toHaveBeenCalled();
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
