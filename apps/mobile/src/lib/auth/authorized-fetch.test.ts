import { z } from 'zod';
import { authorizedFetch } from './authorized-fetch';
import { getSupabase } from './supabase';

jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));

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
  });

  it('tazeleme de düşerse ilk 401 sonucunu döner, ikinci deneme YAPMAZ (girişe yönlendirme ekran kararı)', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'eski' } } });
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid refresh token' } });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'unauthorized' }, 401));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cihazda oturum yoksa ağa HİÇ çıkmadan unauthorized döner', async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'unauthorized', status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 dışındaki hata olduğu gibi geçer, tazeleme denenmez', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'eski' } } });
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'not_found' }, 404));

    const result = await authorizedFetch('/api/v1/me', MeLiteSchema);

    expect(result).toMatchObject({ data: null, error: 'not_found', status: 404 });
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
