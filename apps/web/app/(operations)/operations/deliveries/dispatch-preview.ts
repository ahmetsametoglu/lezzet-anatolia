import type { DispatchRunView } from './dispatch-types';

/**
 * **Turun önizlemesinin SAF eşlemesi** (11.9) — satırlar girer, haritanın modeli çıkar.
 *
 * `dispatch-read` içinde gömülüydü ve orada DB'siz sınanamıyordu; oysa bu eşlemenin üç kararı da
 * ölçülmeyi hak ediyor ve hiçbiri veritabanı sormuyor:
 *   ① sıradaki YER kimlikten türer (`stop_order` dizisindeki indeks + 1) — okuma sırasından değil;
 *   ② koordinatsız durak haritaya GİRMEZ (`Number(null) = 0` bütün turu Gine Körfezi'ne taşırdı);
 *   ③ deponun noktası yoksa çıpa `null` kalır — uydurma bir merkez, tura olmayan bir bacak ekler.
 *
 * Ayrıştırmanın gerekçesi `route-map-model.ts` ile aynı: kararın testi, kararın çalıştığı yerin
 * kurulum maliyetini ödememeli.
 */

export type StopOrderPreview = NonNullable<NonNullable<DispatchRunView['run']>['stopOrder']>;

/** Eşlemenin ihtiyacı olan sefer alanları — satırın tamamı değil (okuyanı yanıltmasın). */
export interface PreviewRun {
  id: string;
  stopOrder: readonly string[];
  stopOrderMetric: string | null;
  stopOrderPrecision: string | null;
}

/** Eşlemenin ihtiyacı olan sipariş alanları. */
export interface PreviewOrder {
  id: string;
  deliveryRunId: string | null;
  referenceNo: string | null;
  addressSnapshot: Record<string, unknown> | null;
}

export interface PreviewDepot {
  lat: number | string | null;
  lng: number | string | null;
  name: string;
}

/**
 * Bir seferin harita modeli. Sıra HESAPLANMAMIŞSA `null` — boş bir harita çizip "sıra yok" demek,
 * operatöre bakacak bir şey vaat edip vermemek olurdu.
 *
 * Koordinatı olan HİÇ durak yoksa da `null`: sıra hesaplanmış olabilir (posta kodu merkezleriyle)
 * ama gösterilecek bir şekil yoktur.
 */
export function runPreviewOf(input: {
  run: PreviewRun;
  orders: readonly PreviewOrder[];
  depot: PreviewDepot | null;
}): StopOrderPreview | null {
  const { run, orders, depot } = input;
  if (run.stopOrderMetric === null || run.stopOrderPrecision === null) return null;

  // Sıradaki yer KİMLİKTEN türer. Okuma sırası siparişin verilme sırasıdır ve bu ekranın anlattığı
  // şeyin tam tersi — motorun dizdiği tur.
  const rank = new Map(run.stopOrder.map((id, index) => [id, index + 1]));

  const stops = orders
    .filter((order) => order.deliveryRunId === run.id)
    .flatMap((order) => {
      const snapshot = order.addressSnapshot;
      const lat = Number(snapshot?.['lat']);
      const lng = Number(snapshot?.['lng']);
      /* Koordinatsız durak haritaya GİRMEZ. `Number(null)` sıfırdır ve (0, 0) Atlantik'te bir
         noktadır: eksik ölçüm sağlıklı gibi okunurdu (`CLAUDE §1`). Durak kaybolmaz — sıradaki
         yerini koruyor ve listede görünüyor; yalnız haritada işareti yok. */
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [
        {
          orderId: order.id,
          sequence: rank.get(order.id) ?? null,
          lat,
          lng,
          label: labelOf(snapshot) || order.referenceNo || '—',
        },
      ];
    });

  if (stops.length === 0) return null;

  return {
    metric: run.stopOrderMetric as StopOrderPreview['metric'],
    precision: run.stopOrderPrecision as StopOrderPreview['precision'],
    origin:
      depot?.lat != null && depot.lng != null
        ? { lat: Number(depot.lat), lng: Number(depot.lng), label: depot.name }
        : null,
    stops,
  };
}

/** İpucu kartının başlığı — adres satırı, yoksa çağıran referans numarasına düşer. */
function labelOf(snapshot: Record<string, unknown> | null): string {
  return [snapshot?.['line1'], snapshot?.['city']].filter((part) => typeof part === 'string').join(', ');
}
