'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { OrderStatusBadge } from '../components/order-status-badge';
import { DeliveryCard, HelpCard, ItemsCard, SummaryCard } from './components/detail-sections';
import type { DetailViewProps } from './detail-types';

/**
 * Sipariş detay — mobil. Tek sütun ve **sıra farklı**: müşteri buraya çoğunlukla bildirimden gelir,
 * ilk sorusu "nerede" — o yüzden teslimat kalemlerden ÖNCE. Masaüstünde teslimat sağ sütunda,
 * çünkü orada ikisi aynı anda görünüyor ve sıra bir öncelik iddiası taşımıyor.
 *
 * Tekrar sipariş düğmesi tam genişlik: dar ekranda başlık şeridine sığmaz ve tasarımın notu bu
 * aksiyonun tek elle erişilebilir olmasını istiyor.
 */
export function DetailMobile({ t, listT, locale, order, busy, onReorder }: DetailViewProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Link href="/orders" className="cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
        {t.back}
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate font-serif text-h3 font-semibold leading-tight text-ink">{order.referenceNo ?? '—'}</h1>
        <OrderStatusBadge t={listT} status={order.status} compact />
      </div>

      <DeliveryCard t={t} locale={locale} order={order} />
      <ItemsCard t={t} locale={locale} order={order} />
      <SummaryCard t={t} locale={locale} order={order} />

      <Button variant="outlineOlive" size="sm" fullWidth disabled={busy} onClick={onReorder}>
        {busy ? t.reordering : t.reorder}
      </Button>

      <HelpCard t={t} />
    </div>
  );
}
