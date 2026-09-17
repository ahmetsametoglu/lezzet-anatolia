'use client';

import ordersMessages from '@lezzet/i18n/customer/orders';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { OrderStatusTag } from '@/components/customer/phone-kit/order-status-tag';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { DASHED_TOP } from '@/components/customer/phone-kit/settings-card';
import { ThumbStack } from '@/components/customer/phone-kit/thumb-stack';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { formatOrderDate, formatPrice } from '@/lib/storefront/format';
import { useLoadMore } from '@/lib/use-load-more.hook';
import { metaOf } from './orders.desktop';
import type { OrdersViewProps } from './orders-types';

/**
 * Siparişlerim'in telefon görünümü, native sipariş listesinin ikizi; kartın tamamı detaya gider, çünkü native'de de tek dokunma
 * hedefi. Ödemesi beklenen kart siparişi ve otomatik tur sınırından sonraki "daha eski siparişler" düğmesi web'e özgü.
 */
export function OrdersMobile({ t, locale, orders, awaitingPayment, nextCursor, loadingMore, onLoadMore, tailFailed }: OrdersViewProps) {
  const copy = ordersMessages[locale];
  // Kuyruk düştüyse otomatik yol kapanır: aynı düşen sayfa art arda istenmesin, söz "tekrar dene"ye geçer.
  const { ref, autoActive, loadMore } = useLoadMore({ hasMore: nextCursor !== null && !tailFailed, loading: loadingMore, onLoadMore });

  // Ödemesi beklenen kart siparişi dikkat tonunda, tek eylemi ödemenin sayfası.
  const awaiting = awaitingPayment && (
    <section className="flex flex-col gap-2.5 rounded-card border border-honey-line bg-honey-bg px-4 py-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="min-w-0 truncate font-sans text-body-sm font-bold text-honey">{t.awaitingPayment.title}</span>
        <span className="flex-none font-sans text-step-sm text-ink">{formatPrice(awaitingPayment.totalCents, locale)}</span>
      </div>
      <p className="font-sans text-helper leading-[1.6] text-muted">
        {[...metaOf(awaitingPayment, t, locale, true), t.awaitingPayment.note].join(' · ')}
      </p>
      <PrimaryButton
        shape="block"
        label={t.awaitingPayment.cta}
        href={{ pathname: '/checkout/[reference]', params: { reference: awaitingPayment.orderId } }}
      />
    </section>
  );

  if (orders.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-4.5 pb-5">
        {awaiting}
        <EmptyState
          fill
          icon={<MobileIcon name="orders" size={80} className="text-sand-600" />}
          title={copy.empty.title}
          description={copy.empty.body}
          action={<PrimaryButton href="/catalog" label={copy.empty.cta} />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4.5 pb-5">
      {awaiting}
      {orders.map((order) => {
        const reference = order.referenceNo ?? '—';
        return (
          <article
            key={order.id}
            className="relative flex flex-col gap-2.5 rounded-card bg-sand-250 px-4 py-3.5 transition-opacity active:opacity-80"
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Kartın tamamı bu bağın dokunma alanı (`after` katmanı); ekran okuyucuya tek satır gider. */}
                <Link
                  href={{ pathname: '/orders/[reference]', params: { reference: order.id } }}
                  aria-label={copy.row.open.replace('{reference}', reference)}
                  className="cursor-pointer font-sans text-body-sm font-bold text-ink after:absolute after:inset-0 after:rounded-card after:content-['']"
                >
                  {reference}
                </Link>
                <span className="font-sans text-helper text-muted">
                  {copy.row.meta.replace('{date}', formatOrderDate(order.createdAt, locale, true)).replace('{count}', String(order.itemCount))}
                </span>
              </div>
              <OrderStatusTag status={order.status} label={copy.status[order.status]} />
            </div>

            {order.thumbs.length > 0 && (
              <ThumbStack
                items={order.thumbs.map((thumb, index) => ({ key: `${thumb.name}-${index}`, name: thumb.name, image: thumb.image }))}
                more={order.moreCount > 0 ? copy.row.more.replace('{n}', String(order.moreCount)) : undefined}
              />
            )}

            <div className={`flex items-center justify-between gap-2.5 pt-2.5 ${DASHED_TOP}`}>
              <span className="font-sans text-step-sm text-ink">{formatPrice(order.totalCents, locale)}</span>
              {/* Kart zaten basılabilir; bu yazı düğme değil, nereye gidileceğini söyleyen işaret. */}
              <span aria-hidden className="font-sans text-control text-terracotta">
                {copy.row.detail}
              </span>
            </div>
          </article>
        );
      })}

      {nextCursor === null ? (
        <p className="pt-2.5 text-center font-sans text-body-sm text-muted">{copy.list.end}</p>
      ) : (
        // Nöbetçi her hâlde yerinde kalır: gözlemci bir kez kurulur (`useLoadMore` künyesi).
        <div ref={ref} className="flex justify-center pt-2.5">
          {loadingMore ? (
            <LoadingState label={copy.list.loading} />
          ) : tailFailed ? (
            <PrimaryButton label={copy.list.tailRetry} onClick={loadMore} />
          ) : autoActive ? null : (
            <SecondaryButton label={t.loadMore} shape="pill" onClick={loadMore} />
          )}
        </div>
      )}
    </div>
  );
}
