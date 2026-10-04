import { OrderService, TicketMessageService, UserProfileService, type Db } from '@lezzet/database';
import { formatShortDate, formatTime } from '@lezzet/helper';
import { localizedUrl } from '@lezzet/i18n';
import { DEVICE_CHANNELS, WRITTEN_CHANNELS, type NotifyResult } from '@lezzet/notify';
import { captureError, SOURCES } from '@lezzet/observability';
import type { PreferredLanguage, Ticket, TicketHistoryEntry, TicketMessage, TicketStatus } from '@lezzet/types';
import { notificationPreferencesUrl } from '../customer/notification-preferences';
import { dispatchCustomerNotification, type DispatchOpts } from '../notification/dispatch';

/**
 * Talep bildirimleri burada tetiklenir; bildirim asıl işlemi durdurmaz, çünkü yazılmış cevap sağlayıcı düştü diye geri alınmaz. Haber
 * karşı taraf (personel ya da yapay zekâ) konuşunca gider; müşterinin kendi mesajı haber doğurmaz, tek istisna açılış teyididir.
 */


/** Mailde gösterilen mesaj sayısı ve alıntı uzunluğu; yazışma sınırsız büyür, gerisi talep sayfasındadır. */
const HISTORY_LIMIT = 4;
const QUOTE_CHARS = 600;

/** Mailde tam kart olarak gösterilen okunmamış cevap tavanı; ertelenen mail birden çok cevap taşıyabilir ama yazışma dökümüne dönmemeli. */
const UNREAD_LIMIT = 6;

/**
 * Yazışmanın son mesajları en yeniden eskiye; haber olan mesaj kırpılmaz, çünkü cevap müşteriye aynen görünmeli (DOMAIN §15). Bağlam
 * alıntısı kırpılırsa bu söylenir (`truncated`).
 */
function buildHistory(messages: readonly TicketMessage[], locale: PreferredLanguage): TicketHistoryEntry[] {
  /* Okunmamış küme müşterinin son mesajından sonraki kesintisiz karşı taraf dizisidir; müşteri yazdığı anda orada olduğu kesin olduğu
     için onun son mesajı doğal sınırdır ve ayrı bir "okundu" damgası gerekmez. */
  const newest = [...messages].reverse();
  let unreadCount = 0;
  while (unreadCount < newest.length && newest[unreadCount]!.sender !== 'customer') unreadCount += 1;
  // Tavanı aşan yeni cevaplar alıntı tarafına düşer — kaybolmaz, yalnız tam kart almaz.
  const unreadShown = Math.min(unreadCount, UNREAD_LIMIT);

  return newest.slice(0, Math.max(unreadShown, 1) + HISTORY_LIMIT - 1).map((message, index) => {
    const body = message.body.trim();
    const unread = index < unreadShown;
    // Kırpma yalnız BAĞLAM alıntılarında: haber olan mesaj müşteriye aynen görünmeli (DOMAIN §15).
    const truncated = !unread && body.length > QUOTE_CHARS;
    return {
      sender: message.sender,
      body: truncated ? `${body.slice(0, QUOTE_CHARS).trimEnd()}…` : body,
      at: `${formatShortDate(message.createdAt, locale)}, ${formatTime(message.createdAt, locale)}`,
      truncated,
      unread,
    };
  });
}

/** Mailin ortak verisi — talep + müşteri + yazışmanın son mesajları. */
async function buildTicketNotification(db: Db, ticket: Ticket, opts: { previousStatus?: TicketStatus | null } = {}) {
  const customer = await new UserProfileService(db).getById(ticket.customerId);
  if (!customer) return null;

  const locale: PreferredLanguage = customer.preferredLanguage ?? 'fr';
  // Sipariş referansı müşterinin "hangi sipariş" sorusunun cevabı; talep siparişsizse boş kalır.
  const order = ticket.orderId ? await new OrderService(db).getById(ticket.orderId) : null;
  const messages = await new TicketMessageService(db).listByTicket(ticket.id);

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
      history: buildHistory(messages, locale),
      previousStatus: opts.previousStatus ?? null,
      ticketUrl: localizedUrl('/support/[ticket]', locale, { ticket: ticket.id }),
      // Jetonlu bağlantı tek kapıdan kurulur; gerekçesi `customer/notification-preferences` künyesinde.
      notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, { customerId: customer.id }),
    },
    recipient: { name: customer.name, email: customer.email, phone: customer.phone, locale },
  };
}

