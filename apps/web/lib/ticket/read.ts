import 'server-only';
import { TicketMessageService, TicketQueueService, TicketService, serviceDb, type TicketQueueFilter } from '@lezzet/database';
import { allowedTicketTransitions } from '@lezzet/domain-core';
import {
  getStaffTicketDetail as staffTicketDetail,
  listTicketQueue as staffTicketQueue,
  ticketOrderRefOf,
  ticketReturnOutcomeOf,
  toTicketMessageViews,
} from '@lezzet/application';
import type { KeysetCursor, Page, ProductComplaintSignal, Ticket } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { CustomerTicketSummary, CustomerTicketView, StaffTicketDetail, TicketQueueItem } from './ticket-types';

/**
 * Talep okumaları (16.1) — artık büyük ölçüde KÖPRÜ (terfi 21.12).
 *
 * Personel yarısı (`listTicketQueue` · `getStaffTicketDetail`) `@lezzet/application`a taşındı:
 * operasyon kuyruğunu artık iki yüzey okuyor (web talepler sayfası + mobil yönetim Y1) ve
 * orkestrasyon iki yerde iki kez yaşayamazdı. Ortak yardımcılar (`ticketOrderRefOf` ·
 * `ticketReturnOutcomeOf` · `toTicketMessageViews`) da oradan geliyor — müşteri yarısının yerel
 * kopyaları SİLİNDİ, aynı zemini iki dosya kurmuyor.
 *
 * Web çağıranları `db` geçmez — bu yüzeyin veritabanı daima `serviceDb()`; imzayı burada bağlamak,
 * onlarca çağrı yerine `serviceDb()` yazdırmaktan hem kısa hem tekti (notify köprüsünün deseni).
 *
 * **Sahiplik imzada durur.** Müşteri okumaları `customerId`'yi zorunlu parametre olarak alır,
 * süzgeç olarak değil: unutulabilen bir süzgeç, bir gün başkasının talebini açan bir ekran demektir.
 */

/**
 * Müşterinin "Taleplerim" listesi (08.6) — keyset sayfalı (talep sayısı veriyle büyür).
 *
 * Ham `ticket` satırı yerine **kuyruk görünümünden** okur; sıra son mesaja göre. Görünümün personel
 * alanları (`customerName`, `handledBy`, `lastMessageBody`) BURADA DÜŞER — müşteri tipine hiç
 * girmezler.
 */
export async function listCustomerTickets(
  customerId: string,
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<CustomerTicketSummary>> {
  const page = await new TicketQueueService(serviceDb()).list({ customerId }, cursor, limit);
  return {
    rows: page.rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      orderReferenceNo: row.orderReferenceNo,
    })),
    nextCursor: page.nextCursor,
  };
}

/**
 * Müşterinin tek talebi — yazışma, sipariş zemini ve iade sonucuyla.
 *
 * **Başkasının talebi `null` döner, hata değil:** "bu talep var ama senin değil" demek, olmayan bir
 * kaydın varlığını doğrulamaktır. Ekran için ikisi de aynı: yok.
 */
export async function getCustomerTicket(locale: Locale, customerId: string, ticketId: string): Promise<CustomerTicketView | null> {
  const db = serviceDb();
  const ticket = await new TicketService(db).getById(ticketId);
  if (!ticket || ticket.customerId !== customerId) return null;

  const [order, messages, returnOutcome] = await Promise.all([
    ticketOrderRefOf(db, locale, ticket),
    new TicketMessageService(db).listByTicket(ticket.id),
    ticketReturnOutcomeOf(db, ticket),
  ]);

  return {
    id: ticket.id,
    type: ticket.type,
    status: ticket.status,
    subject: ticket.subject,
    createdAt: ticket.createdAt,
    order,
    // Müşteri yazışmayı KENDİ dilinde okur: personelin Türkçe cevabı burada çevrilir.
    messages: await toTicketMessageViews(messages, locale),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(ticket.status, 'customer'),
  };
}

/** Sipariş detayındaki "bu siparişle ilgili talebiniz var" bağı — sahiplik yine imzada. */
export async function listTicketsForOrder(customerId: string, orderId: string): Promise<Ticket[]> {
  const rows = await new TicketService(serviceDb()).listByOrder(orderId);
  return rows.filter((t) => t.customerId === customerId);
}

/** Operasyon kuyruğu (16.3) — KÖPRÜ: gövde `@lezzet/application/ticket/staff-read` (21.12). */
export function listTicketQueue(
  viewLanguage: Locale,
  filter: TicketQueueFilter = { openOnly: true },
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<TicketQueueItem>> {
  return staffTicketQueue(serviceDb(), viewLanguage, filter, cursor, limit);
}

/** Operasyon talep detayı (16.3) — KÖPRÜ: gövde `@lezzet/application/ticket/staff-read` (21.12). */
export function getStaffTicketDetail(locale: Locale, ticketId: string): Promise<StaffTicketDetail | null> {
  return staffTicketDetail(serviceDb(), locale, ticketId);
}

/** Dashboard rozeti — kapanmamış talep sayısı. */
export function countOpenTickets(): Promise<number> {
  return new TicketService(serviceDb()).countOpen();
}

/**
 * Kuyruk başlığının sayaçları — durum başına, TÜM kuyruk üzerinden.
 *
 * Yüklenmiş sayfadan saymak yanlış olurdu ve tam da sayının anlam kazandığı yerde: kuyruk keyset
 * sayfalı, yani "2 işlemde" aslında "ilk sayfada 2 işlemde" demek olurdu (`CLAUDE.md §1`).
 */
export function countTicketsByStatus(): Promise<Record<Ticket['status'], number>> {
  return new TicketService(serviceDb()).countByStatus();
}

/** Başlığın üçüncü sayısı (16.5): cevabı insanın yazmadığı (ai + hibrit) kapanmamış talepler. */
export function countTicketsHandledByAi(): Promise<number> {
  return new TicketService(serviceDb()).countHandledByAi();
}

/**
 * **Ürün başına şikâyet yoğunluğu** (16.6 · operasyon talebi 03.08) — Geri Bildirim ekranının skor
 * tablosunda, ürünün skorunun YANINDA okunur.
 *
 * Haritada olmayan ürünün şikâyeti YOKTUR; çağıran `?? 0` okur — her ürün için sıfırlı bir kayıt
 * üretmek, şikâyetsiz bir katalogda yüzlerce boş nesne olurdu (`getProductScores` ile aynı desen).
 *
 * `since` (ISO) verilirse yalnız o dönemin şikâyetleri; ekranın "Son 30 gün" seçicisi budur.
 */
export async function getProductComplaintSignals(
  productIds: readonly string[] = [],
  since?: string,
): Promise<Map<string, ProductComplaintSignal>> {
  const rows = await new TicketService(serviceDb()).listComplaintSignals(productIds, since);
  return new Map(rows.map((row) => [row.productId, row]));
}
