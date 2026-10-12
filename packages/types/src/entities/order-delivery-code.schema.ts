import { z } from 'zod';

/** Kapı kodu: altı hane; müşteriye giden ile kapıda girilen aynı kurala uyar. */
export const DoorCodeSchema = z.string().regex(/^\d{6}$/);

/** Kapı kodunun müşteriye gittiği kanal. */
export const DoorCodeViaEnum = z.enum(['whatsapp', 'email']);
export type DoorCodeVia = z.infer<typeof DoorCodeViaEnum>;

/**
 * Rota teslimindeki kapı kodu (`order_delivery_code`). Kod düz metin durur, çünkü bildirim geçişten sonra gider ve kodu bu satırdan
 * okur; tabloyu yalnız servis rolü okur.
 */
export const OrderDeliveryCodeSchema = z.object({
  orderId: z.string().uuid(),
  code: DoorCodeSchema,
  /** `null` = gönderilemedi; kurye kodsuz teslim eder. */
  sentVia: DoorCodeViaEnum.nullable(),
  failedAttempts: z.number().int(),
  createdAt: z.string(),
});
export type OrderDeliveryCode = z.infer<typeof OrderDeliveryCodeSchema>;

export const OrderDeliveryCodeInsertSchema = OrderDeliveryCodeSchema.pick({ orderId: true, code: true });
export type OrderDeliveryCodeInsert = z.infer<typeof OrderDeliveryCodeInsertSchema>;
