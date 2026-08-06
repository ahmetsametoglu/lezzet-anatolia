import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { countTicketsByStatus, getStaffTicketDetail, listTicketQueue } from '@/lib/ticket/read';
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

  const [queue, counts] = await Promise.all([
    listTicketQueue(OPERATIONS_LOCALE, toTicketFilter(urlState.f), undefined, DEFAULT_PAGE_SIZE),
    countTicketsByStatus(),
  ]);

  /**
   * **Seçim yoksa ilk satır açılır.** Detay panosu ekranın yarısı: boş bırakmak operatöre iki
   * tıklık bir "önce bir şey seç" adımı dayatırdı.
   */
  const selectedId = urlState.t || (queue.rows[0]?.id ?? '');

  // Ürün adları TÜRKÇE çözülür — operasyon yüzeyinin dili (CLAUDE.md §2) ve öteki ekranların da
  // yaptığı bu (Fiyatlar, Stok: `resolveLocalizedText` kanonik sırayla, TR önce).
  //
  // Burada bir tur `DEFAULT_LOCALE` yazılıydı ve künyesi "yüzeyin geri kalanıyla aynı dil" diyordu;
  // ikisi de yanlıştı — o sabit `'fr'`, yani MÜŞTERİ yüzeyinin varsayılanı. Sonuç: aynı ürün
  // Talepler'de Fransızca, Fiyatlar'da Türkçe görünüyordu. Sabitin adı "varsayılan" olduğu için
  // doğru duruyordu; hangi yüzeyin varsayılanı olduğu sorulmamıştı (03.08).
  const detail = selectedId ? await getStaffTicketDetail(OPERATIONS_LOCALE, selectedId) : null;

  // Tek an, tüm yaşlar: kuyruk satırları ve detay künyesi aynı `now`'a göre hesaplanır — ikisi ayrı
  // okunsaydı aynı damga listede ve detayda farklı yaş gösterebilirdi.
  const now = Date.now();

  const data: TicketsData = {
    rows: toRowViews(queue.rows, now),
    nextCursor: queue.nextCursor,
    counts,
    detail: detail && { ...detail, openedAgoMinutes: ageMinutesOf(detail.ticket.createdAt, now) },
  };

  return <TicketsClient data={data} urlState={{ ...urlState, t: selectedId }} />;
}
