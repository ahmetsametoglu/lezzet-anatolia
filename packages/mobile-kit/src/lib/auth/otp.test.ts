import { verifyOtp, requestOtp } from './otp';
import { getSupabase } from './supabase';

// supabase istemcisi mock — cihazsız test; yalnız setSession yüzeyi gerekiyor.
jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));

const setSession = jest.fn(async () => ({ data: {}, error: null }));
(getSupabase as jest.Mock).mockReturnValue({ auth: { setSession } });

function fakeResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = init.headers ?? {};
  return {
    status: init.status ?? 200,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

// Sunucunun döndürdüğü oturum — sözleşme camelCase'tir (AuthSessionSchema); `stray` sözleşme dışı.
const wireSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 3600,
  expiresAt: 1770000000,
  tokenType: 'bearer',
  stray: 'sözleşmede yok',
};

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
  setSession.mockClear();
});

describe('verifyOtp', () => {
  it('cevabı AuthSessionSchema ile parse eder (fazla alan düşer) ve oturumu cihaza yazar', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: { session: wireSession }, error: null }));

    const result = await verifyOtp('musteri@example.com', '123456', 'fr');

    expect(result.error).toBeNull();
    // Parse kanıtı: alanlar tipli, sözleşme dışı `stray` zarfa SIZMADI.
    expect(result.data).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      expiresAt: 1770000000,
      tokenType: 'bearer',
    });
    expect(setSession).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' });
  });

  it('biçimsiz kod API çağrısı YAPMADAN invalid_code döner (deneme sayacı boşa yanmaz)', async () => {
    const result = await verifyOtp('musteri@example.com', '12x', 'fr');

    expect(result).toMatchObject({ data: null, error: 'invalid_code' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tel anahtarını tipli AuthErrorKey olarak geçirir (code_locked)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'code_locked' }, { status: 401 }));

    const result = await verifyOtp('musteri@example.com', '123456', 'fr');

    expect(result).toMatchObject({ data: null, error: 'code_locked' });
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe('yalnız kayıtlı hesap — operasyon girişi (21.312)', () => {
  /** İlk isteğin gövdesi — `apiFetch` gövdeyi JSON'a çevirip gönderir. */
  const sentBody = (): unknown => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

  it('bayrak gövdeye girer ve sunucunun reddi tipli not_registered döner', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'not_registered' }, { status: 403 }));

    const result = await requestOtp('yok@example.test', 'tr', { registeredOnly: true });

    expect(result.error).toBe('not_registered');
    expect(sentBody()).toMatchObject({ email: 'yok@example.test', registeredOnly: true });
  });

  it('bayrak verilmezse gövdede HİÇ yok — müşteri girişinin isteği değişmez', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: true, error: null }));

    await requestOtp('musteri@example.test', 'fr');

    expect(sentBody()).not.toHaveProperty('registeredOnly');
  });

  it('doğrulama da bayrağı taşır — hesap yoksa sunucu hesap açmaz, ret tipli döner', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'not_registered' }, { status: 403 }));

    const result = await verifyOtp('yok@example.test', '123456', 'tr', { registeredOnly: true });

    expect(result.error).toBe('not_registered');
    expect(sentBody()).toMatchObject({ registeredOnly: true });
  });
});

describe('requestOtp', () => {
  it('cooldown cevabında Retry-After süresini sonuca taşır', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'cooldown' }, { status: 429, headers: { 'retry-after': '58' } }));

    const result = await requestOtp('musteri@example.com', 'de');

    expect(result).toMatchObject({ data: null, error: 'cooldown', retryAfterSec: 58 });
  });

  it('enum dışı hata (ağ dahil) müşteri diline send_failed olarak indirgenir; ağ arızası offline taşır', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await requestOtp('musteri@example.com', 'tr');

    expect(result).toMatchObject({ data: null, error: 'send_failed', offline: true });
  });

  it('sunucunun cevabı ağ arızası DEĞİLDİR — offline yalnız isteğin hiç çıkamadığı hâl (21.312)', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ data: null, error: 'send_failed' }, { status: 502 }));

    const result = await requestOtp('musteri@example.com', 'tr');

    expect(result).toMatchObject({ data: null, error: 'send_failed', offline: false });
  });
});