/**
 * Ortak gönderim; bildirim kurulamıyorsa ya da sağlayıcı düşerse sessiz geçilir. Veri kurulumu da `try` içindedir, yoksa düşen bir okuma
 * çoktan yazılmış cevabı "başarısız" gösterirdi.
 */
async function send(
  db: Db,
  ticket: Ticket,
  event: 'ticket_received' | 'ticket_replied' | 'ticket_status_changed',
  previousStatus: TicketStatus | null = null,
  opts: DispatchOpts = {},
): Promise<NotifyResult[]> {
  try {
    const bundle = await buildTicketNotification(db, ticket, { previousStatus });
    if (!bundle) return [{ status: 'skipped', channel: 'email', reason: 'customer_not_found' } as NotifyResult];
    /* Her cevap ve durum değişimi ayrı haberdir, dedupe anahtarı yoktur. Payload yalnız sipariş numarası ve talep türüdür: müşterinin
       kendi cümlesi kilit ekranında görünmesin diye taşınmaz. */
    return await dispatchCustomerNotification(
      db,
      {
        event,
        customerId: ticket.customerId,
        recipient: bundle.recipient,
        data: bundle.data,
        target: { type: 'ticket', id: ticket.id },
        payload: { referenceNo: bundle.data.orderReferenceNo, ticketType: ticket.type },
      },
      opts,
    );
  } catch (error) {
    // Dönen sonucu okuyan yok; gitmeyen haber izsiz kalmasın. Kimlik yazılır, içerik yazılmaz (OBSERVABILITY §5).
    void captureError(error, { source: SOURCES.applicationTicket, level: 'warning', context: { ticketId: ticket.id, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) } as NotifyResult];
  }
}

/**
 * Açılış teyidi yalnız müşterinin kendi açtığı talepte gider, çünkü personelin açtığında "bize yazdıklarınız" başlığı altında müşterinin
 * yazmadığı bir metin görünürdü.
 */
export function notifyTicketReceived(db: Db, ticket: Ticket, openedBy: 'customer' | 'staff'): Promise<NotifyResult[]> {
  if (openedBy !== 'customer') return Promise.resolve([]);
  return send(db, ticket, 'ticket_received');
}

/**
 * Karşı taraf cevap yazdı: uygulama içi satır ve cihaz bildirimi hemen gider; yazışmayı o an açık tutan müşteride uygulama bildirimi
 * göstermez. E-posta okunmamış cevaplar için sonradan gider (`mailTicketReply`).
 */
export function notifyTicketReplied(db: Db, ticket: Ticket): Promise<NotifyResult[]> {
  return send(db, ticket, 'ticket_replied', null, { channels: DEVICE_CHANNELS });
}

/** Okunmamış cevabın yazılı haberi: e-posta, yoksa yazılı yedek; satır yazmaz, çünkü cihaz bildirimi cevap anında satırını yazdı. */
export function mailTicketReply(db: Db, ticket: Ticket): Promise<NotifyResult[]> {
  return send(db, ticket, 'ticket_replied', null, { channels: WRITTEN_CHANNELS, inApp: false });
}

/**
 * Durum değişiminde yalnız çözüldü ve personelin yeniden açması haber doğurur; `in_progress` müşteriye bir şey söylemez ve müşterinin
 * kendi eyleminin haberi gürültüdür.
 */
export function notifyTicketStatusChanged(db: Db, ticket: Ticket, from: TicketStatus, by: 'customer' | 'staff'): Promise<NotifyResult[]> {
  const meaningful = ticket.status === 'resolved' || (ticket.status === 'open' && from === 'resolved');
  if (!meaningful || by !== 'staff') return Promise.resolve([]);
  return send(db, ticket, 'ticket_status_changed', from);
}
