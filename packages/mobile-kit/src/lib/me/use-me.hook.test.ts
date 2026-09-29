import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { meFixture } from '../../testing/me-fixture';

/*
  Müşteri kimliğinin düşen okumadan toparlanması; `guest` ile `error` ayrı tutulur ki oturumu duran müşteriye giriş daveti basılmasın.
  Modül durumu sıfırlanmaz, her iddia `waitFor` ile beklenen hâle bakar.
*/

const mockFetchMe = jest.fn();
jest.mock('../api/me', () => ({ fetchMe: () => mockFetchMe() }));

let authListener: (() => void) | null = null;
const mockAuthUnsubscribe = jest.fn();
jest.mock('../auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: () => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: mockAuthUnsubscribe } } };
      },
    },
  }),
}));

/** Uygulama öne/arkaya alındığında çağrılan dinleyici — testin elle tetiklediği sinyal. */
let appStateListener: ((s: string) => void) | null = null;
const mockAppStateRemove = jest.fn();
/* `react-native` modülü sahtelenmez, yalnız `AppState.addEventListener` gözlenir: modülü toptan değiştirmek ya da gerçeğini
   yaymak suite'i açılmadan düşürüyor, `spyOn` preset'in dünyasını yerinde bırakır. */
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: (s: string) => void) => {
  appStateListener = cb;
  return { remove: mockAppStateRemove };
}) as typeof AppState.addEventListener);

const mockApplyProfileLocale = jest.fn();
jest.mock('../i18n/app-locale', () => ({ applyProfileLocale: (l: string) => mockApplyProfileLocale(l) }));

import { publishMe, useWholesale, useMe } from './use-me.hook';

const ok = (overrides = {}) => ({ data: meFixture([], overrides), error: null, status: 200, retryAfterSec: null });
/** `status: null` = istek hiç atılamadı (ağ) — 0 DEĞİL, bilinmiyor (CLAUDE §1). */
const fail = (status: number | null) => ({ data: null, error: 'hata', status, retryAfterSec: null });

beforeEach(() => {
  mockFetchMe.mockReset();
  mockAuthUnsubscribe.mockClear();
  mockAppStateRemove.mockClear();
  mockApplyProfileLocale.mockClear();
  authListener = null;
  appStateListener = null;
});

/** Kimliği okuyan bir ekran açar ve beklenen hâle gelmesini bekler. */
async function ekran(beklenen: 'ready' | 'guest' | 'error') {
  const view = await renderHook(() => useMe());
  await waitFor(() => expect(view.result.current.status).toBe(beklenen));
  return view;
}

