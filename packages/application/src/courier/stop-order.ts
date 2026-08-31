/**
 * Durak sırasının hesaplanıp seferе yazıldığı **tek kapı** (11.9).
 *
 * ── NEREDE DEĞİL: RPC'NİN İÇİNDE VE CRON'DA ─────────────────────────────────
 * Sıralama bir KARARDIR (`domain-core`), `start_delivery_run` ise claim'in atomikliğini taşır —
 * migration'ın kendi künyesi aynı ayrımı zaten yazıyor: *"DURUM GEÇİŞİ BURADA YAPILMAZ… izni
 * motorundur."* Haversine'i PL/pgSQL'e yazmak kuralı çatallardı.
 *
 * Cron da değil: tetikleyicinin sahibi ve anı belli (sefer başladı / gün okundu). Cron, kimsenin
 * okumadığı seferler için hesap yapar ve dördüncü bir yazan el eklerdi.
 *
 * ── BAYATLIK ZAMANA DEĞİL KÜMEYE BAKAR ──────────────────────────────────────
 * `ticket/ai.ts`in damga deseni burada daha keskin uygulanabiliyor: "sıra bayat mı" sorusunun
 * cevabı bir saat farkı değil, **seferin bugünkü sipariş kümesinin kayıtlı sıradan farklı olması**.
 * Damga ikinci rolde — düşmüş bir sağlayıcı her ekran tazelemesinde yeniden dövülmesin diye bir
 * bekleme süresi.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AddressService,
  DeliveryRunService,
  OrderService,
  PostalCodePlaceService,
  WarehouseService,
} from '@lezzet/database';
import { orderStops, warehousePoint, type GeoPoint, type RouteStop } from '@lezzet/domain-core';
import type { Order, StopOrderPrecision } from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';

/** Aynı seferin sırası bu süre içinde yeniden hesaplanmaz — düşmüş sağlayıcı dövülmesin. */
const RECOMPUTE_COOLDOWN_MS = 60_000;

export type StopOrderOutcome =
  | { status: 'written'; stops: number; precision: StopOrderPrecision; unplaced: number }
  | { status: 'fresh' }
  | { status: 'kept_manual' }
  | { status: 'skipped'; reason: 'run_not_found' | 'no_stops' | 'cooling_down' }
  | {
      status: 'unavailable';
      reason:
        | 'no_origin'
        | 'no_points'
        | 'too_many'
        | 'cost_unavailable'
        | 'write_failed'
        /**
         * Duraklar ayırt edilemedi — hepsi tek noktada. Bugünkü tipik sebebi posta kodu merkezi:
         * ölçüldü 31.08, GeoNames dökümünde Strasbourg'un üç kodu da aynı noktayı taşıyor. Adres
         * koordinatı geldiğinde bu hâl kendiliğinden kapanır.
         */
        | 'indistinguishable';
    };

/**
 * Seferin sırasını gerekirse hesaplar ve yazar.
 *
 * **Hiçbir hâlde fırlatmaz ve çağıranı bloke etmez.** Bir rota iyileştirici, aracın yola çıkmasını
 * durduramaz: hesap düşerse sıra `null` kalır, ekran "sırasız" der ve kurye günü yine görür.
 */
