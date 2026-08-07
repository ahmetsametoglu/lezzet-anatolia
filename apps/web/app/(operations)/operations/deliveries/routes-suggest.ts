import type { Country } from '@lezzet/types';
import type { CodeStatsView, SuggestionView } from './routes-types';

/**
 * **Rota önerisi motoru** (19.20 · kullanıcı isteği 07.08) — SAF karar, veritabanı yok.
 *
 * Okumadan (`routes-read`) ayrı duruyor ve sebebi `CLAUDE §1`'in kendi ayrımı: *"domain-core = saf
 * karar (DB'siz, testli); database = saf I/O."* Burada verilen kararlar sessizce bozulabilecek
 * cinsten — bir kodun neden önerildiği, hangi sırayla, hangi uzaklığa kadar — ve hepsi testli.
 */

/**
 * **Sinyal ağırlıkları — parametrik ve gerekçeli** (`CLAUDE §4`: parametrik değer sorulmaz, makul
 * varsayılan konur ve bildirilir).
 *
 * Sayılar bir kehanet değil bir SIRALAMA ölçüsü ve ekranda hiç görünmüyorlar: operatör puanı değil
 * ham kanıtı okuyor ("3 kişi bekliyor · 47 kez soruldu"). Ağırlık yalnız hangi satırın üstte
 * duracağına karar veriyor.
 *
 * Oranın gerekçesi sinyalin MALİYETİDİR — bir insanın onu üretmek için ne kadar ileri gittiği:
 * bekleyen kişi e-postasını verip izin işaretledi (en pahalı), sipariş veren ödeme yaptı ama zaten
 * kargoyla hizmet alıyor, soru soran yalnız bir kutuya yazıp çıktı (en ucuz, ama hacmi anlamlı).
 */
export const WAITING_WEIGHT = 10;
export const ORDER_WEIGHT = 6;
export const REQUEST_WEIGHT = 1;

/**
 * **Uzaklık tavanı (km).** Bunun ötesi bir rota adayı değil, bir KARGO müşterisidir — ve onun
 * kararı ("yeni bölge/depo açmalı mıyım") Depolar'daki talep tablosunun işi (19.21).
 *
 * 80 km, tek depodan çıkan bir aracın gün içinde dönebileceği makul yarıçap. Ölçüldü (seed verisi):
 * `67500` rotaya 18 km, `77652` 14 km, `68000` (Colmar) 56 km — üçü de gerçek aday; `54000` (Nancy)
 * ~120 km, `75011` (Paris) ~400 km — ikisi de değil. Eşik bu ikiliyi temiz ayırıyor.
 */
export const SUGGESTION_MAX_KM = 80;

/** Rayda kaç öneri gösterilir. Liste değil DAVET: on satır karar kolaylaştırmaz, erteletir. */
export const SUGGESTION_LIMIT = 6;

/**
 * İki nokta arası kuş uçuşu uzaklık (km) — haversine.
 *
 * Kuş uçuşu YETERLİ ve bilerek: soru "kaç dakika sürer" değil *"güzergâhın yakınında mı"*. Gerçek
 * yol mesafesi bir dış servis ister ve kararı değiştirmez — 30 km'lik bir yer yolla 38 km olabilir,
 * ikisi de "yakın"dır.
 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Motorun girdisi: koordinatı çözülmüş bir aday yer. */
export interface LocatedPlace {
  country: Country;
  postalCode: string;
  places: string[];
  lat: number;
  lng: number;
}

export interface SuggestionInputs {
  /** `ülke:kod` — bir rotada TANIMLI olanlar; bunlar aday değil. */
  definedKeys: ReadonlySet<string>;
  /** Uzaklığın ölçüldüğü çapalar: rotalarda tanımlı kodların koordinatları. */
  routeAnchors: ReadonlyArray<{ lat: number; lng: number }>;
  /** Kod → sipariş/ciro/bekleyen. Anahtar yalnız posta kodu (RPC de öyle eşliyor). */
  stats: Record<string, CodeStatsView>;
  /** Kod → anonim talep sayacı satırı. */
  requestOf: ReadonlyMap<string, { requestCount: number; lastSeenAt: string }>;
  /** "Şimdi" DIŞARIDAN verilir: motor saf kalsın, testi de tarihe bağlı olmasın. */
  now: number;
}

/**
 * Önerileri kurar: **boştaki** kodlardan, en az bir sinyali olan ve güzergâha yakın olanlar.
 *
 * Üç eleme sırayla ve her biri ayrı bir soruya bakıyor:
 * *(1)* zaten bir rotada mı — öyleyse öneri değil, *(2)* hiç sinyali var mı — yoksa bu yalnızca
 * haritadaki yüzlerce boş noktadan biri, *(3)* güzergâha yakın mı — değilse rota adayı değil.
 *
 * **Yakınlık tek başına ÖNERİ SEBEBİ DEĞİL** ve bu bilinçli: bölge havuzundaki kodların neredeyse
 * hepsi "yakın". Yakınlığı da sebep saysaydık öneri listesi haritanın kopyası olurdu ve hiçbir şey
 * söylemezdi. Yakınlık bir SÜZGEÇTİR, sinyal değil.
 */
export function buildSuggestions(
  located: readonly LocatedPlace[],
  { definedKeys, routeAnchors, stats, requestOf, now }: SuggestionInputs,
): SuggestionView[] {
  const rows: Array<SuggestionView & { score: number }> = [];

  for (const place of located) {
    if (definedKeys.has(`${place.country}:${place.postalCode}`)) continue;

    const stat = stats[place.postalCode];
    const demand = requestOf.get(place.postalCode);
    const waitingCount = stat?.waitingCount ?? 0;
    const orderCount = stat?.orderCount ?? 0;
    const requestCount = demand?.requestCount ?? 0;
    if (waitingCount === 0 && orderCount === 0 && requestCount === 0) continue;

    const point = { lat: place.lat, lng: place.lng };
    /**
     * Hiç rota kodu yoksa (ilk kurulum) uzaklık ÖLÇÜLEMEZ — süzgeç uygulanmaz ve mesafe 0 yazılmaz
     * gibi davranılmaz: ölçemediğimiz bir şeye dayanarak eleme yapmak, sinyali olan kodu sessizce
     * yutmak olurdu (`CLAUDE §1`). İlk rotayı kuran operatörün tam olarak bu önerilere ihtiyacı var.
     */
    const measurable = routeAnchors.length > 0;
    const distance = measurable ? Math.min(...routeAnchors.map((anchor) => distanceKm(anchor, point))) : 0;
    if (measurable && distance > SUGGESTION_MAX_KM) continue;

    rows.push({
      country: place.country,
      postalCode: place.postalCode,
      place: place.places[0],
      lat: point.lat,
      lng: point.lng,
      waitingCount,
      orderCount,
      revenueCents: stat?.revenueCents ?? 0,
      requestCount,
      lastAskedMinutes: demand ? Math.max(0, Math.round((now - Date.parse(demand.lastSeenAt)) / 60_000)) : null,
      distanceKm: Math.round(distance),
      score: waitingCount * WAITING_WEIGHT + orderCount * ORDER_WEIGHT + requestCount * REQUEST_WEIGHT,
    });
  }

  // Eşitlikte YAKIN olan önce: aynı kanıta sahip iki koddan güzergâha yakın olanı eklemek ucuzdur.
  return rows
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
    .slice(0, SUGGESTION_LIMIT)
    .map(({ score: _score, ...row }) => row);
}
