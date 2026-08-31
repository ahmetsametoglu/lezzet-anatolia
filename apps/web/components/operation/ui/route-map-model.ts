/**
 * Rota önizlemesinin SAF modeli (11.9) — tip ve sabitler; Leaflet ithal etmez.
 *
 * Ayrı dosya olmasının gerekçesi `zone-map-model` ile aynı: sunucudan okuyan dosyalar bu tipleri
 * ithal edebilmeli, ama Leaflet'i çekmemeli (`window is not defined`, ölçülmüş arıza 07.08).
 *
 * ── NEDEN `ZoneMap` GENİŞLETİLMEDİ ──────────────────────────────────────────
 * Üç şey uymuyordu ve üçü de yapısal:
 *   ① `zone-map-model`de ÇİZGİ kavramı yok — rota bir polyline ister.
 *   ② İşaretçi NUMARA taşımıyor; `stateOf` beş HÂLE (renk) eşliyor, sayıya değil.
 *   ③ Anahtar çakışıyor: orada `country:postalCode`, yani aynı koddaki iki durak tek noktaya düşer.
 *      Rota haritasının anahtarı `orderId` olmak zorunda.
 * `onPick`, `FREE_CODE_MIN_ZOOM`, `stateOf` posta kodu SEÇİCİSİNİN sözleşmesidir ve rota
 * önizlemesinin bu soruların hiçbiri yok. Bir komponenti iki ilgisiz soruya birden cevap verir hâle
 * getirmek, ikisini de bulandırırdı.
 */

export interface RouteMapStop {
  orderId: string;
  /** Rota sırası (1'den) — `null` = sırasız; harita onu numarasız ve soluk çizer. */
  sequence: number | null;
  lat: number;
  lng: number;
  /** İpucu kartının başlığı: adres ya da müşteri adı. */
  label: string;
}

export interface RouteMapProps {
  /** Turun başlangıcı ve bitişi — depo. `null` = nokta girilmemiş; harita yalnız durakları çizer. */
  origin: { lat: number; lng: number; label: string } | null;
  stops: readonly RouteMapStop[];
  /** Sıra hangi ölçüyle dizildi — künye şeridinde yazılır, `null` = sıra hesaplanmadı. */
  metric: 'haversine' | 'matrix' | null;
  precision: 'address' | 'postal_centroid' | 'mixed' | null;
  className?: string;
}

/** Depo ile ilk durak arasında çizgi çizilecek mi — sıra yoksa bağlanacak bir şey yok. */
export function hasSequence(stops: readonly RouteMapStop[]): boolean {
  return stops.some((stop) => stop.sequence !== null);
}

/**
 * Çizilecek TUR: depo → sıralı duraklar → depo. Sırasız duraklar yola GİRMEZ ama haritada durur —
 * çizgiye katmak, olmayan bir sırayı varmış gibi göstermek olurdu.
 */
export function tourPath(props: Pick<RouteMapProps, 'origin' | 'stops'>): { lat: number; lng: number }[] {
  const ordered = props.stops
    .filter((stop): stop is RouteMapStop & { sequence: number } => stop.sequence !== null)
    .sort((a, b) => a.sequence - b.sequence);

  if (ordered.length === 0) return [];
  const legs = ordered.map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  return props.origin ? [props.origin, ...legs, props.origin] : legs;
}

/** Haritanın çerçeveleyeceği noktalar — depo dahil, sırasız duraklar dahil. */
export function allPoints(props: Pick<RouteMapProps, 'origin' | 'stops'>): { lat: number; lng: number }[] {
  const stops = props.stops.map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  return props.origin ? [props.origin, ...stops] : stops;
}

/** Künye şeridinin cümlesi — ölçü ve incelik operatöre okunur dille söylenir. */
export function metricNote(props: Pick<RouteMapProps, 'metric' | 'precision'>): string | null {
  if (props.metric === null) return 'Sıra hesaplanmadı — duraklar liste sırasında.';

  const olcu = props.metric === 'haversine' ? 'kuş uçuşu' : 'yol süresi';
  const incelik =
    props.precision === 'address'
      ? 'kapı düzeyinde'
      : props.precision === 'postal_centroid'
        ? 'posta kodu düzeyinde'
        : 'karışık çözünürlükte';
  return `Sıra ${olcu} ölçüsüyle, ${incelik}.`;
}
