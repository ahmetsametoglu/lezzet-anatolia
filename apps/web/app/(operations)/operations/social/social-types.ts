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

// Sosyal gelen kutusunun GÖRÜNÜM tipleri (15.5 · üç kanal 15.15).
//
// Ekran hiçbir yerde ham satır okumaz: gelen kutusu görünümü ve mesaj defteri burada üç panelin
// ihtiyacına indirgenir. Sebep tek: pencere durumu, yaş ve önizleme birer KARARDIR (eşik nedir,
// metinsiz mesaj nasıl okunur) ve karar bileşenin içine gömülürse sınanamaz.

/**
 * 24 saatlik servis penceresinin ekrandaki hâli — kararı motor verir (`serviceWindowState`), burası
 * yalnız onu operatörün diline çevirir. Pencere kavramı üç kanalda da var (24 saat); EKONOMİSİ
 * kanala göre değişir ve o fark sözlükte durur (`WINDOW_NOTE[source]`), burada değil.
 *
 * Üç durum AYRI tutulur ve son ikisi aynı "serbest mesaj gönderemezsin"e düşse de aynı şey değildir:
 * `closed` kaçırılmış bir fırsattır (müşteri yazmıştı, süre doldu), `never` kurulmamış bir ilişkidir
 * (müşteri bize hiç yazmadı). İkisini tek kovaya atmak, operatöre yanlış eylemi önerirdi.
 *
 * **`human` (15.37):** Messenger/Instagram'da standart 24 saat doldu ama insan temsilci süresi (son gelen
 * mesajdan 7 gün) sürüyor — operatör yazabilir, yapay zekâ yazamaz. WhatsApp'ta bu hâl YOK: orada 24 saat
 * sonrası yalnız onaylı kalıp mesaj.
 */
export type WindowState = 'open' | 'human' | 'closed' | 'never';

export interface WindowView {
  state: WindowState;
  /** Dar sütunun rozeti: `18 sa` · `kapalı` · `—`. */
  chip: string;
  /** Rozetin ve altlık bandının tonu — `soon` eşiğe yaklaşan açık penceredir. */
  tone: 'open' | 'soon' | 'closed' | 'idle';
}

/**
 * Gelen kutusu satırı — sol panel. **Bir KİŞİ** (15.38 · `customer_inbox`): aynı müşterinin kanalları tek satırda.
 * Başlık, önizleme, yaş, yürütücü ve pencere BAŞ sohbetin (en son yazdığı); kanallar ve bekleyiş kişinin.
 */
export interface InboxRowView {
  /** Baş sohbetin kimliği — satırın anahtarı; süzgeçsiz kuyrukta basınca açılan sohbet. */
  id: string;
  /** Mesajı olan kanallar (15.38) — satırın kanal noktaları; boş kanal görünmez. */
  channels: ConversationSource[];
  /** Kişinin bütün sohbetleri, en son yazdığı önce — basınca hangisinin açılacağı (`rowTarget`) ve seçili satır. */
  threads: CustomerInboxThread[];
  /** Müşteri adı; çözülmemişse sağlayıcı profil adı; o da yoksa dış anahtar (boş satır yerine). */
  title: string;
  /** Son mesajın tek satırlık önizlemesi; metinsiz türde türün adı okunur. */
  preview: string;
  /** Son hareketin yaşı — dar sütun biçiminde (`agoShort`). */
  ago: string;
  /** Kişi cevap bekliyor — herhangi bir kanalında son sözü müşteri söyledi (15.38). */
  awaitingReply: boolean;
  /** Kimlik çözülmemiş konuşma (webhook önce yazar, sonra çözer — Messenger/IG'de varsayılan hâl). */
  unidentified: boolean;
  /** Sohbeti kim yürütüyor (16.08) — satırdaki AI/Hibrit rozetinin kaynağı. */
  handledBy: TicketHandler;
  window: WindowView;
}

