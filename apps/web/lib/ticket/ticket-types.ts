import type { Ticket } from '@lezzet/types';
import type {
  CustomerTicketSummary,
  StaffTicketDetail,
  TicketMessageView,
  TicketOrderRef,
  TicketQueueItem,
  TicketReturnOutcome,
} from '@lezzet/application';

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
/** Personel üçlüsü de pakete terfi etti (21.12) — künyeleri `ticket/ticket-types`ta. */
export type { StaffTicketDetail, TicketOrderRef, TicketQueueItem };

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
