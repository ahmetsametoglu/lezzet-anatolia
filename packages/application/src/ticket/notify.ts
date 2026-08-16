import { OrderService, TicketMessageService, UserProfileService, type Db } from '@lezzet/database';
import { formatShortDate, formatTime } from '@lezzet/helper';
import { localizedUrl } from '@lezzet/i18n';
import { defaultNotifier, type NotifyResult } from '@lezzet/notify';
import { captureError, SOURCES } from '@lezzet/observability';
import type { PreferredLanguage, Ticket, TicketHistoryEntry, TicketMessage, TicketStatus } from '@lezzet/types';

/**
 * Talep bildirimlerinin tetiklendiği yer (16.4) — şablonlar 14.7'de.
 *
 * ── TERFİ (16.08) · WEB'DEN GELDİ ────────────────────────────────────────────
 * Kaynağı `apps/web/lib/ticket/notify.ts`ti; web kopyası KÖPRÜ olarak duruyor (`order/notify.ts`
 * ile aynı yol, 21.21). Gerekçe: özerk AI ajanı (16.5) cevabı BACKEND cron'unda yazıyor ve o cevap
 * da müşteriye mail doğurmalı — personel cevabıyla AYNI mail. Kurucu iki uygulamada iki kopya
 * olamazdı (`CLAUDE §1`). Değişen tek şey `db`nin çağırandan gelmesi (paketin ortak deseni).
 *
 * **Bildirim asıl işlemi DURDURMAZ.** Cevap yazıldıysa yazılmıştır; mail sağlayıcısı düştü diye
 * cevabı geri almak yanlış olurdu. Kapılar sonucu beklemez ve hata yukarı çıkmaz.
 *
 * **Müşterinin kendi yazdığı mesaj bildirim doğurmaz:** kimse kendi cümlesini mailde okumak
 * istemez. Haber, KARŞI TARAF konuştuğunda gider — AI da karşı taraftır (`sender='ai'` cevabı
 * müşteriye personel cevabıyla aynı yoldan bildirilir). Tek istisna talebin AÇILIŞIDIR: teyit
 * müşteriye bir şey anlatmaz, mesajın ulaştığını kanıtlar.
 */

const notifier = defaultNotifier();

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
 * **İlk sıra KIRPILMAZ:** o, mailin konusu olan mesajdır ve cevap müşteriye aynen görünmelidir
 * (DOMAIN §15 — iç not yoktur). Alıntılananlar bağlamdır, kırpılabilir; kırpıldığı da SÖYLENİR
 * (`truncated`) — sessizce kesilen bir cümle, müşterinin okuduğunu sandığı şeyi değiştirir.
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
      notificationPreferencesUrl: localizedUrl('/account/notifications', locale),
    },
    recipient: { name: customer.name, email: customer.email, phone: customer.phone, locale },
  };
}

/**
 * Ortak gönderim — bildirim kurulamıyorsa ya da sağlayıcı düşerse sessiz geçilir.
 *
 * **Veri kurulumu da `try` içindedir**, gönderimin kendisi kadar: müşteri okuması ya da sipariş
 * okuması düşerse istisna yukarı çıkar ve yazılmış cevap "başarısız" görünürdü. Oysa cevap çoktan
 * yazılmıştır; geri alınacak bir şey yok, söylenecek bir şey de.
 */
async function send(
  db: Db,
  ticket: Ticket,
  event: 'ticket_received' | 'ticket_replied' | 'ticket_status_changed',
  previousStatus?: TicketStatus | null,
): Promise<NotifyResult[]> {
  try {
    const bundle = await buildTicketNotification(db, ticket, { previousStatus });
    if (!bundle) return [{ status: 'skipped', channel: 'email', reason: 'customer_not_found' } as NotifyResult];
    return await notifier.send(event, bundle.recipient, bundle.data);
  } catch (error) {
    // Dönen sonucu okuyan yok; gitmeyen mail izsiz kalmasın → `warning`. Kimlik yazılır, içerik
    // yazılmaz (OBSERVABILITY §5). Kaynak AKIŞA bağlı (`applicationTicket`): web de backend'in
    // cron'u da aynı kapıdan geçiyor.
    void captureError(error, { source: SOURCES.applicationTicket, level: 'warning', context: { ticketId: ticket.id, event } });
    return [{ status: 'error', channel: 'email', error: error instanceof Error ? error.message : String(error) } as NotifyResult];
  }
}

/**
 * Talep açıldı — **teyit maili**. Yalnız müşterinin KENDİ açtığı talepte gider: personelin müşteri
 * adına açtığında ilk sözü operatör söyler ve "bize yazdıklarınız" başlığı altında müşteriye kendi
 * yazmadığı bir metni göstermek olurdu.
 */
export function notifyTicketReceived(db: Db, ticket: Ticket, openedBy: 'customer' | 'staff'): Promise<NotifyResult[]> {
  if (openedBy !== 'customer') return Promise.resolve([]);
  return send(db, ticket, 'ticket_received');
}

/** Karşı taraf cevap yazdı (personel YA DA özerk AI) — cevabın tam metni mailde gider (DOMAIN §15). */
export function notifyTicketReplied(db: Db, ticket: Ticket): Promise<NotifyResult[]> {
  return send(db, ticket, 'ticket_replied');
}

/**
 * Durum değişti. **İki hâl haber doğurur: çözüldü ve yeniden açıldı.**
 *
 * `in_progress` doğurmaz — "incelemeye aldık" müşteriye bir şey söylemez; söyleyecek bir şey
 * çıktığında cevap maili zaten gider. Müşterinin kendi yeniden açması da haber doğurmaz: kendi
 * eyleminin mailini almak gürültüdür.
 */
export function notifyTicketStatusChanged(db: Db, ticket: Ticket, from: TicketStatus, by: 'customer' | 'staff'): Promise<NotifyResult[]> {
  const meaningful = ticket.status === 'resolved' || (ticket.status === 'open' && from === 'resolved');
  if (!meaningful || by !== 'staff') return Promise.resolve([]);
  return send(db, ticket, 'ticket_status_changed', from);
}
