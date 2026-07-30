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
  busy: boolean;
  onReorder: () => void;
}
