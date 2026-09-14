import { renderHook, waitFor } from '@testing-library/react-native';

/*
  OTOMATİK DEV GİRİŞİ — üç kapının üçü de SESSİZ bozulur, bu yüzden üçü de ayrı ölçülür.

  Hook'un tek görünür etkisi bir ağ turu açmak; yanlış davranışı ekrana hata olarak düşmez:
  · kapı 1 gevşerse üretim derlemesi kendi kendine giriş yapar — kullanıcı yüzeyinde felaket,
  · kapı 2 gevşerse geliştiricinin AÇIK oturumu (ör. müşteri hesabı) sessizce ezilir,
  · kapı 3 gevşerse giriş akışını (OTP · OAuth · onboarding) denemek imkânsız hâle gelir.

  Cihaz ölçümünün yerini tutmaz — "operasyona düşüyor mu" sorusunun hakemi cihazdır (30.08'de
  öyle doğrulandı). Buradaki soru daha dar: hook KİMİ, NE ZAMAN çağırıyor.
*/

const mockGetSession = jest.fn();
jest.mock('./supabase', () => ({ getSupabase: () => ({ auth: { getSession: mockGetSession } }) }));

const mockDevSignIn = jest.fn();
jest.mock('./dev-login', () => ({
  devSignIn: (email: string) => mockDevSignIn(email),
}));

import { useDevAutoLogin } from './use-dev-auto-login.hook';

/** Hesap uygulamanın verdiği değerdir (21.310) — kanca kendi sabitini bilmez. */
const APP_ACCOUNT = 'uygulama@lezzetanatolie.com';

const withoutSession = (): void => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_DEV_AUTOLOGIN;
  /* Supabase adresi kancanın ÜÇÜNCÜ kapısı: yoksa giriş denenmez. Testler onu burada kuruyor,
     yoksa hepsi aynı erken dönüşe düşer ve hiçbir şey ölçmez. */
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  mockDevSignIn.mockResolvedValue({ error: null });
});

describe('useDevAutoLogin', () => {
  it('oturum yoksa UYGULAMANIN verdiği hesapla giriş yapar', async () => {
    withoutSession();

    renderHook(() => useDevAutoLogin(APP_ACCOUNT));

    await waitFor(() => expect(mockDevSignIn).toHaveBeenCalledWith(APP_ACCOUNT));
  });

  it('OTURUM VARSA dokunmaz — geliştiricinin seçtiği hesap ezilmez', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    renderHook(() => useDevAutoLogin(APP_ACCOUNT));

    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(mockDevSignIn).not.toHaveBeenCalled();
  });

  it('EXPO_PUBLIC_DEV_AUTOLOGIN=off ise oturumu sormaz bile', () => {
    process.env.EXPO_PUBLIC_DEV_AUTOLOGIN = 'off';
    withoutSession();

    renderHook(() => useDevAutoLogin(APP_ACCOUNT));

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockDevSignIn).not.toHaveBeenCalled();
  });

  it('SUPABASE ADRESİ YOKSA istemciyi hiç doğurmaz — kök yığını render eden testler bundan düşmüştü', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    withoutSession();

    renderHook(() => useDevAutoLogin(APP_ACCOUNT));

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockDevSignIn).not.toHaveBeenCalled();
  });

  /* `__DEV__` kapısı burada ölçülemez: Jest ortamında sabit `true` ve onu çevirmek, testin
     ölçtüğü dünyayı üretimden uzaklaştırır. Kapının kendisi tek satır ve gövdenin ilk ifadesi;
     yanlışlıkla silinmesi `pnpm lint`in değil, gözden geçirmenin işidir — künyede yazılı. */
});
