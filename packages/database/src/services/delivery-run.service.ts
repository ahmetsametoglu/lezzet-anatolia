import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CloseDeliveryRunResultSchema,
  DeliveryRunCloseSchema,
  DeliveryRunCollectionSchema,
  DeliveryRunSchema,
  SetStopOrderResultSchema,
  OpenDeliveryRunResultSchema,
  DepartDeliveryRunResultSchema,
  type CloseDeliveryRunResult,
  type DeliveryRun,
  type DeliveryRunClose,
  type DeliveryRunCollection,
  type SetStopOrderResult,
  type OpenDeliveryRunResult,
  type DepartDeliveryRunResult,
  type StopOrderMetric,
  type StopOrderPrecision,
  type StopOrderSource,
} from '@lezzet/types';
import { fromCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents } from '../utils/rpc-money';

// SEFER — gerçekleşen teslimat rotası (11.7 · 18.08 · `docs/feature/sefer.md`).
// 0025'teki `courier-day-close.service`in halefi: kapanışın ekseni kurye×gün'den SEFERE indi.
//
// **Karar vermez, satır getirir/yazar** (STACK §4). Yazım İKİ yoldan ve ikisi de RPC: sefer
// başlatma (satır + siparişlerin damgalanması tek transaction) ve sefer kapatma (dönüş + fotoğraf +
// takılı durakların çözümü tek an). Elle `insert`/`update` açık değil — ikinci bir yazım yolu,
// beklenen tutarların başka yerde hesaplanması demekti.

/**
 * RPC dönüşündeki dokuz para alanı — euro `numeric` gelir, cent'e `rpcMoneyToCents`te iner (02.9).
 * Bu bir `moneyFields` BEYANI DEĞİL (o sözleşme tablo satırlarına ait ve adları Cents'le biter);
 * buradaki adlar RPC'nin euro alanlarıdır, çeviri onları `…Cents`e dönüştürür.
 */
const CLOSE_RPC_EURO_FIELDS = [
  'expectedCash',
  'expectedCard',
  'expectedCheque',
  'countedCash',
  'countedCard',
  'countedCheque',
  'differenceCash',
  'differenceCard',
  'differenceCheque',
] as const;

