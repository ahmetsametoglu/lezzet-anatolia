import { act, renderHook, waitFor } from '@testing-library/react-native';

import { preparationOrder } from './warehouse-fixture';
import { usePreparation } from './use-preparation.hook';
import { resetWarehouseStatus } from './warehouse-status';

/*
  ÇEVRİMDIŞI TAZELEME — "okumak serbest, YAZMAK kapalı" (v3:216).

  ── NEDEN AYRI DOSYA VE NEDEN HOOK ──────────────────────────────────────────
  Kural İKİ yükleme gerektiriyor: ilki başarılı, ikincisi düşük. Ekran testinde ikinci yüklemeyi
  tetiklemenin yolu yok — `useFocusEffect` taklidi bir kez koşuyor ve `reload` yalnız hata
  bloğunun düğmesinde. Hook'u doğrudan koşturmak kuralı olduğu gibi sınıyor.

  ── ÖLÇÜLEN ARIZA (30.08) ───────────────────────────────────────────────────
  Kuyruk ekranının çevrimdışı kilidi HİÇ ERİŞİLEMİYORDU: her okuma hatası `error`a gidiyor ve
  eldeki liste gizleniyordu. Yani kilidin çizildiği dal ölü koddu — `knip` bunu göremez (dal
  kullanılıyor, koşulu sağlanamıyor), yalnız cihazda ya da böyle bir testle görünür.

  ── AYRIM AĞ HATASINA ÖZGÜ ──────────────────────────────────────────────────
  Sunucu hatasında liste GİZLENİR: bayatlığı açıklayan bir kilit çizilmediği için depocu eski
  listeye bakıp olmayan bir işe giderdi. İki iddia da burada.
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

function serverError(): Response {
  return {
    status: 500,
    headers: { get: () => null },
    json: async () => ({ data: null, error: 'server_error' }),
  } as unknown as Response;
}

const IKINCI = '00000000-0000-4000-8000-000000000002';
const QUEUE = { date: null, orders: [preparationOrder(), preparationOrder({ orderId: IKINCI })] };

/** İlk okuma dolu kuyruk döner, ikincisi verilen cevabı — "tazeleme düştü" hâli. */
function loadThenFail(second: () => Promise<Response>) {
  let first = true;
  fetchMock.mockImplementation(() => {
    if (first) {
      first = false;
      return Promise.resolve(ok(QUEUE));
    }
    return second();
  });
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  resetWarehouseStatus();
});

describe('usePreparation · çevrimdışı tazeleme', () => {
  it('AĞ düşerse eldeki kuyruk KALIR — ekran kilidi çizebilsin', async () => {
    loadThenFail(() => Promise.reject(new Error('network down')));

    const { result } = await renderHook(() => usePreparation());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.orders).toHaveLength(2);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.orders).toHaveLength(2);
  });

  it('SUNUCU hatasında liste GİZLENİR — açıklanamayan bayatlık gösterilmez', async () => {
    loadThenFail(() => Promise.resolve(serverError()));

    const { result } = await renderHook(() => usePreparation());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('İLK yükleme ağ hatasıyla düşerse yine HATA — gösterilecek hiçbir şey yok', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));

    const { result } = await renderHook(() => usePreparation());

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
