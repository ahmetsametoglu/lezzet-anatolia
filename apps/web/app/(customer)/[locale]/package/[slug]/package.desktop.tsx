import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Badge } from '@/components/customer/ui/badge';
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
 * Paket detay — masaüstü düzeni (tasarım: `Musteri - Paket Detay.dc.html`, "Paket Detay Web").
 * Breadcrumb → iki sütun (görsel | satın alma) → "Pakette neler var?" → yasal not.
 *
 * Sağ sütunun sırası tasarımın kararı ve satın alma mantığını izler: künye → ad → fiyat/stok →
 * açıklama → aksiyon → teslim koşulu → güven künyesi. Kargo kısıtı aksiyonun ALTINDA ama sepete
 * eklemeden ÖNCE görünür (`musteri-paket-detay.md §2`).
 */
export function PackageDesktop({ t, locale, pack }: PackageViewProps) {
  return (
    <div className="flex flex-col">
      <nav className="flex gap-1.5 px-12 pt-5 font-sans text-body-sm text-muted">
        <Link href="/packages" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        <span>· {pack.name}</span>
      </nav>

      {/* Tasarımın 1.1fr/1fr oranı: görsel biraz baskın, satın alma sütunu okunur genişlikte kalır. */}
      <section className="grid grid-cols-[1.1fr_1fr] items-start gap-12 px-12 pt-6 pb-10">
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SOURCE} crop={pack.image.crop} />

        <div className="flex flex-col gap-4">
          {/* "6 kişilik" İSTEĞE BAĞLI: girilmemişse künye yalnız "Hazır Paket" olur, yerine başka
              bilgi konmaz (tasarımın etkileşim sözleşmesi). */}
          <span className="font-sans text-eyebrow text-olive uppercase">
            {t.eyebrow}
            {pack.serves !== null && ` · ${t.serves.replace('{n}', String(pack.serves))}`}
          </span>

          <div className="flex items-start justify-between gap-4">
            <h1 className="font-serif text-page-title text-ink">{pack.name}</h1>
            {/* Paylaş masaüstünde de var: sosyal medya birincil senaryo, link her yüzeyden çıkabilmeli. */}
            <span className="grid size-11 flex-none place-items-center rounded-full border border-sand-200 bg-card">
              <ShareButton label={t.share} />
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={['font-sans text-h1-sm font-bold', pack.soldOut ? 'text-muted' : 'text-ink'].join(' ')}>
              {formatPrice(pack.priceCents, locale)}
            </span>
            <Badge tone={pack.soldOut ? 'closed' : 'positive'}>{pack.soldOut ? t.soldOut : t.inStock}</Badge>
          </div>

          {pack.description && <p className="font-sans text-lead text-body">{pack.description}</p>}

          <PurchaseBox t={t} locale={locale} bundleId={pack.id} soldOut={pack.soldOut} routeOnly={pack.inRouteOnly} />

          {/* Kargolanamayan pakette şerit UYARIYA döner: üç ferah vaat yerine tek kısıt cümlesi —
              "kargoya uygun" ile "kargoya verilemez" aynı kutuda yan yana duramaz. */}
          {/* Paket kargoya çıkamıyorsa kısıt YERE göre konuşur: bölge içindeki müşteriye
              "gönderemiyoruz" demek yanlış olurdu — onun için bu bir kısıt değil. */}
          <DeliveryLine
            locale={locale}
            shippable={!pack.inRouteOnly}
            fallback={{ ...t.assurance, notShippable: t.assurance.inRouteOnly }}
            blockedActions={
              <Link href="/packages" className={buttonClass({ size: "sm", className: '!text-note' })}>
                {t.seeShippablePackages}
              </Link>
            }
            
          />

          <PackageFacts t={t} locale={locale} pack={pack} />

          <span className="font-sans text-note leading-relaxed text-muted">{t.fixedNote}</span>
        </div>
      </section>

      <section className="flex flex-col gap-4 px-12 pb-11">
        <div className="flex items-baseline gap-3.5">
          <h2 className="font-serif text-h1-sm text-ink">{t.contents.title}</h2>
          <span className="font-sans text-body-sm text-muted">{t.contents.subtitle.replace('{n}', String(pack.itemCount))}</span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {pack.items.map((item) => (
            <ContentCard key={item.variantId} t={t} item={item} />
          ))}
        </div>

        {/* Yasal not KALDIRILAMAZ: beyanın ürün başına yapıldığını söyleyen tek cümle bu — paket
            sayfasındaki özet künye, tam beyanın yerine geçmez (INCO). */}
        <p className="rounded-soft border border-sand-100 bg-card px-5 py-3.5 font-sans text-note leading-relaxed text-body">
          {t.contents.legal}
        </p>
      </section>
    </div>
  );
}