/** Mesaj balonu — orta panel. */
export interface MessageView {
  id: string;
  direction: MessageDirection;
  /** Kim yazdı (16.08) — AI'ın gönderdiği balon ayrı tonda okunur; "bunu kim söyledi" sonradan da cevaplanmalı. */
  author: TicketSender;
  kind: MessageKind;
  /**
   * Gövde metni — operatörün DİLİNDE (15.28): çeviri varsa Türkçesi, yoksa kanaldan geçen metin.
   * Metinsiz türde türün okunabilir adı. Kanaldan geçen orijinal `translation.original`da durur.
   */
  text: string;
  /** "22 Tem 14:30" — aynı gün iki mesajı ayırt etmek için saat şart. */
  stamp: string;
  /** Yalnız şablon mesajında dolu: hangi kalıp, hangi ücret sınıfı (yalnız WhatsApp'ta olabilir). */
  templateLabel: string | null;
  /**
   * Gelen medyanın SÜRELİ adresi — her okumada yeniden imzalanır, satırda saklanmaz.
   *
   * `null` üç ayrı hâli birden taşır ve ekran bunları ayırt ETMEZ: medya yok · kova yerelde ayarlı
   * değil · o gün indirme düşmüştü. Üçünde de operatörün yapabileceği bir şey yok; ayırt eden bir
   * ekran, eyleme dönüşmeyen bir ayrım gösterirdi.
   */
  mediaUrl: string | null;
  /** Fotoğraf mı ses mi çizileceği — `kind` hepsine `media` diyor. */
  mediaMime: string | null;
  /**
   * Sesin MAKİNE çözümü — müşterinin yazdığı metin değil, bu yüzden `text`ten ayrı taşınıyor ve
   * ekranda ayrı çiziliyor. Operatör hangi cümlenin insandan geldiğini görmeden okumamalı.
   *
   * `null`: ses değil · çözüm henüz koşmadı · güvenle çözülemedi. Üçünde de operatörün yapacağı şey
   * aynı (kaydı kendisi dinlemek), o yüzden ekran ayırt etmiyor.
   *
   * Operatörün DİLİNDE (15.28): transkript çevrildiyse Türkçesi; orijinal `translation.original`da.
   */
  mediaTranscript: string | null;
  /**
   * **Çeviri künyesi** (15.28) — gösterilen metin kanaldan geçenden FARKLIYSA dolu.
   *
   * Gelen mesajda: ekrandaki Türkçe makine çevirisidir, `original` müşterinin yazdığı (ya da
   * söylediği) cümle. Giden mesajda ters: ekrandaki operatörün/ajanın Türkçesidir, `original`
   * müşteriye GÖNDERİLEN çeviri. İkisi de ekranda söylenmeli — operatör makine cümlesini
   * müşterinin cümlesi sanmamalı, ve müşterinin gerçekte ne okuduğunu görebilmeli.
   *
   * Ses mesajında künye TRANSKRİPTE aittir (alt yazı yok), metin mesajında gövdeye.
   */
  translation: {
    original: string;
    /** Orijinalin dili (ISO 639) — rozet ve `lang` özniteliği için; tespit edilmemişse `null`. */
    language: string | null;
  } | null;
}

/**
 * Sohbetin İÇ NOTU (15.29) — müşteriye gitmedi; akışın içinde, olayın olduğu yerde okunur. İlk
 * yazanı ajanın devri ("AI devretti — sebep").
 */
export interface NoteView {
  id: string;
  /** Personel ya da AI — müşteri iç not yazamaz (DB kısıtı). */
  author: TicketSender;
  text: string;
  /** "22 Tem 14:30" — balonlarla aynı biçim; not akışta onların arasında durur. */
  stamp: string;
}

/** Sohbet akışının bir satırı — mesaj balonu ya da iç not, zaman sırasıyla (15.29). */
export type ThreadItemView = { kind: 'message'; message: MessageView } | { kind: 'note'; note: NoteView };

