import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useNotifications } from './use-notifications.hook';

/*
  MÜŞTERİ AKIŞ HOOK'U — sınanan şey ekran değil MANTIK: iyimser yazımların rozet matematiği ve
  düşen istekte GERİ ALMA. Ekranda "okundu" duran ama sunucuda okunmamış satır, aynı hesabın
  öteki cihazında rozeti yalancı çıkarır — geri alma bu yüzden süs değil, sözleşme.

  API modülü taklit (ağ yok); kanal kurulumları hook içinde künyeli yutulur (env'siz ortam).
*/

const mockApi = {
  fetchNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
  dismissNotification: jest.fn(),
};
jest.mock('@/lib/api/notifications', () => ({
  fetchNotifications: (...a: unknown[]) => mockApi.fetchNotifications(...a),
  markNotificationRead: (...a: unknown[]) => mockApi.markNotificationRead(...a),
  markAllNotificationsRead: (...a: unknown[]) => mockApi.markAllNotificationsRead(...a),
  dismissNotification: (...a: unknown[]) => mockApi.dismissNotification(...a),
}));

const row = (id: string, readAt: string | null = null) => ({
  id,
  kind: 'ticket_replied',
  targetType: 'ticket' as const,
  targetId: 't-1',
  payload: {},
  createdAt: '2026-08-26T10:00:00Z',
  readAt,
});

const sayfa = (rows: ReturnType<typeof row>[], unread: number) => ({
  error: null,
  status: 200,
  data: { notifications: rows, nextCursor: null, unread },
});

beforeEach(() => {
  jest.resetAllMocks();
  mockApi.fetchNotifications.mockResolvedValue(sayfa([row('a'), row('b', '2026-08-26T09:00:00Z')], 1));
});

describe('useNotifications — iyimser yazım ve geri alma', () => {
  it('okundu: rozet anında düşer; istek DÜŞERSE satır ve rozet GERİ gelir', async () => {
    /* İstek BEKLETİLİR: iyimser ara-hâl ancak cevap gelmeden gözlenebilir — çözülmüş bir mock'la
       `act` bütün zinciri boşaltır ve test yalnız son hâli görürdü. */
    let cevapla!: (v: unknown) => void;
    mockApi.markNotificationRead.mockImplementation(() => new Promise((r) => { cevapla = r; }));
    const { result } = await renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(() => { result.current.markRead('a'); });
    expect(result.current.unread).toBe(0); // iyimser: ekran beklemez

    await act(async () => { cevapla({ error: 'boom', status: 500, data: null }); });
    expect(result.current.unread).toBe(1); // sunucu reddetti — geri alındı
    expect(result.current.rows.find((r: { id: string }) => r.id === 'a')?.readAt).toBeNull();
  });

  it('ZATEN okunmuş satıra dokunmak sunucuya gitmez, rozet oynamaz', async () => {
    const { result } = await renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(() => result.current.markRead('b'));

    expect(mockApi.markNotificationRead).not.toHaveBeenCalled();
    expect(result.current.unread).toBe(1);
  });

  it('gizle: OKUNMAMIŞ satır rozetten de düşer; istek düşerse ikisi de geri gelir', async () => {
    let cevapla!: (v: unknown) => void;
    mockApi.dismissNotification.mockImplementation(() => new Promise((r) => { cevapla = r; }));
    const { result } = await renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(() => { result.current.dismiss('a'); });
    expect(result.current.rows.map((r: { id: string }) => r.id)).toEqual(['b']);
    expect(result.current.unread).toBe(0);

    await act(async () => { cevapla({ error: 'boom', status: 500, data: null }); });
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.unread).toBe(1);
  });

  it('tümünü okundu: başarıda kalıcı, düşüşte liste ve sayaç eski hâline döner', async () => {
    let cevapla!: (v: unknown) => void;
    mockApi.markAllNotificationsRead.mockImplementation(() => new Promise((r) => { cevapla = r; }));
    const { result } = await renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(() => { result.current.markAllRead(); });
    expect(result.current.unread).toBe(0);

    await act(async () => { cevapla({ error: 'boom', status: 500, data: null }); });
    expect(result.current.unread).toBe(1);
  });

  it('401 misafire iner ve eski satırlar EKRANDA KALMAZ — başkasının akışı gösterilmez', async () => {
    const { result } = await renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mockApi.fetchNotifications.mockResolvedValue({ error: 'unauthorized', status: 401, data: null });
    await act(() => result.current.refresh());

    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(result.current.rows).toEqual([]);
    expect(result.current.unread).toBe(0);
  });
});
