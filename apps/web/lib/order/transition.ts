import { serviceDb } from '@lezzet/database';
import { transitionOrder as transitionOrderFor, type OrderEffects, type TransitionOutcome } from '@lezzet/application';
import type { OrderStatus } from '@lezzet/types';
import { notifyOrderStatus } from './notify';
import { rewardCompletedOrder } from '../feedback/points';

/**
 * Durum ilerletme kapısı (07.6) — **uygulama katmanı orkestrasyonu**.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 3/3): gövde `@lezzet/application`'ın
 * `order/transition`ına taşındı — kural artık ORADA yaşıyor. Zincirin parçası olduğu için taşındı:
 * sipariş onaylama akışı kapıda/vadeli ödemede siparişi bu kapıdan `confirmed`'a geçiriyor ve
 * mobilin "Siparişi tamamla" ekranı da aynı geçişi yapacak. İki kopya, bir gün iki ayrı referans
 * numarası kuralı demekti.
 *
 * Köprünün taşıdığı şey WEB'E ÖZGÜ olan: **iki yan etki**. Müşteri haberi (`notifyOrderStatus`,
 * modül 14) `@lezzet/notify` + `@lezzet/i18n` ister, sipariş puanı (`rewardCompletedOrder`, modül
 * 17) `pointsSettings()` üstünde durur; ikisi de `@lezzet/application`ın bağımlılığı DEĞİL ve
 * sahipleri başka şeritler — gerekçenin tamamı paketin `order/effects.ts` künyesinde. Yutma
 * davranışı orada da aynı: etki patlarsa geçiş geri ALINMAZ, yalnız iz bırakılır.
 */
export const webOrderEffects: OrderEffects = {
  notifyStatus: (orderId, status) => notifyOrderStatus(orderId, status),
  rewardDelivered: (orderId) => rewardCompletedOrder(orderId),
};

interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  /** Geçişi yapan personel; sistem olayında (webhook, cron) verilmez. */
  actorId?: string | null;
}

export async function transitionOrder(input: TransitionInput): Promise<TransitionOutcome> {
  return transitionOrderFor(serviceDb(), { ...input, effects: webOrderEffects });
}
