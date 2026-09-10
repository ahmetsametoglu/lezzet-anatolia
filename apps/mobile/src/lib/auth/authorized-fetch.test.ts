import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { z } from 'zod';
import { authorizedFetch } from './authorized-fetch';
import { getSupabase } from './supabase';

jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));

/**
 * Oturum sonu (21.304) — karar kuralı (`isDeadSessionAnswer`) GERÇEK; taklit edilen yalnız
 * kapanışın kendisi, ki test onun çağrılıp çağrılmadığını sayabilsin.
 */
const mockEndRejectedSession = jest.fn(async () => undefined);
jest.mock('./session-end', () => ({
  ...jest.requireActual('./session-end'),
  endRejectedSession: () => mockEndRejectedSession(),
}));

function fakeResponse(body: unknown, status = 200): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const getSession = jest.fn();
const refreshSession = jest.fn();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockReset();
  refreshSession.mockReset();
  mockEndRejectedSession.mockClear();
  (getSupabase as jest.Mock).mockReturnValue({ auth: { getSession, refreshSession } });
});

const MeLiteSchema = z.object({ id: z.string() });

describe('authorizedFetch — 401 → bir kez refresh → bir kez retry', () => {
  it('Bearer başlığını ekler; 401 gelirse tazeleyip yeni token ile bir kez daha dener', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'eski' } } });
    refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'taze' } }, error: null });
    fetchMock
      .mockResolvedValueOnce(fakeResponse({ data: null, error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(fakeResponse({ data: { id: 'me-1' }, error: null }));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: { id: 'me-1' }, error: null });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    const retryHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
    expect(firstHeaders.Authorization).toBe('Bearer eski');
    expect(retryHeaders.Authorization).toBe('Bearer taze');
    expect(mockEndRejectedSession).not.toHaveBeenCalled();
  });

  it('tazeleme TANINMAYAN bir hatayla düşerse ilk 401 döner, ikinci deneme YAPMAZ, oturuma dokunmaz', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'eski' } } });
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid refresh token' } });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'unauthorized' }, 401));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockEndRejectedSession).not.toHaveBeenCalled();
  });

  it('cihazda oturum yoksa ağa HİÇ çıkmadan unauthorized döner — kapatılacak oturum da yok', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(mockEndRejectedSession).not.toHaveBeenCalled();
  });

  it('401 dışındaki hata olduğu gibi geçer, tazeleme denenmez', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'eski' } } });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'not_found' }, 404));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'not_found', status: 404 });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(mockEndRejectedSession).not.toHaveBeenCalled();
  });
});

/*
  ÖLÜ OTURUM CİHAZDA BIRAKILMAZ (21.304 — cihazda ölçüldü 10.09). Silinen ya da iptal edilen bir
  oturumda sunucu jetonu reddediyor, auth sunucusu tazelemeye `refresh_token_not_found` diyordu; ama
  supabase-js erişim jetonunun saati dolmadığı için oturumu koruyordu ve ekranlar bir saate kadar
  "Bağlantı ya da sunucu sorunu" dedi. Aşağıdaki iki test kararın iki yüzünü kilitler: kesin retle
  oturum kapanır, auth kesintisinde KAPANMAZ.
*/
describe('authorizedFetch — ölü oturum cihazda bırakılmaz (21.304)', () => {
  it('sunucu 401 + auth sunucusu tazelemeyi KESİN reddetti → oturum kapatılır, ilk 401 döner', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'olu' } } });
    refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token: Refresh Token Not Found', 400, 'refresh_token_not_found'),
    });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'unauthorized' }, 401));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(mockEndRejectedSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tazeleme auth sunucusuna ULAŞAMADIYSA oturum KORUNUR — kesinti kimseyi dışarı atmaz', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'gecerli' } } });
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: new AuthRetryableFetchError('Bad Gateway', 502) });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'unauthorized' }, 401));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(mockEndRejectedSession).not.toHaveBeenCalled();
  });
});
