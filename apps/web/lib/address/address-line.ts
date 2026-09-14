import type { Address } from '@lezzet/types';

/**
 * Adresin TEK SATIRI — "sokak[, kat/daire], posta kodu şehir". Telefon görünümünde sepetin adres künyesi, ödeme
 * ekranının adres kartı ve sipariş detayının özeti aynı satırı okur; ayrı yazılan birleşim bir gün ayrışırdı.
 *
 * Native'in birleşimiyle aynı (`apps/mobile/src/screens/customer-kit/address-format.ts` `addressLine`). İki uygulama ayrı
 * pakette; ortak pakete (`@lezzet/helper`) taşımak oraya şema tiplerinin bağımlılığını getirir — o paket bugün yalnız
 * `@lezzet/i18n`e bağlı. `line2` (kat/daire) boş değilse sokağın peşine girer: yutulursa teslimat adresi eksik görünür.
 *
 * Parçalar İSTEĞE BAĞLI (14.09): sipariş detayının adresi siparişe yazılmış anlık görüntüdür ve eksik alan taşıyabilir —
 * boş parça atlanır, "undefined" basılmaz. Tam adreste çıktı öncekiyle aynı.
 */
type AddressParts = Partial<Record<keyof Pick<Address, 'line1' | 'line2' | 'postalCode' | 'city'>, string | null>>;

export function addressLine(address: AddressParts): string {
  const place = [address.postalCode, address.city].filter(Boolean).join(' ');
  return [address.line1, address.line2, place].filter(Boolean).join(', ');
}
