import 'server-only';
import {
  MoneyMovementService,
  OrderItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  TicketMessageService,
  TicketQueueService,
  TicketService,
  UserProfileService,
  serviceDb,
  type TicketQueueFilter,
} from '@lezzet/database';
import { allowedTicketTransitions, canTriggerReturn, isReturnBound } from '@lezzet/domain-core';
import { resolveLocalizedText, type KeysetCursor, type Page, type Ticket, type TicketMessage } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { privateReadUrls } from '@lezzet/storage';
import type { CustomerTicketView, StaffTicketDetail, TicketMessageView, TicketOrderRef, TicketQueueItem, TicketReturnOutcome } from './ticket-types';

/**
 * Talep okumaları (16.1) — **uygulama katmanı orkestrasyonu**: motor karar verir, servisler satır
 * getirir, burası ikisini birleştirir (STACK §4).
 *
 * **Sahiplik imzada durur.** Müşteri okumaları `customerId`'yi zorunlu parametre olarak alır,
 * süzgeç olarak değil: unutulabilen bir süzgeç, bir gün başkasının talebini açan bir ekran demektir.
 */

/** Kalem adı çözümü için tek turluk yardımcı — kalem → varyant → ürün adı (N+1 kırma). */
async function resolveItemNames(
  locale: Locale,
  itemIds: readonly string[],
  orderId: string,
): Promise<Array<{ id: string; name: string; qty: number }>> {
  if (itemIds.length === 0) return [];
  const db = serviceDb();
  const items = (await new OrderItemService(db).listByOrder(orderId)).filter((i) => itemIds.includes(i.id));
  if (items.length === 0) return [];

  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const products = await new ProductService(db).listByIds(variants.map((v) => v.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  return items.map((item) => {
    const variant = variantById.get(item.variantId);
    const product = variant ? productById.get(variant.productId) : undefined;
    return {
      id: item.id,
      // Ürün silinmiş olabilir; müşteri yine de neyi işaretlediğini görmeli — adsız ama var olan satır.
      name: product ? resolveLocalizedText(product.name, locale) : '—',
      qty: item.qty,
    };
  });
}

/** Talebe bağlı siparişin künyesi + işaretli kalemler; siparişsiz talepte null. */
async function orderRefOf(locale: Locale, ticket: Ticket): Promise<TicketOrderRef | null> {
  if (!ticket.orderId) return null;
  const order = await new OrderService(serviceDb()).getById(ticket.orderId);
  if (!order) return null;
  return {
    id: order.id,
    referenceNo: order.referenceNo,
    markedItems: await resolveItemNames(locale, ticket.orderItemIds, order.id),
  };
}

/**
 * İadenin sonucu — **siparişin para hareketlerinden türetilir**, talepte saklanmaz.
 *
 * Tetik damgası yoksa hiç bakılmaz: talepten doğmamış bir iade bu talebin ekranında görünmemeli.
 */
async function returnOutcomeOf(ticket: Ticket): Promise<TicketReturnOutcome | null> {
  if (!ticket.returnTriggeredAt || !ticket.orderId) return null;
  const movements = await new MoneyMovementService(serviceDb()).listByOrder(ticket.orderId);
  const refunded = movements
    .filter((m) => m.type === 'order_refund')
    .reduce((sum, m) => sum + Math.round(m.amount * 100), 0);
  return { triggeredAt: ticket.returnTriggeredAt, refundedCents: refunded };
}

/**
 * Mesajı ekranın gördüğü hâle çevirir — ekler **süreli imzalı adrese** dönüşerek.
 *
 * Şikâyet fotoğrafı private kovada durur ve public adresi yoktur; adres burada, yani yetkinin
 * doğrulandığı yerin içinde üretilir. Anahtarın kendisi dışarı çıkmaz: ekranın anahtarla
 * yapabileceği bir şey yok, ama sızan bir anahtar ileride açılacak her kapının önünde durur.
 *
 * Bir talebin mesajları birlikte imzalanır (`Promise.all`) — mesaj başına sıra beklemek, on
 * mesajlık bir yazışmayı on tur uzatırdı.
 */
async function toMessageView(message: TicketMessage): Promise<TicketMessageView> {
  return {
    id: message.id,
    sender: message.sender,
    body: message.body,
    attachmentUrls: await privateReadUrls(message.attachments),
    createdAt: message.createdAt,
  };
}

const toMessageViews = (messages: readonly TicketMessage[]): Promise<TicketMessageView[]> =>
  Promise.all(messages.map(toMessageView));

/** Müşterinin "Taleplerim" listesi — keyset sayfalı (talep sayısı veriyle büyür). */
export function listCustomerTickets(customerId: string, cursor?: KeysetCursor, limit?: number): Promise<Page<Ticket>> {
  return new TicketService(serviceDb()).listByCustomer(customerId, cursor, limit);
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
    orderRefOf(locale, ticket),
    new TicketMessageService(db).listByTicket(ticket.id),
    returnOutcomeOf(ticket),
  ]);

  return {
    id: ticket.id,
    type: ticket.type,
    status: ticket.status,
    subject: ticket.subject,
    createdAt: ticket.createdAt,
    order,
    messages: await toMessageViews(messages),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(ticket.status, 'customer'),
  };
}

