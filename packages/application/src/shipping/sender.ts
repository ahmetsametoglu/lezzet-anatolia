import type { Warehouse } from '@lezzet/types';
import type { SenderAddress } from './port';

/**
 * Deponun serbest `address` alanından gönderici; teklif ve duyuru aynı yardımcıyı okur ki gösterilen fiyatla satın alınan etiket aynı
 * çıkıştan hesaplansın. Posta kodu zorunlu, çünkü tarife çıkış noktasına bağlıdır ve yokluğu ülkeye düşürülseydi fiyat yanlış çıkardı.
 */
export function senderOf(warehouse: Pick<Warehouse, 'countryCode' | 'address' | 'name'>): SenderAddress | null {
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
