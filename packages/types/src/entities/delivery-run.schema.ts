import { z } from 'zod';
import {
  OrderStatusEnum,
  StopOrderMetricEnum,
  StopOrderPrecisionEnum,
  StopOrderSourceEnum,
} from '../primitives/enums.schema';

// Sefer: gerçekleşen teslimat rotası; planlanan sefer `(deliveryZoneId, deliveryDate)` ikilisidir ve türetilmiş kalır.
// Durum makinesi yok: hâl damgalardan türer (`departedAt` dolu = yolda, `returnedAt` dolu = döndü).

export const DeliveryRunSchema = z.object({
  id: z.string().uuid(),
  /** Okunabilir sefer kodu — `SF-26-XXXXXX` (`deliveryRunReferenceNo`, domain-core). */
  referenceNo: z.string(),
  deliveryZoneId: z.string().uuid(),
  deliveryDate: z.string(),
  /** SNAPSHOT: bölge sonradan başka depoya taşınsa da seferin yüklendiği tesis değişmez. */
  warehouseId: z.string().uuid(),
  /** Seferi süren kurye — siparişin `courierId`si start anında BURADAN senkronlanır. */
  courierId: z.string().uuid(),
  /** Nullable: araç kaydı girilmemiş kurulumda kurye kilitlenmez; zorunluluk parametrik (Setting). */
  vehicleId: z.string().uuid().nullable(),
  createdAt: z.string(),
  departedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  note: z.string().nullable(),

  /**
   * Durak sırası turun özelliğidir, siparişin değil; sipariş başka güne taşınınca kolon olarak sessizce yalana dönerdi.
   * Dizi sıralamadır, üyelik değil: dizide olmayan durak düşmez, sırasız olarak sona gider.
   */
  stopOrder: z.array(z.string().uuid()),
  /** Sırayı kim koydu; `manual` motor yazımını kilitler. `null` = hiç hesaplanmadı. */
  stopOrderSource: StopOrderSourceEnum.nullable(),
  /** Hangi ölçüyle — kuş uçuşu mu gerçek yol süresi mi. Ekran bunu söyleyebilmeli. */
  stopOrderMetric: StopOrderMetricEnum.nullable(),
  /** Hangi incelikte — `postal_centroid` ise aynı koddaki duraklar arasında sıra keyfidir. */
  stopOrderPrecision: StopOrderPrecisionEnum.nullable(),
  /**
   * Kararın anı. Sonuç BOŞ olsa da damgalanır ("hesaplandı, sıralanamadı") — yoksa düşmüş bir
   * sağlayıcı her gün ekranı yoklamasında yeniden dövülürdü.
   */
  stopOrderGeneratedAt: z.string().nullable(),
  stopOrderBy: z.string().uuid().nullable(),
});
export type DeliveryRun = z.infer<typeof DeliveryRunSchema>;

/**
 * `set_run_stop_order` dönüşü; `manual_order_kept` ve `run_closed` hata değil korumadır: elle dizilen sıra yeniden hesapla ezilmez, kapanmış seferin sırası donar.
 */
export const SetStopOrderResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['run_not_found', 'run_closed', 'manual_order_kept']).optional(),
  runId: z.string().uuid().optional(),
  stops: z.number().int().optional(),
});
export type SetStopOrderResult = z.infer<typeof SetStopOrderResultSchema>;

/**
 * Sefer kapanışı, mutabakat kaydı; `expected_*` türetilebilirken saklanır, çünkü sonradan bir hareket düzeltilse de "o gün ne konuşuldu" değişmemeli.
 * `reconciled` veritabanında türer; para alanları cent, dönüşüm servis sınırında.
 */
export const DeliveryRunCloseSchema = z.object({
  id: z.string().uuid(),
  deliveryRunId: z.string().uuid(),
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
  countedCashCents: z.number().int(),
  countedCardCents: z.number().int(),
  countedChequeCents: z.number().int(),
  /**
   * Seferin üç akıbeti — sayı değil KİMLİK: kapanıştan sonra "hangi sipariş" sorusu cevaplanabilsin.
   * Fotoğraf ÇÖZÜMDEN ÖNCE çekilir: kapanışın `ready`ye düşürdüğü duraklar burada `pending` görünür.
   */
  deliveredOrders: z.array(z.string().uuid()),
  returnedOrders: z.array(z.string().uuid()),
  pendingOrders: z.array(z.string().uuid()),
  note: z.string().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: z.string(),
  reconciled: z.boolean(),
});
export type DeliveryRunClose = z.infer<typeof DeliveryRunCloseSchema>;

/**
 * `delivery_run_collection` görünümü — kapanış ÖNCESİ beklenen tahsilat, SEFER bazında.
 * Toplama SQL'i tek yerde (görünümde); TypeScript'te ikinci kez yazılmaz.
 */
