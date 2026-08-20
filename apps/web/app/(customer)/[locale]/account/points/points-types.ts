import type { KeysetCursor, PointsEntry } from '@lezzet/types';
import type messages from './messages.json';

export type Messages = (typeof messages)['tr'];

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
