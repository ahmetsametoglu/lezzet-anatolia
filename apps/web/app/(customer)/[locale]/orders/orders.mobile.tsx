'use client';

import { Link } from '@/i18n/navigation';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { ListEmpty } from '@/components/customer/ui/list-empty';
import { Icon } from '@/components/customer/ui/icons';
import { LoadMore } from '@/components/customer/ui/load-more';
import { formatPrice } from '@/lib/storefront/format';
import { OrderStatusBadge } from './components/order-status-badge';
import { ReorderNotice } from './components/reorder-notice';
// Liste `ReorderButton`ı KULLANMIYOR (meşgul durumu tüm satırlar için tek yerde), ama kelimeler
// ortak — düğmeyle aynı kaynaktan okunuyor (08.20).
import reorderCopy from './components/reorder-messages.json';
import { metaOf, summaryOf } from './orders.desktop';
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
  awaitingPayment,
  nextCursor,
  loadingMore,
  onLoadMore,
  busyOrderId,
  onReorder,
  notice,
  onDismissNotice,
}: OrdersViewProps) {
  // Ödemesi beklenen kart siparişi (07.18) — listenin başında, liste boşken de (masaüstüyle aynı kural).
  // Kart kabuğu listeninki, tonu dikkat (bal); tek eylemi ödemenin sayfası.
  const awaiting = awaitingPayment && (
    <div className="flex flex-col gap-2 rounded-[16px] border border-honey-line bg-honey-bg p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-sans text-note font-bold leading-tight text-honey">{t.awaitingPayment.title}</span>
        <span className="flex-none font-sans text-note font-bold leading-tight text-ink">{formatPrice(awaitingPayment.totalCents, locale)}</span>
      </div>
      <span className="font-sans text-micro leading-relaxed text-muted">
        {[...metaOf(awaitingPayment, t, locale, true), t.awaitingPayment.note].join(' · ')}
      </span>
      <Link
        href={{ pathname: '/checkout/[reference]', params: { reference: awaitingPayment.orderId } }}
        className={buttonClass({ variant: 'primary', size: 'sm', compact: true, fullWidth: true })}
      >
        {t.awaitingPayment.cta}
      </Link>
    </div>
  );

  if (orders.length === 0) {
    return (
      // Boş hâl KALAN ALANIN 4:6 noktasında (native kuralı, 16.08 — salt ortalama gözün üstünde
      // durur; footer'sız kısa sayfada üstte asılı buton altında krem bir deniz bırakıyordu).
      <div className="flex flex-1 flex-col px-4 py-8">
        {awaiting}
        <span className="flex-[2]" aria-hidden="true" />
        <ListEmpty icon="box"title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} />
        <span className="flex-[3]" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 py-4">
      {awaiting}
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
                compact
                fullWidth
                disabled={busyOrderId !== null}
                onClick={() => onReorder(order.id)}
              >
                {busyOrderId !== order.id && <Icon name="refresh" size={14} />}
                {busyOrderId === order.id ? reorderCopy[locale].reordering : reorderCopy[locale].reorder}
              </Button>
              <Link
                href={{ pathname: '/orders/[reference]', params: { reference: order.id } }}
                className={buttonClass({ variant: order.active ? 'primary' : 'outlineOlive', size: 'sm', compact: true, fullWidth: true })}
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
