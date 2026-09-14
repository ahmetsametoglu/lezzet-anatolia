import { act, renderHook } from '@testing-library/react-native';

/*
  REDDEDİLEN OTURUM → GİRİŞ (21.304) — kancanın iki sözü: ret duyulunca giriş ekranı SEBEBİYLE
  açılır; yığın hazır değilken gelen ret (açılıştaki kök istekler) kaybolmaz, yığın hazır olunca
  açılır. Zincirin tamamı `operations-session-rejected.test`te gerçek rota ağacıyla koşuyor.
*/

const mockPush = jest.fn();
let mockNavigationKey: string | undefined = 'kok';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRootNavigationState: () => (mockNavigationKey === undefined ? undefined : { key: mockNavigationKey }),
}));

let mockRejectionListener: (() => void) | null = null;
const mockRelease = jest.fn();
jest.mock('./session-end', () => ({
  onSessionRejected: (listener: () => void) => {
    mockRejectionListener = listener;
    return mockRelease;
  },
}));

import { useSessionEndedLogin } from './use-session-ended-login.hook';

const LOGIN_WITH_REASON = { pathname: '/login', params: { notice: 'session_ended' } };

beforeEach(() => {
  mockPush.mockClear();
  mockRelease.mockClear();
  mockRejectionListener = null;
  mockNavigationKey = 'kok';
});

describe('useSessionEndedLogin', () => {
  it('ret duyulunca giriş ekranı sebep anahtarıyla açılır', async () => {
    await renderHook(() => useSessionEndedLogin());

    await act(async () => {
      mockRejectionListener?.();
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(LOGIN_WITH_REASON);
  });

  it('ret duyulmadıkça hiçbir yere gidilmez — gönüllü çıkış bu kancayı tetiklemez', async () => {
    await renderHook(() => useSessionEndedLogin());

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('yığın hazır değilken gelen ret KAYBOLMAZ — yığın hazır olunca açılır', async () => {
    // Açılışta kök kapılar (font, dil, onboarding) açılmadan yığın çizilmiyor; kökteki istekler ise
    // ilk karede başlıyor — ret o aralıkta gelebilir.
    mockNavigationKey = undefined;
    const { rerender } = await renderHook(() => useSessionEndedLogin());

    await act(async () => {
      mockRejectionListener?.();
    });
    expect(mockPush).not.toHaveBeenCalled();

    mockNavigationKey = 'kok';
    await act(async () => {
      await rerender(undefined);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(LOGIN_WITH_REASON);
  });

  it('sökülünce abonelik bırakılır', async () => {
    const { unmount } = await renderHook(() => useSessionEndedLogin());

    await act(async () => {
      await unmount();
    });

    expect(mockRelease).toHaveBeenCalled();
  });
});
