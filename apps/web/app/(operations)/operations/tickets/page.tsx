import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import { guarded, requireAdmin } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { countOpenTickets, getStaffTicketDetail, listTicketQueue } from '@/lib/ticket/read';
import { TicketsClient } from './tickets-client';
import { ageMinutesOf, toRowViews, toTicketFilter } from './tickets-read';
import { parseTicketsUrl } from './tickets-url';
import type { TicketsData } from './tickets-types';

// Talepler / şikâyetler (16.3) — müşteri talebinin tek kuyruğu, yazışması ve iade köprüsü.
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// `admin-talepler.md §6` bu ekranı yalnız admin rolüne açıyor. Depo ve kurye görmez: yazışma
// müşteriye AYNEN gidiyor ve iade kararının zemini burada kuruluyor.
//
// ── DEPO BAĞLAMI BU SAYFAYI DARALTMAZ ────────────────────────────────────────
// Talep bir müşteri ilişkisidir, bir depo işi değil: aynı müşterinin iki deposundan gelen iki
// siparişi tek bir şikâyette anılabilir. Depo süzgeci konsaydı, kuyruk deposu olmayan talepleri
// (genel soru) sessizce yutardı.
//
// ── DETAY SUNUCUDA OKUNUR ────────────────────────────────────────────────────
// Seçili talep adreste (`?t=`), yani okuması burada. İstemcide tutulsaydı her tıklama bir istemci
// turu + ikinci bir yazışma çağrısı olurdu; üstelik bir talebin bağlantısı paylaşılamazdı.

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
  const device = await detectDevice();

  const [queue, openCount] = await Promise.all([
    listTicketQueue(toTicketFilter(urlState.f), undefined, DEFAULT_PAGE_SIZE),
    countOpenTickets(),
  ]);

  /**
   * **Seçim yoksa masaüstünde ilk satır açılır, telefonda açılmaz.**
   *
   * Masaüstünde detay panosu ekranın yarısı: boş bırakmak operatöre iki tıklık bir "önce bir şey
   * seç" adımı dayatırdı. Telefonda ise detay bir alt tabakadır — kendiliğinden açılsaydı ekran
   * kuyruğu hiç göstermeden bir talebin üstüne düşerdi.
   *
   * Ayrım sunucuda yapılıyor çünkü asıl kazanç OKUMANIN kendisi: telefonda kimse bakmayacakken
   * beş sorgu atmanın karşılığı yok.
   */
  const selectedId = urlState.t || (device === 'mobile' ? '' : (queue.rows[0]?.id ?? ''));

  // Ürün adları operasyon yüzeyinin geri kalanıyla AYNI dilde çözülür (`DEFAULT_LOCALE`): kalem
  // adları katalogda çok dilli duruyor ve ekran hangisini göstereceğini kendi uydurmamalı.
  const detail = selectedId ? await getStaffTicketDetail(DEFAULT_LOCALE, selectedId) : null;

  // Tek an, tüm yaşlar: kuyruk satırları ve detay künyesi aynı `now`'a göre hesaplanır — ikisi ayrı
  // okunsaydı aynı damga listede ve detayda farklı yaş gösterebilirdi.
  const now = Date.now();

  const data: TicketsData = {
    rows: toRowViews(queue.rows, now),
    nextCursor: queue.nextCursor,
    openCount,
    detail: detail && { ...detail, openedAgoMinutes: ageMinutesOf(detail.ticket.createdAt, now) },
  };

  return <TicketsClient data={data} device={device} urlState={{ ...urlState, t: selectedId }} />;
}
