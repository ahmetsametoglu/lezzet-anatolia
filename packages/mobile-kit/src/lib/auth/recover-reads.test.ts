import { z } from 'zod';
import { authorizedFetch } from './authorized-fetch';
import { registerReadRecovery } from './recover-reads';
import { getSupabase } from './supabase';

jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));

// Oturumla alınan başarılı cevap düşen okumaları yeniden denetmezse ya da başarısız cevap denetirse kırmızıya döner.

function fakeResponse(body: unknown, status = 200): Response {
  return { status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const Schema = z.object({ id: z.string() });
const recover = jest.fn();
let unregister: () => void = () => undefined;

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  recover.mockClear();
  (getSupabase as jest.Mock).mockReturnValue({
    auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }), refreshSession: jest.fn() },
  });
  unregister = registerReadRecovery(recover);
});

afterEach(() => unregister());

describe('düşen okumaların kurtarılması', () => {
  it('oturumla başarılı cevap kayıtlı kurtarmaları çağırır', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: { id: 'sepet' }, error: null }));

    await authorizedFetch('/api/v1/me/cart', Schema);

    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('sunucu hatası kurtarma çağırmaz — sağlam olduğu kanıtlanmamış sunucuya yeniden okuma gönderilmez', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'internal' }, 500));

    await authorizedFetch('/api/v1/me/cart', Schema);

    expect(recover).not.toHaveBeenCalled();
  });
});
