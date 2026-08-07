// Teslimat sayfasının URL sözleşmesi (09.15).
//
// Sayfa GÜN üzerine kuruludur (tasarım §2) ve gün adreste durur: sevkiyatçı "yarının listesi"ni
// birine gönderebilmeli, tazelediğinde aynı günde kalmalı. Kuryenin dalında URL durumu YOKTU ve
// hâlâ yok — onun tek bir görünümü var (bugünün durakları).

/** Sayfanın iki yüzü — tasarım ikisini tek sayfada, iki sekmede topluyor. */
export const DELIVERY_TABS = ['plan', 'routes'] as const;
export type DeliveryTab = (typeof DELIVERY_TABS)[number];

interface DeliveriesUrlState {
  /** ISO `YYYY-MM-DD`. Yoksa bugün. */
  date: string;
  /**
   * Kimin gözünden bakılıyor. Varsayılan rolden türer — bu parametre yalnız **hem yönetici hem
   * kurye** olan kişinin kendi gününe geçebilmesi için var (rol iki şapkayı da taşıyabiliyor,
   * `admin` + `courier` sık bir bileşim).
   */
  view: 'dispatch' | 'mine' | null;
  /** `plan` günün çıkışları · `routes` güzergâh kurulumu. Varsayılan `plan`: günlük iş odur. */
  tab: DeliveryTab;
  /** Rotalar sekmesinde seçili güzergâh. Adreste durur: bir rotanın bağlantısı paylaşılabilmeli. */
  routeId: string | null;
}

/**
 * Tarih AYRIŞTIRILMAZ, DOĞRULANIR: `new Date(x)` bozuk girdide "Invalid Date" üretip ekranı sessizce
 * boş bir güne düşürürdü. Biçimi tutmayan değer yok sayılır ve bugüne dönülür — adres bozuksa
 * ekranın cevabı "bugün"dür, "hiçbir gün" değil.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDeliveriesUrl(params: Record<string, string | string[] | undefined>, today: string): DeliveriesUrlState {
  const raw = typeof params.d === 'string' ? params.d : undefined;
  const view = params.view === 'mine' ? 'mine' : params.view === 'dispatch' ? 'dispatch' : null;
  const tab = params.tab === 'routes' ? 'routes' : 'plan';
  const routeId = typeof params.route === 'string' ? params.route : null;
  return { date: raw && ISO_DATE.test(raw) && isRealDate(raw) ? raw : today, view, tab, routeId };
}

/** `2026-02-31` biçimi tutar ama gün yoktur — takvim de doğrulanmalı. */
function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Bir günü gün sayısı kadar kaydırır — takvim sınırlarını `Date` çözer, elle aritmetik yok. */
export function shiftDay(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const shifted = new Date(year, month - 1, day + days);
  return toIsoDate(shifted);
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "7 Ağu Cum" — gün seçicinin okunur etiketi. Yıl YOK: gün seçici hep yakın günlerde dolaşır. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Bugün';
  if (iso === shiftDay(today, 1)) return 'Yarın';
  if (iso === shiftDay(today, -1)) return 'Dün';
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
}
