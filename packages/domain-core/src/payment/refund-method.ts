import type { AccountType, PaymentMethod } from '@lezzet/types';

/**
 * İadenin yöntemi paranın çıktığı hesabın türünden çıkar, siparişin yönteminden değil, çünkü operatör kartla ödenmiş siparişi kasadan
 * nakit iade edebilir (DOMAIN §8). Sağlayıcıdan iade asıl ödemenin yolundan döner; bilinmeyen yöntem tahmin edilmez, `null` kalır.
 */
export function refundMethodOf(accountType: AccountType, paidWith: PaymentMethod | null): PaymentMethod | null {
  switch (accountType) {
    case 'cash':
      return 'cash';
    case 'bank':
      return 'bank_transfer';
    case 'provider':
      return paidWith;
    case 'partner':
      return null;
  }
}
