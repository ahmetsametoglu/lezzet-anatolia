import { RATIO_SQUARE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/customer/ui/badge';
import { BackButton } from '@/components/customer/ui/back-button';
import { ShareButton } from '@/components/customer/ui/share-button';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { formatPrice } from '@/lib/storefront/format';
import { ContentCard } from './components/content-card';
import { PackageFacts } from './components/package-facts';
import { PurchaseBox } from './components/purchase-box';
import type { PackageViewProps } from './package-types';

/**
 * Paket detay — mobil düzen (tasarım: `Musteri - Paket Detay.dc.html`, "Paket Detay Mobil").
 *
 * BAŞLIK YOK, görsel tepeye yaslı ve kenardan kenara (kullanıcı kararı 20.08, sekizinci tur —
 * ürün detayıyla AYNI desen): geri düğmesi fotoğrafın sol üstünde krem daire, sepete giden yol
 * çerçevenin sağ alttaki yüzen düğmesi (`CartFab`). Satın alma sabit çubukta DEĞİL, akışın karar
 * bölgesinde — iki detay sayfası aynı jesti aynı yerde konuşur.
 */
export function PackageMobile({ t, locale, pack }: PackageViewProps) {
  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="relative">
        {/* Kahraman KARE (dokuzuncu tur, ürün galerisinin aynı kararı): native kahramanı telefon
            eninde ≈1:1; 3:2 dar ekranda kısa bant kalıyordu. Odak/zoom operatörün künyesinden. */}
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SQUARE} crop={pack.image.crop} className="!rounded-none" />
        <div className="absolute top-3 left-3 z-10">
          <BackButton label={t.backLabel} fallback="/packages" variant="photo" />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-4">
        <span className="font-sans text-eyebrow-sm text-olive uppercase">
          {t.eyebrow}
          {pack.serves !== null && ` · ${t.serves.replace('{n}', String(pack.serves))}`}
        </span>
        {/* Paylaş adın yanında — ürün detayıyla aynı desen. Paket bir ürün DEĞİL: `productId`
            yok, çünkü paket birden çok ürünü tek fiyata sunuyor — birini seçip ona yazmak
            ölçümü o ürüne haksızca yüklerdi. */}
        <div className="flex items-start justify-between gap-2">
          <h1 className="font-serif text-page-title-sm text-ink">{pack.name}</h1>
          <ShareButton label={t.share} subject={{ subjectType: 'bundle', subjectId: pack.id }} />
        </div>

        <div className="flex items-center gap-2.5">
          <span className={['font-sans text-card-title font-bold', pack.soldOut ? 'text-muted' : 'text-ink'].join(' ')}>
            {formatPrice(pack.priceCents, locale)}
          </span>
          <Badge tone={pack.soldOut ? 'closed' : 'positive'} variant="plain">
            {pack.soldOut ? t.soldOut : t.inStock}
          </Badge>
        </div>

        {pack.description && <p className="font-sans text-note leading-relaxed text-body">{pack.description}</p>}

        {/* Paket kargoya çıkamıyorsa kısıt YERE göre konuşur: bölge içindeki müşteriye
            "gönderemiyoruz" demek yanlış olurdu — onun için bu bir kısıt değil. */}
        <DeliveryLine
          locale={locale}
          shippable={!pack.inRouteOnly}
          fallback={{ ...t.assurance, notShippable: t.assurance.inRouteOnly }}
          blockedActions={
            <Link href="/packages" className={buttonClass({ size: "xs", className: '!text-micro' })}>
              {t.seeShippablePackages}
            </Link>
          }
          compact
        />

        <PackageFacts t={t} locale={locale} pack={pack} compact />

        {/* Satın alma AKIŞTA (sekizinci tur): karar bölgesinin sonu — fiyat, teslimat ve künyenin
            hemen altı. Sabit koyu çubuk söküldü, alt köşe yüzen sepet düğmesinin. */}
        <PurchaseBox t={t} locale={locale} bundleId={pack.id} soldOut={pack.soldOut} routeOnly={pack.inRouteOnly} flow />
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

    </div>
  );
}
