/**
 * İki posta kodu arasındaki KUŞ UÇUŞU mesafe (22.7).
 *
 * ── NEDEN MOTORDA, ARAÇTA DEĞİL ─────────────────────────────────────────────
 * Asistan "67500 kodunu hangi bölgeye ekleyeyim" derken bir dayanağa muhtaç; bugün hiç yok ve
 * körlemesine seçiyor. Dayanak veride ZATEN var (`postal_code_place.lat/lng`) ama hesabı hiçbir
 * yerde yoktu. Hesabı modele bıraksaydık her çağrıda başka bir sonuç çıkardı — mesafe bir görüş
 * değil, bir ölçüdür.
 *
 * ── KUŞ UÇUŞU, YOL DEĞİL — ve bu bilinçli ───────────────────────────────────
 * Gerçek sürüş mesafesi bir rota servisi ister (dış bağımlılık, kota, gecikme). Burada aranan şey
 * "hangi hat daha yakın" karşılaştırmasıdır ve o soruya kuş uçuşu yeter: Strasbourg çevresinde
 * sıralamayı değiştirecek kadar sapan bir topografya yok. **Sayı bir karar değil bir sıralama
 * girdisidir** — ekrana "12 km" yazan taraf bunun yaklaşık olduğunu söylemeli.
 */

/** Dünya yarıçapı (km) — ortalama küresel yarıçap. */
const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
  lat: number;
  lng: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Haversine — iki nokta arası kuş uçuşu km. Girdi eksikse `null`: **sıfır DEĞİL** (`CLAUDE §1`),
 * çünkü sıfır "aynı yerde" demek olurdu ve koordinatsız bir kod en yakın hat seçilirdi.
 */
export function distanceKm(a: GeoPoint | null | undefined, b: GeoPoint | null | undefined): number | null {
  if (!a || !b) return null;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bir hedefe en yakın aday — mesafesiyle birlikte. */
export interface NearestResult<T> {
  item: T;
  distanceKm: number;
}

/**
 * Adaylar içinden hedefe EN YAKIN olanı seçer.
 *
 * Koordinatı olmayan aday **elenir, sıfır sayılmaz**; hiçbir adayın koordinatı yoksa `null` döner
 * ve çağıran "yakınlık bilinmiyor" der. Sessizce bir aday seçmek, ölçülemeyen bir şeyi ölçülmüş
 * gibi göstermenin en pahalı hâli olurdu: yanlış hatta açılan bir bölge, aracın her hafta boşa
 * gittiği bir durak demektir.
 */
export function nearestOf<T>(target: GeoPoint | null | undefined, candidates: readonly { item: T; point: GeoPoint | null }[]): NearestResult<T> | null {
  if (!target) return null;
  let best: NearestResult<T> | null = null;
  for (const candidate of candidates) {
    const km = distanceKm(target, candidate.point);
    if (km === null) continue;
    if (!best || km < best.distanceKm) best = { item: candidate.item, distanceKm: km };
  }
  return best;
}
