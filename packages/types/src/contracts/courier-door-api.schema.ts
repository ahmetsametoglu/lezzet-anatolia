import { z } from 'zod';
import { FulfillmentAdjustmentSchema } from '../entities/order.schema';
import { DoorCodeSchema } from '../entities/order-delivery-code.schema';
import { OrderStatusEnum, PaymentStatusEnum } from '../primitives/enums.schema';
import { DoorCollectionInputSchema, DoorCollectionUnavailableSchema } from './courier-api.schema';

/** Kapıdaki sonuç: teslim, tahsilat ve ulaşılamadı/reddedildi uçlarının şemaları. */

/**
 * **Ulaşılamadı / reddedildi** isteği. İki ayrı işaret, iki ayrı akıbet — tek düğmeye
 * sıkıştırılmaz: `unreachable` malı araçta bırakır (`ready`), `refused` depoya döndürür (`returned`).
 */
export const MarkUndeliveredRequestSchema = z.object({
  outcome: z.enum(['unreachable', 'refused']),
  /** Kısa ve SERBEST ("zil bozuk"): sebebi standartlaştırmak sahada yanlış-ama-düzgün veri üretir. */
  note: z.string().nullish(),
});
export type MarkUndeliveredRequest = z.infer<typeof MarkUndeliveredRequestSchema>;

export const MarkUndeliveredResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), outcome: z.enum(['unreachable', 'refused']), currentStatus: OrderStatusEnum }),
  z.object({
    status: z.literal('forbidden'),
    reason: z.enum(['not_assigned', 'same_status', 'terminal', 'not_allowed']),
  }),
  /** Araya biri girdi: sipariş artık o durumda değil. Ekran bunu GÖSTERİR, yutmaz. */
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('not_found') }),
]);
export type MarkUndeliveredResponse = z.infer<typeof MarkUndeliveredResponseSchema>;

/**
 * Teslim kanıtı girdisi: imza ve fotoğraf görsel olarak saklanır.
 * `box_scan` istemciden gelmez, o kaydı sunucu okutulan kodlardan kurar; girdi bu yüzden kayıt şemasından dardır.
 */
export const DeliveryProofInputSchema = z.object({
  kind: z.enum(['signature', 'photo']),
  imageKey: z.string().min(1),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullish(),
});
export type DeliveryProofInputContract = z.infer<typeof DeliveryProofInputSchema>;

/**
 * Kapıda teslim isteği: sıra sunucuda sabittir (kanıt → mal → teslim → para), istemci tek istek gönderir ki yarısı yazılmış teslimat kalmasın.
 */
export const ConfirmDoorDeliveryRequestSchema = z.object({
  /**
   * `fulfilledQty` hedef değerdir (kalan adet), fark değil.
   * Akıbet (`returnDisposition`) kuryede yoktur, çünkü malın satılabilir olup olmadığını depoda bakan kişi beyan eder; `note` kalır.
   */
  adjustments: z.array(FulfillmentAdjustmentSchema.omit({ returnDisposition: true })).optional(),
  proof: DeliveryProofInputSchema.nullish(),
  collection: DoorCollectionInputSchema.nullish(),
  /**
   * Kapıda okutulan kutu kodları: kutulu siparişte teslimin ön koşuludur, eksik kutuda `boxes_missing` döner ve hiçbir yazım yapılmaz.
   */
  scannedBoxCodes: z.array(z.string()).optional(),
  /** Müşterinin söylediği kapı kodu; boş = kodsuz teslim. Kod üretilmemiş siparişte yok sayılır. */
  doorCode: DoorCodeSchema.nullish(),
});
export type ConfirmDoorDeliveryRequest = z.infer<typeof ConfirmDoorDeliveryRequestSchema>;

export const ConfirmDoorDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Fiilen yazılan tahsilat (**cent**); tahsilat yoksa 0. */
    collectedCents: z.number().int(),
    /** Teslim sonrası kalan borç (**cent**). */
    amountDueCents: z.number().int(),
    paymentStatus: PaymentStatusEnum,
    /** Nakit yasal sınırı aşıldı mı. **Engel DEĞİL, bilgi** — karar sahadadır (DOMAIN §7). */
    cashLimitExceeded: z.boolean(),
    adjustedLines: z.number().int(),
    /** Tahsilat bu istekte yazılmadı; aynı anahtarla zaten yazılmıştı. */
    collectionDeduped: z.literal(true).optional(),
  }),
  /** Kapı kodu tutmadı ve hiçbir yazım yapılmadı; `attemptsLeft` sıfırsa sonraki deneme kilitlenir. */
  z.object({ status: z.literal('door_code_mismatch'), attemptsLeft: z.number().int() }),
  /** Kod hakları doldu; kurye kodsuz teslim edebilir. */
  z.object({ status: z.literal('door_code_locked') }),
  /** Okutulmamış kutu var ve teslim yazılmadı; kalan kutuların numarası döner ki ekran hangilerinin eksik olduğunu söylesin. */
  z.object({ status: z.literal('boxes_missing'), remainingBoxNos: z.array(z.number().int()) }),
  DoorCollectionUnavailableSchema,
  z.object({ status: z.literal('forbidden'), reason: z.literal('not_assigned') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('not_found') }),
]);
export type ConfirmDoorDeliveryResponse = z.infer<typeof ConfirmDoorDeliveryResponseSchema>;

/**
 * Kanıt yükleme izni isteği: dosya sunucudan geçmez, cihaz doğrudan kovaya yükler.
 * Sunucu yetkiyi doğrular, anahtarı seçer ve kısa ömürlü izin yazar.
 */
export const DeliveryProofUploadRequestSchema = z.object({
  filename: z.string().min(1),
  /** Bu teslimat için daha önce kaç kanıt istendiği — tavan kontrolü (imza + birkaç fotoğraf). */
  alreadyRequested: z.number().int().nonnegative().optional(),
});
export type DeliveryProofUploadRequest = z.infer<typeof DeliveryProofUploadRequestSchema>;

export const DeliveryProofUploadResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), key: z.string(), uploadUrl: z.string() }),
  z.object({
    ok: z.literal(false),
    /**
     * `not_found` "yok" ile "senin değil"in ORTAK cevabıdır (bilerek): ayrı cevap verilseydi kimlik
     * deneyerek hangi siparişlerin var olduğu haritalanabilirdi.
     * `storage_unavailable` kova yapılandırılmamış — "yüklendi" demekle karıştırılmaz.
     */
    reason: z.enum(['unsupported_type', 'too_many', 'not_found', 'storage_unavailable']),
  }),
]);
export type DeliveryProofUploadResponse = z.infer<typeof DeliveryProofUploadResponseSchema>;
