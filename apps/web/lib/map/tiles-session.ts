import 'server-only';

import { captureError, SOURCES } from '@lezzet/observability';
import { MAP_STYLE } from '@lezzet/helper';
import { INTL_LOCALE, type Locale } from '@lezzet/i18n';

/** Tarayıcının karo isteğine koyduğu iki değer; ikisi de karo adresinde açıkta gider. */
export interface MapTiles {
  session: string;
  key: string;
}

const CREATE_SESSION_URL = 'https://tile.googleapis.com/v1/createSession';

// Oturum iki hafta geçerli ve bütün ziyaretçilerde ortak kullanılabiliyor; bitmesine bir gün kala yenilenir ki açık bir harita süresi
// dolmuş jetonla karo istemesin.
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

const sessions = new Map<string, { tiles: MapTiles; renewAt: number }>();
const inFlight = new Map<string, Promise<MapTiles | null>>();

/** Dil ve çözünürlük başına tek oturum; alınamazsa `null` döner ve harita zeminsiz çizilir. */
export async function mapTilesSession(language: Locale, highDpi: boolean): Promise<MapTiles | null> {
  const key = process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!key || !site) return null;

  const cacheKey = `${language}:${highDpi ? 2 : 1}`;
  const cached = sessions.get(cacheKey);
  if (cached && Date.now() < cached.renewAt) return cached.tiles;

  const running = inFlight.get(cacheKey);
  if (running) return running;
  const request = createSession(key, site, language, highDpi).then((created) => {
    inFlight.delete(cacheKey);
    if (!created) return null;
    sessions.set(cacheKey, { tiles: created.tiles, renewAt: created.expiresAt - RENEW_BEFORE_MS });
    return created.tiles;
  });
  inFlight.set(cacheKey, request);
  return request;
}

async function createSession(
  key: string,
  site: string,
  language: Locale,
  highDpi: boolean,
): Promise<{ tiles: MapTiles; expiresAt: number } | null> {
  const context = { flow: 'map_tiles_session', language, highDpi };
  try {
    const response = await fetch(CREATE_SESSION_URL, {
      method: 'POST',
      // Anahtar yalnız sitemizden gelen isteği kabul ediyor; oturumu bütün ziyaretçiler için sunucu aldığından siteyi kendisi söylüyor.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, referer: new URL('/', site).toString() },
      body: JSON.stringify({
        mapType: 'roadmap',
        language: INTL_LOCALE[language],
        region: 'FR',
        ...(highDpi ? { scale: 'scaleFactor2x', highDpi: true } : {}),
        styles: MAP_STYLE,
      }),
    });
    if (!response.ok) {
      await captureError(new Error(`Map Tiles oturumu: HTTP ${response.status}`), {
        source: SOURCES.webAction,
        context: { ...context, status: response.status },
      });
      return null;
    }
    const body = (await response.json()) as { session?: unknown; expiry?: unknown };
    const expiresAt = Number(body.expiry) * 1000;
    if (typeof body.session !== 'string' || !Number.isFinite(expiresAt)) {
      await captureError(new Error('Map Tiles oturumu: cevapta jeton ya da süre yok'), { source: SOURCES.webAction, context });
      return null;
    }
    return { tiles: { session: body.session, key }, expiresAt };
  } catch (err) {
    await captureError(err, { source: SOURCES.webAction, context });
    return null;
  }
}
