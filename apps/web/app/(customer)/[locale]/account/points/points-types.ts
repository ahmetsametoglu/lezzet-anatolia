import type { CustomerPointsRules, PendingNeighborAward } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import type { KeysetCursor, PointsEntry } from '@lezzet/types';
import type messages from './messages.json';

export type Messages = (typeof messages)['tr'];

/** İki görünümün ortak sözleşmesi; sayfalama durumu çatalda tutulur ki iki görünüm aynı listeyi görsün. */
export interface PointsViewProps {
  t: Messages;
  locale: Locale;
  rules: CustomerPointsRules;
  /** Hesap kartının bakiyesi; telefon native gibi başlığın altında gösterir. */
  balance: number;
  /** Ödemesi beklenen komşu siparişleri; telefon native gibi bakiyenin altında "yolda" diye gösterir. */
  pendingNeighborAwards: PendingNeighborAward[];
  entries: PointsEntry[];
  hasMore: boolean;
  loading: boolean;
  /** Son devam isteği düştü; telefon native'deki gibi "tekrar dene" gösterir. */
  failed: boolean;
  loadMore: () => void;
}

/** Bir sayfalık döküm — action ile sayfa aynı şekli konuşur. */
export interface PointsHistoryPage {
  entries: PointsEntry[];
  nextCursor: KeysetCursor | null;
}

/**
 * Sayfa boyu. Hesap kartındaki "Son kazanımlar" 4 satırdır (`POINTS_HISTORY_SIZE`); burası tam
 * döküm — bir ekranı dolduracak kadar geniş, ama defter sınırsız büyüdüğü için yine keyset sayfalı.
 */
export const POINTS_PAGE_SIZE = 30;
