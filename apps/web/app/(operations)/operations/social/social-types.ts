import { z } from 'zod';
import {
  LinkProofKindEnum,
  TicketTypeEnum,
  type ConversationSource,
  type KeysetCursor,
  type MessageDirection,
  type MessageKind,
  type TicketHandler,
  type TicketSender,
} from '@lezzet/types';
import type { CustomerContextData } from '@/lib/customer/context';
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
 */
export type WindowState = 'open' | 'closed' | 'never';

export interface WindowView {
  state: WindowState;
  /** Dar sütunun rozeti: `18 sa` · `kapalı` · `—`. */
  chip: string;
  /** Rozetin ve altlık bandının tonu — `soon` eşiğe yaklaşan açık penceredir. */
  tone: 'open' | 'soon' | 'closed' | 'idle';
}

/** Gelen kutusu satırı — sol panel. */
export interface InboxRowView {
  id: string;
  /** Hangi kanal (15.15) — satırın kenar rengi ve rozeti buradan okunur. */
  source: ConversationSource;
  /** Müşteri adı; çözülmemişse sağlayıcı profil adı; o da yoksa dış anahtar (boş satır yerine). */
  title: string;
  /** Son mesajın tek satırlık önizlemesi; metinsiz türde türün adı okunur. */
  preview: string;
  /** Son hareketin yaşı — dar sütun biçiminde (`agoShort`). */
  ago: string;
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
  /** Gövde metni; yoksa türün okunabilir adı (kart/medya adım 2'de dolacak). */
  text: string;
  /** "22 Tem 14:30" — aynı gün iki mesajı ayırt etmek için saat şart. */
  stamp: string;
  /** Yalnız şablon mesajında dolu: hangi kalıp, hangi ücret sınıfı (yalnız WhatsApp'ta olabilir). */
  templateLabel: string | null;
}

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
   * Eskiden yeniye — okunan şey bir sohbet, ters sıralı sohbet okunmaz.
   *
   * Sayfalama YOK ve bugün doğru: adım 1'de mesajlar elle işleniyor, bir avuç satır var. Ters
   * yönlü sayfalı okuma geldiğinde eklenir → BEKLEYEN(15.7); gerekçe `lib/messaging/read.ts`'te.
   */
  messages: MessageView[];
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
   * Ticari mesaj izni (DOMAIN §11) — sohbette verilmiş/reddedilmiş izin. Operatör bunu KAYDEDER,
   * kendisi karar vermez: müşteri sohbette ne dediyse o yazılır (15.12).
   */
  optIn: boolean;
}

export interface SocialData {
  rows: InboxRowView[];
  nextCursor: KeysetCursor | null;
  /** "N cevap bekliyor" — SAYIM, yüklenmiş sayfanın uzunluğu değil; kanal süzgecine uyar. */
  awaitingCount: number;
  /** Çizimin ikinci sayısı ("N AI'da") — 16.08'de gerçek oldu; ai + hibrit sohbetler. */
  aiCount: number;
  detail: ConversationDetailView | null;
}

/**
 * Elle DM işleme penceresinin girdisi (15.1'in yüzey yarısı) — **yalnız WhatsApp**: telefon kimlik
 * anahtarıdır ve operatör onu telefonundan okur. Messenger/IG kişi kimliği (PSID/IGSID) operatörce
 * bilinemez — o konuşmaları webhook doğuracak (15.7); var olan sohbete mesaj işlemek ise kanal-nötr
 * (`RecordOutboundSchema` + gelen-devam kapısı konuşma kimliğiyle çalışır).
 *
 * `receivedAt` ZORUNLU ve varsayılanı YOK — kapının kendi kuralı (`recordInboundMessage`) ve tam da
 * bu ekran için konmuş: admin sabah gelen bir DM'i öğlen işler, pencere ise müşteri YAZDIĞINDA
 * başlamıştır. "Şimdi"den hesaplanan bitiş Meta'nınkinden saatlerce geç olur ve biz "serbest metin
 * gönderebilirim" derken gönderim şablon ücretiyle geçer.
 */