export async function ensureStopOrder(
  db: SupabaseClient,
  input: { runId: string; force?: boolean; actorId?: string | null },
): Promise<StopOrderOutcome> {
  try {
    const runs = new DeliveryRunService(db);
    const run = await runs.getById(input.runId);
    if (!run) return { status: 'skipped', reason: 'run_not_found' };

    const orders = await new OrderService(db).listByRuns([run.id]);
    const stopIds = orders.map((order) => order.id);
    if (stopIds.length === 0) return { status: 'skipped', reason: 'no_stops' };

    // Elle dizilmiş sıra motor tarafından ezilmez — kural veride de duruyor (RPC), burada yalnız
    // boşuna hesap yapmamak için erken çıkılıyor.
    if (run.stopOrderSource === 'manual' && !input.force) return { status: 'kept_manual' };

    if (!input.force && isFresh(run.stopOrder, stopIds)) return { status: 'fresh' };
    if (!input.force && coolingDown(run.stopOrderGeneratedAt)) return { status: 'skipped', reason: 'cooling_down' };

    const { origin, stops, precision } = await resolvePoints(db, { warehouseId: run.warehouseId, orders });
    if (!origin) return { status: 'unavailable', reason: 'no_origin' };

    const plan = orderStops({ start: origin, stops });
    if (!plan.ok) {
      return {
        status: 'unavailable',
        reason: plan.reason === 'no_start' ? 'no_origin' : plan.reason,
      };
    }

    const written = await runs.saveStopOrder({
      runId: run.id,
      orderIds: plan.plan.ordered.map((stop) => stop.id),
      source: 'engine',
      // Bugün tek ölçü var; port takıldığı gün burası `matrix` diyecek ve motor hiç değişmeyecek.
      metric: 'haversine',
      precision,
      actorId: input.actorId ?? null,
      force: input.force,
    });

    if (!written.ok) {
      return written.reason === 'manual_order_kept'
        ? { status: 'kept_manual' }
        : { status: 'unavailable', reason: 'write_failed' };
    }

    return {
      status: 'written',
      stops: plan.plan.ordered.length,
      precision,
      unplaced: plan.plan.unplaced.length,
    };
  } catch (error) {
    // Bağlama KİMLİK yazılır, konum yazılmaz (CLAUDE §1): `runId` teşhis için yeter, koordinat
    // müşterinin evidir.
    await captureError(error, { source: SOURCES.applicationCourier, context: { flow: 'stop_order', runId: input.runId } });
    return { status: 'unavailable', reason: 'write_failed' };
  }
}

/**
 * Kayıtlı sıra bugünkü durakları KAPSIYOR mu. Küme karşılaştırması — sıradaki fazlalık (sonuçlanıp
 * seferden çıkmış sipariş) bayatlık sayılmaz, EKSİKLİK sayılır: gün ortasında hazırlanan bir sipariş
 * aksi hâlde sırasız kalırdı.
 */
function isFresh(stopOrder: readonly string[], stopIds: readonly string[]): boolean {
  if (stopOrder.length === 0) return false;
  const known = new Set(stopOrder);
  return stopIds.every((id) => known.has(id));
}

function coolingDown(generatedAt: string | null): boolean {
  if (!generatedAt) return false;
  const at = Date.parse(generatedAt);
  return Number.isFinite(at) && Date.now() - at < RECOMPUTE_COOLDOWN_MS;
}

/**
 * Durakların ve deponun noktaları — **önce adresin kendi koordinatı, sonra posta kodu merkezi.**
 *
 * Merkez `address` satırına KOPYALANMIYOR (türetilmiş değeri kalıcılaştırmak olurdu); geri düşüş
 * okuma anında yaşıyor ve sonucu `precision` alanında GÖRÜNÜR oluyor. Bir rotanın posta kodlarının
 * bir kısmı yoğun, bir kısmı tek duraklı olabildiği için (kullanıcı ölçümü 31.08) aynı seferde iki
 * çözünürlük bir arada olabiliyor — `mixed` tam olarak bunu söylüyor.
 */
