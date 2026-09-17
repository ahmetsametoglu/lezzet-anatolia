import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
import type { DiscoverCard } from '@/lib/feedback/discover';

export type Messages = LocalizedCopy<typeof messages>;

export type DiscoverVote = 'like' | 'dislike';

/** Masaüstü görünümün props'u — tur ve bitiş aynı sayfada, üst satır ikisinde de durur. */
export interface DiscoverViewProps {
  t: Messages;
  cards: DiscoverCard[];
  /** Sıradaki kartın destedeki yeri (0'dan); deste boyuna eşitse tur bitti. */
  current: number;
  /** Verilen kararlar, deste sırasıyla — adaylar şeridinin ✓/× işaretleri ve bitişteki beğeni listesi. */
  decisions: DiscoverVote[];
  /** Bu turda biriken puan. */
  earned: number;
  signedIn: boolean;
  onVote: (vote: DiscoverVote) => void;
  /** Yazımı süren oy var: düğmeler kilitli, bitiş puan toplamı tamamlanınca çizilir. */
  busy: boolean;
  /** Giriş dönüşünde hesaba yüklenen puan; talep yoksa `null`. */
  claimed: number | null;
  /** Biriken puanın para karşılığı, sunucuda biçimlendi. */
  earnedMoney: string;
}

/** Telefon görünümünün props'u: tur ve bitiş aynı ekranda, başlık çubuğu ikisinde de durur. */
export interface DiscoverMobileProps {
  t: Messages;
  locale: Locale;
  /** Sıradaki karttan başlayan kalan deste; boşsa tur bitti. */
  deck: DiscoverCard[];
  /** Sıradaki kartın destedeki yeri (0'dan) ve deste boyu — ilerleme dilimleri ve sayaç. */
  current: number;
  total: number;
  earned: number;
  /** Bu turda beğenilen kart sayısı. */
  likes: number;
  /** Yazımı süren oy var: puan toplamı henüz eksik, bitiş sayıyı onu beklemeden yazmaz. */
  settling: boolean;
  signedIn: boolean;
  onVote: (vote: 'like' | 'dislike') => void;
  /** Giriş dönüşünde hesaba yüklenen puan; talep yoksa `null`. */
  claimed: number | null;
  /** Deste hiç dolmadı: tur bitmedi, hiç başlamadı. */
  emptyDeck: boolean;
  /** Biriken puanın para karşılığı, sunucuda biçimlendi. */
  earnedMoney: string;
}
