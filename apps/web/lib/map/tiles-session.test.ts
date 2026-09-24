import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Harita oturumu sunucuda alınıp bütün ziyaretçilere paylaştırılır. İstek site adresini taşımazsa anahtarın site kısıtı onu
  reddeder; oturum saklanmazsa her harita açılışı Google'a ayrı istek olur; ret saklanırsa anahtar düzelince de harita zeminsiz kalır.
*/

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));
vi.mock('@lezzet/observability', () => ({ captureError, SOURCES: { webAction: 'web-action' } }));

const KEY = 'tarayici-anahtari';
const SITE = 'https://lezzetanatolie.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const granted = (session: string, validForMs = 14 * DAY_MS) =>
  new Response(JSON.stringify({ session, expiry: String(Math.floor((Date.now() + validForMs) / 1000)) }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;

async function freshModule() {
  vi.resetModules();
  return import('./tiles-session');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  vi.stubEnv('GOOGLE_MAPS_BROWSER_API_KEY', KEY);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  captureError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('harita karosu oturumu', () => {
  it('istek site adresini taşır, oturum aynı dil ve çözünürlükte bir kez alınır', async () => {
    fetchMock.mockResolvedValue(granted('oturum-1'));
    const { mapTilesSession } = await freshModule();

    const first = await mapTilesSession('fr', true);
    const second = await mapTilesSession('fr', true);

    expect(first).toEqual({ session: 'oturum-1', key: KEY });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).referer).toBe(`${SITE}/`);
  });

  it('bitmesine bir günden az kalan oturum yenilenir', async () => {
    fetchMock.mockResolvedValueOnce(granted('eski')).mockResolvedValueOnce(granted('yeni'));
    const { mapTilesSession } = await freshModule();

    expect((await mapTilesSession('de', false))?.session).toBe('eski');
    vi.setSystemTime(Date.now() + 13 * DAY_MS + 60_000);
    expect((await mapTilesSession('de', false))?.session).toBe('yeni');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ret saklanmaz ve anahtar hata kaydına yazılmaz', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(granted('sonra'));
    const { mapTilesSession } = await freshModule();

    expect(await mapTilesSession('tr', true)).toBeNull();
    expect(captureError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(captureError.mock.calls.map(([err, meta]) => [String(err), meta]));
    expect(logged).not.toContain(KEY);
    expect((await mapTilesSession('tr', true))?.session).toBe('sonra');
  });
});
