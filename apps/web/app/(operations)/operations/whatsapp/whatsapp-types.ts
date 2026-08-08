import { z } from 'zod';
import { TicketTypeEnum, type Consent, type KeysetCursor, type MessageDirection, type MessageKind } from '@lezzet/types';
import type { WhatsappFilterKey, WhatsappUrlState } from './whatsapp-url';

// WhatsApp izleme ekranının GÖRÜNÜM tipleri (15.5).
//
// Ekran hiçbir yerde ham satır okumaz: gelen kutusu görünümü ve mesaj defteri burada üç panelin
// ihtiyacına indirgenir. Sebep tek: pencere durumu, yaş ve önizleme birer KARARDIR (eşik nedir,
// metinsiz mesaj nasıl okunur) ve karar bileşenin içine gömülürse sınanamaz.

/**
 * 24 saatlik servis penceresinin ekrandaki hâli — kararı motor verir (`serviceWindowState`), burası
 * yalnız onu operatörün diline çevirir.
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
  /** Müşteri adı; kimlik çözülmemişse numaranın kendisi (boş satır göstermek yerine). */
  title: string;
  /** Son mesajın tek satırlık önizlemesi; metinsiz türde türün adı okunur. */
  preview: string;
  /** Son hareketin yaşı — dar sütun biçiminde (`agoShort`). */
  ago: string;
  awaitingReply: boolean;
  /** Kimlik çözülmemiş konuşma (webhook önce yazar, sonra çözer — ve elle işlemede çakışma olabilir). */
  unidentified: boolean;
  window: WindowView;
}

/** Mesaj balonu — orta panel. */
export interface MessageView {
  id: string;
  direction: MessageDirection;
  kind: MessageKind;
  /** Gövde metni; yoksa türün okunabilir adı (kart/medya adım 2'de dolacak). */
  text: string;
  /** "22 Tem 14:30" — aynı gün iki mesajı ayırt etmek için saat şart. */
  stamp: string;
  /** Yalnız şablon mesajında dolu: hangi kalıp, hangi ücret sınıfı. */
  templateLabel: string | null;
}

/**
 * Sağ panelin sipariş satırı — **müşteri panelininkinden (`CustomerOrderRow`) daha DAR ve o bilinçli.**
 *
 * Orada satır bir sipariş listesidir (durum, tahsilat, tarih); burada "bu müşteri ne aldı"
 * bağlamıdır ve çizim de iki şey gösteriyor: numara ve tutar. Geniş tipi ödünç almak, kullanılmayan
 * dört alanı bu ekranın sözleşmesine sokardı. (Kardeş sayfadan tip almak zaten yasak — STACK §7,
 * yalnız `*-url` geçer; ama tipi taşımanın gerekçesi kural değil, ekranın kendi ihtiyacı.)
 */
export interface ConversationOrderRow {
  id: string;
  /** Referans numarası; henüz üretilmemişse (taslak sipariş) tarihi tanıtır. */
  label: string;
  totalCents: number;
  href: string;
}

/** Müşteri bağlamı — sağ panel. */
export interface ConversationContextView {
  customerId: string | null;
  name: string;
  /** E.164 numara (`external_ref`) — operatör satırı numaradan tanır. */
  phone: string;
  /** WhatsApp'tan otomatik açılmış, doğrulanmış girişten geçmemiş kayıt. */
  isDraft: boolean;
  isCompany: boolean;
  /** `null` = hiç sorulmamış; "reddetti" ile aynı şey DEĞİL ve ekran ikisini ayırır. */
  whatsappConsent: Consent | null;
  orders: ConversationOrderRow[];
}

export interface ConversationDetailView {
  id: string;
  title: string;
  window: WindowView;
  /**
   * Eskiden yeniye — okunan şey bir sohbet, ters sıralı sohbet okunmaz.
   *
   * Sayfalama YOK ve bugün doğru: adım 1'de mesajlar elle işleniyor, bir avuç satır var. Ters
   * yönlü sayfalı okuma geldiğinde eklenir → BEKLEYEN(15.7); gerekçe `lib/whatsapp/read.ts`'te.
   */
  messages: MessageView[];
  /** Kimlik çözülememiş konuşmada `null` — sağ panel o zaman numarayla ne yapılacağını söyler. */
  context: ConversationContextView | null;
  /** Bu konuşmadan açılmış talepler — köprü iki yönlü olsun diye. */
  tickets: { id: string; subject: string; statusLabel: string }[];
}

export interface WhatsappData {
  rows: InboxRowView[];
  nextCursor: KeysetCursor | null;
  /** "N cevap bekliyor" — SAYIM, yüklenmiş sayfanın uzunluğu değil. */
  awaitingCount: number;
  detail: ConversationDetailView | null;
}

/**
 * Elle DM işleme penceresinin girdisi (15.1'in yüzey yarısı).
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

/** Var olan konuşmaya mesaj işleme — yön ekranda seçilir, damga yalnız gelende sorulur. */
export const RecordMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
  receivedAt: z.string().min(1).optional(),
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

/** Sağ panelin son sipariş listesi — sınır GÖRÜNÜR, sessiz kırpma yok. */
export const CONTEXT_ORDER_LIMIT = 5;

export interface WhatsappViewProps {
  data: WhatsappData;
  urlState: WhatsappUrlState;
  navPending: boolean;
  busy: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onFilter: (f: WhatsappFilterKey) => void;
  onSelect: (c: string) => void;
  onRecordInbound: (text: string, receivedAt: string) => Promise<boolean>;
  onRecordOutbound: (text: string) => Promise<boolean>;
  onNewDm: () => void;
  onNewTicket: () => void;
}
