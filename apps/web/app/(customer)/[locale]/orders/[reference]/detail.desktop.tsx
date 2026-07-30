'use client';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { formatOrderDate } from '@/lib/storefront/format';
import { OrderStatusBadge } from '../components/order-status-badge';
import { DeliveryCard, HelpCard, ItemsCard, SummaryCard, TimelineCard } from './components/detail-sections';
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
 * **"↻ Tekrar sipariş" bu satırda DEĞİL, sayfanın üst şeridinde** (tasarımın başlık çubuğu).
 */
export function DetailDesktop({ t, listT, locale, order, busy, onReorder }: DetailViewProps) {
  return (
    <>
      {/* BEKLEYEN(08.14): tasarımda bu şerit BAŞLIĞIN İÇİNDE — logo + "← Siparişlerim" + sağda
          "↻ Tekrar sipariş". Hesap alanının kendi başlığı var (`Hesabım · Siparişlerim ·
          Taleplerim` + "← Kataloğa dön") ve `SiteFrame` bugün yalnız vitrin başlığını çiziyor.
          O çerçeve varyantı açılana kadar şerit sayfanın en üstünde duruyor: içerik ve davranış
          tasarımın istediği, konumu bir kademe aşağıda. */}
      <div className="mx-auto flex w-full max-w-[1100px] items-center gap-9 border-b border-sand-300 px-12 py-4">
        <Link href="/orders" className="cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        <Button variant="outlineOlive" size="sm" disabled={busy} onClick={onReorder} className="ml-auto flex-none">
          {busy ? t.reordering : t.reorder}
        </Button>
      </div>

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
        <HelpCard t={t} />
      </div>
      </div>
    </>
  );
}
