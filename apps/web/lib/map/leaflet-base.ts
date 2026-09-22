/** Haritaların ortak zemini: karo kaynağı tek yerde, yoksa bir harita CSP'de açık olmayan bir hosttan çizebilirdi. */

/**
 * `tile.openstreetmap.org` kamusal sunucudur ve ağır kullanım için değildir; müşteri checkout haritası da bunu kullandığı
 * için yayından önce altlık değişmeli. BEKLEYEN(K.30)
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; OpenStreetMap';
export const TILE_MAX_ZOOM = 18;

/** Token değerini gerçek renge çevirir: canvas ve SVG CSS sınıfı alamaz, ham hex de yazılamaz. Sunucuda `fallback` döner. */
export function mapToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
