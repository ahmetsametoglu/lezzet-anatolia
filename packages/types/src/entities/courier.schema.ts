import { z } from 'zod';

/**
 * Teslim kanıtı (`order.delivery_proof`): kurye kapısı ve gel-al tezgâhı yazar, operasyon ekranı okur. İki uç aynı şemayı kullanır ki
 * alan adları ayrışmasın.
 */
export const DeliveryProofRecordSchema = z.object({
  /** Kanıt kapıda okutulan kutu kodlarıdır, görseli yoktur. */
  kind: z.literal('box_scan'),
  /** Kanıtı üreten kurye — sipariş sonradan başkasına atansa da kanıt kimin olduğunu söyler. */
  courierId: z.string().uuid(),
  at: z.string(),
  /** Kapıda okutulan kutu kodları. */
  boxCodes: z.array(z.string()).nullish(),
  /** Kapı kodunun sonucu; boş = siparişe kod üretilmedi. Kodsuz teslim de yazılır ki ihtilafta kodun sorulmadığı görülsün. */
  doorCode: z.enum(['verified', 'skipped']).nullish(),
});
export type DeliveryProofRecord = z.infer<typeof DeliveryProofRecordSchema>;
