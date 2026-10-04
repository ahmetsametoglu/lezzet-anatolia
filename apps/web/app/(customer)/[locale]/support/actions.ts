'use server';

import { revalidatePath } from 'next/cache';
import type { KeysetCursor, Page } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { getCustomerOrderDetail, type CustomerOrderDetail } from '@/lib/order/customer-orders';
import { listCustomerTickets, getCustomerTicket } from '@/lib/ticket/read';
import { requestTicketUploadUrl } from '@/lib/ticket/attachments';
import { openTicket, replyAsCustomer } from '@/lib/ticket/write';
import type { TicketType } from '@lezzet/types';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';

/**
 * Talep sayfasının kapıları: kimlik her eylemde sunucuda çözülür ve sahiplik motorun imzasında sorulur, çünkü kimlikler istemciden
 * gelir. Motorun iç ret sebepleri burada müşteri anahtarına çevrilir; motor operasyonla ortak ve personel iç sebebi görmeli.
 */

/** Sonraki sayfa; imleç URL'e yazılmaz, istemcide yaşar. */
export async function loadMoreTicketsAction(cursor: KeysetCursor): Promise<CustomerResult<Page<CustomerTicketSummary>>> {
  try {
    const customerId = await requireCustomer();
    return { data: await listCustomerTickets(customerId, cursor), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Cevap yazar; kapanmış talep kendiliğinden yeniden açılır, çünkü ayrı bir "yeniden aç" adımı unutulur ve mesaj kapalı talepte kalırdı.
 * Güncel görünümü döndürür ki ekran durumu tahmin etmesin; liste satırı sunucuda çizildiği için yol da tazelenir.
 */
export async function replyToTicketAction(
  locale: Locale,
  ticketId: string,
  body: string,
  attachments: readonly string[],
): Promise<CustomerResult<CustomerTicketView>> {
  try {
    const customerId = await requireCustomer();
    const result = await replyAsCustomer({ customerId, ticketId, body, attachments: [...attachments] });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));

    const view = await getCustomerTicket(locale, customerId, ticketId);
    if (!view) throw new CustomerError('ticket_unavailable');

    revalidatePath('/[locale]/support', 'layout');
    return { data: view, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Fotoğrafın imzalı yükleme adresi; dosya sunucudan geçmez. `alreadyRequested` istemciden gelir, çünkü sayı henüz gönderilmemiş bir
 * mesaja ait; güvenlik sınırı açılış ve cevaptaki ek sahipliği kontrolüdür.
 */
export async function requestTicketPhotoAction(
  ticketId: string | null,
  filename: string,
  alreadyRequested: number,
): Promise<CustomerResult<{ key: string; uploadUrl: string }>> {
  try {
    const customerId = await requireCustomer();
    const result = await requestTicketUploadUrl({ customerId, ticketId, filename, alreadyRequested });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));
    return { data: { key: result.key, uploadUrl: result.uploadUrl }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Talep açar; kaynak formdur, sipariş detayından gelinse bile. Sipariş ve kalem sahipliği motorda sorulur, yoksa müşteri başkasının
 * siparişini kendi talebi üzerinden okurdu.
 */
export async function openTicketAction(input: {
  type: TicketType;
  body: string;
  orderId: string | null;
  orderItemIds: readonly string[];
  attachments: readonly string[];
}): Promise<CustomerResult<{ ticketId: string }>> {
  try {
    const customerId = await requireCustomer();
    const result = await openTicket({
      customerId,
      source: 'form',
      type: input.type,
      body: input.body,
      orderId: input.orderId,
      orderItemIds: [...input.orderItemIds],
      attachments: [...input.attachments],
    });
    if (!result.ok) throw new CustomerError(ticketErrorKey(result.reason));

    revalidatePath('/[locale]/support', 'layout');
    return { data: { ticketId: result.data.id }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/** Talep çekmecesinde seçilen siparişin kalemleri; "yok" ile "senin değil" aynı cevabı alır. */
export async function ticketOrderAction(locale: Locale, orderId: string): Promise<CustomerResult<CustomerOrderDetail>> {
  try {
    const customerId = await requireCustomer();
    const order = await getCustomerOrderDetail(locale, customerId, orderId);
    if (!order) throw new CustomerError('ticket_unavailable');
    return { data: order, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

async function requireCustomer(): Promise<string> {
  const customerId = await currentCustomerId();
  if (!customerId) throw new CustomerError('session_expired');
  return customerId;
}

/**
 * Motorun ret sebebi → müşteri anahtarı. Üç iç sebep tek anahtara iner, çünkü ayrımı söylemek başkasının sipariş kimliğini
 * doğrulatırdı; tanınmayan sebep `unexpected`e düşer ki ekran iç sözcüğü göstermesin.
 */
function ticketErrorKey(reason: string): string {
  const map: Record<string, string> = {
    empty_body: 'message_empty',
    not_found: 'ticket_unavailable',
    order_not_found: 'ticket_unavailable',
    items_not_in_order: 'ticket_unavailable',
    // Ekin sahipliği tutmuyor: müşteri için sonuç "fotoğraf eklenemedi"dir, bir yetki dersi değil.
    attachment_not_yours: 'photo_unavailable',
    storage_unavailable: 'photo_unavailable',
    unsupported_type: 'photo_unsupported',
    too_many: 'photo_limit',
  };
  return map[reason] ?? 'unexpected';
}
