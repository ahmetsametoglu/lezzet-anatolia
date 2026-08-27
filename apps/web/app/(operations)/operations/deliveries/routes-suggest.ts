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
const WAITING_WEIGHT = 10;
const ORDER_WEIGHT = 6;
const REQUEST_WEIGHT = 1;

/**
 * **Uzaklık SÜZGECİ YOK — kullanıcı kararı 07.08.**
 *
 * Bir süre 80 km'lik bir tavan vardı ve onu ben koymuştum (`CLAUDE §4`: parametrik değer sorulmaz,
 * makul varsayılan konur ve bildirilir). Kullanıcı sorguladı — *"böyle bir sınırdan bahsettiğimi
 * hatırlamıyorum, neden var?"* — ve kaldırılmasına karar verdi: **karar operatöründür.** Uzak bir
 * kodu rotaya eklemek anlamsız olabilir, ama bunu ekranın operatör adına kararlaştırması, ona
 * veriyi göstermemek demekti.
 *
 * Yerine geçen şey bir süzgeç değil, SIRALAMA: kanıtı güçlü olan üste çıkıyor ve tavan (altı satır)
 * zaten zayıf sinyalleri dışarıda bırakıyor. Paris'in iki sorusu, Haguenau'nun 47 sorusu + 3
 * bekleyeni ile aynı listede yarışıyor ve kaybediyor — eleyerek değil, hak ederek.
 *
 * Uzaklık YİNE GÖSTERİLİYOR ama ekranda ve seçili rotaya göre (`routes.desktop`): bilgi olarak
 * kalıyor, karar olarak değil.
 */

/** Rayda kaç öneri gösterilir. Liste değil DAVET: on satır karar kolaylaştırmaz, erteletir. */
export const SUGGESTION_LIMIT = 6;

/*
  KUŞ UÇUŞU UZAKLIK BURADAN KALKTI (27.08) — motorun kopyasıydı.

  `distanceKm` burada yeniden yazılmıştı: aynı haversine, aynı `R = 6371`. Ama motordaki sürümde
  (`domain-core/delivery/distance.ts`) iki koruma vardı, kopyada yoktu: koordinat eksikse `null`
  dönüşü (`CLAUDE §1` — "ölçülemeyen değer SIFIR değildir") ve `Math.asin` girdisinin kırpılması.
  Tek çağıranı `routes.desktop.tsx`ti ve orada "en yakınını seç" de elle yazılıydı (`Math.min`);
  ikisi de motora bağlandı (`nearestOf`). Motorun testi kopyanınkini tamamen kapsıyor.
*/

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
 * İki eleme, iki soru: *(1)* zaten bir rotada mı — öyleyse öneri değil, *(2)* hiç sinyali var mı —
 * yoksa bu yalnızca haritadaki yüzlerce boş noktadan biri.
 *
 * **Yakınlık ne süzgeç ne sinyal** (kullanıcı kararı 07.08): eleme yapmıyor, sıralamaya da girmiyor.
 * Ekranda gösteriliyor ama kararı operatör veriyor. Sıralamanın tek ölçütü KANIT — uzak bir kod
 * listeye ancak güçlü kanıtla girer ve altı satırlık tavan zayıfları zaten dışarıda bırakır.
 */
export function buildSuggestions(
  located: readonly LocatedPlace[],
  { definedKeys, stats, requestOf, now }: SuggestionInputs,
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

    rows.push({
      country: place.country,
      postalCode: place.postalCode,
      // Adlar HAM taşınıyor (`OB-04`): kırpma kararı çizim anında, `placesLabel` ile veriliyor.
      places: place.places,
      lat: place.lat,
      lng: place.lng,
      waitingCount,
      orderCount,
      revenueCents: stat?.revenueCents ?? 0,
      requestCount,
      lastAskedMinutes: demand ? Math.max(0, Math.round((now - Date.parse(demand.lastSeenAt)) / 60_000)) : null,
      score: waitingCount * WAITING_WEIGHT + orderCount * ORDER_WEIGHT + requestCount * REQUEST_WEIGHT,
    });
  }

  // Eşitlikte KOD sırası: uzaklık artık sıralamaya girmiyor ve rastgele bir sıra, aynı ekranı iki
  // kez açan operatöre listeyi değişmiş gibi gösterirdi.
  return rows
    .sort((a, b) => b.score - a.score || a.postalCode.localeCompare(b.postalCode))
    .slice(0, SUGGESTION_LIMIT)
    .map(({ score: _score, ...row }) => row);
}
