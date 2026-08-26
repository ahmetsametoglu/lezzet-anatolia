import type { KeysetCursor, MeNotification } from '@lezzet/types';
import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için DEĞER bağı gerek (tip JSON'dan türetilir) — puan sayfasının aynı deseni.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

/** Sayfaya-özel tipler kendi dosyasında (`page → client → page` döngüsü doğmasın — boundaries). */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Bir sayfalık akış — action ile istemci aynı şekli konuşur. Satır şekli MOBİL SÖZLEŞMEYLE AYNI
 * (`MeNotification`, 14.13 künyesi: "iki tüketici tek şekle bağlansın"); imleç web'de zarfsız
 * gezer — action teli JSON taşır, base64 kodlama uca özgü bir taşıma ayrıntısıydı.
 */
export interface NotificationsFeedPage {
  rows: MeNotification[];
  nextCursor: KeysetCursor | null;
  /** Okunmamış VE gizlenmemiş — tanım tek yerde (`AppNotificationService.UNREAD`). */
  unread: number;
}

/** Ekranı dolduracak kadar geniş; akış sınırsız büyür → keyset (puan sayfasının aynı ölçüsü). */
export const FEED_PAGE_SIZE = 30;
