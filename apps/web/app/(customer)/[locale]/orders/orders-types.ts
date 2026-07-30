import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { CustomerOrderSummary } from '@/lib/order/customer-orders';
import type { KeysetCursor } from '@lezzet/types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Siparişler sayfasının tip/sözleşme modülü (view DEĞİL — gerçek view'lar orders.desktop/.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/** Tekrar siparişin ekrandaki sonucu — hangi satırda açıldığı da burada, iki kart aynı anda açılmaz. */
export interface ReorderNotice {
  orderId: string;
  added: number;
  skipped: readonly string[];
}

export interface OrdersViewProps {
  t: Messages;
  locale: Locale;
  orders: readonly CustomerOrderSummary[];
  nextCursor: KeysetCursor | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Hangi siparişin tekrar sipariş isteği uçuyor (düğme o satırda beklemeye geçer). */
  busyOrderId: string | null;
  onReorder: (orderId: string) => void;
  notice: ReorderNotice | null;
  onDismissNotice: () => void;
}
