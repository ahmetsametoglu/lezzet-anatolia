import type { KeysetCursor, MeNotification } from '@lezzet/types';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (tip JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

/** Sayfaya özel tipler kendi dosyasında: `page → client → page` döngüsü doğmasın. */
export type Messages = LocalizedCopy<typeof messages>;

/** Bir sayfalık akış — satır şekli mobil sözleşmeyle aynı (`MeNotification`); imleç web'de zarfsız gezer. */
export interface NotificationsFeedPage {
  rows: MeNotification[];
  nextCursor: KeysetCursor | null;
  /** Okunmamış ve gizlenmemiş — tanım tek yerde (`AppNotificationService.UNREAD`). */
  unread: number;
}

/** Telefon ve masaüstü görünümünün ortak sözleşmesi — durum ve eylemler `notifications-client`te. */
export interface NotificationsViewProps {
  t: Messages;
  locale: Locale;
  rows: MeNotification[];
  unread: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDismiss: (id: string) => void;
}

/** Ekranı dolduracak kadar geniş; akış sınırsız büyür → keyset. */
export const FEED_PAGE_SIZE = 30;
