'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { ListEmpty } from '@/components/customer/ui/list-empty';
import { Icon } from '@/components/customer/ui/icons';
import { LoadMore } from '@/components/customer/ui/load-more';
import { formatOrderDate, formatPrice } from '@/lib/storefront/format';
import type { CustomerOrderSummary } from '@/lib/order/customer-orders';
import { orderProductNames } from '@/lib/order/order-names';
import { OrderStatusBadge } from './components/order-status-badge';
import { DesktopReorderNotice } from './components/desktop-reorder-notice';
// Liste `ReorderButton`ı kullanmıyor, çünkü meşgul durumunu bütün satırlar için tek yerde tutuyor; kelimeler yine ortak.
import ordersShared from '@lezzet/i18n/customer/orders';
import type { OrdersViewProps } from './orders-types';

/**
 * Siparişler kart ızgarası değil liste, çünkü müşteri buraya "hangisiydi" diye bakar ve dikey tarama daha hızlıdır. Sıralamayı ekran
 * yapmaz: sayfalanan listede ekranda sıralamak ikinci sayfadaki aktif siparişi birincinin üstüne zıplatırdı.
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

      {orders.map((order) => {
        // Ödeme bekleyen siparişin numarası yok ve kalemleri siparişte duruyor: tekrar edilmez, tek eylemi ödemesi.
        const pending = order.status === 'awaiting_payment';
        return (
          <div key={order.id} className="flex flex-col gap-2">
            <div
              className={[
                'flex items-center gap-5 rounded-[18px] bg-card px-6 py-4.5',
                order.active ? 'border-[1.5px] border-olive' : 'border border-sand-200',
              ].join(' ')}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-sans text-body-sm font-bold leading-tight text-ink">{order.referenceNo ?? t.pendingTitle}</span>
                  <OrderStatusBadge t={t} status={order.status} />
                </div>
                <span className="truncate font-sans text-note leading-relaxed text-muted">{summaryOf(order, t, locale)}</span>
              </div>

              <span
                className={[
                  'flex-none font-sans text-copy font-bold leading-tight',
                  order.status === 'cancelled' ? 'text-muted' : 'text-ink',
                ].join(' ')}
              >
                {formatPrice(order.totalCents, locale)}
              </span>

              {/* İptal edilmiş sipariş de tekrar edilebilir, çünkü müşteri iptal ettiği siparişi çoğu zaman yeniden vermek ister. */}
              {!pending && (
                <Button
                  variant="outlineOlive"
                  size="sm"
                  disabled={busyOrderId !== null}
                  onClick={() => onReorder(order.id)}
                  className="flex-none"
                >
                  {busyOrderId !== order.id && <Icon name="refresh" size={14} />}
                  {busyOrderId === order.id ? ordersShared[locale].reorder.working : t.reorder}
                </Button>
              )}

              <Link
                // Yolda sipariş kimliği taşınır, çünkü numara ancak onayla doğar.
                href={{ pathname: pending ? '/checkout/[reference]' : '/orders/[reference]', params: { reference: order.id } }}
                className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark"
              >
                {pending ? t.payArrow : t.detailArrow}
              </Link>
            </div>

            {notice?.orderId === order.id && <DesktopReorderNotice t={t} locale={locale} notice={notice} onDismiss={onDismissNotice} />}
          </div>
        );
      })}

      <LoadMore hasMore={nextCursor !== null} loading={loadingMore} onLoadMore={onLoadMore} label={t.loadMore} loadingLabel={t.loading} />
    </div>
  );
}

interface EmptyOrdersProps {
  t: OrdersViewProps['t'];
}

/** Boş durum — tasarımın kartı: ikon, başlık, açıklama, kataloğa davet. */
function EmptyOrders({ t }: EmptyOrdersProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-12 py-10">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>
      <div className="mx-auto w-[340px] rounded-[16px] bg-cream p-6">
        <ListEmpty icon="box" title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} />
      </div>
    </div>
  );
}

/** Ürün adı yoksa o parça yazılmaz, çünkü "3 kalem · " diye biten satır eksik veriyi eksik gösterir; ürün silinmiş olabilir. */
export function summaryOf(
  order: CustomerOrderSummary,
  t: OrdersViewProps['t'],
  locale: OrdersViewProps['locale'],
  compact = false,
): string {
  const parts = metaOf(order, t, locale, compact);
  const names = orderProductNames(order);
  if (names.length > 0) parts.push(names.join(', '));
  return parts.join(' · ');
}

/** Satırın tarih ve kalem sayısı parçaları. */
function metaOf(
  order: Pick<CustomerOrderSummary, 'createdAt' | 'itemCount'>,
  t: OrdersViewProps['t'],
  locale: OrdersViewProps['locale'],
  compact = false,
): string[] {
  return [formatOrderDate(order.createdAt, locale, compact), t.itemCount.replace('{count}', String(order.itemCount))];
}