async function resolvePoints(
  db: SupabaseClient,
  input: { warehouseId: string; orders: readonly Order[] },
): Promise<{ origin: GeoPoint | null; stops: RouteStop[]; precision: StopOrderPrecision }> {
  const warehouse = await new WarehouseService(db).getById(input.warehouseId);

  /* Snapshot ÖNCE, adres kaydı GERİ DÜŞÜŞ — `addressTexts`in aynı deseni (`day.ts`).
     Snapshot doğru kaynaktır: sipariş anındaki nokta, adres sonradan düzelse de değişmez. Ama eski
     siparişlerin snapshot'ında koordinat yok (alan sonradan doğdu) ve adres kaydı hâlâ duruyorsa
     ondan okumak, o durağı posta kodu merkezine düşürmekten iyidir. */
  const snapshots = new Map(
    input.orders.map((order) => [order.id, (order.addressSnapshot ?? null) as Record<string, unknown> | null]),
  );
  const addressPoints = await addressPointsOf(db, input.orders, snapshots);
  const codes = new Set<string>();
  for (const snapshot of snapshots.values()) {
    const code = textOf(snapshot?.['postalCode']);
    if (code) codes.add(code);
  }
  const warehouseCode = textOf(warehouse?.address?.['postalCode'] ?? warehouse?.address?.['postal_code']);
  if (warehouseCode) codes.add(warehouseCode);

  const centroids = await centroidsOf(db, [...codes]);
  const origin = warehousePoint({
    lat: warehouse?.lat,
    lng: warehouse?.lng,
    address: warehouse?.address ?? null,
    centroidOf: (code) => centroids.get(code) ?? null,
  });

  let exact = 0;
  let approximate = 0;
  const stops: RouteStop[] = input.orders.map((order) => {
    const snapshot = snapshots.get(order.id) ?? null;
    const own = pointOf(snapshot?.['lat'], snapshot?.['lng']) ?? addressPoints.get(order.id) ?? null;
    if (own) {
      exact += 1;
      return { id: order.id, point: own };
    }

    const code = textOf(snapshot?.['postalCode']);
    const centroid = code ? (centroids.get(code) ?? null) : null;
    if (centroid) approximate += 1;
    return { id: order.id, point: centroid };
  });

  return { origin, stops, precision: precisionOf(exact, approximate) };
}

function precisionOf(exact: number, approximate: number): StopOrderPrecision {
  if (approximate === 0) return 'address';
  if (exact === 0) return 'postal_centroid';
  return 'mixed';
}

/**
 * Snapshot'ında koordinat OLMAYAN siparişlerin noktası, adres kaydından.
 *
 * Yalnız eksik olanlar sorulur — snapshot doğru kaynaktır ve çoğu siparişte doludur; hepsini
 * sormak her gün okumasına gereksiz bir tur eklerdi.
 */
async function addressPointsOf(
  db: SupabaseClient,
  orders: readonly Order[],
  snapshots: ReadonlyMap<string, Record<string, unknown> | null>,
): Promise<Map<string, GeoPoint>> {
  const missing = orders.filter(
    (order) => order.addressId && !pointOf(snapshots.get(order.id)?.['lat'], snapshots.get(order.id)?.['lng']),
  );
  if (missing.length === 0) return new Map();

  const rows = await new AddressService(db).listByIds([...new Set(missing.map((order) => order.addressId as string))]);
  const byId = new Map(rows.map((row) => [row.id, row]));

  const out = new Map<string, GeoPoint>();
  for (const order of missing) {
    const row = order.addressId ? byId.get(order.addressId) : undefined;
    const point = pointOf(row?.lat, row?.lng);
    if (point) out.set(order.id, point);
  }
  return out;
}

async function centroidsOf(db: SupabaseClient, codes: readonly string[]): Promise<Map<string, GeoPoint>> {
  const places = new PostalCodePlaceService(db);
  const map = new Map<string, GeoPoint>();

  await Promise.all(
    codes.map(async (code) => {
      const rows = await places.findByPostalCode(code);
      // Aynı kod iki ülkede geçerli olabilir (610 kod, 0033 künyesi). Burada ülke ayrımı yapılmıyor
      // ve yapılamaz: snapshot ülkeyi taşımayabiliyor. Noktası olan ilk satır alınıyor — rotanın
      // ölçeğinde iki ülkenin aynı kodu aynı rotada olmaz.
      const withPoint = rows.find((row) => row.lat !== null && row.lng !== null);
      if (withPoint) map.set(code, { lat: Number(withPoint.lat), lng: Number(withPoint.lng) });
    }),
  );

  return map;
}

function pointOf(lat: unknown, lng: unknown): GeoPoint | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
