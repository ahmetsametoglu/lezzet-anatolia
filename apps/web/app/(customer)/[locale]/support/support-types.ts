import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { KeysetCursor } from '@lezzet/types';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Talep sayfasının tip/sözleşme modülü (view DEĞİL — gerçek view'lar support.desktop/.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Ekranın hangi rotadan geldiği; cihaz çatalıyla çarpılır: telefonda liste ya da yazışma ekranı, masaüstünde iki bölme. Masaüstü
 * `/support`ta da bir yazışma gösterdiği için sunucu iki rotada da bir detay çözer.
 */
export type SupportMode = 'list' | 'detail';

export interface SupportViewProps {
  t: Messages;
  locale: Locale;
  mode: SupportMode;
  tickets: readonly CustomerTicketSummary[];
  nextCursor: KeysetCursor | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Sağ bölmede (mobilde tam ekranda) açık olan talep; liste boşsa null. */
  selected: CustomerTicketView | null;
}
