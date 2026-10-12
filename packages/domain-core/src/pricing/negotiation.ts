import type { UserRole } from '@lezzet/types';

/**
 * Pazarlıklı fiyatı yalnız yönetici yazar (DOMAIN §5); kişi kurye ya da depocu da olsa yöneticiyse yazar. Web masası, mobil sipariş
 * ve yerinde satış bu kuralı buradan okur, çünkü ekranda kilitli alan elle kurulan istekle yine gönderilebilir.
 */
export function canNegotiatePrice(roles: readonly UserRole[]): boolean {
  return roles.includes('admin');
}