export interface ConversationDetailView {
  id: string;
  /** Hangi kanal — başlık rozeti, pencere cümleleri ve sağ panelin dili buradan seçilir. */
  source: ConversationSource;
  title: string;
  /**
   * Konuşmanın dış anahtarı (`external_ref`) — müşteri bağlamından AYRI tutulur, çünkü konuşmanın
   * malı. WhatsApp'ta okunaklı bir telefondur; Messenger/IG'de opak PSID/IGSID — ekran onu kanala
   * göre gösterir ya da göstermez, veri kapısı bu kararı vermez.
   */
  externalRef: string;
  /** Sağlayıcı profil adı — kimliksiz Messenger/IG sohbetinin tek okunur başlığı. */
  profileName: string | null;
  window: WindowView;
  /**
   * Müşteriye hangi dilde yazıldığı ve NEDEN (15.28) — kararı motor verir (`outboundLanguage`),
   * burası taşır. Operatör Türkçe yazıp Fransızca gönderildiğini görecek; dayanağı da görmeli:
   * varsayılana düşmüş bir sohbet (müşteri henüz yazmadı) dikkat ister.
   */
  language: OutboundLanguage;
  /**
   * Sohbet akışı — mesajlar ve iç notlar (15.29), eskiden yeniye: okunan şey bir sohbet, ters
   * sıralı sohbet okunmaz.
   *
   * Sayfalama YOK ve bugün doğru: adım 1'de mesajlar elle işleniyor, bir avuç satır var. Ters
   * yönlü sayfalı okuma geldiğinde eklenir → BEKLEYEN(15.7); gerekçe `lib/messaging/read.ts`'te.
   */
  thread: ThreadItemView[];
  /** Başlıktaki "N mesaj" — iç notlar SAYILMAZ: müşteriyle yazışmanın parçası değiller. */
  messageCount: number;
  /**
   * Kişinin sohbetleri — başlığın KANAL SEKMELERİ (15.38): mesajı olan kanallar ve açık sohbetin kendisi
   * (`tabsOf`). Tek kanalda da tek sekme çizilir (çizim) — operatör hangi kanalda olduğunu sekmeden okur.
   */
  threads: CustomerInboxThread[];
  /**
   * Müşteri bağlamı — ORTAK okuma (`lib/customer/context`), Talepler ekranı da aynısını kullanır.
   * Kimlik çözülememiş konuşmada `null`; sağ panel o zaman kanala göre ne yapılacağını söyler.
   */
  context: CustomerContextData | null;
  /** Bu konuşmadan açılmış talepler — köprü iki yönlü olsun diye. */
  tickets: { id: string; subject: string; statusLabel: string }[];
  /** Sohbeti kim yürütüyor (16.08): human · hybrid · ai — başlıktaki mod anahtarının değeri. */
  handledBy: TicketHandler;
  /** Hibrit modun bekleyen AI taslağı — kesikli kartın metni; `null` = taslak yok. */
  aiDraft: string | null;
  /**
   * Kampanya izninin panodaki ÜÇ hâli (DOMAIN §11 · 14.09) — kararı `consentStateOf` verir: WhatsApp'ta
   * müşteri kaydı, Messenger/IG'de sohbetin kendi kaydı. Operatör bunu KAYDEDER, karar vermez (15.12).
   */
  consent: ConsentState;
  /**
   * **Kimlik çapası** (04.10 · DOMAIN §10) — "bu numaranın GEÇMİŞİ kimin" sorusunun cevabı.
   *
   * Kimliksiz sohbette `null`: çapa bir MÜŞTERİNİN künyesidir, konuşmanın değil. Operatör panelde
   * ne yapabileceğini buradan görüyor — çapası olana ikinci çapa kurulmaz, bekleyen bir soru varsa
   * yenisi sorulmaz.
   */
  anchor: AnchorSnapshot | null;
}

