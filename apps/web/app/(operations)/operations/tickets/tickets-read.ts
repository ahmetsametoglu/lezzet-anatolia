import type { TicketQueueFilter } from '@lezzet/database';
import { ageMinutesOf } from '@/components/operation/ui/format';
import type { TicketQueueItem } from '@/lib/ticket/ticket-types';
import type { TicketRowView } from './tickets-types';
import type { TicketFilterKey } from './tickets-url';

// Talepler ekranının OKUMA DÖNÜŞÜMLERİ (16.3) — saf fonksiyonlar, sunucu turu yok.
//
// Ayrı dosya olmalarının sebebi sınanabilirlik: çipin hangi süzgece karşılık geldiği bir KARARDIR
// ("siparişli" kapanmışları da kapsasın mı?) ve karar sayfa bileşeninin içine gömülürse sınanamaz.

/**
 * Çip → servis süzgeci.
 *
 * **"Siparişli" kapanmışları KAPSAMAZ** (`openOnly`): çip bir durum değil bir eksen seçiyor ve
 * kuyruğun beyan edilmiş odağı kapanmamış taleplerdir (`admin-talepler.md §2`: *"açık talepler
 * varsayılan odaktır"*). Kapsasaydı tek çip, aylar önce çözülmüş her siparişli talebi geri
 * getirir ve şeridin en kalabalık görünümü "yapılacak iş" gibi okunurdu.
 *
 * Süzme SUNUCUDA: talep kümesi veriyle büyür (CLAUDE.md §1), yüklenmiş sayfada süzen bir çip
 * ikinci sayfadaki satırı "yok" gösterirdi.
 */
export function toTicketFilter(f: TicketFilterKey): TicketQueueFilter {
  if (f === 'with_order') return { hasOrder: true, openOnly: true };
  // İki AI çipi (16.5): "AI'da" ŞU ANIN sorusu (ai + hibrit — cevabı insan yazmıyor) ve
  // "siparişli" ile aynı gerekçeyle kapanmışları kapsamaz; "AI yanıtladı" ise HİÇ'in sorusu —
  // kalite denetimi kapanmış talebe de bakar, o yüzden `openOnly` YOK.
  if (f === 'ai') return { handledBy: ['ai', 'hybrid'], openOnly: true };
  if (f === 'ai_answered') return { answeredByAi: true };
  return { status: f };
}

/**
 * Kuyruk satırlarına tek türetme ekler: son mesajın yaşı.
 *
 * Yaş hesabı ORTAK (`ui/format.ageMinutesOf`) — burada ikinci bir tanımı vardı ve sistem
 * ekranınınkinden ayrışmıştı: bozuk damgada biri `0` ("az önce"), öteki `null` ("ölçülemedi")
 * diyordu. Bu ekranın sözleşmesi `number` olduğu için ölçülemeyen damga burada `0`'a düşürülür —
 * karar TEK yerde ve görünür duruyor.
 */
export function toRowViews(rows: readonly TicketQueueItem[], now: number): TicketRowView[] {
  return rows.map((row) => ({ ...row, ageMinutes: ageMinutesOf(row.lastMessageAt, now) ?? 0 }));
}
