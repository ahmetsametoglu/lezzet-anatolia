import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
import type { DiscoverCard } from '@/lib/feedback/discover';

// Keşif akışının tip modülü (view DEĞİL — gerçek view `discover.desktop/.mobile`).

export type Messages = LocalizedCopy<typeof messages>;

/** Masaüstü ve mobil görünümün ORTAK props'u — ikisi aynı desteyi farklı yerleştiriyor. */
export interface DiscoverViewProps {
  t: Messages;
  locale: Locale;
  /**
   * Sıradaki kart — **asla `null` değil.** Deste bitince istemci bu görünümleri hiç çizmiyor,
   * bitiş ekranına geçiyor; tipin nullable olması iki görünümde de gereksiz bir dal açardı ve o
   * dal bir gün "kart yok" hâlini kendi başına yorumlamaya kalkardı.
   */
  card: DiscoverCard;
  /** Kaçıncı karttayız / kaç kart — tasarımın "3 / 7" sayacı. */
  position: { index: number; total: number };
  /** Bu turda biriken puan; girişsizde "giriş yaparsan kazanacağın" olarak okunur. */
  earned: number;
  signedIn: boolean;
  onVote: (vote: 'like' | 'dislike') => void;
  /** Oy gönderilirken kartlar kilitlenir — çift dokunuş iki kart birden geçirmesin. */
  busy: boolean;
}
