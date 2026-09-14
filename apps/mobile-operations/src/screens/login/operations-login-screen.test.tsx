import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { meFixture } from '@lezzet/mobile-kit/src/testing/me-fixture';
import { operationsSectionRoute } from '@/screens/login/post-login-route';

import { loginCopy } from './copy';
import { handOffOAuthCode } from './oauth-handoff';
import { OperationsLoginScreen } from './operations-login-screen';

/*
  OPERASYON GİRİŞİ (21.312) — durum makinesi uçların SINIRINDA sınanır: kit istemcileri ve kapının okuması
  taklit, ekran gerçek. Soru "ekran hangi cevaba hangi hâlle karşılık veriyor"; uçların kendisi mobile-api'nin
  entegrasyon testlerinde (`auth-otp.test.ts` · `auth-oauth.test.ts`), dışarıdan açılan oturumun kapıya gidişi
  kabuk testinde (`operations-login-session.test.tsx`).
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-TR' }] }));

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockAuthListeners = new Set<(event: string) => void>();
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        mockAuthListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(listener) } } };
      },
    },
  }),
}));

const mockRequestOtp = jest.fn();
const mockVerifyOtp = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/auth/otp', () => ({
  NOT_REGISTERED: 'not_registered',
  requestOtp: (...args: unknown[]) => mockRequestOtp(...args),
  verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
}));

const mockFetchMe = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/api/me', () => ({ fetchMe: () => mockFetchMe() }));

const mockCheckOAuthAccount = jest.fn();
jest.mock('@/lib/api/oauth-check', () => ({ checkOAuthAccount: () => mockCheckOAuthAccount() }));

const mockExchange = jest.fn();
const mockGoogle = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/auth/oauth', () => ({
  exchangeOAuthCode: (code: string) => mockExchange(code),
  signInWithGoogle: () => mockGoogle(),
}));

const mockSignOut = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/auth/sign-out', () => ({ signOut: () => mockSignOut() }));

const mockEndDeviceSession = jest.fn();
jest.mock('@lezzet/mobile-kit/src/lib/auth/session-end', () => ({ endDeviceSession: () => mockEndDeviceSession() }));

jest.mock('@lezzet/mobile-kit/src/lib/auth/dev-login', () => ({
  DEV_ACCOUNTS: [{ label: 'Depo', email: 'depo@test.fr', operations: true }],
  devSignIn: jest.fn(),
}));

function apiOk<T>(data: T) {
  return { data, error: null, status: 200, retryAfterSec: null };
}

function otpFail(error: string, extra: { retryAfterSec?: number; offline?: boolean } = {}) {
  return { data: null, error, retryAfterSec: extra.retryAfterSec ?? null, offline: extra.offline ?? false };
}

const OTP_OK = { data: true, error: null, retryAfterSec: null };
const STAFF_EMAIL = 'deniz.arslan@lezzetanatolie.com';
const STAFF = meFixture(['warehouse', 'courier'], { name: 'Deniz Arslan', email: STAFF_EMAIL });

beforeEach(() => {
  jest.resetAllMocks();
  mockAuthListeners.clear();
  mockRequestOtp.mockResolvedValue(OTP_OK);
  mockSignOut.mockResolvedValue({ error: null });
  mockEndDeviceSession.mockResolvedValue({ error: null });
  mockGoogle.mockResolvedValue({ error: null });
});

async function sendCodeTo(email: string) {
  await fireEvent.changeText(screen.getByTestId('login-email-input'), email);
  await fireEvent.press(screen.getByTestId('login-send'));
}

async function enterCode(code: string) {
  await fireEvent.changeText(await screen.findByTestId('login-code'), code);
}

describe('operasyon girişi — sistemde kayıtlı olmayan giremez', () => {
  it('kayıtlı olmayan e-postaya kod GİTMEZ: uyarı kutusu söyler, kod paneli açılmaz', async () => {
    mockRequestOtp.mockResolvedValueOnce(otpFail('not_registered'));
    await render(<OperationsLoginScreen />);

    await sendCodeTo('yabanci@example.com');

    expect(mockRequestOtp).toHaveBeenCalledWith('yabanci@example.com', expect.any(String), { registeredOnly: true });
    expect(await screen.findByTestId('login-notice')).toHaveTextContent(loginCopy.errors.notRegistered);
    expect(screen.queryByTestId('login-code')).toBeNull();
  });

  it('geçersiz e-posta UCA GİTMEDEN tasarımın cümlesiyle yakalanır', async () => {
    await render(<OperationsLoginScreen />);

    await sendCodeTo('bu-eposta-degil');

    expect(screen.getByTestId('login-notice')).toHaveTextContent(loginCopy.errors.invalidEmail);
    expect(mockRequestOtp).not.toHaveBeenCalled();
  });

  it('personel kodla girer → DOĞRUDAN ilk bölümüne; kendi akışının oturum olayı kapıya atmaz (kullanıcı kararı 14.09)', async () => {
    mockVerifyOtp.mockImplementationOnce(async () => {
      // Oturum kurulurken doğan olay — ekranın KENDİ akışı: dinleyici `/`e atmamalı, yönlendirmeyi ekran yapar.
      mockAuthListeners.forEach((listener) => listener('SIGNED_IN'));
      return { data: { accessToken: 'a' }, error: null, retryAfterSec: null };
    });
    mockFetchMe.mockResolvedValueOnce(apiOk(STAFF));
    await render(<OperationsLoginScreen />);

    await sendCodeTo(STAFF_EMAIL);
    await enterCode('418203');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(operationsSectionRoute('warehouse')));
    expect(mockVerifyOtp).toHaveBeenCalledWith(STAFF_EMAIL, '418203', expect.any(String), { registeredOnly: true });
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it('kod bölümü adresin YERİNE açılır; "E-postayı değiştir" geri döndürür, adres korunur (kullanıcı kararı 14.09)', async () => {
    await render(<OperationsLoginScreen />);

    await sendCodeTo(STAFF_EMAIL);

    expect(await screen.findByTestId('login-code')).toBeOnTheScreen();
    expect(screen.queryByTestId('login-email-input')).toBeNull();
    expect(screen.queryByTestId('login-send')).toBeNull();

    await fireEvent.press(screen.getByTestId('login-change-email'));

    expect(screen.queryByTestId('login-code')).toBeNull();
    expect(screen.getByTestId('login-email-input')).toHaveProp('value', STAFF_EMAIL);
    expect(screen.getByTestId('login-send')).toBeOnTheScreen();
  });

  it('rolsüz hesap → "yetki yok": e-posta cümlede, oturum cihazda BIRAKILMAZ; "Başka hesapla gir" girişe döner', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: {}, error: null, retryAfterSec: null });
    mockFetchMe.mockResolvedValueOnce(apiOk(meFixture(['customer'], { email: 'musteri@example.com' })));
    await render(<OperationsLoginScreen />);

    await sendCodeTo('musteri@example.com');
    await enterCode('418203');

    expect(await screen.findByTestId('login-no-role')).toHaveTextContent(/musteri@example\.com doğrulandı/);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('login-no-role-switch'));

    expect(screen.getByTestId('login-email-input')).toHaveProp('value', '');
  });

  it('yanlış kod: panelde tasarımın cümlesi, alan temizlenir', async () => {
    mockVerifyOtp.mockResolvedValueOnce(otpFail('invalid_code'));
    await render(<OperationsLoginScreen />);

    await sendCodeTo(STAFF_EMAIL);
    await enterCode('000000');

    expect(await screen.findByTestId('login-code-error')).toHaveTextContent(loginCopy.errors.codeRejected);
    expect(screen.getByTestId('login-code')).toHaveProp('value', '');
  });

  it('bekleme cezası (429) SAYAÇTIR: süre yeniden gönderme bağında, ayrı cümle yok', async () => {
    await render(<OperationsLoginScreen />);
    await sendCodeTo(STAFF_EMAIL);
    mockRequestOtp.mockResolvedValueOnce(otpFail('cooldown', { retryAfterSec: 42 }));

    await fireEvent.press(await screen.findByTestId('login-resend'));

    expect(await screen.findByText('Kodu tekrar gönder · 0:42')).toBeOnTheScreen();
    expect(screen.queryByTestId('login-code-error')).toBeNull();
  });

  it('istek ağa hiç çıkamazsa bağlantı bandı çizilir — uyarı cümlesi değil', async () => {
    mockRequestOtp.mockResolvedValueOnce(otpFail('send_failed', { offline: true }));
    await render(<OperationsLoginScreen />);

    await sendCodeTo(STAFF_EMAIL);

    expect(await screen.findByTestId('login-offline')).toHaveTextContent(loginCopy.offline);
    expect(screen.queryByTestId('login-notice')).toBeNull();
  });

  it('açılış sebebi (reddedilen oturum) uyarı kutusunda söylenir', async () => {
    await render(<OperationsLoginScreen initialNotice="session_ended" />);

    expect(screen.getByTestId('login-notice')).toHaveTextContent(loginCopy.errors.sessionEnded);
  });
});

describe('Google dönüşü — kayıt kapısı', () => {
  it('kapı reddederse yerel oturum yetkili çağrı YAPMADAN kapanır ve ret söylenir', async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    mockCheckOAuthAccount.mockResolvedValueOnce({ data: null, error: 'not_registered', status: 403, retryAfterSec: null });
    await render(<OperationsLoginScreen />);

    await act(async () => handOffOAuthCode('pkce-1'));

    expect(await screen.findByTestId('login-notice')).toHaveTextContent(loginCopy.errors.notRegistered);
    expect(mockExchange).toHaveBeenCalledWith('pkce-1');
    expect(mockEndDeviceSession).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockFetchMe).not.toHaveBeenCalled();
  });

  it('kayıtlı personel doğrudan ilk bölümüne girer; dönüş ekran açılmadan geldiyse devir montajda okunur', async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    mockCheckOAuthAccount.mockResolvedValueOnce(apiOk('kept'));
    mockFetchMe.mockResolvedValueOnce(apiOk(STAFF));
    handOffOAuthCode('pkce-2');

    await render(<OperationsLoginScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(operationsSectionRoute('warehouse')));
    expect(mockExchange).toHaveBeenCalledWith('pkce-2');
  });
});
