/*
  Posta kodu → bölge → depo: kod bir aktif bölgeye düşerse o bölgenin deposu, düşmezse ülkenin tek kargo deposu. Aynı kod iki
  bölgedeyse cevap hatadır, çünkü sessizce birini seçmek siparişi yanlış depoya düşürür.
*/

import type { Country } from '@lezzet/types';
import { normalizePostalCode } from '@lezzet/helper';
import { matchZones, type DeliveryZoneCandidate } from './delivery-days';
import { placeLabel } from './place-name';

export interface WarehouseCandidate {
  id: string;
  code: string;
  countryCode: Country;
  /** Bölge dışı adresler kargo deposuna düşer. */
  shipsOnline: boolean;
  isActive: boolean;
}

export interface ZoneWithWarehouse extends DeliveryZoneCandidate {
  warehouseId: string;
  isActive: boolean;
}

export type PlaceResolution =
  /** Araçla teslim: ücretsiz, kapıda ödeme mümkün. */
  | { kind: 'route'; warehouseId: string; zoneId: string; weekdays: readonly number[] }
  | { kind: 'shipping'; warehouseId: string }
  /**
   * `no_shipping_warehouse` bizim yapılandırma eksiğimizdir, müşteriye "bölge dışısınız" dedirtmemeli; `ambiguous_zone` aynı
   * kodun iki bölgede olmasıdır.
   */
  | { kind: 'unresolved'; reason: 'no_shipping_warehouse' | 'ambiguous_zone' };

/** Pasif bölge yok sayılır; bu "hizmet yok" değil, kargo demektir. */
export function resolveWarehouseForPostalCode(
  place: { country: Country; postalCode: string },
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): PlaceResolution {
  const matched = matchZones(place, zones);

  if (matched.length > 1) return { kind: 'unresolved', reason: 'ambiguous_zone' };

  const zone = matched[0];
  if (zone) {
    // Deposu kapalı bölgede rota fiilen yoktur; müşteri kargoya düşer.
    const warehouse = warehouses.find((w) => w.id === zone.warehouseId && w.isActive);
    if (warehouse) return { kind: 'route', warehouseId: warehouse.id, zoneId: zone.id, weekdays: zone.weekdays };
  }

  const shipping = findShippingWarehouse(place.country, warehouses);
  if (!shipping) return { kind: 'unresolved', reason: 'no_shipping_warehouse' };
  return { kind: 'shipping', warehouseId: shipping.id };
}

/**
 * Ülke başına tek kargo deposu var (veritabanında kısmi tekil indeks). Ayrı fonksiyon, çünkü vitrin rota içindeki müşteri için
 * de "bu ürün kargoyla gelir mi" diye soruyor.
 */
export function findShippingWarehouse(
  country: Country,
  warehouses: readonly WarehouseCandidate[],
): WarehouseCandidate | null {
  return warehouses.find((w) => w.isActive && w.shipsOnline && w.countryCode === country) ?? null;
}

/** Hizmet ülkeleri ayardan değil veriden türer: yeni ülkede depo açıldığında küme kendiliğinden büyür. */
export function activeCountries(
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
): Country[] {
  const countries = new Set<Country>();
  for (const w of warehouses) if (w.isActive) countries.add(w.countryCode);
  for (const z of zones) {
    if (!z.isActive) continue;
    for (const c of z.postalCodes) countries.add(c.country);
  }
  return [...countries].sort();
}

export interface PostalCodeMatch {
  country: Country;
  /** Kod yalnız kendi bölge tablomuzdaysa boştur: yer adı uydurulmaz, ekran bölge adını gösterir. */
  places: readonly string[];
}

/** Belirsiz kodda müşteriye ülke değil tanınabilir bir yer sunulur. */
export interface PlaceCandidate extends PostalCodeMatch {
  /** Daha olası cevap olduğu için sıralamada önce gelir. */
  inRoute: boolean;
}