/** Sipariş detayındaki "bu siparişle ilgili talebiniz var" bağı — sahiplik yine imzada. */
export async function listTicketsForOrder(customerId: string, orderId: string): Promise<Ticket[]> {
  const rows = await new TicketService(serviceDb()).listByOrder(orderId);
  return rows.filter((t) => t.customerId === customerId);
}

/**
 * Operasyon kuyruğu (16.3) — son mesaja göre sıralı, keyset sayfalı, **tek sorgu**.
 *
 * Müşteri adı, sipariş numarası ve son mesajın metni görünümden gelir (`ticket_queue`): ekran
 * onları ayrı ayrı çekseydi 30 satırlık bir kuyruk 90 sorguya çıkardı. Bu işlev yalnız sunum
 * kararını ekler — önizlemenin kırpılması.
 */
export async function listTicketQueue(
  filter: TicketQueueFilter = { openOnly: true },
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<TicketQueueItem>> {
  const page = await new TicketQueueService(serviceDb()).list(filter, cursor, limit);
  return {
    rows: page.rows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      type: row.type,
      status: row.status,
      handledBy: row.handledBy,
      source: row.source,
      preview: previewOf(row.lastMessageBody ?? ''),
      lastMessageAt: row.lastMessageAt,
      awaitingReply: row.awaitingReply,
      hasAttachment: row.hasAttachment,
      orderReferenceNo: row.orderReferenceNo,
      returnBound: isReturnBound(row.type),
    })),
    nextCursor: page.nextCursor,
  };
}

/** Kuyruk önizlemesi: ilk satır, kısaltılmış. Ekran taraması için — tam metin detayda okunur. */
function previewOf(body: string): string {
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

/**
 * Operasyon talep detayı (16.3).
 *
 * **Müşteri bağlamı bilerek burada:** "sürekli şikâyet eden mi, ilk kez mi" sorusu iade kararının
 * bir parçasıdır (tasarım §2) ve ayrı bir çağrıya bırakılsaydı ekran onu çekmeyi unutabilirdi.
 */
export async function getStaffTicketDetail(locale: Locale, ticketId: string): Promise<StaffTicketDetail | null> {
  const db = serviceDb();
  const row = await new TicketQueueService(db).getRow(ticketId);
  if (!row) return null;

  const [customer, order, messages, returnOutcome, customerTickets] = await Promise.all([
    new UserProfileService(db).getById(row.customerId),
    orderRefOf(locale, row),
    new TicketMessageService(db).listByTicket(row.id),
    returnOutcomeOf(row),
    new TicketService(db).listByCustomer(row.customerId, undefined, 100),
  ]);

  return {
    ticket: row,
    customer: {
      id: row.customerId,
      name: customer?.name ?? '—',
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
      totalTickets: customerTickets.rows.length,
    },
    order,
    messages: await toMessageViews(messages),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(row.status, 'staff'),
    returnTrigger: canTriggerReturn(row),
  };
}

/** Dashboard rozeti — kapanmamış talep sayısı. */
export function countOpenTickets(): Promise<number> {
  return new TicketService(serviceDb()).countOpen();
}
