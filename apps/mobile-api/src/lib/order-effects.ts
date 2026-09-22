import { notifyOrderException, notifyOrderStatus, type OrderEffects } from '@lezzet/application';
import type { Db } from '@lezzet/database';

/**
 * Durum geçişinin yan etkileri, web `webOrderEffects`inin mobil ikizi; ikisi aynı paket kapılarını çağırır. `refunder` yok, çünkü
 * sipariş açma ve kapıda teslim zincirinde sağlayıcı iadesi adımı yok; kayıtsız port süreç başına bir kez uyarır.
 */
export function mobileOrderEffects(db: Db): OrderEffects {
  return {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
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
