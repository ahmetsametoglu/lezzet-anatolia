import { buildOrderNotification as buildOrderNotificationFor, type NotificationBundle } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { NotifyEventName } from '@lezzet/notify';

/**
 * Sipariş bildiriminin VERİSİNİ kurar (14.5) — **köprü**.
 *
 * Gövde `@lezzet/application`'ın `order/notification-data`sına taşındı (terfi 21.21); kural, para
 * çözümü ve biçimleme kararlarının tamamı ORADA yaşıyor ve künyeleri de orada. Taşınmasının sebebi
 * ölçülmüş bir arızadır: `apps/mobile-api` bu dosyayı import edemediği için mobilden verilen
 * kapıda/vadeli ödemeli siparişte "siparişiniz alındı" maili hiç gitmiyordu. Mailin içeriği
 * siparişin kendisinden türer, siparişi hangi ekranın açtığından değil — iki kopya, bir gün iki
 * farklı toplam demekti.
 *
 * Köprünün taşıdığı tek şey `serviceDb()`: pakette `db` çağırandan gelir, web çağıranlarının
 * (bildirim gönderimi + iki entegrasyon testi) imzası değişmesin diye burada bağlanıyor.
 */
export function buildOrderNotification(
  orderId: string,
  event: NotifyEventName,
  opts: { refundedAmountCents?: number | null } = {},
): Promise<NotificationBundle | null> {
  return buildOrderNotificationFor(serviceDb(), orderId, event, opts);
}
