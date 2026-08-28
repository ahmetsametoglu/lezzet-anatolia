'use client';

import { formatOrderDate } from '@/lib/storefront/format';
import { OrderStatusBadge } from '../components/order-status-badge';
import { DeliveryCard, FeedbackInviteCard, HelpCard, ItemsCard, SummaryCard, TimelineCard } from './components/detail-sections';
import type { DetailViewProps } from './detail-types';

/**
 * Sipariş detay — masaüstü (tasarım: `Musteri - Siparis Detay.dc.html` · "Siparis Detay Web").
 *
 * Düzen tasarımın kendisi: **1.5fr / 1fr iki sütun.** Solda başlık satırı → zaman çizgisi →
 * kalemler; sağda teslimat → tutar → "bir sorun mu var". Sıra bir öncelik iddiası: müşterinin ilk
 * sorusu "nerede" (çizgi), ikincisi "ne aldım" (kalemler); tutar sağda, çünkü onay ekranında zaten
 * bir kez görülmüş bir bilgi.
 *
 * Başlık satırı `LZA-2451 · 22 Temmuz 2026 · ● Yolda` — üçü BASELINE hizalı, tasarımda öyle.
 * **"↻ Tekrar sipariş" bu sayfada DEĞİL, `SiteFrame`'in hesap başlığında** (08.14) — tasarımda
 * logo ve "← Siparişlerim" ile aynı çubukta duruyor.
 */
export function DetailDesktop({ t, listT, locale, order, feedbackInvite }: DetailViewProps) {
  return (
      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[1.5fr_1fr] items-start gap-9 px-12 py-8">
      <div className="flex flex-col gap-4.5">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="font-serif text-page-title leading-tight text-ink">{order.referenceNo ?? '—'}</h1>
          <span className="font-sans text-note leading-tight text-muted">{formatOrderDate(order.createdAt, locale)}</span>
          <OrderStatusBadge t={listT} status={order.status} />
        </div>

        <TimelineCard t={t} locale={locale} order={order} />
        <ItemsCard t={t} locale={locale} order={order} title={t.itemsTitle} />
      </div>

      <div className="flex flex-col gap-3.5">
        <DeliveryCard t={t} locale={locale} order={order} title={t.deliveryTitle} />
        <SummaryCard t={t} locale={locale} order={order} title={t.amountTitle} />
        {/* Teşvik özetin ALTINDA (native ile aynı sıra): müşteri ne aldığını ve ne ödediğini
            gördükten sonra davet edilir — yardım kartından önce, çünkü bu bir sorun değil davet. */}
        <FeedbackInviteCard t={t} invite={feedbackInvite} />
        <HelpCard t={t} order={order} />
      </div>
    </div>
  );
}
