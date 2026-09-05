import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useOperationsNotifications } from './use-notifications.hook';

/*
  AKIŞ KANCASI — 05.09'a kadar HİÇ TESTİ YOKTU ve ekran testi onu toptan taklit ediyordu; taşıdığı
  arızaların hiçbiri bu yüzden görünmüyordu. Çivilenenler, üçü de ölçülmüş kusurların karşılığı:

  1. "GÖRDÜM" BEYANI GÖRÜLENLE SINIRLI. Eski hâl `read-all`ı kapsamsız çağırıyordu: ekran bir sayfa
     çizerken sunucudaki TÜM satırlar okundu oluyordu ve saklama süpürmesi 90 gün sonra onları
     "görülmüş" sayıp siliyordu. Artık çizilen EN ESKİ satırın damgası sınır olarak gidiyor.
  2. BEYAN AÇILIŞTA DEĞİL. Eski tetik mount'ta atıyor, veri henüz gelmediği için erken dönüyor ve
     istek HİÇ gitmiyordu — rozet hiç sönmüyordu. Artık çağıran (ekran) çıkarken tetikliyor ve
     kanca yalnız okunmamış satır varsa istek atıyor.
  3. İMLEÇ TÜKETİLİYOR. Uç `nextCursor` üretiyordu, kanca okumuyordu: 30 satırın arkası sessizce
     yutuluyordu (CLAUDE §1'in adıyla andığı desen).
*/

const mockFetch = jest.fn();
const mockMarkAll = jest.fn();
const mockMarkOne = jest.fn();

jest.mock('@/lib/api/notifications', () => ({
  fetchNotifications: (...args: unknown[]) => mockFetch(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAll(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkOne(...args),
}));

/* `useFocusEffect` gerçek expo-router'da odak gerektiriyor; testte bir kez koşan `useEffect`e
   indiriliyor — kancanın ölçtüğü şey odak mekaniği değil, tur mantığı. */
jest.mock('expo-router', () => {
  const react = jest.requireActual('react') as { useEffect: (cb: () => void, deps: unknown[]) => void };
  return { useFocusEffect: (cb: () => void) => react.useEffect(cb, [cb]) };
});

const satir = (id: string, createdAt: string, readAt: string | null = null) => ({
  id,
  kind: 'transfer_shortfall',
  targetType: null,
  targetId: null,
  payload: { shortQty: 2, referenceNo: 'TR-1' },
  createdAt,
  readAt,
});

const sayfa = (rows: ReturnType<typeof satir>[], nextCursor: string | null, unread: number) =>
  Promise.resolve({ error: null, data: { notifications: rows, nextCursor, unread } });

beforeEach(() => {
  mockFetch.mockReset();
  mockMarkAll.mockReset().mockResolvedValue({ error: null, data: { done: true } });
  mockMarkOne.mockReset().mockResolvedValue({ error: null, data: { done: true } });
});

describe('useOperationsNotifications', () => {
  it('ilk tur satırları ve SUNUCUNUN rozet sayısını verir — sayfadan yeniden saymaz', async () => {
    // Sunucu 104 diyor, sayfada 2 satır var: rozet sayfa boyuyla TAVANLANMAMALI.
    mockFetch.mockReturnValue(sayfa([satir('a', '2026-09-05T08:00:00Z'), satir('b', '2026-09-05T07:00:00Z')], null, 104));

    const { result } = await renderHook(() => useOperationsNotifications());

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.unread).toBe(104);
  });

  it('çekim düşerse HATA hâline geçer — sonsuz iskelet değil', async () => {
    mockFetch.mockResolvedValue({ error: 'network', data: null });

    const { result } = await renderHook(() => useOperationsNotifications());

    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });

  it('imleç varsa devamı yüklenir ve satırlar EKLENİR', async () => {
    mockFetch
      .mockReturnValueOnce(sayfa([satir('a', '2026-09-05T08:00:00Z')], 'imlec-1', 3))
      .mockReturnValueOnce(sayfa([satir('b', '2026-09-04T08:00:00Z')], null, 3));

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.loadMore).not.toBeNull());

    await act(async () => {
      result.current.loadMore?.();
    });

    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === 'ready' && state.rows.map((row) => row.id)).toEqual(['a', 'b']);
    });
    expect(mockFetch).toHaveBeenLastCalledWith('imlec-1', 'staff');
  });

  it('kuyruk turu düşerse LİSTE YERİNDE KALIR, yalnız düşüş bildirilir', async () => {
    mockFetch
      .mockReturnValueOnce(sayfa([satir('a', '2026-09-05T08:00:00Z')], 'imlec-1', 3))
      .mockResolvedValueOnce({ error: 'network', data: null });

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.loadMore).not.toBeNull());

    await act(async () => {
      result.current.loadMore?.();
    });

    await waitFor(() => expect(result.current.tailFailed).toBe(true));
    const state = result.current.state;
    expect(state.status === 'ready' && state.rows).toHaveLength(1);
  });

  it('satır okundu İYİMSER yazılır: satır söner, rozet bir azalır', async () => {
    mockFetch.mockReturnValue(sayfa([satir('a', '2026-09-05T08:00:00Z')], null, 5));

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.markRead('a');
    });

    const state = result.current.state;
    expect(state.status === 'ready' && state.rows[0]?.readAt).not.toBeNull();
    expect(result.current.unread).toBe(4);
    expect(mockMarkOne).toHaveBeenCalledWith('a');
  });

  it('aynı satır iki kez okunursa rozet İKİ KEZ düşmez', async () => {
    mockFetch.mockReturnValue(sayfa([satir('a', '2026-09-05T08:00:00Z')], null, 5));

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.markRead('a');
      result.current.markRead('a');
    });

    expect(result.current.unread).toBe(4);
  });

  /* EN KRİTİK ÇİVİ: beyan çizilen EN ESKİ satırın damgasıyla sınırlanmazsa, sayfanın arkasında
     kalan ve kullanıcının hiç görmediği satırlar okundu olur ve 90 gün sonra süpürülür. */
  it('"gördüm" beyanı çizilen EN ESKİ satırın damgasıyla sınırlanır', async () => {
    mockFetch.mockReturnValue(
      sayfa([satir('a', '2026-09-05T08:00:00Z'), satir('b', '2026-09-04T17:30:00Z')], 'daha-var', 104),
    );

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.markSeen();
    });

    expect(mockMarkAll).toHaveBeenCalledWith('staff', '2026-09-04T17:30:00Z');
  });

  it('okunmamış satır YOKSA beyan hiç gönderilmez — boşuna tur atılmaz', async () => {
    mockFetch.mockReturnValue(sayfa([satir('a', '2026-09-05T08:00:00Z', '2026-09-05T09:00:00Z')], null, 0));

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.markSeen();
    });

    expect(mockMarkAll).not.toHaveBeenCalled();
  });

  it('liste boşken beyan gönderilmez', async () => {
    mockFetch.mockReturnValue(sayfa([], null, 0));

    const { result } = await renderHook(() => useOperationsNotifications());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.markSeen();
    });

    expect(mockMarkAll).not.toHaveBeenCalled();
  });
});