/** Ülkesiz kodun çözümü: ülke de türetilir. */
export type PostalCodeResolution =
  /** `placeName` burada bir kez türetilir ki çağıranlar ad kuralını yeniden yazmasın. */
  | (Extract<PlaceResolution, { kind: 'route' | 'shipping' }> & {
      country: Country;
      places: readonly string[];
      placeName: string | null;
    })
  | (Extract<PlaceResolution, { kind: 'unresolved' }> & { country: Country })
  | { kind: 'ambiguous'; candidates: readonly PlaceCandidate[] }
  /** Büyük olasılıkla yazım hatası; engel değil uyarıdır. */
  | { kind: 'unknown' };

/**
 * Ülke koddan türer ya da müşterinin seçtiği ülkeye bağlanır; iki yolda da çift referansta ya da bölge tablomuzda bulunmalı,
 * çünkü KDV oranı ve teslimat yolu ona bağlı. İki hizmet ülkesinde geçerli kodda rota adayı yalnız sıralamada öne alınır, seçimi
 * müşteri yapar.
 */
export function resolvePlaceByPostalCode(
  postalCode: string,
  matches: readonly PostalCodeMatch[],
  zones: readonly ZoneWithWarehouse[],
  warehouses: readonly WarehouseCandidate[],
  /** Verilirse kod bu ülkeye bağlanır; kod orada yoksa cevap `unknown`. */
  chosenCountry?: Country,
): PostalCodeResolution {
  // Nereye gittiğimizi kendi bölge tablomuz bilir: dış referansta olmayan kodu da, pasif bölgenin kodunu da tanır, çünkü ülkesi
  // bellidir.
  const code = normalizePostalCode(postalCode);
  const own = new Map<Country, PostalCodeMatch>();
  for (const zone of zones) {
    for (const entry of zone.postalCodes) {
      if (normalizePostalCode(entry.postalCode) === code && !own.has(entry.country)) {
        // Kendi tablomuz yer adını bilmez ve uydurulmaz; referansta karşılığı varsa aşağıda o kazanır.
        own.set(entry.country, { country: entry.country, places: [] });
      }
    }
  }

  // Referans satırı yer adıyla geldiği için öncelikli; yalnız bizde olan ülke yine de kalır.
  const merged = new Map(own);
  for (const m of matches) merged.set(m.country, m);
  // Seçilen ülke süzer, sıralamaz: başka ülkeye sessizce çözmek müşterinin vermediği bir KDV kararı olurdu.
  const all = [...merged.values()].filter((m) => !chosenCountry || m.country === chosenCountry);

  if (all.length === 0) return { kind: 'unknown' };

  const served = new Set(activeCountries(zones, warehouses));
  // Hizmet ülkemizde olmayan kodu da tanıyoruz: doğru cevap "tanımadık" değil, aşağıdaki çözümün vereceği
  // `no_shipping_warehouse`.
  const candidates = all.filter((m) => served.has(m.country));
  const effective = candidates.length > 0 ? candidates : all;

  if (effective.length > 1) {
    const scored = effective.map((m) => ({
      ...m,
      inRoute: resolveWarehouseForPostalCode({ country: m.country, postalCode }, zones, warehouses).kind === 'route',
    }));
    // Aynı kod her seferinde aynı listeyi üretsin diye eşitlikte ülke koduna göre sıralanır.
    scored.sort((a, b) => Number(b.inRoute) - Number(a.inRoute) || a.country.localeCompare(b.country));
    return { kind: 'ambiguous', candidates: scored };
  }

  const only = effective[0]!;
  const resolved = resolveWarehouseForPostalCode({ country: only.country, postalCode }, zones, warehouses);
  return resolved.kind === 'unresolved'
    ? { ...resolved, country: only.country }
    : { ...resolved, country: only.country, places: only.places, placeName: placeLabel(only.places) };
}
