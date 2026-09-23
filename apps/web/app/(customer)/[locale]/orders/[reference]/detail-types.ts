import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { CustomerOrderDetail } from '@/lib/order/customer-orders';
import type { Messages as ListMessages } from '../orders-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

export type Messages = LocalizedCopy<typeof messages>;

export interface DetailViewProps {
  t: Messages;
  /** Durum rozeti listeyle AYNI metinleri kullanır — iki dosyada iki "Teslim edildi" olmaz. */
  listT: ListMessages;
  locale: Locale;
  order: CustomerOrderDetail;
  /**
   * Açık yorum daveti — `null` ise davet yok ya da kapanmış (üç hâl tek cevapta, künye
   * `readOrderFeedbackInvite`). Sayfaya sunucuda okunup geçilir; istemci token üretmez.
   */
  feedbackInvite: { token: string; completionPoints: number } | null;
}

/**
 * Ödeme hâli — tasarımın beş hapı; masaüstü hapı ve telefonun özet satırı AYNI anahtardan okur (14.09). Sıra ANLAMLI:
 * iade her şeyi ezer (para geri döndüyse "kapıda ödenecek" demek yanlış olur), vade yöntemden önce gelir (vadeli
 * sipariş de kapıda kapanabilir). Native'in `paymentKey`i aynı sırayı izliyor.
 */
export function paymentKeyOf(
  order: Pick<CustomerOrderDetail, 'paymentStatus' | 'onAccount' | 'paymentMethod' | 'deliveryType'>,
): 'refunded' | 'credit' | 'online' | 'transfer' | 'door' | 'pickup' | 'paidOnHandover' {
  if (order.paymentStatus === 'refunded') return 'refunded';
  if (order.onAccount) return 'credit';
  if (order.paymentMethod === 'online') return order.paymentStatus === 'paid' ? 'online' : 'transfer';
  if (order.paymentMethod === 'bank_transfer') return 'transfer';
  // Kapıda/depoda tahsil edilmişse borç cümlesi kalmaz; gel-al'da tahsilat kapıda değil depoda.
  if (order.paymentStatus === 'paid') return 'paidOnHandover';
  return order.deliveryType === 'pickup' ? 'pickup' : 'door';
}
