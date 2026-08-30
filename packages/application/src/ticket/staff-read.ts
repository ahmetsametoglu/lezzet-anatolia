import type { SupabaseClient } from '@supabase/supabase-js';
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
  type TicketQueueFilter,
} from '@lezzet/database';
import { allowedTicketTransitions, canTriggerReturn, isReturnBound, resolveUserText } from '@lezzet/domain-core';
import {
  resolveLocalizedText,
  type KeysetCursor,
  type Page,
  type PreferredLanguage,
  type Ticket,
} from '@lezzet/types';
import { customerLabel } from '../customer/label';
import { toTicketMessageViews } from './read';
import type { StaffTicketDetail, TicketOrderRef, TicketQueueItem } from './ticket-types';

/*
  PERSONEL TALEP OKUMALARI — terfi 21.12 (kaynağı `apps/web/lib/ticket/read.ts`in personel yarısı,
  birebir; web köprüyle okur). Ölçüt doldu: operasyon kuyruğu/detayı artık İKİ yüzeyden okunuyor
  (web talepler sayfası + mobil yönetim Y1).

  Dil `PreferredLanguage` — `Locale` DEĞİL (`ticket-types` künyesi): paket Next'in dil kabuğunu
  bilmez; web köprüsü kendi `Locale`ünü buraya geçirirken tip zaten aynı üç değeri taşıyor.
*/

/**
 * Kuyruk önizlemesi: ilk satır, kısaltılmış. Ekran taraması için — tam metin detayda okunur.
 *
 * DIŞA AÇIK çünkü ikinci bir tüketicisi var: yönetim hub'ının karar kutusu aynı önizlemeyi
 * kartına yazıyor (21.164). İkinci bir kırpma kuralı yazmak, aynı kuyruğun iki ekranda iki farklı
 * uzunlukta görünmesi demekti (CLAUDE §1).
 */
export function previewOf(body: string): string {
  const firstLine = body.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

/** Kalem adı çözümü için tek turluk yardımcı — kalem → varyant → ürün adı (N+1 kırma). */
async function resolveItemNames(
  db: SupabaseClient,
  viewLanguage: PreferredLanguage,
  itemIds: readonly string[],
  orderId: string,
): Promise<Array<{ id: string; name: string; qty: number }>> {
  if (itemIds.length === 0) return [];
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
      // Ürün silinmiş olabilir; okuyan yine de neyin işaretlendiğini görmeli — adsız ama var olan satır.
      name: product ? resolveLocalizedText(product.name, viewLanguage) : '—',
      qty: item.qty,
    };
  });
}

/** Talebe bağlı siparişin künyesi + işaretli kalemler; siparişsiz talepte null.
 *  İhraç bilinçli: web'in MÜŞTERİ detayı da aynı zemini kurar — kural iki yerde yaşamasın. */
export async function ticketOrderRefOf(
  db: SupabaseClient,
  viewLanguage: PreferredLanguage,
  ticket: Ticket,
): Promise<TicketOrderRef | null> {
  if (!ticket.orderId) return null;
  const order = await new OrderService(db).getById(ticket.orderId);
  if (!order) return null;
  return {
    id: order.id,
    referenceNo: order.referenceNo,
    markedItems: await resolveItemNames(db, viewLanguage, ticket.orderItemIds, order.id),
  };
}

/**
 * İadenin sonucu — **siparişin para hareketlerinden türetilir**, talepte saklanmaz.
 * Tetik damgası yoksa hiç bakılmaz: talepten doğmamış bir iade bu talebin ekranında görünmemeli.
 */
export async function ticketReturnOutcomeOf(db: SupabaseClient, ticket: Ticket): Promise<StaffTicketDetail['returnOutcome']> {
  if (!ticket.returnTriggeredAt || !ticket.orderId) return null;
  const movements = await new MoneyMovementService(db).listByOrder(ticket.orderId);
  const refunded = movements
    .filter((m) => m.type === 'order_refund')
    .reduce((sum, m) => sum + m.amountCents, 0);
  return { triggeredAt: ticket.returnTriggeredAt, refundedCents: refunded };
}

