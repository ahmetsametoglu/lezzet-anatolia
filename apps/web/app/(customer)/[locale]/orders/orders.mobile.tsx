'use client';

import { Link } from '@/i18n/navigation';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { LoadMore } from '@/components/customer/ui/load-more';
import { formatPrice } from '@/lib/storefront/format';
import { OrderStatusBadge } from './components/order-status-badge';
import { ReorderNotice } from './components/reorder-notice';
import { summaryOf } from './orders.desktop';
import type { OrdersViewProps } from './orders-types';

/**
 * Siparişlerim — mobil (tasarım: "Siparisler Mobil"). Masaüstünün dar hâli DEĞİL, yapıca farklı:
 * satır şerit olmaktan çıkıp **kart** oluyor ve aksiyonlar alta, yan yana iki tam genişlik düğmeye
 * iniyor. Tasarımın notu bunu açıkça istiyor — B2B rutini tek elle yürüyor, "↻ Tekrar sipariş"
 * kartın en erişilebilir aksiyonu olmalı.
 *
 * Tutar da özet satırının içine giriyor ("22 Tem 2026 · 3 kalem · 103,20 €"): dar ekranda ayrı bir
 * tutar sütunu, adı kırpardı.
 *
 * Özet metni masaüstüyle AYNI fonksiyondan geliyor (`summaryOf`) — iki kopya, bir gün ayrışan iki
 * cümle demekti. Farklılaşan tek şey `compact` (kısa ay adı).
 */
export function OrdersMobile({
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
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-4 py-8 text-center">
        <span className="text-[34px] leading-none">📦</span>
        <span className="font-serif text-h3 font-semibold leading-tight text-ink">{t.empty.title}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.empty.body}</span>
        <Link href="/catalog" className={buttonClass({ className: 'mt-1' })}>
          {t.empty.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 py-4">
      {orders.map((order) => (
        <div key={order.id} className="flex flex-col gap-2">
          <div
            className={[
              'flex flex-col gap-2 rounded-[16px] bg-card p-3.5',
              order.active ? 'border-[1.5px] border-olive' : 'border border-sand-200',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-sans text-note font-bold leading-tight text-ink">{order.referenceNo ?? '—'}</span>
              <OrderStatusBadge t={t} status={order.status} compact />
            </div>

            <span className="font-sans text-micro leading-relaxed text-muted">
              {summaryOf(order, t, locale, true)} · {formatPrice(order.totalCents, locale)}
            </span>

            <div className="flex gap-2">
              <Button
                variant="outlineOlive"
                size="sm"
                fullWidth
                disabled={busyOrderId !== null}
                onClick={() => onReorder(order.id)}
              >
                {busyOrderId === order.id ? t.reordering : t.reorder}
              </Button>
              <Link
                href={{ pathname: '/orders/[reference]', params: { reference: order.id } }}
                className={buttonClass({ variant: order.active ? 'primary' : 'outlineOlive', size: 'sm', fullWidth: true })}
              >
                {t.detail}
              </Link>
            </div>
          </div>

          {notice?.orderId === order.id && <ReorderNotice t={t} notice={notice} onDismiss={onDismissNotice} compact />}
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
