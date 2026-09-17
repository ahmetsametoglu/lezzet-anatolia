'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { ListEmpty } from '@/components/customer/ui/list-empty';
import { Icon } from '@/components/customer/ui/icons';
import { LoadMore } from '@/components/customer/ui/load-more';
import { formatOrderDate, formatPrice } from '@/lib/storefront/format';
import type { ReactNode } from 'react';
import type { CustomerAwaitingPayment, CustomerOrderSummary } from '@/lib/order/customer-orders';
import { orderProductNames } from '@/lib/order/order-names';
import { OrderStatusBadge } from './components/order-status-badge';
import { DesktopReorderNotice } from './components/desktop-reorder-notice';
// Liste `ReorderButton`ı kullanmıyor, çünkü meşgul durumunu bütün satırlar için tek yerde tutuyor; kelimeler yine ortak.
import reorderCopy from './components/reorder-messages.json';
import type { OrdersViewProps } from './orders-types';

/**
 * Siparişler kart ızgarası değil liste, çünkü müşteri buraya "hangisiydi" diye bakar ve dikey tarama daha hızlıdır. Sıralamayı ekran
 * yapmaz: sayfalanan listede ekranda sıralamak ikinci sayfadaki aktif siparişi birincinin üstüne zıplatırdı.
 */
export function OrdersDesktop({
  t,
  locale,
  orders,
  awaitingPayment,
  nextCursor,
  loadingMore,
  onLoadMore,
  busyOrderId,
  onReorder,
  notice,
  onDismissNotice,
}: OrdersViewProps) {
  const awaiting = awaitingPayment && <AwaitingPaymentRow t={t} locale={locale} awaiting={awaitingPayment} />;
  if (orders.length === 0) return <EmptyOrders t={t} awaiting={awaiting} />;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-12 py-10">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>

      {/* Ödemesi beklenen sipariş listenin başında ayrı alan, çünkü numarası yok ve sayfalanan listeye karışmamalı. */}
      {awaiting}

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

            {/* İptal edilmiş sipariş de tekrar edilebilir, çünkü müşteri iptal ettiği siparişi çoğu zaman yeniden vermek ister. */}
            <Button
              variant="outlineOlive"
              size="sm"
              disabled={busyOrderId !== null}
              onClick={() => onReorder(order.id)}
              className="flex-none"
            >
              {busyOrderId !== order.id && <Icon name="refresh" size={14} />}
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

          {notice?.orderId === order.id && <DesktopReorderNotice t={t} notice={notice} onDismiss={onDismissNotice} />}
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

interface EmptyOrdersProps {
  t: OrdersViewProps['t'];
  /** Ödemesi beklenen siparişin satırı; liste boşken de başlığın altında durur. */
  awaiting: ReactNode;
}

/** Boş durum — tasarımın kartı: ikon, başlık, açıklama, kataloğa davet. */
function EmptyOrders({ t, awaiting }: EmptyOrdersProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-12 py-10">
      <h1 className="font-serif text-page-title leading-tight text-ink">{t.title}</h1>
      {awaiting}
      <div className="mx-auto w-[340px] rounded-[16px] bg-cream p-6">
        <ListEmpty icon="box"title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} />
      </div>
    </div>
  );
}

/** Ürün adı yoksa o parça yazılmaz, çünkü "3 kalem · " diye biten satır eksik veriyi eksik gösterir; ürün silinmiş olabilir. */
export function summaryOf(order: CustomerOrderSummary, t: OrdersViewProps['t'], locale: OrdersViewProps['locale'], compact = false): string {
  const parts = metaOf(order, t, locale, compact);
  const names = orderProductNames(order);
  if (names.length > 0) parts.push(names.join(', '));
  return parts.join(' · ');
}

/** Ödemesi beklenen siparişin satırı da bu iki parçayla başlar ama ürün adı taşımaz, çünkü onun sorusu "ödemem ne oldu". */
export function metaOf(
  order: Pick<CustomerOrderSummary, 'createdAt' | 'itemCount'>,
  t: OrdersViewProps['t'],
  locale: OrdersViewProps['locale'],
  compact = false,
): string[] {
  return [formatOrderDate(order.createdAt, locale, compact), t.itemCount.replace('{count}', String(order.itemCount))];
}

interface AwaitingPaymentRowProps {
  t: OrdersViewProps['t'];
  locale: OrdersViewProps['locale'];
  awaiting: CustomerAwaitingPayment;
}

/**
 * Ödemesi beklenen kart siparişi dikkat tonunda ve sipariş satırı değil: numarası yok, tekrar edilemez. Tek eylemi ödemenin sayfası,
 * çünkü ödemenin canlı durumu orada okunur.
 */
function AwaitingPaymentRow({ t, locale, awaiting }: AwaitingPaymentRowProps) {
  return (
    <div className="flex items-center gap-5 rounded-[18px] border border-honey-line bg-honey-bg px-6 py-4.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-sans text-body-sm font-bold leading-tight text-honey">{t.awaitingPayment.title}</span>
        <span className="truncate font-sans text-note leading-relaxed text-muted">
          {[...metaOf(awaiting, t, locale), t.awaitingPayment.note].join(' · ')}
        </span>
      </div>
      <span className="flex-none font-sans text-body font-bold leading-tight text-ink">{formatPrice(awaiting.totalCents, locale)}</span>
      <Link
        href={{ pathname: '/checkout/[reference]', params: { reference: awaiting.orderId } }}
        className="flex-none cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark"
      >
        {t.awaitingPayment.ctaArrow}
      </Link>
    </div>
  );
}
