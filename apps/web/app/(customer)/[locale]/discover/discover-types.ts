import type { Locale, LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';
import type { DiscoverCard } from '@/lib/feedback/discover';

export type Messages = LocalizedCopy<typeof messages>;

/** Masaüstü görünümün props'u. */
export interface DiscoverViewProps {
  t: Messages;
  locale: Locale;
  /** Sıradaki kart; deste bitince görünüm hiç çizilmez, bitiş ekranı gelir. */
  card: DiscoverCard;
  /** Kaçıncı karttayız / kaç kart — "3 / 7" sayacı. */
  position: { index: number; total: number };
  /** Bu turda biriken puan; girişsizde "giriş yaparsan kazanacağın" olarak okunur. */
  earned: number;
  signedIn: boolean;
  onVote: (vote: 'like' | 'dislike') => void;
  /** Önceki oyun yazımı sürerken kilitli: çift tıklama iki kart birden geçirmesin. */
  busy: boolean;
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
