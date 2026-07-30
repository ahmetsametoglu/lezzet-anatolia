'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { OrderStatusBadge } from '../components/order-status-badge';
import { DeliveryCard, HelpCard, ItemsCard, SummaryCard } from './components/detail-sections';
import type { DetailViewProps } from './detail-types';

/**
 * Sipariş detay — masaüstü. Tasarımın düzeni: başlık şeridi (referans + durum + tekrar sipariş),
 * altında iki sütun — solda kalemler (asıl içerik, geniş), sağda teslimat + tutar + yardım.
 */
export function DetailDesktop({ t, listT, locale, order, busy, onReorder }: DetailViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-12 py-10">
      <Link href="/orders" className="cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
        {t.back}
      </Link>

      <div className="flex items-center gap-4">
        <h1 className="font-serif text-h1 font-semibold leading-tight text-ink">{order.referenceNo ?? '—'}</h1>
        <OrderStatusBadge t={listT} status={order.status} />
        <Button variant="outlineOlive" size="sm" disabled={busy} onClick={onReorder} className="ml-auto flex-none">
          {busy ? t.reordering : t.reorder}
        </Button>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-5">
        <ItemsCard t={t} locale={locale} order={order} />
        <div className="flex flex-col gap-5">
          <DeliveryCard t={t} locale={locale} order={order} />
          <SummaryCard t={t} locale={locale} order={order} />
          <HelpCard t={t} />
        </div>
      </div>
    </div>
  );
}
