import { formatPrice, packageRouteStatusOf, placeMarkOf, showsNoShipChip } from '@lezzet/helper';
import packageDetailMessages from '@lezzet/i18n/customer/package-detail';
import placeMessages from '@lezzet/i18n/customer/place';
import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PhotoGallery } from '@/components/customer/phone-kit/photo-gallery';
import { StockMark } from '@/components/customer/phone-kit/stock-mark';
import { BackButton } from '@/components/customer/ui/back-button';
import { ShareButton } from '@/components/customer/ui/share-button';
import { Link } from '@/i18n/navigation';
import { PhonePackageBar } from './components/phone-package-bar';
import type { PackageViewProps } from './package-types';

/**
 * Paket detayının telefon görünümü, native paket detayının web ikizi: sıra, metin ve yer işareti kuralı native ile aynı. Web'e
 * özgü olan, içerik altından aktığı için yapışkan başlık çubuğunun krem camı ve sepete eklemenin web sepetine gitmesidir.
 */
export function PackageMobile({ locale, pack }: PackageViewProps) {
  const copy = packageDetailMessages[locale];
  const { place } = useDeliveryPlace();
  // Tükenmiş pakette yer işareti yok: hiçbir yerde yokken "bu adrese gelmez" demek cevapsız soruya cevap vermektir.
  const mark = pack.soldOut ? null : placeMarkOf(packageRouteStatusOf(pack.route), place, placeMessages[locale]);
  // "Kargoyla gelir" burada yazılmaz: kargo kısıtı kendi çipiyle konuşuyor, rota dışı cümlesi listelerin bandında.
  const placeMark = mark === null || mark.tone === 'info' ? null : mark;
  // Solma yalnız galeriye uygulanır; yazı katmanı tam opak kalır ki solmanın sebebi okunsun.
  const heroFaded = pack.soldOut || placeMark?.tone === 'blocked';
  // Kapak önce, kalemler sonra: satılan şey paket, kalemler içeriği. Adressiz ve tekrarlanan görseli galeri eler.
  const heroPhotos = [pack.image, ...pack.items.map((item) => item.image)];

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b-[1.5px] border-ink bg-sand-50/96 px-3.5 py-2 backdrop-blur-sm">
        <BackButton label={copy.back} fallback="/packages" />
        <span className="min-w-0 flex-1 truncate font-serif text-screen-title text-ink">{copy.header}</span>
        <ShareButton variant="bar" label={copy.share} subject={{ subjectType: 'bundle', subjectId: pack.id }} />
      </header>

      <div className="relative aspect-16/10 flex-none">
        <div className={['size-full', heroFaded ? 'opacity-45' : ''].filter(Boolean).join(' ')}>
          <PhotoGallery images={heroPhotos} alt={pack.name} photoLabel={copy.gallery.photo} initial={pack.name.slice(0, 1)} ratio={RATIO_SOURCE} />
        </div>
        {pack.soldOut && (
          <span className="absolute top-3 left-3 rounded-badge bg-ink px-2.5 py-1 font-sans text-badge-sm font-bold tracking-(--text-badge--letter-spacing) text-sand-50 uppercase">
            {copy.badge.soldOut}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4.5 py-4">
        <h1 className="font-serif text-h1-sm text-ink">{pack.name}</h1>
        <p className="font-sans text-card-title font-bold text-ink">
          {formatPrice(pack.priceCents, locale)} <span className="text-helper font-normal text-muted">{copy.priceSuffix}</span>
        </p>
        {showsNoShipChip(!pack.inRouteOnly, placeMark?.tone ?? null) && (
          <span className="self-start rounded-badge bg-olive-bg px-2 py-1 font-sans text-micro font-semibold text-olive-dark">{copy.noShip}</span>
        )}
        {placeMark !== null && <StockMark label={placeMark.label} tone={placeMark.tone} />}
        {pack.description && <p className="font-sans text-body-sm leading-[1.6] text-body">{pack.description}</p>}

        <h2 className="mt-1.5 font-serif text-screen-title text-ink">{copy.contents.title}</h2>
        <ul className="flex flex-col gap-2">
          {pack.items.map((item) => (
            <li key={item.variantId}>
              {/* Satır ürün detayına gider, çünkü alerjen ve içindekiler her kalemin kendi sayfasında (yasal beyan). Boy da
                  taşınır: paketteki boy ürünün en ucuz boyu olmayabilir. */}
              <Link
                href={{ pathname: '/product/[slug]', params: { slug: item.slug }, query: { variant: item.variantId } }}
                aria-label={copy.contents.open.replace('{name}', item.name)}
                className="flex cursor-pointer items-center gap-3 rounded-card bg-sand-250 px-3 py-2.5 transition-opacity hover:opacity-80 active:opacity-70"
              >
                {item.image.url === null ? (
                  <span aria-hidden className="grid size-11.5 flex-none place-items-center rounded-badge bg-sand-300 font-sans text-note font-bold text-muted">
                    {item.name.slice(0, 1)}
                  </span>
                ) : (
                  <FramedImage
                    src={item.image.url}
                    alt=""
                    ratio={1}
                    crop={item.image.crop}
                    frames={item.image.frames}
                    sizes="46px"
                    className="size-11.5 flex-none !rounded-badge"
                  />
                )}
                <span className="min-w-0 flex-1 font-sans text-note font-bold text-ink">
                  {item.unitLabel ? `${item.name} · ${item.unitLabel}` : item.name}
                </span>
                <span className="font-sans text-helper font-bold text-muted">{`×${item.qty}`}</span>
                <span aria-hidden className="font-sans text-body text-sand-600">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="font-sans text-body-sm leading-[1.5] text-muted">{copy.contents.note}</p>
      </div>

      {/* Yapışkan barın payı (native `productBarSpace` 108). */}
      <div aria-hidden className="h-27 flex-none" />
      <PhonePackageBar copy={copy} locale={locale} pack={pack} />
    </div>
  );
}
