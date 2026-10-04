import { isLocalToday, ticketTitle as ticketTitleOf } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import { formatOrderDate } from '@/lib/storefront/format';
import type { Messages } from '../support-types';

/**
 * Talep ekranının metin türetmeleri — liste kartı, yazışma başlığı ve mesaj damgası aynı kurallara
 * bakar. Ayrı ayrı yazılsalardı kart "Eksik geldi · Gözleme" derken başlık başka bir şey diyebilirdi.
 */

/**
 * Talebin ekrandaki adı: tür · konu. Konu boş olabilir (müşteri başlık değil anlatım yazar); o zaman "Soru ·" gibi asılı bir
 * ayraç bırakılmaz.
 */
export function ticketTitle(
  ticket: { type: keyof Messages['type']; subject: string | null },
  t: Messages,
): string {
  return ticketTitleOf(t.type[ticket.type], ticket.subject, '{type} · {subject}');
}

/** Liste kartının "son mesaj" değeri: bugünse "bugün", değilse yıllı tarih, çünkü talep listesi yıllara yayılan bir arşiv. */
export function lastMessageLabel(iso: string, locale: Locale): string {
  return isLocalToday(iso) ? supportMessages[locale].today : formatOrderDate(iso, locale, true);
}

/** Kartın alt satırındaki bağlam: siparişin numarası ya da "siparişsiz". */
export function ticketContext(orderReferenceNo: string | null, t: Messages): string {
  return orderReferenceNo ?? t.noOrder;
}