export class DeliveryRunService extends BaseDbService<DeliveryRun, never, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'delivery_run', DeliveryRunSchema, DeliveryRunSchema as never, DeliveryRunSchema as never, false);
  }

  /** Rota+gün'ün seferi — mutlak unique (18.08), yani tekil okunur; yoksa sefer hiç açılmadı. */
  getByZoneDate(zoneId: string, date: string): Promise<DeliveryRun | null> {
    return this.getOneBy({ deliveryZoneId: zoneId, deliveryDate: date });
  }

  /** Kuryenin seferleri — gün verilirse o günün, verilmezse en yeniler. */
  listByCourier(courierId: string, opts: { date?: string; limit?: number } = {}): Promise<DeliveryRun[]> {
    return this.getAll(
      { courierId, deliveryDate: opts.date },
      { orderBy: 'deliveryDate', orderDirection: 'desc', limit: opts.limit ?? 30 },
    );
  }

  /** Günün seferleri — sevkiyat ekranının "araç çıktı mı, döndü mü" şeridi. */
  listByDate(date: string): Promise<DeliveryRun[]> {
    return this.getAll({ deliveryDate: date }, { orderBy: 'createdAt', limit: 100 });
  }

  /**
   * Geçmiş seferler — KEYSET sayfalı (CLAUDE §1: sefer kümesi veriyle sınırsız büyür). İmleç
   * `deliveryDate` + `id` (tiebreak); `nextCursor` üretmek okuyanın işi — bir fazla satır çekilir.
   */
  listRecent(opts: { limit: number; after?: { value: string | number; id: string } }): Promise<DeliveryRun[]> {
    return this.getAll(undefined, {
      orderBy: 'deliveryDate',
      orderDirection: 'desc',
      limit: opts.limit,
      keysetAfter: opts.after,
      tiebreakById: true,
    });
  }

  /**
   * **Seferi KUR** — satır + siparişlerin damgalanması TEK transaction (`open_delivery_run`).
   * `already_started` bir hata değil: rota+gün başına tek sefer, ikinci çağrı mevcut künyeyi alır.
   *
   * Sefer `departed_at` NULL doğar (31.08): kurulmuş sefer araçta bekler, kutuları okutulabilir,
   * ama yola çıkmamıştır. Durum GEÇİŞİ de burada yapılmaz — `ready → out_for_delivery` iznini
   * motor verir, uygulama katmanı yazar (dört-liste sözleşmesi orada kurulur).
   */
  async open(input: {
    zoneId: string;
    date: string;
    courierId: string;
    referenceNo: string;
    vehicleId?: string | null;
    actorId?: string | null;
  }): Promise<OpenDeliveryRunResult> {
    const raw = await this.executeRpc('open_delivery_run', {
      p_zone_id: input.zoneId,
      p_date: input.date,
      p_courier_id: input.courierId,
      p_reference_no: input.referenceNo,
      p_vehicle_id: input.vehicleId ?? null,
      p_actor_id: input.actorId ?? null,
    });
    // `claimed` gömülü dizi — `embeds` ile alt ağaç da çevrilir (order_id → orderId).
    return OpenDeliveryRunResultSchema.parse(dbToApp(raw, new Set(['claimed'])));
  }

  /**
   * **Seferi BAŞLAT** (yola çık) — kurulmuş seferin `departed_at` damgası (31.08).
   * Durum geçişleri yine uygulama katmanında; RPC damganın atomikliğini ve tekrar basılamazlığını
   * taşır. Başkasının seferi `not_mine` alır.
   */
  async depart(input: { runId: string; courierId: string }): Promise<DepartDeliveryRunResult> {
    const raw = await this.executeRpc('depart_delivery_run', {
      p_run_id: input.runId,
      p_courier_id: input.courierId,
    });
    return DepartDeliveryRunResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Durak sırasını yaz** (11.9) — `set_run_stop_order`. Yine RPC, çünkü kural VERİDE duruyor:
   * elle dizilmiş sıra motor yazımıyla ezilmez ve kapanmış seferin sırası donar. Uygulamada
   * oku-sonra-yaz olsaydı, biri sırayı düzeltirken uçuşta olan bir yeniden hesap onu sessizce
   * ezebilirdi.
   */
  async saveStopOrder(input: {
    runId: string;
    orderIds: readonly string[];
    source: StopOrderSource;
    metric: StopOrderMetric;
    precision: StopOrderPrecision;
    actorId?: string | null;
    force?: boolean;
  }): Promise<SetStopOrderResult> {
    const raw = await this.executeRpc('set_run_stop_order', {
      p_run_id: input.runId,
      p_order_ids: [...input.orderIds],
      p_source: input.source,
      p_metric: input.metric,
      p_precision: input.precision,
      p_actor_id: input.actorId ?? null,
      p_force: input.force ?? false,
    });
    return SetStopOrderResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Seferi kapat** — dönüş damgası + kapanış fotoğrafı + takılı durakların çözümü tek an
   * (`close_delivery_run`). Sayılan tutarlar CENT gelir, RPC euro bekler; çeviri burada.
   */
  async close(input: {
    runId: string;
    countedCashCents?: number;
    countedCardCents?: number;
    countedChequeCents?: number;
    note?: string | null;
    actorId?: string | null;
  }): Promise<CloseDeliveryRunResult> {
    const raw = await this.executeRpc('close_delivery_run', {
      p_run_id: input.runId,
      p_counted_cash: fromCents(input.countedCashCents ?? 0),
      p_counted_card: fromCents(input.countedCardCents ?? 0),
      p_counted_cheque: fromCents(input.countedChequeCents ?? 0),
      p_note: input.note ?? null,
      p_actor_id: input.actorId ?? null,
    });
    // RPC dönüşü jsonb — `moneyFields` tablo satırında çalışır, buraya inmez (`rpc-money` künyesi).
    return CloseDeliveryRunResultSchema.parse(rpcMoneyToCents(dbToApp(raw), CLOSE_RPC_EURO_FIELDS));
  }

  /**
   * **Seferi devret** (K2 istisnası) — run + açık siparişlerin kuryesi tek transaction'da değişir
   * (`reassign_delivery_run`). Sonuçlanmış duraklara dokunulmaz: teslim edenin kimliği tarihîdir.
   */
  async reassign(input: { runId: string; courierId: string; actorId?: string | null }): Promise<{
    ok: boolean;
    reason?: 'not_found' | 'already_closed' | 'same_courier';
    movedStops?: number;
  }> {
    const raw = await this.executeRpc('reassign_delivery_run', {
      p_run_id: input.runId,
      p_courier_id: input.courierId,
      p_actor_id: input.actorId ?? null,
    });
    return dbToApp(raw);
  }
}

/**
 * Sefer kapanışı kayıtları — mutabakatın SALT-OKUNUR yüzü. Yazım yalnız RPC'den
 * (`DeliveryRunService.close`); burada okuma metotları durur.
 */
export class DeliveryRunCloseService extends BaseDbService<DeliveryRunClose, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'delivery_run_close',
      DeliveryRunCloseSchema,
      DeliveryRunCloseSchema as never,
      DeliveryRunCloseSchema as never,
      false,
    );
  }

  protected override readonly moneyFields = [
    'expectedCashCents',
    'expectedCardCents',
    'expectedChequeCents',
    'countedCashCents',
    'countedCardCents',
    'countedChequeCents',
  ];

  /** Seferin kapanışı — yoksa sefer henüz açık (ya da hiç sayılmadı). */
  getByRun(runId: string): Promise<DeliveryRunClose | null> {
    return this.getOneBy({ deliveryRunId: runId });
  }

  /** Bir küme seferin kapanışları — rota seçim ekranının "kapalı mı" bayrağı tek sorguda. */
  listByRuns(runIds: readonly string[]): Promise<DeliveryRunClose[]> {
    return this.getAll({ deliveryRunId: [...runIds] });
  }
}

/**
 * Beklenen tahsilat görünümü (`delivery_run_collection`) — kapanış öncesi ekranın okuması.
 * Kendi sınıfı olmasının sebebi teknik: okuma `tableName`e bağlıdır (0025'teki emsalin aynısı).
 */
export class DeliveryRunCollectionService extends BaseDbService<DeliveryRunCollection, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'delivery_run_collection',
      DeliveryRunCollectionSchema,
      DeliveryRunCollectionSchema as never,
      DeliveryRunCollectionSchema as never,
      false,
    );
  }

  protected override readonly moneyFields = ['expectedCashCents', 'expectedCardCents', 'expectedChequeCents'];

  /** Seferin beklenen tahsilatı; hiç kapıda ödeme yoksa satır doğmaz → sıfır kabul edilir. */
  getByRun(runId: string): Promise<DeliveryRunCollection | null> {
    return this.getOneBy({ deliveryRunId: runId });
  }

  /** Bir küme seferin beklenen tahsilatları — kuryelerin üstündeki paranın ham verisi (21.12). */
  listByRuns(runIds: readonly string[]): Promise<DeliveryRunCollection[]> {
    if (runIds.length === 0) return Promise.resolve([]);
    return this.getAll({ deliveryRunId: [...runIds] });
  }
}
