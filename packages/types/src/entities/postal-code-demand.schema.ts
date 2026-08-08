import { z } from 'zod';

/**
 * Bölge dışı talep sayacı (`postal_code_demand`, 0023) — *"hangi kodlardan soruldu."*
 *
 * **Anonim ve öyle kalacak:** ziyaretçi kimliği, oturum, IP ya da e-posta bu tabloya YAZILMAZ ve
 * tablo buna yer bırakmaz (`ANALYTICS §3`). Sayı mutlak bir "kişi" değil, **ilgi yoğunluğudur**:
 * aynı ziyaretçinin tekrar sorması ayrı sayılır, çünkü tekilleştirmek kimlik tutmayı gerektirirdi.
 *
 * Kimlikli karşılığı `zone_notice`'tir — aynı olgu, iki kayıt (`DATA_MODEL`'in kendi emsali). İkisi
 * **toplanmaz**: tek bir "ilgi" sayısına indirmek anonim sayacı geriye dönük kimliklendirmek olurdu.
 */
export const PostalCodeDemandSchema = z.object({
  postalCode: z.string(),
  requestCount: z.number().int(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type PostalCodeDemand = z.infer<typeof PostalCodeDemandSchema>;
