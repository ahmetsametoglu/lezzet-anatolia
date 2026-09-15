import { z } from 'zod';
import {
  TicketTypeEnum,
  type ConversationSource,
  type CustomerInboxThread,
  type KeysetCursor,
  type MessageDirection,
  type MessageKind,
  type TicketHandler,
  type TicketSender,
} from '@lezzet/types';
import type { AnchorSnapshot } from '@lezzet/application';
import type { OutboundLanguage } from '@lezzet/domain-core';
import type { CustomerContextData } from '@/lib/customer/context';
import type { ConsentState } from '@/components/operation/ui/customer-context-pane';
import type { SocialChannelKey, SocialFilterKey, SocialUrlState } from './social-url';

/**
 * `closed` (müşteri yazmıştı, süre doldu) ile `never` (hiç yazmadı) ayrı tutulur: operatöre önerilecek eylem farklı.
 * `human` yalnız Messenger/Instagram'da, 24 saatten sonraki 7 günlük insan temsilci süresi: operatör yazar, yapay zekâ yazamaz.
 */
export type WindowState = 'open' | 'human' | 'closed' | 'never';

export interface WindowView {
  state: WindowState;
  chip: string;
  /** `soon` eşiğe yaklaşan açık penceredir. */
  tone: 'open' | 'soon' | 'closed' | 'idle';
}

/** Satır bir kişidir: başlık, önizleme ve pencere en son yazdığı sohbetten, kanallar ve bekleyiş bütün sohbetlerinden. */
export interface InboxRowView {
  /** Baş sohbetin kimliği; süzgeçsiz kuyrukta satıra basınca açılan sohbet. */
  id: string;
  /** Yalnız mesajı olan kanallar: boş kanalın noktası çizilmez. */
  channels: ConversationSource[];
  /** En son yazılan önce; satıra basınca hangisinin açılacağını `rowTarget` buradan seçer. */
  threads: CustomerInboxThread[];
  title: string;
  preview: string;
  ago: string;
  /** Kişinin herhangi bir kanalında son sözü müşteri söylediyse doğru. */
  awaitingReply: boolean;
  /** Webhook mesajı önce yazar, kimliği sonra çözer; Messenger/Instagram'da varsayılan hâl budur. */
  unidentified: boolean;
  handledBy: TicketHandler;
  window: WindowView;
}

export interface MessageView {
  id: string;
  direction: MessageDirection;
  /** Yapay zekânın gönderdiği balon ayrı tonda çizilir: "bunu kim söyledi" sonradan da cevaplanmalı. */
  author: TicketSender;
  kind: MessageKind;
  /** Operatörün dilinde: çeviri varsa Türkçesi; kanaldan geçen orijinal `translation.original`da. */
  text: string;
  stamp: string;
  /** Yalnız kalıp mesajında dolu; kategori ücret sınıfıdır. */
  templateLabel: string | null;
  /** Geçit yolu, imzalı adres değil. `null` (medya yok ya da indirme düşmüş) ayırt edilmez: ikisinde de operatörün yapacağı bir şey yok. */
  mediaUrl: string | null;
  /** `kind` bütün medyaya `media` der; fotoğraf mı ses mi çizileceği buradan okunur. */
  mediaMime: string | null;
  /** Sesin makine çözümü, müşterinin yazdığı metin değil: operatör hangi cümlenin insandan geldiğini görsün diye ayrı çizilir. */
  mediaTranscript: string | null;
  /**
   * Gösterilen metin kanaldan geçenden farklıysa dolu: gelen mesajda `original` müşterinin cümlesi, giden mesajda müşteriye
   * gönderilen çeviri. Sesli mesajda künye transkripte, ötekilerde gövdeye aittir.
   */
  translation: {
    original: string;
    /** ISO 639; tespit edilmemişse `null`. */
    language: string | null;
  } | null;
}

/** Sohbetin iç notu: müşteriye gitmez, akışta olayın olduğu yerde okunur. */
export interface NoteView {
  id: string;
  /** Personel ya da yapay zekâ; müşteri iç not yazamaz (DB kısıtı). */
  author: TicketSender;
  text: string;
  stamp: string;
}

export type ThreadItemView = { kind: 'message'; message: MessageView } | { kind: 'note'; note: NoteView };

