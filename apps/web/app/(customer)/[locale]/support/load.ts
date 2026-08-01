import 'server-only';
import { redirect } from 'next/navigation';
import type { Locale } from '@lezzet/i18n';
import type { Page } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerTicket, listCustomerTickets } from '@/lib/ticket/read';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';
import { routing } from '@/i18n/routing';

/**
 * İki talep rotasının ORTAK yüklemesi (`/support` ve `/support/[ticket]`).
 *
 * Ortak olmasının sebebi masaüstünün iki bölmeli olması: her iki rota da hem LİSTEYİ hem bir
 * YAZIŞMAYI çözmek zorunda. İki sayfada ayrı ayrı yazılsaydı biri guard'ı, öteki sıralamayı
 * unutabilirdi — ve fark ancak müşteri boş bir bölmeye baktığında görünürdü.
 *
 * **Girişsiz ziyaretçi 404 GÖRMEZ, girişe yönlenir** — hesap ve siparişler sayfalarıyla aynı
 * gerekçe: sayfanın kendisi bir sır değil, müşterinin eksiği kimlik.
 */
interface SupportData {
  customerId: string;
  tickets: Page<CustomerTicketSummary>;
  selected: CustomerTicketView | null;
}

export async function loadSupport(locale: Locale, ticketId?: string): Promise<SupportData> {
  const customerId = await currentCustomerId();
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor (`/giris`); ikinci bir bölü eklenmez.
  if (!customerId) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const tickets = await listCustomerTickets(customerId);
  // Rota bir talep söylemiyorsa listenin İLKİ açılır — masaüstünde sağ bölme boş kalmasın diye.
  // Mobil bu detayı çizmez ama okuma yine yapılır: cihaz kararı istemcide kesinleşiyor ve sunucunun
  // tahmini yanılırsa masaüstü kullanıcısı yarısı boş bir ekranla karşılaşırdı.
  const openId = ticketId ?? tickets.rows[0]?.id;
  const selected = openId ? await getCustomerTicket(locale, customerId, openId) : null;

  return { customerId, tickets, selected };
}
