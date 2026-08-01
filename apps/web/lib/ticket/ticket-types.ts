import type { Ticket, TicketMessage, TicketQueueRow } from '@lezzet/types';

/**
 * Talep görünüm sözleşmesi (16.1) — **iki yüzeyin ortak veri kapısı.**
 *
 * Müşteri ve operasyon aynı talebi okur ama aynı şeyi GÖRMEZ: müşteri kendi anlatımını ve
 * cevapları görür, operasyon ayrıca müşterinin geçmişini ve iade zeminini görür. Bu yüzden iki
 * ayrı görünüm tipi vardır — tek bir "her şeyi taşıyan" tip, bir gün müşteri ekranına iç bilgi
 * sızdırmanın en kolay yolu olurdu.
 *
 * `design/pages/musteri-talep.md` + `design/pages/admin-talepler.md` bağlayıcı.
 */

/** Yazışmadaki tek mesaj — ekranın gördüğü hâl. */
export interface TicketMessageView {
  id: string;
  sender: TicketMessage['sender'];
  body: string;
  /** Public okuma URL'leri; anahtar değil (ekran anahtarla bir şey yapamaz). */
  attachmentUrls: string[];
  createdAt: string;
}

/** Talebe bağlı siparişin künyesi — tam sipariş değil, tanınmasına yetecek kadarı. */
export interface TicketOrderRef {
  id: string;
  /** Müşterinin bildiği numara ("LZA-2451"). Henüz üretilmemişse null. */
  referenceNo: string | null;
  /** Müşterinin işaretlediği kalemler — şikâyetin somut zemini. */
  markedItems: Array<{ id: string; name: string; qty: number }>;
}

/**
 * İadenin sonucu — **siparişten türetilir**, talepte saklanmaz (DOMAIN §8).
 *
 * `triggeredAt` talebin kendi damgasıdır (iadeyi bu talep doğurdu); `refundedCents` siparişin para
 * hareketlerinden gelir. İkisi ayrı kaynaklardan geldiği için "tetiklendi ama henüz ödenmedi" hâli
 * kendiliğinden görünür — tek bir alan olsaydı o ara hâl kaybolurdu.
 */
export interface TicketReturnOutcome {
  triggeredAt: string;
  refundedCents: number;
}

/**
 * "Taleplerim" listesinin tek satırı (08.6) — **taranmaya yetecek kadarı.**
 *
 * Yazışma taşımaz: liste yirmi talebin yirmi mesaj dizisini çekmek zorunda değil, o detayın işi.
 * `lastMessageAt` hem sıralama ölçütü hem ekranın "son mesaj: bugün" satırı — tasarımın kartta
 * gösterdiği iki bağlam (o an ve siparişin numarası) `ticket_queue` görünümünde zaten türetilmiş
 * durumda; ham talep satırından okumak sayfa başına iki ek tur olurdu.
 */
export interface CustomerTicketSummary {
  id: string;
  type: Ticket['type'];
  status: Ticket['status'];
  subject: string | null;
  createdAt: string;
  /** Son mesajın anı — liste bu sıraya göre gelir (cevaplanan talep başa çıkar). */
  lastMessageAt: string;
  /** Bağlı siparişin müşteri numarası ("LZA-2451"); siparişsiz talepte null. */
  orderReferenceNo: string | null;
}

/**
 * Müşterinin gördüğü talep. **İç durum adları burada da `status`'tür** — çeviri yüzeyin işi
 * (messages.json); veri kapısı iki ayrı durum alanı taşımaz.
 */
export interface CustomerTicketView {
  id: string;
  type: Ticket['type'];
  status: Ticket['status'];
  subject: string | null;
  createdAt: string;
  order: TicketOrderRef | null;
  messages: TicketMessageView[];
  /** "↩ 5,90 € iade edildi" satırı; iade yoksa null. */
  returnOutcome: TicketReturnOutcome | null;
  /** Müşterinin şu an yapabileceği durum değişiklikleri (pratikte yalnız "yeniden aç"). */
  allowedTransitions: readonly Ticket['status'][];
}

/** Kuyruk satırı — tarama için gereken her şey, tek turda. */
export interface TicketQueueItem {
  id: string;
  customerName: string;
  type: Ticket['type'];
  status: Ticket['status'];
  handledBy: Ticket['handledBy'];
  source: Ticket['source'];
  /** Son mesajın ilk satırı — kuyrukta okunan önizleme. */
  preview: string;
  lastMessageAt: string;
  /** Son sözü müşteri söyledi: top bizde. */
  awaitingReply: boolean;
  hasAttachment: boolean;
  orderReferenceNo: string | null;
  /** Bozuk/eksik — kuyruğun "bu iş para işi" işareti. */
  returnBound: boolean;
}

/**
 * Operasyonun gördüğü talep detayı. Kuyruk satırının üstüne yazışmayı, sipariş zeminini ve
 * **müşteri bağlamını** ekler: sürekli şikâyet eden mi, ilk kez mi — karar verirken görülmeli.
 */
export interface StaffTicketDetail {
  ticket: TicketQueueRow;
  customer: { id: string; name: string; email: string | null; phone: string | null; totalTickets: number };
  order: TicketOrderRef | null;
  messages: TicketMessageView[];
  returnOutcome: TicketReturnOutcome | null;
  /** Ekran yalnız bunları sunar — yasak geçiş hiç gösterilmez. */
  allowedTransitions: readonly Ticket['status'][];
  /** İade tetikleme düğmesi açık mı; kapalıysa sebebiyle. */
  returnTrigger: { allowed: true } | { allowed: false; reason: 'no_order' | 'already_triggered' };
}
