import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { KeysetCursor } from '@lezzet/types';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Talep sayfasının tip/sözleşme modülü (view DEĞİL — gerçek view'lar support.desktop/.mobile).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Ekranın hangi rotadan geldiği. Cihaz çatalıyla KARIŞMAZ, onunla çarpılır:
 *
 * | | `list` (`/support`) | `detail` (`/support/[ticket]`) |
 * | mobil | liste ekranı | yazışma ekranı (tam sayfa) |
 * | masaüstü | iki bölme, ilk talep seçili | iki bölme, o talep seçili |
 *
 * Masaüstü iki bölme olduğu için `/support` de bir yazışma gösterir — bu yüzden sunucu her iki
 * rotada da bir detay çözer. Mobil o detayı çizmez ama okuma yine yapılır: cihaz kararı istemcide
 * kesinleşiyor (`useDevice`) ve sunucunun tahmini yanılırsa masaüstünün sağ bölmesi boş kalırdı.
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
