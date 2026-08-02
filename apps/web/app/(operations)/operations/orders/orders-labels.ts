import { ORDER_STATUS_LABELS, type OrderStatus, type PaymentMethod } from '@lezzet/types';
import { paymentTone, type OpsTone } from '@/components/operation/ui/tone';
import type { OrderCountsView, OrderRow } from './orders-types';

// Sipariş satırının SÖZLERİ — durum rengi, tahsilat cümlesi, teslim yazısı. Tek yerde durur ki
// masaüstü tablosu ile mobil kart aynı satıra aynı şeyi desin.
//
// Durum ADLARI burada yeniden yazılmaz: `ORDER_STATUS_LABELS` (types) tek kaynaktır. Buradaki tek
// karar RENK — yani "bu durum iyi mi, bekliyor mu, sorunlu mu".

/**
 * Durumun tonu. Yolculuğun neresinde olduğunu söyler: mavi = başladı/onaylandı, amber = elimizde iş
 * var, olive = tamamlandı, kırmızı = geri döndü, nötr = kapandı.
 */
const STATUS_TONE: Record<OrderStatus, OpsTone> = {
  draft: 'neutral',
  confirmed: 'blue',
  preparing: 'amber',
  ready: 'amber',
  out_for_delivery: 'slate',
  delivered: 'olive',
  completed: 'olive',
  cancelled: 'neutral',
  returned: 'red',
};

export function statusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status];
}

export function statusTone(status: OrderStatus): OpsTone {
  return STATUS_TONE[status];
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'online',
  cash: 'nakit',
  card: 'kart',
  cheque: 'çek',
  bank_transfer: 'havale',
};

/**
 * Tahsilat cümlesi — tasarımın sağdaki sütunu. Üç hâl vardır ve üçü farklı bir şey söyler:
 * para geldi · kapıda alınacak · vadesi var (ve belki geçti).
 *
 * Tutar YALNIZ tahsil edilecekse yazılır: ödenmiş siparişte rakam tekrar etmek, sütunu okunmaz
 * yapardı — o satırda karar yok.
 */
export function paymentText(row: OrderRow, money: (cents: number) => string): string {
  const { status, method, onAccount, dueDate, openCents } = row.payment;
  const methodText = method ? ` · ${METHOD_LABELS[method]}` : '';

  if (status === 'refunded') return 'İade edildi';
  if (status === 'paid') return `Ödendi${methodText}`;
  if (onAccount) return `Vade ${dueDate ?? '—'}${row.payment.overdue ? ' · geçti' : ''}`;
  const prefix = status === 'partial' ? 'Kalan' : 'Kapıda';
  return `${prefix} ${money(openCents)}${methodText}`;
}

/**
 * Tahsilat tonu — kural ORTAK (`ui/tone.ts`), burada yalnız satırdan girdi çıkarılıyor.
 *
 * Gecikme bu ekranda BİLİNİYOR (`payment.overdue`) ve geçiliyor; müşteri panelinde bilinmiyor ve
 * orada varsayılan `false` işliyor. Kuralın kendisi tek yerde durduğu için ikisi ayrışamaz.
 */
const rowPaymentTone = (row: OrderRow): OpsTone => paymentTone(row.payment.status, row.payment.overdue);

/**
 * Tahsilat tonunun METİN SINIFI — tabloda, mobil kartta ve hızlı bakışta AYNI cümle aynı renkte
 * okunsun diye tek yerde.
 *
 * Üç yerde elle yazılmıştı ve ikisinde `neutral` dalı yoktu: iade edilmiş sipariş masaüstünde
 * sönük gri, telefonda amber görünüyordu — kapanmış bir kayıt "bekleyen iş" rengiyle.
 */
export function paymentToneClass(row: OrderRow): string {
  switch (rowPaymentTone(row)) {
    case 'red':
      return 'font-semibold text-ops-red';
    case 'olive':
      return 'text-ops-olive-dark';
    case 'neutral':
      return 'text-ops-muted';
    default:
      return 'text-ops-amber-dark';
  }
}

/** Teslim yazısı — rota gününde tarih, kargoda "Kargo"; ikinci satırda semt. */
export function deliveryText(row: OrderRow, shortDate: (d: string) => string): { main: string; meta: string } {
  const main = row.deliveryType === 'shipping' ? 'Kargo' : row.deliveryDate ? shortDate(row.deliveryDate) : 'Gün yok';
  const meta = row.deliveryType === 'shipping' ? (row.deliveryArea || 'adres kopyası yok') : (row.courierName ?? row.deliveryArea);
  return { main, meta };
}

/**
 * Satırın içeriği — "3 kalem · 7 adet". Sistemin BİLDİĞİ gerçek yazılır; tasarımdaki "2 paket ·
 * soğuk zincir" gibi serbest metin bir yerden türetilemez, uydurulmaz.
 */
export function contentText(row: OrderRow): string {
  const base = `${row.itemCount} kalem · ${row.unitCount} adet`;
  return row.hasBundle ? `${base} · paketli` : base;
}

/**
 * Başlık altı özeti — tasarımın cümlesi: kaç sipariş, kaçı elimizde, kaçı para bekliyor. Üçüncüsü
 * "yolda" değil TAHSİLAT: yolda olan zaten kuryenin işi, tahsilat bekleyen buranın.
 *
 * Masaüstü ve mobil AYNI cümleyi kurar — iki yerde yazılsaydı biri "depoda", öteki "hazırlanıyor"
 * derdi ve aynı ekran iki dil konuşurdu.
 */
export function summaryText(counts: OrderCountsView): string {
  const preparing = (counts.byStatus.preparing ?? 0) + (counts.byStatus.ready ?? 0);
  return `${counts.total} sipariş · ${preparing} hazırlanıyor · ${counts.codCount} tahsilat bekliyor`;
}
