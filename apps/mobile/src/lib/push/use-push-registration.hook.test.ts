import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

/*
  PUSH KAYDININ TETİKLEYİCİLERİ — ilk kare, giriş ve (push talebi 10.09) öne geliş. Öne gelişin
  sözü: günde en çok bir kez. Her öne gelişte kaydolmak her uygulama değişiminde Expo'ya ve sunucuya
  istek demekti; hiç kaydolmamak ise uygulamayı hiç kapatmayan müşterinin cihazını 30 gün sonra
  "etkin değil" saydırırdı (`push_device.last_seen_at`).
*/

const mockEnsure = jest.fn(async () => undefined);
jest.mock('./register-device', () => ({ ensurePushRegistration: () => mockEnsure() }));

let mockAuthListener: ((event: string) => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

import { PUSH_REFRESH_INTERVAL_MS, usePushRegistration } from './use-push-registration.hook';

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const removeAppState = jest.fn();
let now = 1_000_000;

beforeEach(() => {
  mockEnsure.mockClear();
  mockUnsubscribe.mockClear();
  removeAppState.mockClear();
  mockAuthListener = null;
  appStateListener = null;
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: removeAppState };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function comeToForeground(afterMs: number) {
  now += afterMs;
  await act(async () => {
    appStateListener?.('active');
  });
}

describe('usePushRegistration', () => {
  it('ilk karede kaydolur', async () => {
    await renderHook(() => usePushRegistration());

    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it('öne gelişte, son denemeden bu yana aralık dolmadıysa yeniden kaydolmaz', async () => {
    await renderHook(() => usePushRegistration());

    await comeToForeground(PUSH_REFRESH_INTERVAL_MS - 1);

    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it('öne gelişte aralık dolduysa yeniden kaydolur — `last_seen_at` tazelenir', async () => {
    await renderHook(() => usePushRegistration());

    await comeToForeground(PUSH_REFRESH_INTERVAL_MS);
    expect(mockEnsure).toHaveBeenCalledTimes(2);

    // Sayaç yeni denemeden başlar: hemen ardından gelen öne geliş yeniden kaydolmaz.
    await comeToForeground(60_000);
    expect(mockEnsure).toHaveBeenCalledTimes(2);
  });

  it('arka plana geçiş kaydı tetiklemez', async () => {
    await renderHook(() => usePushRegistration());

    now += PUSH_REFRESH_INTERVAL_MS;
    await act(async () => {
      appStateListener?.('background');
    });

    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it('oturum açılınca kaydolur ve sayaç sıfırlanır; öteki olaylar tetiklemez', async () => {
    await renderHook(() => usePushRegistration());

    now += PUSH_REFRESH_INTERVAL_MS - 1000;
    await act(async () => {
      mockAuthListener?.('SIGNED_IN');
      mockAuthListener?.('TOKEN_REFRESHED');
    });
    expect(mockEnsure).toHaveBeenCalledTimes(2);

    // Girişten 2 sn sonra gelen öne geliş: ilk kareden 24 saat geçti ama girişten geçmedi.
    await comeToForeground(2000);
    expect(mockEnsure).toHaveBeenCalledTimes(2);
  });

  it('sökülünce iki dinleyici de bırakılır', async () => {
    const { unmount } = await renderHook(() => usePushRegistration());

    await act(async () => {
      await unmount();
    });

    expect(removeAppState).toHaveBeenCalled();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
