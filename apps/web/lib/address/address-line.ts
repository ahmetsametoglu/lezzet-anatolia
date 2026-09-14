import type { Address } from '@lezzet/types';

/**
 * Adresin TEK SATIRI — "sokak[, kat/daire], posta kodu şehir". Telefon görünümünde sepetin adres künyesi ve ödeme
 * ekranının adres kartı aynı satırı okur; iki yerde ayrı yazılan birleşim bir gün ayrışırdı.
 *
 * Native'in birleşimiyle aynı (`apps/mobile/src/screens/customer-kit/address-format.ts` `addressLine`). İki uygulama ayrı
 * pakette; ortak pakete (`@lezzet/helper`) taşımak oraya şema tiplerinin bağımlılığını getirir — o paket bugün yalnız
 * `@lezzet/i18n`e bağlı. `line2` (kat/daire) boş değilse sokağın peşine girer: yutulursa teslimat adresi eksik görünür.
 */
export function addressLine(address: Pick<Address, 'line1' | 'line2' | 'postalCode' | 'city'>): string {
  const street = address.line2 ? `${address.line1}, ${address.line2}` : address.line1;
  return `${street}, ${address.postalCode} ${address.city}`;
}
