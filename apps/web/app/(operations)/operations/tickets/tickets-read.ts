import type { TicketQueueFilter } from '@lezzet/database';
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
  return f === 'with_order' ? { hasOrder: true, openOnly: true } : { status: f };
}

/**
 * Bir damganın dakika cinsinden yaşı.
 *
 * `now` dışarıdan gelir — sayfa onu BİR KEZ okur ve ekrandaki bütün yaşlar aynı ana göre hesaplanır.
 * İçeride okunsaydı listenin başı ile sonu (ve detay künyesi) farklı anlara göre çıkardı; fark
 * küçük ama ölçüt kayması gerçek — aynı damga iki yerde iki farklı yaş gösterebilirdi.
 *
 * Negatife DÜŞMEZ: ileri tarihli bir damga (saat kayması) "-3 dk önce" diye okunurdu.
 */
export function ageMinutesOf(iso: string, now: number): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, (now - t) / 60_000);
}

/** Kuyruk satırlarına tek türetme ekler: son mesajın yaşı. */
export function toRowViews(rows: readonly TicketQueueItem[], now: number): TicketRowView[] {
  return rows.map((row) => ({ ...row, ageMinutes: ageMinutesOf(row.lastMessageAt, now) }));
}
