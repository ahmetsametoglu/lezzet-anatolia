import { notifyOrderException, notifyOrderStatus, type OrderEffects } from '@lezzet/application';
import type { Db } from '@lezzet/database';
import { providerRefunder } from './revolut';

/**
 * Durum geçişinin yan etkileri, web `webOrderEffects`inin mobil ikizi; ikisi aynı paket kapılarını çağırır. Kapıdaki ret, depo dönüşü
 * ve yola çıkıştaki hazırlık eksiği online ödemenin parasını kendiliğinden iade eder, bu yüzden sağlayıcı portu buradadır.
 */
export function mobileOrderEffects(db: Db): OrderEffects {
  return {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
    refunder: providerRefunder(),
  };
}

/**
 * Kart ödemesinin netleştiği yollar (durum sorusu, açık ödeme) iptal de doğurabilir: geç gelen ödeme iade edilir ya da ödeme hiç
 * gelmez. Web `webPaymentEffects`inin ikizi; iptal haberi olmasa müşteri paranın ya da siparişin akıbetini öğrenemezdi.
 */
export function mobilePaymentEffects(db: Db): OrderEffects {
  return {
    ...mobileOrderEffects(db),
    notifyException: (orderId, event, opts) => notifyOrderException(db, orderId, event, opts),
  };
}
