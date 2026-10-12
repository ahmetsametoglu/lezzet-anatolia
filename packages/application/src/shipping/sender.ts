import type { WarehouseWithShipping } from '@lezzet/types';
import type { SenderAddress } from './port';

/**
 * Gönderici: varış ülkesinin gönderim satırında teslim noktası varsa o, yoksa deponun serbest `address` alanı; teklif ve duyuru aynı
 * yardımcıyı okur ki gösterilen fiyatla satın alınan etiket aynı çıkıştan hesaplansın. Posta kodu zorunlu, çünkü tarife çıkış
 * noktasına bağlıdır ve yokluğu ülkeye düşürülseydi fiyat yanlış çıkardı.
 */
export function senderOf(
  warehouse: Pick<WarehouseWithShipping, 'countryCode' | 'address' | 'name' | 'shipCountries'>,
  destinationCountry: string,
): SenderAddress | null {
  const handover = warehouse.shipCountries.find((row) => row.country === destinationCountry);
  if (handover?.handover) {
    return {
      countryCode: handover.country,
      postalCode: handover.handover.postalCode,
      city: handover.handover.city,
      name: warehouse.name,
      addressLine1: handover.handover.line1,
    };
  }
  const address = warehouse.address ?? {};
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode : null;
  if (!postalCode) return null;
  return {
    countryCode: warehouse.countryCode,
    postalCode,
    city: typeof address.city === 'string' ? address.city : undefined,
    name: warehouse.name,
    addressLine1: typeof address.line1 === 'string' ? address.line1 : undefined,
  };
}