export interface SocialData {
  rows: InboxRowView[];
  nextCursor: KeysetCursor | null;
  /** "N cevap bekliyor" — SAYIM, yüklenmiş sayfanın uzunluğu değil; kanal süzgecine uyar. */
  awaitingCount: number;
  /** Çizimin ikinci sayısı ("N AI'da") — 16.08'de gerçek oldu; ai + hibrit sohbetler. */
  aiCount: number;
  /**
   * Yeni sohbetin VARSAYILAN yürütücüsü (15.30) — Ayarlar'daki satırın aynısı, başlıkta anahtar
   * olarak. Açık sohbetleri değiştirmez; onların anahtarı sohbet panosunda.
   */
  defaultHandler: TicketHandler;
  detail: ConversationDetailView | null;
}

/**
 * Var olan konuşmaya GİDEN mesaj — damga YOK ve olmamalı: giden mesaj pencereye dokunmuyor. GELEN mesaj
 * yalnız kanaldan (webhook) gelir; elle kaydı 15.36'da kalktı (kullanıcı kararı 15.09).
 */
export const RecordOutboundSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

/**
 * Sohbette verilen/reddedilen ticari mesaj izninin KAYDI (15.12 · DOMAIN §11).
 *
 * `granted` boolean ve üçüncü bir "sorulmadı" değeri YOK: sorulmamışlık bir beyan değil, kaydın
 * hiç olmamasıdır (`opt_in_at` boş kalır). Enum'a "sorulmadı" eklemek, sorulmamış bir izni
 * kaydedilmiş gibi göstermek olurdu.
 *
 * (Elle bağlama ve e-posta çapası şemaları 15.40'ta kalktı — bağı ve çapayı müşteri hesap bağlantısıyla
 * kendisi kurar, kullanıcı kararı 15.09.)
 */
export const ConversationOptInSchema = z.object({
  conversationId: z.string().uuid(),
  granted: z.boolean(),
});

/**
 * Konuşmadan talep açma — `ticket.conversation_id` FK'sini gerçekten dolduran TEK yol.
 *
 * Bağ 15.1'de kuruldu ama bugüne kadar hiçbir yazma yolu onu doldurmuyordu; Talepler ekranı da
 * "bağlı konuşma var" satırını çizip hiç gösteremiyordu. Ajanın talep açması (15.14) ayrı iş —
 * bu, operatörün sohbeti okuyup kendi açmasıdır.
 */
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
  /** Kanal çipi (15.15) — durum çipinden ayrı eksen. */
  onChannel: (ch: SocialChannelKey) => void;
  onSelect: (c: string) => void;
  /** Cevabı GÖNDERİR (06.09) — sağlayıcıya çıkar, sonra deftere yazılır (`sendOutboundAction`). */
  onSendReply: (text: string) => Promise<boolean>;
  /** Yürütücü modu (16.08): human · hybrid · ai — Devral da bu kapıdan geçer (`mode='human'`). */
  onMode: (mode: TicketHandler) => void;
  /** Yeni sohbetlerin varsayılan modu (15.30) — sohbete değil AYARA yazar; Ayarlar ekranıyla aynı satır. */
  onDefaultMode: (mode: TicketHandler) => void;
  /** Hibrit taslağı tüket — metni döndürür, ekran cevap kutusuna taşır; gönderme kararı operatörün. */
  onConsumeDraft: () => Promise<string | null>;
  /** Taslağı istek üzerine üret (20.4) — hibritte taslak yokken. */
  onSuggestDraft: () => void;
  onNewTicket: () => void;
  /** Sohbette verilen izni KAYDET (15.12) — operatör karar vermez, müşterinin dediğini yazar. */
  onOptIn: (granted: boolean) => void;
  /** Sepet bağlantısını sohbete gönder (15.21) — ajanın aracının insan eli; müşteri sitede tamamlar. */
  onSendCartLink: () => void;
  /**
   * Hesap bağlantısını sohbete gönder (15.16 · 15.40) — müşteri e-postasıyla giriş yapar, sohbet kendi hesabına bağlanır
   * ve çapası kurulur. Panelde bağlamanın ve çapanın TEK yolu: operatör bağlamaz, kod üretmez (kullanıcı kararı 15.09).
   */
  onSendAccountLink: () => void;
}
