import type { Locale } from '@lezzet/i18n';
import { formatOrderDate, formatShortDate, formatTime } from '@/lib/storefront/format';
import type { Messages } from '../support-types';

/**
 * Talep ekranının metin türetmeleri — liste kartı, yazışma başlığı ve mesaj damgası aynı kurallara
 * bakar. Ayrı ayrı yazılsalardı kart "Eksik geldi · Gözleme" derken başlık başka bir şey diyebilirdi.
 */

/**
 * Talebin ekrandaki adı: **tip · konu** (tasarım: "Eksik geldi · Gözleme").
 *
 * `subject` boş olabilir ve bu normaldir — müşteri başlık yazmaz, anlatısını yazar (`ticket.schema`).
 * O zaman geriye tipin kendisi kalır; "Soru ·" gibi asılı bir ayraç bırakılmaz.
 */
export function ticketTitle(
  ticket: { type: keyof Messages['type']; subject: string | null },
  t: Messages,
): string {
  const type = t.type[ticket.type];
  const subject = ticket.subject?.trim();
  return subject ? `${type} · ${subject}` : type;
}

/**
 * Mesaj damgası — tasarımda "24 Tem, 18:02" ve "bugün, 10:15".
 *
 * "Bugün" karşılaştırması tarayıcının saat diliminde yapılır (bileşen istemcide çalışıyor); yıl
 * yazılmaz çünkü damga bir yazışmanın İÇİNDE duruyor ve orada bağlam zaten dizinin kendisi.
 */
export function messageStamp(iso: string, locale: Locale, t: Messages): string {
  const day = isToday(iso) ? t.today : formatShortDate(iso, locale);
  return `${day}, ${formatTime(iso, locale)}`;
}

/**
 * Liste kartının "son mesaj: …" değeri. Bugünse "bugün", değilse **yıllı** tarih.
 *
 * Yıl bilerek var: talep listesi bir arşivdir ve yıllara yayılır — yılsız "24 Tem" iki farklı
 * talebi ayırt edemez. Siparişler listesinde verilen kararın aynısı (`design/BACKLOG §3`).
 */
export function lastMessageLabel(iso: string, locale: Locale, t: Messages): string {
  return isToday(iso) ? t.today : formatOrderDate(iso, locale, true);
}

/** Kartın alt satırındaki bağlam: siparişin numarası ya da "siparişsiz". */
export function ticketContext(orderReferenceNo: string | null, t: Messages): string {
  return orderReferenceNo ?? t.noOrder;
}

function isToday(iso: string): boolean {
  const then = new Date(iso);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate()
  );
}
