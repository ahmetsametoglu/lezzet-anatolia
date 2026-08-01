import 'server-only';
import { OrderService, TicketMessageService, UserProfileService, serviceDb } from '@lezzet/database';
import type { NotifyResult } from '@lezzet/notify';
import type { PreferredLanguage, Ticket, TicketHistoryEntry, TicketMessage, TicketStatus } from '@lezzet/types';
import { localizedUrl, notifier } from '../notify';
import { formatShortDate, formatTime } from '../storefront/format';
import { captureError, SOURCES } from '@lezzet/observability';

/**
 * Talep bildirimlerinin tetiklendiği yer (16.4) — şablonlar 14.7'de.
 *
 * **Bildirim asıl işlemi DURDURMAZ.** Cevap yazıldıysa yazılmıştır; mail sağlayıcısı düştü diye
 * operatörün cevabını geri almak yanlış olurdu. Bu yüzden kapılar sonucu beklemez ve hata yukarı
 * çıkmaz — puan yazımıyla aynı desen (DOMAIN §14/§15).
 *
 * **Müşterinin kendi yazdığı mesaj bildirim doğurmaz:** kimse kendi cümlesini mailde okumak
 * istemez. Haber, KARŞI TARAF konuştuğunda gider. **Tek istisna talebin AÇILIŞIDIR** ve istisna
 * olmasının sebebi işinin farklı olması: teyit müşteriye bir şey anlatmaz, mesajın ulaştığını
 * kanıtlar.
 */

/**
 * Mailde gösterilecek mesaj sayısı ve alıntı uzunluğu.
 *
 * **Sınır kapıda, çünkü küme sınırsız büyür** (`CLAUDE.md §1`): kırk mesajlık bir talebin tamamını
 * payload'a koymak hem sözleşmeyi hem maili şişirir. Dört = bugünkü haber + öncesindeki üç adım;
 * gerisi talep sayfasında ve mailde onun bağlantısı var.
 */
const HISTORY_LIMIT = 4;
const QUOTE_CHARS = 600;

/**
 * Yazışmanın son mesajları, **en yeniden eskiye** — mailin okunma yönü bu.
 *
 * **İlk sıra KIRPILMAZ:** o, mailin konusu olan mesajdır ve personelin cevabı müşteriye aynen
 * görünmelidir (DOMAIN §15 — iç not yoktur, gösterdiğimiz metin yazdığımız metindir). Alıntılananlar
 * bağlamdır, kırpılabilir; kırpıldığı da SÖYLENİR (`truncated`) — sessizce kesilen bir cümle,
 * müşterinin okuduğunu sandığı şeyi değiştirir.
 */
function buildHistory(messages: readonly TicketMessage[], locale: PreferredLanguage): TicketHistoryEntry[] {
  return [...messages]
    .reverse()
    .slice(0, HISTORY_LIMIT)
    .map((message, index) => {
      const body = message.body.trim();
      const truncated = index > 0 && body.length > QUOTE_CHARS;
      return {
        sender: message.sender,
        body: truncated ? `${body.slice(0, QUOTE_CHARS).trimEnd()}…` : body,
        at: `${formatShortDate(message.createdAt, locale)}, ${formatTime(message.createdAt, locale)}`,
        truncated,
      };
    });
}

/** Mailin ve wa.me metninin ortak verisi — talep + müşteri + yazışmanın son mesajları. */
async function buildTicketNotification(ticket: Ticket, opts: { previousStatus?: TicketStatus | null } = {}) {
  const db = serviceDb();
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
async function send(
  ticket: Ticket,
  event: 'ticket_received' | 'ticket_replied' | 'ticket_status_changed',
  previousStatus?: TicketStatus | null,
) {
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

/**
 * Talep açıldı — **teyit maili**. Ekran iki mail vaat ediyordu ("aldığımızda ve yanıtladığımızda"),
 * kodda yalnız ikincisi vardı; müşteri onay ekranını görüp gelen kutusunda hiçbir şey bulmuyordu.
 *
 * **Personelin müşteri adına açtığı talepte GİTMEZ.** Orada ilk sözü operatör söyler; "bize
 * yazdıklarınız" başlığı altında müşteriye kendi yazmadığı bir metni göstermek olurdu. O akışta
 * haber, personel cevap yazdığında zaten gider.
 */
export function notifyTicketReceived(ticket: Ticket, openedBy: 'customer' | 'staff'): Promise<NotifyResult[]> {
  if (openedBy !== 'customer') return Promise.resolve([]);
  return send(ticket, 'ticket_received');
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
