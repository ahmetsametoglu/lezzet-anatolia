import { defaultTicketHandler, ticketsChannelName } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { LiveRefresh } from '@/components/operation/ui/live-refresh';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { readCustomerContext } from '@/lib/customer/context';
import { countTicketsByStatus, countTicketsHandledByAi, getStaffTicketDetail, listTicketQueue } from '@/lib/ticket/read';
import { TicketsClient } from './tickets-client';
import { ageMinutesOf } from '@/components/operation/ui/format';
import { toRowViews, toTicketFilter } from './tickets-read';
import { parseTicketsUrl } from './tickets-url';
import type { TicketsData } from './tickets-types';

// Yalnız yönetici görür, çünkü yazışma müşteriye aynen gider ve iade kararının zemini burada kurulur. Depo süzgeci uygulanmaz:
// talep bir müşteri ilişkisidir ve deposu olmayan genel soruyu kuyruk sessizce yutardı.

interface TicketsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Talepler"
        reason="Müşteri yazışması ve iade köprüsü yönetime açıktır. Bir talebin ilerlemesi gerekiyorsa yöneticiye talebin numarasıyla bildirin."
      />
    );
  }

  const urlState = parseTicketsUrl(await searchParams);

  const [queue, counts, aiCount, defaultHandler] = await Promise.all([
    listTicketQueue(OPERATIONS_LOCALE, toTicketFilter(urlState.f), undefined, DEFAULT_PAGE_SIZE),
    countTicketsByStatus(),
    countTicketsHandledByAi(),
    defaultTicketHandler(serviceDb()),
  ]);

  /**
   * **Seçim yoksa ilk satır açılır.** Detay panosu ekranın yarısı: boş bırakmak operatöre iki
   * tıklık bir "önce bir şey seç" adımı dayatırdı.
   */
  const selectedId = urlState.t || (queue.rows[0]?.id ?? '');

  // Ürün adları operasyonun dilinde çözülür; `DEFAULT_LOCALE` müşteri yüzeyinin varsayılanıdır (`fr`).
  const detail = selectedId ? await getStaffTicketDetail(OPERATIONS_LOCALE, selectedId) : null;

  /**
   * Müşteri bağlamı talep okumasının içine konmaz, çünkü müşteri geçmişi talebin her okumasını (mobil, e-posta, AI) genişletirdi.
   * Okuma ortaktır: sosyal ekran da aynı soruyu aynı kapıdan sorar.
   */
  const context = detail ? await readCustomerContext(detail.customer.id) : null;

  // Tek an, tüm yaşlar: kuyruk satırları ve detay künyesi aynı `now`'a göre hesaplanır — ikisi ayrı
  // okunsaydı aynı damga listede ve detayda farklı yaş gösterebilirdi.
  const now = Date.now();

  const data: TicketsData = {
    rows: toRowViews(queue.rows, now),
    nextCursor: queue.nextCursor,
    counts,
    aiCount,
    defaultHandler,
    // Ölçülemeyen damga bu ekranın sözleşmesinde sayıdır; kararı `toRowViews` ile aynı yerde
    // duruyor (ortak `ageMinutesOf` `null` döner — bkz. `ui/format`).
    detail: detail && { ...detail, openedAgoMinutes: ageMinutesOf(detail.ticket.createdAt, now) ?? 0 },
    context,
  };

  return (
    <>
      {/* Müşteri ya da AI yazınca zil çalar ve sayfa sunucudan yeniden istenir. Kanal adı guard'ın arkasında üretilir, çünkü
          tahmin edilebilir bir ad oturumsuz birine desteğe mesaj düştüğünü söylerdi. */}
      <LiveRefresh channel={ticketsChannelName()} />
      <TicketsClient data={data} urlState={{ ...urlState, t: selectedId }} />
    </>
  );
}