/**
 * Operasyon kuyruğu — son mesaja göre sıralı, keyset sayfalı; önizleme OKUYUCUNUN dilinde (20.2):
 * detay çevrilip kuyruk çevrilmeseydi personel talebi ancak açarak triyaj edebilirdi.
 */
export async function listTicketQueue(
  db: SupabaseClient,
  viewLanguage: PreferredLanguage,
  filter: TicketQueueFilter = { openOnly: true },
  cursor?: KeysetCursor,
  limit?: number,
): Promise<Page<TicketQueueItem>> {
  const page = await new TicketQueueService(db).list(filter, cursor, limit);

  const namelessIds = [...new Set(page.rows.filter((row) => !row.customerName?.trim()).map((row) => row.customerId))];
  const profiles = namelessIds.length > 0 ? await new UserProfileService(db).listByIds(namelessIds) : [];
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));

  return {
    rows: page.rows.map((row) => {
      const shown = resolveUserText(
        { text: row.lastMessageBody, language: row.lastMessageLanguage, translations: row.lastMessageTranslations },
        viewLanguage,
      );
      return {
        id: row.id,
        customerName: customerLabel(row.customerName, emailById.get(row.customerId)),
        type: row.type,
        status: row.status,
        handledBy: row.handledBy,
        answeredByAi: row.answeredByAi,
        source: row.source,
        preview: previewOf(shown.text ?? ''),
        previewTranslated: shown.isTranslated,
        lastMessageAt: row.lastMessageAt,
        awaitingReply: row.awaitingReply,
        hasAttachment: row.hasAttachment,
        orderReferenceNo: row.orderReferenceNo,
        returnBound: isReturnBound(row.type),
      };
    }),
    nextCursor: page.nextCursor,
  };
}

/**
 * Operasyon talep detayı (16.3).
 *
 * **Müşteri bağlamı bilerek burada:** "sürekli şikâyet eden mi, ilk kez mi" sorusu iade kararının
 * bir parçasıdır ve ayrı bir çağrıya bırakılsaydı ekran onu çekmeyi unutabilirdi.
 */
export async function getStaffTicketDetail(
  db: SupabaseClient,
  viewLanguage: PreferredLanguage,
  ticketId: string,
): Promise<StaffTicketDetail | null> {
  const row = await new TicketQueueService(db).getRow(ticketId);
  if (!row) return null;

  const [customer, order, messages, returnOutcome, customerTickets] = await Promise.all([
    new UserProfileService(db).getById(row.customerId),
    ticketOrderRefOf(db, viewLanguage, row),
    new TicketMessageService(db).listByTicket(row.id),
    ticketReturnOutcomeOf(db, row),
    // SAYIM, sayfa değil: "sürekli şikâyet eden mi" ölçüsü iade kararının girdisi ve tam da tavanda
    // anlamsızlaşır. Bir sayfanın satır sayısını "toplam" diye göstermek 300 talebi 100 gösterirdi.
    new TicketService(db).countByCustomer(row.customerId),
  ]);

  return {
    ticket: row,
    customer: {
      id: row.customerId,
      // Kuyrukla AYNI kural (`customerLabel`): adsız müşteri e-postasıyla anılır.
      name: customerLabel(customer?.name, customer?.email),
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
      totalTickets: customerTickets,
    },
    order,
    // Ters yön: müşterinin kendi dilinde yazdığı şikâyet personele operasyon dilinde açılır.
    messages: await toTicketMessageViews(messages, viewLanguage),
    returnOutcome,
    allowedTransitions: allowedTicketTransitions(row.status, 'staff'),
    returnTrigger: canTriggerReturn(row),
  };
}