export interface ConversationDetailView {
  id: string;
  source: ConversationSource;
  title: string;
  /**
   * Konuşmanın malı olduğu için müşteri bağlamından ayrı: WhatsApp'ta telefon, Messenger/Instagram'da opak PSID/IGSID.
   * Göstermek ekranın kararıdır.
   */
  externalRef: string;
  /** Kimliksiz Messenger/Instagram sohbetinin tek okunur başlığı. */
  profileName: string | null;
  window: WindowView;
  /** Kararı motor verir (`outboundLanguage`); dayanağı da gösterilir, çünkü varsayılana düşmüş sohbet dikkat ister. */
  language: OutboundLanguage;
  /** Eskiden yeniye mesajlar ve iç notlar. BEKLEYEN(15.7): sohbet akışının ters yönlü sayfalı okuması. */
  thread: ThreadItemView[];
  /** İç notlar sayılmaz: müşteriyle yazışmanın parçası değiller. */
  messageCount: number;
  /** Başlığın kanal sekmeleri (`tabsOf`); tek kanalda da çizilir, operatör hangi kanalda olduğunu sekmeden okur. */
  threads: CustomerInboxThread[];
  /** Kimliği çözülmemiş konuşmada `null`; sağ panel o zaman kanala göre ne yapılacağını söyler. */
  context: CustomerContextData | null;
  tickets: { id: string; subject: string; statusLabel: string }[];
  handledBy: TicketHandler;
  /** Hibrit modun bekleyen taslağı; `null` = taslak yok. */
  aiDraft: string | null;
  /** Kararı `consentStateOf` verir; operatör izni kaydeder, karar vermez. */
  consent: ConsentState;
  /** Çapa müşterinin künyesidir, konuşmanın değil: kimliksiz sohbette `null`. */
  anchor: AnchorSnapshot | null;
}

export interface SocialData {
  rows: InboxRowView[];
  nextCursor: KeysetCursor | null;
  /** Yüklenmiş sayfanın uzunluğu değil, kanal süzgecine uyan sayım. */
  awaitingCount: number;
  /** Yapay zekânın ya da hibrit modun yürüttüğü sohbetler. */
  aiCount: number;
  /** Yeni sohbetin varsayılan yürütücüsü (Ayarlar'daki satırın aynısı); açık sohbetleri değiştirmez. */
  defaultHandler: TicketHandler;
  detail: ConversationDetailView | null;
}

/** Giden mesaj pencereye dokunmadığı için damga taşımaz. */
export const RecordOutboundSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

/**
 * "Sorulmadı" bir beyan değil, kaydın yokluğudur (`opt_in_at` boş): enum'a üçüncü değer eklemek sorulmamış izni kaydedilmiş
 * gibi gösterirdi.
 */
export const ConversationOptInSchema = z.object({
  conversationId: z.string().uuid(),
  granted: z.boolean(),
});

/** Operatörün sohbetten talep açması; `ticket.conversation_id`yi dolduran tek yol. */
export const ConversationTicketSchema = z.object({
  conversationId: z.string().uuid(),
  customerId: z.string().uuid(),
  type: TicketTypeEnum,
  subject: z.string().optional(),
  body: z.string().min(1),
});

export interface SocialViewProps {
  data: SocialData;
  urlState: SocialUrlState;
  navPending: boolean;
  busy: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onFilter: (f: SocialFilterKey) => void;
  onChannel: (ch: SocialChannelKey) => void;
  onSelect: (c: string) => void;
  onSendReply: (text: string) => Promise<boolean>;
  /** "Devral" da bu kapıdan geçer (`mode='human'`). */
  onMode: (mode: TicketHandler) => void;
  /** Sohbete değil ayara yazar; Ayarlar ekranıyla aynı satır. */
  onDefaultMode: (mode: TicketHandler) => void;
  /** Taslağı cevap kutusuna taşır; göndermek operatörün kararı. */
  onConsumeDraft: () => Promise<string | null>;
  onSuggestDraft: () => void;
  onNewTicket: () => void;
  /** Operatör karar vermez, müşterinin sohbette dediğini kaydeder. */
  onOptIn: (granted: boolean) => void;
  /** Ajanın sepet aracının operatör eli; müşteri siparişi sitede tamamlar. */
  onSendCartLink: () => void;
  /** Bağlamanın ve çapanın paneldeki tek yolu: müşteri e-postasıyla giriş yapar, sohbet kendi hesabına bağlanır. */
  onSendAccountLink: () => void;
}
