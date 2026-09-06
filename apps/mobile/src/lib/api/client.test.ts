import { z } from 'zod';
import { apiFetch, CLIENT_ERROR, failureCauseOf, type ApiFail } from './client';

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

/*
  SEBEP SINIFI (06.09) — cihazda ölçülen yanlış teşhisin çekirdeği.

  Sosyal gelen kutusu "Liste yüklenemedi — bağlantıyı kontrol edin" diyordu; gerçekte oturum ölmüştü
  ve istek ağa HİÇ çıkmamıştı. Sınıf burada ölçülür, cümle ekranın sözlüğünde kurulur.
*/
describe('failureCauseOf — arızanın sebep sınıfı', () => {
  const fail = (over: Partial<ApiFail>): ApiFail => ({ data: null, error: 'x', status: 500, retryAfterSec: null, ...over });

  it('ağa çıkamayan istek BAĞLANTIDIR (status null, 0 değil)', () => {
    expect(failureCauseOf(fail({ error: CLIENT_ERROR.network, status: null }))).toBe('connection');
  });

  it('401 OTURUMDUR — hem yerel kısa devre hem uçtaki Bearer reddi aynı sınıfa düşer', () => {
    expect(failureCauseOf(fail({ error: 'unauthorized', status: 401 }))).toBe('session');
  });

  it('403 YETKİDİR — kimlik doğru, rol kapısı kapalı', () => {
    expect(failureCauseOf(fail({ error: 'forbidden', status: 403 }))).toBe('forbidden');
  });

  it('sözleşmeye uymayan gövde ve 5xx BEKLENMEDİKTİR — oturum suçlanmaz', () => {
    expect(failureCauseOf(fail({ error: CLIENT_ERROR.invalidResponse, status: 200 }))).toBe('unexpected');
    expect(failureCauseOf(fail({ error: 'internal', status: 500 }))).toBe('unexpected');
  });

  it('sebep kaydı yoksa bir sebep İDDİA EDİLMEZ', () => {
    // 200 döndü ama gövde boştu gibi hâller: "ölçülemeyen değer sıfır değildir" (CLAUDE §1).
    expect(failureCauseOf(null)).toBe('unexpected');
  });
});
