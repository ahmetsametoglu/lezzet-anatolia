import { RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatComparison } from '@/lib/storefront/format';
import type { StorefrontCategory, StorefrontOffer, StorefrontPackage, StorefrontProduct } from '@/lib/storefront/storefront-types';
import { Badge } from './badge';
import { buttonClass } from './button';
import { Price } from './price';

/**
 * §2 · Kartlar — K7 Ürün · K8 Fırsat · K9 Kategori · K10 Paket. Anasayfada doğdular ama katalog ve
 * ürün detay da bunları tüketecek, bu yüzden sayfa klasöründe değil ortak dizindeler (`STACK §7`).
 * Dördü aynı dosyada çünkü aynı ailedir: aynı çerçeve oranı, aynı kenarlık dili, aynı fiyat bloğu.
 *
 * Kart kendi fiyatını BİÇİMLENDİRMEZ (K6 `Price`), kendi rozetini BOYAMAZ (K5 `Badge`) — ikisi de
 * ortak karardır. Kartın işi yerleşim.
 *
 * Cihaz farkı `compact` ile taşınır (Sapma 3: `md:` akışkan responsive YOK). Kompakt = mobil
 * ölçüleri; düzenin kendisi (kaç sütun, hangi sırada) çağıran sayfanın işidir.
 *
 * Görsel her zaman `FramedImage` — kırpma künyesi (odak + zoom) kaynaktan gelir, kart kendi
 * kırpmasını uydurmaz; görsel yoksa placeholder zemin kalır (05.11 · envanter §0B).
 */

/** Kartlar henüz gerçek hedefe bağlanmıyor — rotalar (08.3+) açılınca `href` gerçek yola döner. */
const PENDING_HREF = '/';

interface CategoryCardProps {
  category: StorefrontCategory;
  /** Mobil şeritte kategori dairesi (kırpma yine kare) — envanter O15. */
  circle?: boolean;
}

export function CategoryCard({ category, circle = false }: CategoryCardProps) {
  return (
    <Link
      href={PENDING_HREF}
      className={[
        'flex cursor-pointer flex-col items-center gap-2.5 text-center transition-colors',
        circle ? 'w-[86px] flex-none' : 'rounded-card border border-sand-200 bg-card p-3.5 hover:border-olive-line',
      ].join(' ')}
    >
      <FramedImage
        src={category.image.url}
        alt={category.name}
        ratio={RATIO_SOURCE}
        crop={category.image.crop}
        circle={circle}
        className={circle ? 'w-[86px]' : 'w-full'}
      />
      <span className={['font-sans font-bold text-ink', circle ? 'text-micro' : 'text-body'].join(' ')}>{category.name}</span>
    </Link>
  );
}

interface ProductCardProps {
  product: StorefrontProduct;
  locale: Locale;
  addToCartLabel: string;
  compact?: boolean;
}

export function ProductCard({ product, locale, addToCartLabel, compact = false }: ProductCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-sand-200 bg-card">
      <Link href={PENDING_HREF} className="cursor-pointer">
        <FramedImage src={product.image.url} alt={product.name} ratio={RATIO_SOURCE} crop={product.image.crop} className="!rounded-none" />
      </Link>
      <div className={['flex flex-col gap-1.5', compact ? 'p-2.5' : 'px-4 pt-3.5 pb-4'].join(' ')}>
        <Link
          href={PENDING_HREF}
          className={['cursor-pointer font-sans font-bold text-ink transition-colors hover:text-olive', compact ? 'text-note' : 'text-body'].join(' ')}
        >
          {product.name}
        </Link>
        <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
          {product.unitLabel} · {formatComparison(product.comparisonCents, locale)}
        </span>
        <div className={['flex items-center justify-between', compact ? 'mt-0.5' : 'mt-1'].join(' ')}>
          <Price cents={product.priceCents} locale={locale} size={compact ? 'sm' : 'lg'} />
          {/* Sepete ekleme 07'ye bağlı — buton görünümü TAM, eylemi henüz yok. STUB(08.10 → 07) */}
          {compact ? (
            <span
              aria-label={addToCartLabel}
              className="grid size-7 cursor-pointer place-items-center rounded-full bg-olive font-sans text-body font-bold text-white transition-colors hover:bg-olive-dark"
            >
              +
            </span>
          ) : (
            <span className={buttonClass({ size: 'sm', className: '!px-3.5 !py-2 !text-note' })}>{addToCartLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface OfferCardProps {
  offer: StorefrontOffer;
  locale: Locale;
  /** "En fazla {n} adet" — sayı yerleştirilmiş hâli çağırandan gelir (i18n şablonu sayfada çözülür). */
  limitLabel: string | null;
  compact?: boolean;
}

export function OfferCard({ offer, locale, limitLabel, compact = false }: OfferCardProps) {
  return (
    <Link
      href={PENDING_HREF}
      className={['flex cursor-pointer items-center bg-card', compact ? 'gap-3 rounded-soft p-3' : 'gap-4 rounded-card p-4'].join(' ')}
    >
      <FramedImage
        src={offer.image.url}
        alt={offer.name}
        ratio={1}
        crop={offer.image.crop}
        className={compact ? 'size-[72px] flex-none' : 'size-24 flex-none'}
      />
      <div className="flex flex-col gap-1">
        <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body'].join(' ')}>
          {compact ? `${offer.name} · ${offer.unitLabel}` : offer.name}
        </span>
        {!compact && <span className="font-sans text-note text-muted">{offer.unitLabel}</span>}
        <Price cents={offer.priceCents} wasCents={offer.wasCents} locale={locale} size={compact ? 'sm' : 'lg'} />
        {limitLabel && (
          <Badge tone="offer" plain={compact}>
            {limitLabel}
          </Badge>
        )}
      </div>
    </Link>
  );
}

interface PackageCardProps {
  pack: StorefrontPackage;
  locale: Locale;
  badgeLabel: string;
  itemsLabel: string;
  ctaLabel: string;
  compact?: boolean;
}

export function PackageCard({ pack, locale, badgeLabel, itemsLabel, ctaLabel, compact = false }: PackageCardProps) {
  return (
    <div className={['flex items-center rounded-card bg-ink text-cream', compact ? 'gap-3.5 p-4' : 'gap-5 p-6'].join(' ')}>
      <FramedImage
        src={pack.image.url}
        alt={pack.name}
        ratio={1}
        crop={pack.image.crop}
        className={compact ? 'size-[84px] flex-none' : 'size-[130px] flex-none'}
      />
      <div className="flex flex-col gap-2">
        <span className={['font-sans text-olive-light uppercase', compact ? 'text-eyebrow-sm' : 'text-eyebrow'].join(' ')}>
          {badgeLabel} · {itemsLabel}
        </span>
        <span className={['font-serif', compact ? 'text-card-title-sm' : 'text-card-title'].join(' ')}>{pack.name}</span>
        {!compact && <span className="font-sans text-note/relaxed text-neutral-400">{pack.description}</span>}
        <div className={['flex items-center', compact ? 'mt-0.5 gap-2.5' : 'mt-1 gap-3.5'].join(' ')}>
          <Price cents={pack.priceCents} locale={locale} tone="onDark" size={compact ? 'sm' : 'lg'} />
          <Link
            href={PENDING_HREF}
            className={buttonClass({
              variant: 'secondaryOnDark',
              size: 'sm',
              className: compact ? '!px-3 !py-[5px] !text-micro' : '!px-4 !py-[7px] !text-note',
            })}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
