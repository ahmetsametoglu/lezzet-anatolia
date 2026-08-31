/**
 * İki haritanın ORTAK zemini (11.9) — karo kaynağı, künyesi ve token okuması.
 *
 * `zone-map` (posta kodu seçimi) ile `route-map` (rota önizlemesi) ayrı komponentler ve öyle
 * kalmalı: birinin sözleşmesi (`onPick`, `stateOf`, serbest kod eşiği) ötekinin hiç sormadığı
 * sorulardır. Ortak olan yalnız ZEMİN — ve o kopyalanırsa iki harita bir gün iki farklı karo
 * sunucusundan çizer, biri CSP'de açık olmayan bir hosttan.
 */

/**
 * ⚠ `tile.openstreetmap.org` KAMUSAL bir sunucudur ve ağır kullanım için değildir. Bir avuç
 * operatörün rota kurduğu iç ekran için uygun; yayına çıkarken kendi sağlayıcımıza geçilmeli.
 * BEKLEYEN(19.20)
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; OpenStreetMap';
export const TILE_MAX_ZOOM = 18;

/**
 * Token değerini gerçek renge çevirir — canvas/SVG bir CSS sınıfı alamaz, ham hex de yazılamaz
 * (`CLAUDE §3`). Sunucuda `fallback` döner: değer yalnız çizim anında gerekiyor.
 */
export function mapToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
