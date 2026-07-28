import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/customer/ui/badge';
import { formatPrice } from '@/lib/storefront/format';
import { ContentCard } from './components/content-card';
import { PackageFacts } from './components/package-facts';
import { PurchaseBox } from './components/purchase-box';
import type { PackageViewProps } from './package-types';

/**
 * Paket detay — mobil düzen (tasarım: `Musteri - Paket Detay.dc.html`, "Paket Detay Mobil").
 *
 * Tek sütun, satın alma EKRANIN ALTINDA sabit koyu çubukta: sosyal medyadan gelen ziyaretçi sayfayı
 * uzun uzun kaydırır, aksiyon her an elinin altında olmalı (`§7`: mobil trafik birincil).
 *
 * Alt boşluk (`pb-28`) çubuğun içeriği örtmesini engeller — sabit çubuk akışta yer kaplamaz.
 */
export function PackageMobile({ t, locale, pack }: PackageViewProps) {
  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="px-3 pt-3">
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SOURCE} crop={pack.image.crop} />
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        <span className="font-sans text-eyebrow-sm text-olive uppercase">
          {t.eyebrow}
          {pack.serves !== null && ` · ${t.serves.replace('{n}', String(pack.serves))}`}
        </span>
        <h1 className="font-serif text-page-title-sm text-ink">{pack.name}</h1>

        <div className="flex items-center gap-2.5">
          <span className={['font-sans text-card-title font-bold', pack.soldOut ? 'text-muted' : 'text-ink'].join(' ')}>
            {formatPrice(pack.priceCents, locale)}
          </span>
          <Badge tone={pack.soldOut ? 'closed' : 'positive'} variant="plain">
            {pack.soldOut ? t.soldOut : t.inStock}
          </Badge>
        </div>

        {pack.description && <p className="font-sans text-note leading-relaxed text-body">{pack.description}</p>}

        {pack.inRouteOnly ? (
          <p className="rounded-soft border border-honey-line bg-honey-bg px-3.5 py-2.5 font-sans text-micro leading-relaxed font-semibold text-honey">
            {t.assurance.inRouteOnly}
          </p>
        ) : (
          <div className="flex flex-wrap gap-4 rounded-soft bg-sand-100 px-3.5 py-2.5 font-sans text-micro text-body">
            <span>{t.assurance.coldChain}</span>
            <span>{t.assurance.doorstep}</span>
            <span>{t.assurance.shippable}</span>
          </div>
        )}

        <PackageFacts t={t} locale={locale} pack={pack} compact />
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        <h2 className="font-serif text-h2-sm text-ink">{t.contents.title}</h2>
        {pack.items.map((item) => (
          <ContentCard key={item.variantId} t={t} item={item} compact />
        ))}
        <p className="rounded-soft border border-sand-100 bg-card px-3.5 py-3 font-sans text-micro leading-relaxed text-body">
          {t.contents.legalShort}
        </p>
      </div>

      {/* Sabit çubuk: sayfanın en altında DEĞİL, EKRANIN altında. Ürün detayla aynı kalıp — iki
          sayfada farklı davranan bir satın alma çubuğu, aynı jesti iki şey yapar hale getirirdi. */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
        <div className="mx-auto max-w-[430px] rounded-card bg-ink px-3.5 py-3">
          <PurchaseBox t={t} bundleId={pack.id} soldOut={pack.soldOut} onDark />
        </div>
      </div>
    </div>
  );
}
