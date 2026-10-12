import { z } from 'zod';

/**
 * Teslim kanıtı (`order.delivery_proof`): kurye kapısı yazar, operasyon ekranı okur. Şema tek kaynaktır, çünkü iki uç ayrı ayrı
 * yazıldığında alan adları ayrışmış ve kanıt yazıldığı hâlde açılamamıştı.
 */
export const DeliveryProofRecordSchema = z.object({
  /** Kanıtın türü; `box_scan` görselsizdir, kanıt kapıda okutulan kutu kodlarıdır. */
  // BEKLEYEN(K.75): imza ve fotoğraf türleri kapı kodundan sonra yazılmıyor; okuyan operasyon detayıyla birlikte sökülür.
  kind: z.enum(['signature', 'photo', 'box_scan']),
  /** Private kovadaki anahtar (`delivery/proofs/{orderId}/…`), public adresi yoktur; `null` yalnız `box_scan`da, çünkü o kanıtın kodları vardır. */
  imageKey: z.string().nullable(),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullable(),
  /** Kanıtı üreten kurye — sipariş sonradan başkasına atansa da kanıt kimin olduğunu söyler. */
  courierId: z.string().uuid(),
  at: z.string(),
  /** Kapıda okutulan kutu kodları. */
  boxCodes: z.array(z.string()).nullish(),
  /** Kapı kodunun sonucu; boş = siparişe kod üretilmedi. Kodsuz teslim de yazılır ki ihtilafta kodun sorulmadığı görülsün. */
  doorCode: z.enum(['verified', 'skipped']).nullish(),
});
export type DeliveryProofRecord = z.infer<typeof DeliveryProofRecordSchema>;