describe('müşteri kimliği', () => {
  it('profil okunursa HAZIR — ve müşterinin dili tek kapıdan uygulanır', async () => {
    mockFetchMe.mockResolvedValue(ok({ preferredLanguage: 'de' }));
    const { result } = await ekran('ready');

    expect(result.current.me?.name).toBe('Musa K.');
    expect(mockApplyProfileLocale).toHaveBeenCalledWith('de');
  });

  it('401 MİSAFİRDİR, hata değil — oturumsuz kullanım müşteri gezinmesidir', async () => {
    mockFetchMe.mockResolvedValue(fail(401));
    const { result } = await ekran('guest');

    expect(result.current.me).toBeNull();
  });

  it.each([
    ['ağ yok', null],
    ['sunucu arızası', 500],
  ])('%s → HATA, misafir DEĞİL — oturumu duran müşteriye giriş daveti basılmaz', async (_ad, status) => {
    mockFetchMe.mockResolvedValue(fail(status));
    await ekran('error');
  });

  it('ÖNE GELİNCE düşen okuma kendi başına toparlanır — 21.98in çivisi', async () => {
    mockFetchMe.mockResolvedValue(fail(null));
    const { result } = await ekran('error');
    expect(mockFetchMe).toHaveBeenCalledTimes(1);

    // Sahadaki toparlanma böyle oluyor: kişi çıkıp wifi'yi düzeltiyor ve geri dönüyor.
    mockFetchMe.mockResolvedValue(ok());
    await act(async () => {
      appStateListener?.('active');
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('HAZIR hâlde öne gelmek tazeleme TETİKLEMEZ — her sekme dönüşü bir ağ turu olmasın', async () => {
    mockFetchMe.mockResolvedValue(ok());
    await ekran('ready');
    const ilk = mockFetchMe.mock.calls.length;

    await act(async () => {
      appStateListener?.('active');
    });

    expect(mockFetchMe).toHaveBeenCalledTimes(ilk);
  });

  it('MİSAFİR hâlde de tazelenmez — 401 kesin bir cevaptır, eksik bir okuma değil', async () => {
    mockFetchMe.mockResolvedValue(fail(401));
    await ekran('guest');
    const ilk = mockFetchMe.mock.calls.length;

    await act(async () => {
      appStateListener?.('active');
    });

    expect(mockFetchMe).toHaveBeenCalledTimes(ilk);
  });

  it('ARKAYA alınmak tazeleme tetiklemez — tetik ÖNE GELME', async () => {
    mockFetchMe.mockResolvedValue(fail(null));
    await ekran('error');
    const ilk = mockFetchMe.mock.calls.length;

    await act(async () => {
      appStateListener?.('background');
    });

    expect(mockFetchMe).toHaveBeenCalledTimes(ilk);
  });

  it('OTURUM DEĞİŞİNCE tazelenir — çıkışta ad düşer, girişte selamlama gelir', async () => {
    mockFetchMe.mockResolvedValue(ok());
    const { result } = await ekran('ready');

    mockFetchMe.mockResolvedValue(fail(401));
    await act(async () => {
      authListener?.();
    });

    await waitFor(() => expect(result.current.status).toBe('guest'));
  });

  it('`publishMe` TÜM abonelere yayar ve ağa ÇIKMAZ — kaydeden ekranın sonucu', async () => {
    mockFetchMe.mockResolvedValue(ok({ name: 'Eski Ad' }));
    const { result } = await ekran('ready');
    const oncekiTur = mockFetchMe.mock.calls.length;

    await act(async () => {
      publishMe(meFixture([], { name: 'Yeni Ad' }));
    });

    expect(result.current.me?.name).toBe('Yeni Ad');
    expect(mockFetchMe).toHaveBeenCalledTimes(oncekiTur);
  });

  it('SON abone gidince iki dinleyici de bırakılır — modül arka planda dinleyici yaşatmaz', async () => {
    mockFetchMe.mockResolvedValue(ok());
    const { result, unmount } = await renderHook(() => useMe());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await unmount();
    });

    expect(mockAuthUnsubscribe).toHaveBeenCalled();
    expect(mockAppStateRemove).toHaveBeenCalled();
  });
});

/**
 * Onaylı kurumsal müşteri: üç koşul birden şart. `b2bApproved` üç değerlidir; `!== false` gibi bir kontrol hiç başvurmamış kaydı
 * onaylı sayar ve toptan fiyatı doğrulanmamış bir kayda açardı.
 */
describe('onaylı kurumsal müşteri', () => {
  const durum = async (overrides: Record<string, unknown>) => {
    mockFetchMe.mockResolvedValue(ok(overrides));
    const { result } = await renderHook(() => useWholesale());
    await waitFor(() => expect(typeof result.current).toBe('boolean'));
    return result;
  };

  it('kurumsal + ONAYLI → evet', async () => {
    const result = await durum({ type: 'company', b2bApproved: true });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('kurumsal ama ONAYSIZ → hayır', async () => {
    const result = await durum({ type: 'company', b2bApproved: false });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('kurumsal ama HİÇ BAŞVURMAMIŞ (`null`) → hayır; bilinmeyen onay DEĞİLDİR', async () => {
    const result = await durum({ type: 'company', b2bApproved: null });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('birey, onay bayrağı dolu olsa bile → hayır', async () => {
    const result = await durum({ type: 'individual', b2bApproved: true });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