export const DeliveryRunCollectionSchema = z.object({
  deliveryRunId: z.string().uuid(),
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
});
export type DeliveryRunCollection = z.infer<typeof DeliveryRunCollectionSchema>;

/**
 * `open_delivery_run` dönüşü: sefer kurulur, başlamaz (`departedAt` null); yola çıkaran `depart_delivery_run`dır.
 * `already_started` ikinci çağrının ezmediğini söyler; `claimed` durum geçişi değil damgalamadır, `ready → out_for_delivery`yi uygulama katmanı yazar.
 */
export const OpenDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  /**
   * `vehicle_taken` araç başka kuryenin açık seferinde, `vehicle_mismatch` kuryenin öteki açık seferi başka araçta demektir; çareleri ayrı olduğu için ayrı retlerdir.
   */
  reason: z
    .enum(['already_started', 'zone_not_found', 'reference_collision', 'vehicle_taken', 'vehicle_mismatch'])
    .optional(),
  /** `vehicle_mismatch` dalında: çakışan seferin aracı — ekran "şu araçtasın" diyebilsin. */
  vehicleId: z.string().uuid().nullable().optional(),
  runId: z.string().uuid().optional(),
  referenceNo: z.string().optional(),
  /** `already_started` dalında: seferi kim sürüyor — ekran "rota bugün X'te" diyebilsin. */
  courierId: z.string().uuid().optional(),
  /* `null` = sefer kuruldu ama başlamadı; `optional` yetmez, çünkü RPC alanı her dalda döndürür ve "alan yok" ile "damga yok" ayrı gerçeklerdir. */
  departedAt: z.string().nullable().optional(),
  claimed: z.array(z.object({ orderId: z.string().uuid(), status: OrderStatusEnum })).optional(),
});
export type OpenDeliveryRunResult = z.infer<typeof OpenDeliveryRunResultSchema>;

/**
 * `depart_delivery_run` dönüşü: kurulmuş seferin yola çıkma damgası; ikinci basış hata değil, `already_departed` ile aynı künye döner.
 */
export const DepartDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  /**
   * `another_running`: araç birden çok seferi taşır ama kurye birini sürer; ret sürülen seferin künyesini taşır ki ekran "önce şunu kapat" diyebilsin.
   */
  reason: z.enum(['not_found', 'not_mine', 'already_departed', 'another_running']).optional(),
  departedAt: z.string().optional(),
  /** `another_running` dalında SÜRÜLEN seferin kimliği ve kodu. */
  runId: z.string().uuid().optional(),
  referenceNo: z.string().optional(),
});
export type DepartDeliveryRunResult = z.infer<typeof DepartDeliveryRunResultSchema>;

/**
 * Seferi araçtan çıkar (`discard_delivery_run`): kurulmuş ama başlamamış seferin geri alınması; ekran kaç siparişin serbest kaldığını ve kaç kutunun indiğini söylesin diye sayılar döner.
 */
export const DiscardDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  /** `already_departed` = sefer yola çıkmış; geri alınacak niyet kalmadı, dürüst çıkış kapanıştır. */
  reason: z.enum(['not_found', 'not_mine', 'already_departed']).optional(),
  releasedOrders: z.number().int().optional(),
  unloadedBoxes: z.number().int().optional(),
});
export type DiscardDeliveryRunResult = z.infer<typeof DiscardDeliveryRunResultSchema>;

/**
 * `close_delivery_run` dönüşü — 0025'teki `CourierDayCloseResult`ın halefi. Alanlar `optional`:
 * `ok:false` dalında RPC hiçbirini döndürmez, sıfır yazmak "hesaplandı, sıfır çıktı" olurdu.
 */
export const CloseDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  /* `not_departed`: sefer kurulmuş ama yola çıkmamış, araçta bekliyor ve kapatılamaz. */
  reason: z.enum(['already_closed', 'not_found', 'not_departed']).optional(),
  id: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  closedAt: z.string().optional(),
  expectedCashCents: z.number().int().optional(),
  expectedCardCents: z.number().int().optional(),
  expectedChequeCents: z.number().int().optional(),
  countedCashCents: z.number().int().optional(),
  countedCardCents: z.number().int().optional(),
  countedChequeCents: z.number().int().optional(),
  /** Sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para. */
  differenceCashCents: z.number().int().optional(),
  differenceCardCents: z.number().int().optional(),
  differenceChequeCents: z.number().int().optional(),
  reconciled: z.boolean().optional(),
  deliveredCount: z.number().int().optional(),
  returnedCount: z.number().int().optional(),
  pendingCount: z.number().int().optional(),
  /** Kapanışın `ready`ye düşürdüğü takılı durak sayısı; ekran "N durak yeniden planlanacak" der. */
  releasedCount: z.number().int().optional(),
  returnedAt: z.string().optional(),
});
export type CloseDeliveryRunResult = z.infer<typeof CloseDeliveryRunResultSchema>;
