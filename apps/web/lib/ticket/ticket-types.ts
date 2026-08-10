import type { Ticket, TicketQueueRow } from '@lezzet/types';
import type { CustomerTicketSummary, TicketMessageView, TicketReturnOutcome } from '@lezzet/application';

/**
 * ── K5-1 KISMİ KÖPRÜ + BİR AYRIŞMA KAYDI (10.08) ────────────────────────────
 *
 * Üç tip pakete köprülendi (`TicketMessageView` · `TicketReturnOutcome` · `CustomerTicketSummary`);
 * üçünün de şekli paketle **birebir aynı** çıktı (satır satır karşılaştırıldı).
 *
 * **Ama `CustomerTicketView` KÖPRÜLENMEDİ ve sebebi bir bulgu:** denetim K5-1 örtüşmeyi ADLA saydı,
 * şekille değil — bu tipin iki sürümü aynı adı taşıyor ama aynı şey DEĞİL. Web sürümü `order`
 * (`TicketOrderRef`) ve `allowedTransitions` taşıyor; paket sürümü ikisini de taşımıyor ve bunun
 * yerine `CustomerTicketSummary`den türüyor. Köprülenseydi müşteri talep ekranı iki alanını sessizce
 * kaybederdi — yani "ikizi kaldırma" işi, ikizin olmadığı yerde ekran bozardı.
 *
 * Aynı adı taşıyan iki farklı şekil, ikizden daha tehlikelidir: ikizde iki cevap ayrışır, burada
 * hangisinin doğru olduğu sorusu hiç sorulmaz. Denetime bildirildi (K5-1 cevabı).
 *
 * Talep görünüm sözleşmesi (16.1) — **iki yüzeyin ortak veri kapısı.**
 *
 * Müşteri ve operasyon aynı talebi okur ama aynı şeyi GÖRMEZ: müşteri kendi anlatımını ve
 * cevapları görür, operasyon ayrıca müşterinin geçmişini ve iade zeminini görür. Bu yüzden iki
 * ayrı görünüm tipi vardır — tek bir "her şeyi taşıyan" tip, bir gün müşteri ekranına iç bilgi
 * sızdırmanın en kolay yolu olurdu.
 *
 * `design/pages/musteri-talep.md` + `design/pages/admin-talepler.md` bağlayıcı.
 */

/** Şekli paketle birebir aynı olan üçlü — künyeleri `@lezzet/application/ticket/ticket-types`ta. */
export type { CustomerTicketSummary, TicketMessageView, TicketReturnOutcome };

/** Talebe bağlı siparişin künyesi — tam sipariş değil, tanınmasına yetecek kadarı. */
export interface TicketOrderRef {
  id: string;
  /** Müşterinin bildiği numara ("LZA-2451"). Henüz üretilmemişse null. */
  referenceNo: string | null;
  /** Müşterinin işaretlediği kalemler — şikâyetin somut zemini. */
  markedItems: Array<{ id: string; name: string; qty: number }>;
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
  /** Talebi ŞU AN kim yürütüyor — satır rozeti ("AI yürütüyor"). */
  handledBy: Ticket['handledBy'];
  /**
   * AI bu talepte HİÇ konuştu mu — rozetten AYRI bir bilgi (16.5): devralınan talep "AI yürütüyor"
   * değildir ama "AI yanıtladı"dır. Kalite denetimi tam da o kümeye bakar.
   */
  answeredByAi: boolean;
  source: Ticket['source'];
  /** Son mesajın ilk satırı, okuyucunun dilinde — kuyrukta okunan önizleme. */
  preview: string;
  /** Önizleme makine çevirisi mi — ekran isterse küçük bir işaret koyar. */
  previewTranslated: boolean;
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
