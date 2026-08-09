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

/**
 * Pusula yönü (derece, 0 = kuzey) — A'dan B'ye bakınca hangi yön.
 *
 * Tek başına anlamlı değil; `routeFitOf`un ham girdisi. İki yön arasındaki FARK, "aynı istikamet
 * mi" sorusunun cevabıdır.
 */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Bir hedefe en yakın aday — mesafesiyle birlikte. */
export interface NearestResult<T> {
  item: T;
  distanceKm: number;
}

/**
 * ─── GÜZERGÂH UYUMU (22.7 · kullanıcı düzeltmesi 09.08) ──────────────────────
 *
 * İlk yazımda "en yakın bölge" yeterli sanılmıştı. Kullanıcı düzeltti ve haklıydı:
 *
 * > *"Hangi depoya yakın olduğu önemli değil… O posta kodunun güzergâhı bizim bir güzergâhımızla
 * > aynı mı? Araba bir ana yol üzerinde ilerlerken sağındaki ve solundaki posta kodlu yerlere
 * > dağıtım yapabilir. Ama ters yöndeki bir noktaya gidip de dağıtım yapamaz."*
 *
 * Yani mesafe tek başına YANILTIR: hattın 5 km ötesindeki ama ters yöndeki bir kod, hattın
 * üzerindeki 15 km'lik bir koddan pahalıdır — çünkü araç zaten oraya gidiyor.
 *
 * Model üç sayıya iniyor (depo = başlangıç, bölgenin uzak ucu = hattın yönü):
 * - **`alongKm`** — hedefin hat DOĞRULTUSUNDAKİ izdüşümü. Negatifse hedef depodan bakınca ters
 *   yönde: araç oraya hiç gitmiyor.
 * - **`crossKm`** — hedefin hattan DİK uzaklığı, yani "ana yoldan ne kadar sapmak gerek".
 * - **`bearingOffsetDeg`** — iki istikamet arasındaki açı; okunması kolay olsun diye.
 *
 * Bu bir rota optimizasyonu DEĞİL ve öyle sunulmamalı: gerçek sürüş yolu bir servis işi. Buradaki
 * üç sayı bir ELEME aracıdır — "bu kod bizim hattımızın üstünde mi, yoksa apayrı bir sefer mi".
 */
export type RouteFit =
  /** Hattın üzerinde ve koridorda — araç zaten oradan geçiyor. */
  | 'on_route'
  /** Aynı istikamette ama hattın ÖTESİNDE — turu uzatır, yine de aynı yön. */
  | 'extends_route'
  /** Yön doğru ama koridordan çıkıyor — ana yoldan ayrılmak gerekir. */
  | 'detour'
  /** Depodan bakınca TERS yönde — ayrı bir sefer demektir. */
  | 'opposite';

export interface RouteFitResult {
  fit: RouteFit;
  alongKm: number;
  crossKm: number;
  bearingOffsetDeg: number;
  /** Hattın kendi uzunluğu — `alongKm` bununla karşılaştırılır (okuyan taraf oranı görebilsin). */
  routeLengthKm: number;
}

/**
 * Hedefin, bir hatta (depo → hattın uzak ucu) göre uyumu.
 *
 * `corridorKm` parametrik ve varsayılanı **6 km**: bir dağıtım aracının ana yoldan sapıp geri
 * dönmeyi göze alabileceği kabaca mesafe. Eşik olduğu için ayara taşınabilir (`DOMAIN §6`);
 * bugün burada duruyor çünkü tek tüketicisi var.
 */
export function routeFitOf(params: {
  origin: GeoPoint;
  routeEnd: GeoPoint;
  target: GeoPoint;
  corridorKm?: number;
  /** Altında hattın YÖNÜ ölçülemez sayılan uzunluk (km). Merkez bölgeleri bu eşiğin altında kalır. */
  minRouteKm?: number;
}): RouteFitResult | null {
  const { origin, routeEnd, target, corridorKm = 6, minRouteKm = 1 } = params;
  const routeLengthKm = distanceKm(origin, routeEnd);
  const targetKm = distanceKm(origin, target);
  if (routeLengthKm === null || targetKm === null) return null;

  // ── HATTIN YÖNÜ YOKSA UYUM DA YOK (ölçüldü 09.08) ─────────────────────────
  // Bölgenin bütün kodları deponun üstündeyse (merkez bölgesi — 67000/67100/67200 referans
  // tablosunda tek noktada) hattın bir istikameti YOKTUR ve `bearingDeg` sıfır döner. O sıfır bir
  // yön değil, yönsüzlüktür: hesabı sürdürsek hedefin kendi yönü hattın yönü sanılır ve karşımıza
  // "sapma 0,6 km, açı 2°" gibi ikna edici ama uydurma bir sonuç çıkar (canlıda tam olarak bu
  // görüldü). Ölçülemeyen değer sıfır değildir — `null` döner, çağıran "yön bilinmiyor" der.
  if (routeLengthKm < minRouteKm) return null;

  const routeBearing = bearingDeg(origin, routeEnd);
  const targetBearing = bearingDeg(origin, target);
  const rawOffset = Math.abs(targetBearing - routeBearing);
  const bearingOffsetDeg = rawOffset > 180 ? 360 - rawOffset : rawOffset;

  // Küresel dik/paralel ayrıştırma. Kısa mesafelerde düzlem yaklaşımıyla aynı sonucu verir ama
  // formülü bozmadan yazmak, "neden burada 3 km sapma çıktı" sorusunu tartışılır olmaktan çıkarır.
  const angle = toRad(bearingOffsetDeg);
  const crossKm = Math.abs(Math.asin(Math.sin(targetKm / EARTH_RADIUS_KM) * Math.sin(angle)) * EARTH_RADIUS_KM);
  const alongKm = Math.cos(angle) * targetKm;

  // Sıra önemli: ters yön her şeyi ezer. 90°'yi geçen bir istikamette "koridordaymış" gibi
  // görünen bir sonuç, aracın geri dönüp gitmesi gereken bir noktayı hattın üstünde gösterirdi.
  const fit: RouteFit =
    alongKm < 0 || bearingOffsetDeg > 90
      ? 'opposite'
      : crossKm > corridorKm
        ? 'detour'
        : alongKm > routeLengthKm
          ? 'extends_route'
          : 'on_route';

  return {
    fit,
    alongKm: Math.round(alongKm * 10) / 10,
    crossKm: Math.round(crossKm * 10) / 10,
    bearingOffsetDeg: Math.round(bearingOffsetDeg),
    routeLengthKm: Math.round(routeLengthKm * 10) / 10,
  };
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
