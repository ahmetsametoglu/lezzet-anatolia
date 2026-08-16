import 'server-only';
import { ringBell } from '@lezzet/application';
import { orderChannelName } from './order-channel';

/**
 * Ödeme onayının zili — Stripe webhook'u sipariş satırını değiştirince onay ekranı sunucudan
 * yeniden istesin diye.
 *
 * **Çağrının kendisi artık burada DEĞİL** (16.8): aynı `fetch` mobil arka uçta ve backend cron'unda
 * da gerekince `@lezzet/application/realtime/bell`e terfi etti. Bu dosyada kalan tek şey, siparişe
 * özgü kanal adını zile bağlamak — "boş yük" ve "sessizce başarısız ol" gerekçeleri o künyede.
 */
export async function broadcastOrderChanged(orderId: string): Promise<void> {
  await ringBell(orderChannelName(orderId));
}
