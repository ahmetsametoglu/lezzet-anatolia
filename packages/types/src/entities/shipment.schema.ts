import { z } from 'zod';

/**
 * GÖNDERİ (`shipment`, 0053) — taşıyıcıdaki bir gönderi partisi.
 *
 * Bir siparişin birden çok gönderisi olabilir (iki kutu bugün, geciken kalem yarın); kutular
 * `order_box.shipment_id` ile bağlanır. Sipariş kutusu = taşıyıcıya verilen kutu (28.08 kararı),
 * o yüzden ayrı bir "koli" varlığı YOK.
 */
export const ShipmentStatusEnum = z.enum([
  'created',
  'handed_over',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'returned',
  'cancelled',
  'error',
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatusEnum>;

export const ShipmentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  status: ShipmentStatusEnum,
  /**
   * Sağlayıcının GÖNDERİ kimliği — iptal ve durum sorgusu bunu ister.
   * **`OrderBox.providerParcelRef` ile karıştırılmaz:** o kolinin kimliği ve webhook onu gönderir.
   * İki ayrı kimlik uzayı; referans proje bunu 13 migration sonra öğrendi.
   */
  providerShipmentId: z.string().nullable(),
  shippingOptionCode: z.string().nullable(),
  carrierCode: z.string().nullable(),
  carrierName: z.string().nullable(),
  servicePointId: z.string().nullable(),
  /** Teklifte gördüğümüz tutar (cent) — BİZİM maliyetimiz, müşteriden alınan değil. */
  quotedCents: z.number().int().nullable(),
  /** Faturada ödediğimiz (cent). Teklifle ayrışabilir: yakıt farkı, ağırlık düzeltmesi. */
  actualCostCents: z.number().int().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Shipment = z.infer<typeof ShipmentSchema>;

/**
 * **`id` YAZILABİLİR ve bu bilinçli.** Duyuru kapısı kimliği ÖNCE üretip sağlayıcıya
 * `external_reference_id` olarak gönderiyor; dönen cevap yazılırken aynı kimlik kullanılmak
 * ZORUNDA — yoksa sağlayıcıdaki referans bizde hiçbir satırı göstermez ve öksüz koli
 * teşhisinin yarısı kaybolur. Öteki tabloların aksine kimliği veritabanına bırakamıyoruz.
 */
export const ShipmentInsertSchema = ShipmentSchema.omit({ createdAt: true }).partial({
  id: true,
  status: true,
  providerShipmentId: true,
  shippingOptionCode: true,
  carrierCode: true,
  carrierName: true,
  servicePointId: true,
  quotedCents: true,
  actualCostCents: true,
  cancelledAt: true,
});
export type ShipmentInsert = z.infer<typeof ShipmentInsertSchema>;

export const ShipmentUpdateSchema = ShipmentSchema.partial().required({ id: true });
export type ShipmentUpdate = z.infer<typeof ShipmentUpdateSchema>;

/**
 * TAŞIYICI OLAY DEFTERİ (`shipment_event`, 0053) — append-only.
 *
 * **`mappedStatus === null`ın İKİ sebebi var ve `recognized` onları ayırır:** kodu tanımıyorsak
 * (`recognized: false`) eşleme tablosu eksiktir ve operasyon bunu sayar; kodu tanıyıp da durumu
 * değiştirmiyorsak (`recognized: true`) o bir bilgi olayıdır ("teslim adresi değişti") ve
 * sayılmaz. Ayrım olmasaydı hep açık duran bir alarm doğardı.
 */
export const ShipmentEventSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string().uuid(),
  /** Koli düzeyi olay; `null` = gönderi düzeyi (duyuruldu, iptal edildi). */
  orderBoxId: z.string().uuid().nullable(),
  providerCode: z.string(),
  mappedStatus: ShipmentStatusEnum.nullable(),
  /** Kod eşleme tablomuzda var mı — `false` = tanınmadı, tablo büyümeli (operasyon sayar). */
  recognized: z.boolean(),
  message: z.string().nullable(),
  /** Olayın KENDİ zamanı — bizim aldığımız an değil (webhook saatler sonra gelebilir). */
  occurredAt: z.string(),
  receivedAt: z.string(),
  /** Yalnız tanınmayan kodda ve KİŞİSEL VERİ AYIKLANARAK. */
  raw: z.record(z.unknown()).nullable(),
});
export type ShipmentEvent = z.infer<typeof ShipmentEventSchema>;

export const ShipmentEventInsertSchema = ShipmentEventSchema.omit({ id: true, receivedAt: true }).partial({
  orderBoxId: true,
  mappedStatus: true,
  recognized: true,
  message: true,
  raw: true,
});
export type ShipmentEventInsert = z.infer<typeof ShipmentEventInsertSchema>;
export const ShipmentEventUpdateSchema = ShipmentEventSchema.partial().required({ id: true });
export type ShipmentEventUpdate = z.infer<typeof ShipmentEventUpdateSchema>;
