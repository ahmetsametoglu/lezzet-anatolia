import type * as Leaflet from 'leaflet';
import { loadMapTilesAction } from './tiles-actions';
import type { MapTiles } from './tiles-session';

/** Haritaların ortak zemini: karo kaynağı tek yerde, yoksa bir harita CSP'de açık olmayan bir hosttan çizebilirdi. */

const TILE_HOST = 'https://tile.googleapis.com';
const TILE_MAX_ZOOM = 18;
// Telif satırı kaydırma bitince sorulur; art arda yakınlaşmada her adım ayrı istek olmasın.
const COPYRIGHT_DELAY_MS = 300;

interface GoogleTilesOptions {
  /** Karo üstündeki yer adlarının dili: müşteride sayfanın dili, operasyonda Türkçe. */
  language: string;
  /** Karo katmanının sınıfı; operasyon tasarımı zemini soluklaştırır (`.ops-map-tiles`). */
  className?: string;
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Google karolarını bağlar: Google'ın şartı gereği logo sol altta, görünen alanın telif satırı sağ altta durur. Logo köşeye ilk
 * eklenen denetim olmalı, aynı köşeye sonra eklenen denetim onun üstüne dizilir; dönen fonksiyon dinleyicileri söker.
 */
export function attachGoogleTiles(L: typeof Leaflet, map: Leaflet.Map, options: GoogleTilesOptions): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tiles: MapTiles | null = null;
  let copyright: string | null = null;
  const attribution = map.attributionControl ?? L.control.attribution().addTo(map);

  const logo = new L.Control({ position: 'bottomleft' });
  logo.onAdd = () => {
    const img = L.DomUtil.create('img', 'block h-[18px] w-auto') as HTMLImageElement;
    img.src = '/attribution/google-maps-outline.svg';
    img.alt = 'Google Maps';
    return img;
  };
  logo.addTo(map);

  const refreshCopyright = () => {
    if (!tiles) return;
    const bounds = map.getBounds();
    const query = new URLSearchParams({
      session: tiles.session,
      key: tiles.key,
      zoom: String(Math.round(map.getZoom())),
      north: String(Math.min(bounds.getNorth(), 85)),
      south: String(Math.max(bounds.getSouth(), -85)),
      east: String(Math.min(bounds.getEast(), 180)),
      west: String(Math.max(bounds.getWest(), -180)),
    });
    void fetch(`${TILE_HOST}/tile/v1/viewport?${query.toString()}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ copyright?: unknown }>) : null))
      .then((body) => {
        if (disposed || typeof body?.copyright !== 'string' || body.copyright === copyright) return;
        if (copyright) attribution.removeAttribution(escapeHtml(copyright));
        copyright = body.copyright;
        attribution.addAttribution(escapeHtml(copyright));
      })
      // Telif satırı alınamazsa öncekisi kalır; karo da aynı host'tan geldiği için arıza zaten zeminde görünür.
      .catch(() => undefined);
  };
  const onMoveEnd = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshCopyright, COPYRIGHT_DELAY_MS);
  };

  void loadMapTilesAction(options.language, window.devicePixelRatio > 1).then((session) => {
    if (disposed || !session) return;
    tiles = session;
    L.tileLayer(`${TILE_HOST}/v1/2dtiles/{z}/{x}/{y}?session=${session.session}&key=${session.key}`, {
      maxZoom: TILE_MAX_ZOOM,
      className: options.className,
    }).addTo(map);
    map.on('moveend', onMoveEnd);
    map.whenReady(refreshCopyright);
  });

  return () => {
    disposed = true;
    clearTimeout(timer);
    map.off('moveend', onMoveEnd);
  };
}

/** Token değerini gerçek renge çevirir: canvas ve SVG CSS sınıfı alamaz, ham hex de yazılamaz. Sunucuda `fallback` döner. */
export function mapToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
