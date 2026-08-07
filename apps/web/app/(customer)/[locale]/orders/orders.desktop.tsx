'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { ListEmpty } from '@/components/customer/ui/list-empty';
import { LoadMore } from '@/components/customer/ui/load-more';
import { formatOrderDate, formatPrice } from '@/lib/storefront/format';
import type { CustomerOrderSummary } from '@/lib/order/customer-orders';
import { OrderStatusBadge } from './components/order-status-badge';
import { ReorderNotice } from './components/reorder-notice';
// Liste `ReorderButton`ı KULLANMIYOR (kendi meşgul durumunu tüm satırlar için tek yerde tutuyor),
// ama kelimeler ortak — düğmeyle aynı kaynaktan okunuyor (08.20).
import reorderCopy from './components/reorder-messages.json';
import type { OrdersViewProps } from './orders-types';

/**
 * Siparişlerim — masaüstü (tasarım: `Musteri - Siparisler.dc.html`, "Siparisler Web").
 *
 * Satır TEK BİR ŞERİTTİR: solda kimlik + özet, sağda tutar → tekrar sipariş → detay. Tasarım kart
 * ızgarası değil liste seçmiş, çünkü müşteri buraya "hangisiydi" diye bakar — dikey tarama yatay
 * ızgaradan hızlıdır.
 *
 * **Aktif sipariş yeşil çerçeveyle ayrışır** ve listenin başındadır. Sıralamayı ekran YAPMAZ:
 * sorgu zaten en yeniyi öne alıyor ve aktif sipariş doğası gereği en yenidir. Ekranda ayrıca
 * sıralasaydık, sayfalanan listede ikinci sayfadaki bir "aktif" sipariş birinci sayfanın üstüne
 * zıplar ve kaydırma sırası bozulurdu.
 */
export function OrdersDesktop({
  t,
  locale,
  orders,
  nextCursor,
  loadingMore,
  onLoadMore,
  busyOrderId,
  onReorder,
  notice,
  onDismissNotice,
}: OrdersViewProps) {
  if (orders.length === 0) return <EmptyOrders t={t} />;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-12 py-10">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>

      {orders.map((order) => (
        <div key={order.id} className="flex flex-col gap-2">
          <div
            className={[
              'flex items-center gap-5 rounded-[18px] bg-card px-6 py-4.5',
              order.active ? 'border-[1.5px] border-olive' : 'border border-sand-200',
            ].join(' ')}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <span className="font-sans text-body-sm font-bold leading-tight text-ink">{order.referenceNo ?? '—'}</span>
                <OrderStatusBadge t={t} status={order.status} />
              </div>
              <span className="truncate font-sans text-note leading-relaxed text-muted">{summaryOf(order, t, locale)}</span>
            </div>

            <span
              className={[
                'flex-none font-sans text-body font-bold leading-tight',
                order.status === 'cancelled' ? 'text-muted' : 'text-ink',
              ].join(' ')}
            >
              {formatPrice(order.totalCents, locale)}
            </span>

            {/* İptal edilmiş sipariş de tekrar edilebilir (tasarımın etkileşim sözleşmesi): müşteri
                iptal ettiği siparişi çoğu zaman yeniden vermek ister. */}
            <Button
              variant="outlineOlive"
              size="sm"
              disabled={busyOrderId !== null}
              onClick={() => onReorder(order.id)}
              className="flex-none"
            >
              {busyOrderId === order.id ? reorderCopy[locale].reordering : reorderCopy[locale].reorder}
            </Button>

            <Link
              // Yolda taşınan kimlik SİPARİŞ KİMLİĞİDİR, referans numarası değil — `/checkout/[reference]`
              // ile aynı karar: numara ancak onayla doğuyor ve `getWithItems` kimlikle okuyor.
              href={{ pathname: '/orders/[reference]', params: { reference: order.id } }}
              className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark"
            >
              {t.detailArrow}
            </Link>
          </div>

          {notice?.orderId === order.id && <ReorderNotice t={t} notice={notice} onDismiss={onDismissNotice} />}
        </div>
      ))}

      <LoadMore
        hasMore={nextCursor !== null}
        loading={loadingMore}
        onLoadMore={onLoadMore}
        label={t.loadMore}
        loadingLabel={t.loading}
      />
    </div>
  );
}

/** Boş durum — tasarımın kartı: ikon, başlık, açıklama, kataloğa davet. */
function EmptyOrders({ t }: { t: OrdersViewProps['t'] }) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-12 py-10">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>
      <div className="mx-auto w-[340px] rounded-[16px] bg-cream p-6">
        <ListEmpty icon="📦" title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} />
      </div>
    </div>
  );
}

/**
 * Satırın alt yazısı: "22 Temmuz 2026 · 3 kalem · Baklava, Gözleme, Bayram Sofrası".
 *
 * Ürün adı YOKSA o parça hiç yazılmaz — "3 kalem · " diye biten bir satır, eksik veriyi eksik
 * gösterir. Ürün silinmiş olabilir; kalem sayısı yine doğrudur.
 */
export function summaryOf(order: CustomerOrderSummary, t: OrdersViewProps['t'], locale: OrdersViewProps['locale'], compact = false): string {
  const parts = [formatOrderDate(order.createdAt, locale, compact), t.itemCount.replace('{count}', String(order.itemCount))];
  if (order.productNames.length > 0) parts.push(order.productNames.join(', '));
  return parts.join(' · ');
}
