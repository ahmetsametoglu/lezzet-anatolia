import 'server-only';
import { OrderService, TicketMessageService, UserProfileService, serviceDb } from '@lezzet/database';
import type { NotifyResult } from '@lezzet/notify';
import type { PreferredLanguage, Ticket, TicketStatus } from '@lezzet/types';
import { localizedUrl, notifier } from '../notify';
import { formatShortDate } from '../storefront/format';
import { captureError, SOURCES } from '@lezzet/observability';

/**
 * Talep bildirimlerinin tetiklendiği yer (16.4) — şablonlar 14.7'de.
 *
 * **Bildirim asıl işlemi DURDURMAZ.** Cevap yazıldıysa yazılmıştır; mail sağlayıcısı düştü diye
 * operatörün cevabını geri almak yanlış olurdu. Bu yüzden kapılar sonucu beklemez ve hata yukarı
 * çıkmaz — puan yazımıyla aynı desen (DOMAIN §14/§15).
 *
 * **Müşterinin kendi yazdığı mesaj bildirim doğurmaz:** kimse kendi cümlesini mailde okumak
 * istemez. Haber, KARŞI TARAF konuştuğunda gider.
 */

/** Mailin ve wa.me metninin ortak verisi — talep + müşteri + son cevap. */
async function buildTicketNotification(ticket: Ticket, opts: { previousStatus?: TicketStatus | null } = {}) {
  const db = serviceDb();
  const customer = await new UserProfileService(db).getById(ticket.customerId);
  if (!customer) return null;

  const locale: PreferredLanguage = customer.preferredLanguage ?? 'fr';
  // Sipariş referansı müşterinin "hangi sipariş" sorusunun cevabı; talep siparişsizse boş kalır.
  const order = ticket.orderId ? await new OrderService(db).getById(ticket.orderId) : null;

  // Son PERSONEL mesajı — müşteriye gidecek olan odur. Kendi mesajını geri göndermeyiz.
  const messages = await new TicketMessageService(db).listByTicket(ticket.id);
  const lastStaff = [...messages].reverse().find((m) => m.sender === 'admin' || m.sender === 'ai');

  return {
    data: {
      ticketId: ticket.id,
      subject: ticket.subject,
      type: ticket.type,
      status: ticket.status,
      customerName: customer.name,
      locale,
      orderReferenceNo: order?.referenceNo ?? null,
      openedOn: formatShortDate(ticket.createdAt, locale),
      replyBody: lastStaff?.body ?? null,
      repliedAt: lastStaff ? formatShortDate(lastStaff.createdAt, locale) : null,
      previousStatus: opts.previousStatus ?? null,
      ticketUrl: localizedUrl('/support/[ticket]', locale, { ticket: ticket.id }),
      notificationPreferencesUrl: localizedUrl('/account/notifications', locale),
    },
    recipient: { name: customer.name, email: customer.email, phone: customer.phone, locale },
  };
}

/**
 * Ortak gönderim — bildirim kurulamıyorsa ya da sağlayıcı düşerse sessiz geçilir.
 *
 * **Veri kurulumu da `try` içindedir**, gönderimin kendisi kadar: müşteri okuması ya da sipariş
 * okuması düşerse istisna yukarı çıkar ve operatörün yazdığı cevap "başarısız" görünürdü. Oysa cevap
 * çoktan yazılmıştır; geri alınacak bir şey yok, söylenecek bir şey de.
 */
async function send(ticket: Ticket, event: 'ticket_replied' | 'ticket_status_changed', previousStatus?: TicketStatus | null) {
  try {
    const bundle = await buildTicketNotification(ticket, { previousStatus });
    if (!bundle) return [{ status: 'skipped', channel: 'email', reason: 'customer_not_found' } as NotifyResult];
    return await notifier.send(event, bundle.recipient, bundle.data);
  } catch (error) {
    // Aynı gerekçe `lib/order/notify.ts`'te: dönen sonuç nesnesini okuyan yok, dolayısıyla gitmeyen
    // mail izsiz kalıyordu. Talep sağlam, eksik olan haber → `warning`.
    void captureError(error, { source: SOURCES.webAction, level: 'warning', context: { ticketId: ticket.id, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) } as NotifyResult];
  }
}

/** Personel cevap yazdı — cevabın tam metni mailde gider (DOMAIN §15: iç not yoktur). */
export function notifyTicketReplied(ticket: Ticket): Promise<NotifyResult[]> {
  return send(ticket, 'ticket_replied');
}

/**
 * Durum değişti. **İki hâl haber doğurur: çözüldü ve yeniden açıldı.**
 *
 * `in_progress` doğurmaz — "incelemeye aldık" müşteriye bir şey söylemez; söyleyecek bir şey
 * çıktığında cevap maili zaten gider. Ara bildirim, gerçek haberin değerini düşürür.
 *
 * Müşterinin kendi yeniden açması da haber doğurmaz: kendi eyleminin mailini almak gürültüdür.
 */
export function notifyTicketStatusChanged(ticket: Ticket, from: TicketStatus, by: 'customer' | 'staff'): Promise<NotifyResult[]> {
  const meaningful = ticket.status === 'resolved' || (ticket.status === 'open' && from === 'resolved');
  if (!meaningful || by !== 'staff') return Promise.resolve([]);
  return send(ticket, 'ticket_status_changed', from);
}