export const ManualInboundSchema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  text: z.string().min(1),
  receivedAt: z.string().min(1),
});

/**
 * Var olan konuşmaya GİDEN mesaj işleme — damga YOK ve olmamalı: giden mesaj pencereye dokunmuyor.
 *
 * Gelen mesajın kendi kapısı var (`ManualInboundSchema` + devam modu), çünkü gelen mesaj pencereyi
 * AÇAN olaydır ve alınma anını ister. İkisini tek şemaya toplamak, damgayı "bazen zorunlu" bir
 * alana çevirirdi.
 */
export const RecordOutboundSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

/**
 * Var olan sohbete GELEN mesaj (devam) — kanal-nötr: konuşma zaten var, kimlik anahtarı gerekmez.
 * Yeni-numara yolundan (`ManualInboundSchema`) ayrı, çünkü orada kimlik çözümü de yapılır ve o
 * yalnız WhatsApp'ta mümkün.
 */
export const FollowUpInboundSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
  receivedAt: z.string().min(1),
});

/**
 * Kimliksiz sohbeti müşteriye bağlama (15.16) — iki kimlik, ikisi de uuid.
 *
 * Serbest metin (ad/telefon) ALMIYOR ve bu bilinçli: operatör seçiciden bir KAYIT seçer, kimlik
 * yazmaz. Metin kabul etseydik "aynı adlı iki müşteri" sorusunu bu kapının çözmesi gerekirdi ve
 * çözemezdi — sohbet yanlış hesaba bağlanırdı.
 */
export const LinkConversationCustomerSchema = z.object({
  conversationId: z.string().uuid(),
  customerId: z.string().uuid(),
  /**
   * **Kanıt ZORUNLU** (15.19) — türü kapalı listeden, değeri müşterinin söylediği metin. Sunucu
   * değeri seçilen müşteriye karşı doğruluyor; opsiyonel olsaydı kapıyı çağıranın nezaketine
   * bırakmış olurduk ve ikinci bir yüzey onu boş geçerdi.
   */
  proof: z.object({
    kind: LinkProofKindEnum,
    value: z.string().trim().min(3, 'Kanıt değeri yazılmalı'),
  }),
});

/**
 * Sohbette verilen/reddedilen ticari mesaj izninin KAYDI (15.12 · DOMAIN §11).
 *
 * `granted` boolean ve üçüncü bir "sorulmadı" değeri YOK: sorulmamışlık bir beyan değil, kaydın
 * hiç olmamasıdır (`opt_in_at` boş kalır). Enum'a "sorulmadı" eklemek, sorulmamış bir izni
 * kaydedilmiş gibi göstermek olurdu.
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
  onRecordOutbound: (text: string) => Promise<boolean>;
  /** Yürütücü modu (16.08): human · hybrid · ai — Devral da bu kapıdan geçer (`mode='human'`). */
  onMode: (mode: TicketHandler) => void;
  /** Hibrit taslağı tüket — metni döndürür, ekran defter kutusuna taşır (gönderim kanalı yok, 15.7/15.11). */
  onConsumeDraft: () => Promise<string | null>;
  /** Taslağı istek üzerine üret (20.4) — hibritte taslak yokken. */
  onSuggestDraft: () => void;
  /** Açık sohbete GELEN mesaj — anahtarı kilitli pencereyi açar (kanal-nötr devam kapısı). */
  onIncoming: () => void;
  /** Yeni WhatsApp DM'i işle — yalnız WhatsApp (kimlik anahtarı telefon). */
  onNewDm: () => void;
  onNewTicket: () => void;
  /** Kimliksiz sohbeti müşteriye bağla (15.16) — Messenger/IG'de kimliğin TEK yolu. */
  onLinkCustomer: () => void;
  /** Sohbette verilen izni KAYDET (15.12) — operatör karar vermez, müşterinin dediğini yazar. */
  onOptIn: (granted: boolean) => void;
}
