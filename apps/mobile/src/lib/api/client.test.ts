import { z } from 'zod';
import { apiFetch, CLIENT_ERROR } from './client';

// fetch mock'u — Response'un testte kullanılan yüzü yeter (headers.get + json).
function fakeResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = init.headers ?? {};
  return {
    status: init.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => fetchMock.mockReset());

describe('apiFetch — /api/v1 zarf istemcisi', () => {
  it('başarı zarfını açar ve gövdeyi verilen şemayla parse eder (fazla alan düşer)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: { id: 'a1', stray: 'x' }, error: null }));

    const result = await apiFetch('/api/v1/thing', z.object({ id: z.string() }));

    expect(result.error).toBeNull();
    // z.object varsayılanı strip'tir: sözleşmede olmayan alan zarftan içeri SIZAMAZ.
    expect(result.data).toEqual({ id: 'a1' });
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/thing', expect.objectContaining({ method: 'GET' }));
  });

  it('hata zarfında anahtarı, durum kodunu ve 429 Retry-After süresini taşır', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'cooldown' }, { status: 429, headers: { 'retry-after': '42' } }));

    const result = await apiFetch('/api/v1/auth/otp/request', z.literal(true), { method: 'POST', body: { email: 'x' } });

    expect(result).toMatchObject({ data: null, error: 'cooldown', status: 429, retryAfterSec: 42 });
  });

  it('zarf başarı derken gövde şemaya uymuyorsa invalid_response döner', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: { id: 123 }, error: null }));

    const result = await apiFetch('/api/v1/thing', z.object({ id: z.string() }));

    expect(result).toMatchObject({ data: null, error: CLIENT_ERROR.invalidResponse, status: 200 });
  });

  it('ağ hatasında fırlatmaz: network_error + status null (0 değil — bilinmiyor)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await apiFetch('/api/v1/thing', z.unknown());

    expect(result).toMatchObject({ data: null, error: CLIENT_ERROR.network, status: null, retryAfterSec: null });
  });
});
