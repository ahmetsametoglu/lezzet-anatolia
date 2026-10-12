import { DeliveryProofRecordSchema, type DeliveryProofRecord } from '@lezzet/types';

/**
 * Siparişe yazılmış teslim kanıtını okur; ham jsonb'yi çağıran ayrıştırmaz ki yazan ile okuyan aynı şemada kalsın. Şemaya uymayan blok
 * `null` döner, çünkü yarım kanıt da "kanıt var" der.
 */
export function readDeliveryProof(raw: unknown): DeliveryProofRecord | null {
  const parsed = DeliveryProofRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
