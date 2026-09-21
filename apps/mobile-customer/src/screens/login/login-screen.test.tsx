import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import type { Me } from '@lezzet/mobile-kit/src/lib/api/me';
import { meFixture } from '@lezzet/mobile-kit/src/testing/me-fixture';
import { LoginScreen } from './login-screen';

/* Akış telden koşar (fetch sahtesi): kod isteği ve doğrulama istemci yolunu katederek, başarıda oturum cihaza yazılır.
   Cihaz dili tr'ye sabit ki beklenen cümleler makine diline bağlı olmasın. */

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

/* `canGoBack` varsayılan true: ekranın olağan girişi başka bir ekranın üstüne itilmek. */
const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
/* Ekran iOS'un kaydırma hareketini adımda kapatıyor (`gestureEnabled`). */
const mockNavigation = { setOptions: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useNavigation: () => mockNavigation }));

const mockSetSession = jest.fn(async () => ({ error: null }));
/* `getSession` gerekli: doğrulama sonrası künye okuması jetonu buradan alıyor; eksikse test sahtenin patlamasını ölçer. */
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      setSession: mockSetSession,
      getSession: async () => ({ data: { session: { access_token: 'access-1' } } }),
    },
  }),
}));

const mockGoogle = jest.fn(async (): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@lezzet/mobile-kit/src/lib/auth/oauth', () => ({ signInWithGoogle: () => mockGoogle() }));

const mockDevSignIn = jest.fn(async (_email: string): Promise<{ error: string | null }> => ({ error: null }));
jest.mock('@lezzet/mobile-kit/src/lib/auth/dev-login', () => ({
  DEV_ACCOUNTS: [
    { label: 'Müşteri', email: 'musteri@test.fr', operations: false },
    { label: 'Kurye', email: 'kurye@test.fr', operations: true },
  ],
  devSignIn: (email: string) => mockDevSignIn(email),
}));

// Toast deposu gerçek zamanlayıcı açıyor — sahte, koşu sonunda asılı tanıtıcı bırakmasın.
const mockToast = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/toast/toast-store', () => ({
  toastSuccess: (m: string) => mockToast(m),
  toastError: (m: string) => mockToast(m),
  toastInfo: (m: string) => mockToast(m),
}));

/** Seçimden e-posta adımına geçer — akış testlerinin ortak girişi. */
async function toEmailStage() {
  await fireEvent.press(screen.getByTestId('login-email'));
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(status: number, body: unknown): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

/** `/me` cevabı; fixture ortak, ikinci bir `Me` yazılmaz. */
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

  /* Personelin dev düğmeleri operasyon uygulamasında; ret seçim adımında söylenir, ekran kapanmaz. */
  it('dev düğmeleri yalnız müşteri hesapları; düğmenin reddi seçim aşamasında söylenir', async () => {
    mockDevSignIn.mockResolvedValueOnce({ error: 'dev_session_failed' });
    await render(<LoginScreen />);

    expect(screen.queryByTestId('login-dev-kurye')).toBeNull();
    await fireEvent.press(screen.getByTestId('login-dev-müşteri'));

    await waitFor(() => expect(mockDevSignIn).toHaveBeenCalledWith('musteri@test.fr'));
    await waitFor(() => expect(screen.getByTestId('login-notice')).toBeOnTheScreen());
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
    // Donmuş bir "bekleyin" cümlesi ayrıca basılmaz.
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
    // Künyesi tam müşteri: ekran normal kapanır.
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

  /* Künye eksik olsa da giriş normal biter: ad ve telefon ilk siparişte istenir. */
  it('doğrulama bitti, künye eksik olsa da hiçbir yere yönlendirilmez — ekran kapanır', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    fetchMock.mockResolvedValueOnce(reply(200, { data: SESSION, error: null }));
    fetchMock.mockResolvedValueOnce(meReply({ phone: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '123456');

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('biçimsiz kod (6 haneden az) UCA HİÇ gitmez', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: true, error: null }));
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('login-code-input'), '123');

    expect(fetchMock).toHaveBeenCalledTimes(1); // yalnız kod isteği; doğrulama çağrısı yok
  });
});

describe('geri oku', () => {
  it('müşteri girişi vitrinin alt ekranıdır: geri oku çizilir ve ekranı kapatır', async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByTestId('login-back'));

    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('e-posta adımında ‹ seçime döner, ekranı kapatmaz', async () => {
    await render(<LoginScreen />);
    await toEmailStage();

    await fireEvent.press(screen.getByTestId('login-back'));

    expect(screen.getByTestId('login-google')).toBeOnTheScreen();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('kod adımında ‹ e-postaya döner; yazılan adres yerinde', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: true, error: null }));
    await render(<LoginScreen />);
    await toEmailStage();
    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ayse@example.com');
    await fireEvent.press(screen.getByTestId('login-send'));
    await waitFor(() => expect(screen.getByTestId('login-code-input')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('login-back'));

    expect(screen.getByTestId('login-email-input').props.value).toBe('ayse@example.com');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("Android'in geri tuşu ‹ ile aynı yolu izler: e-posta adımında seçime döner, seçimde gezgine bırakır", async () => {
    const listen = jest.spyOn(BackHandler, 'addEventListener');
    await render(<LoginScreen />);
    await toEmailStage();
    // Ekran her adımda dinleyiciyi yeniler: basılan, son kurulan dinleyicidir.
    const pressBack = () => listen.mock.calls.at(-1)?.[1]({ type: 'hardwareBackPress', timeStamp: Date.now() });

    let handled: boolean | null | undefined;
    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(screen.getByTestId('login-google')).toBeOnTheScreen();

    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(false);
    listen.mockRestore();
  });

  it("iOS'un kenardan kaydırma hareketi adımda kapalı, seçimde açık — hareket girişi e-posta adımından kapatamaz", async () => {
    await render(<LoginScreen />);
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });

    await toEmailStage();
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });

    await fireEvent.press(screen.getByTestId('login-back'));
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });
});
