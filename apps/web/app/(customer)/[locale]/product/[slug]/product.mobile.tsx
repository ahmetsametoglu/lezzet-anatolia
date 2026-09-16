import { cardBadgeOf, formatPrice, placeMarkOf, productPriceLabel } from '@lezzet/helper';
import placeMessages from '@lezzet/i18n/customer/place';
import productMessages from '@lezzet/i18n/customer/product';
import { RATIO_SQUARE } from '@lezzet/types';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { PhotoGallery } from '@/components/customer/phone-kit/photo-gallery';
import { ProductCircleCard } from '@/components/customer/phone-kit/product-circle-card';
import { BackButton } from '@/components/customer/ui/back-button';
import { ShareButton } from '@/components/customer/ui/share-button';
import { variantNameOf } from '@/lib/storefront/variant-name';
import { PhoneDeclaration } from './components/phone-declaration';
import { PhoneFamilyRail } from './components/phone-family-rail';
import { PhonePurchaseBar } from './components/phone-purchase-bar';
import { PhoneReviews } from './components/phone-reviews';
import type { ProductViewProps } from './product-types';

/**
 * Sıra native ürün detayınınki. Değerlendirmeler web'in gerçek yorumları; beyan `<details>` ile, içerik kapalıyken de
 * sayfada durur (INCO).
 */
export function ProductMobile({ t, locale, product, selected, onSelect, reviews }: ProductViewProps) {
  const copy = productMessages[locale];
  const { place } = useDeliveryPlace();
  const price = selected?.priceCents ?? null;
  const was = selected?.wasCents;
  const soldOut = selected?.soldOut ?? true;
  /* Filigranda yalnız uyarı konuşur: `info` (kargoyla gelir) gösterilmez, fiyatsız ürün susar. */
  const mark = selected === null || price === null ? null : placeMarkOf(selected.stockStatus, place, placeMessages[locale]);
  const placeMark = mark === null || mark.tone === 'info' ? null : mark;
  // Fiyatsız benzer çizilmez: satışa kapalı ürün rafta durmaz.
  const similar = product.similar.filter((item) => item.priceCents !== null);
  // Galeri yoksa tek kapak: ilk öğe zaten kapaktır.
  const heroPhotos = product.gallery.length > 0 ? product.gallery : [product.image];
  const categoryUpper = product.category?.name.toLocaleUpperCase(locale) ?? null;
  const comparison = selected?.comparisonCents ?? null;
  const metaLine = [
    comparison === null ? null : copy.meta.perKg.replace('{price}', formatPrice(comparison, locale)),
    copy.meta.vat,
    was === undefined ? null : copy.meta.was.replace('{price}', formatPrice(was, locale)),
  ]
    .filter((part) => part !== null)
    .join(' · ');

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {/* Kahraman içeriğin üstünde (`z-10`): fiyat rozeti alt komşuya sarkıyor. */}
      <div className="relative z-10 h-[400px] flex-none">
        <PhotoGallery images={heroPhotos} alt={product.name} photoLabel={copy.gallery.photo} initial={product.name.slice(0, 1)} ratio={RATIO_SQUARE} />
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-b from-scrim-soft to-ink-deep/0 to-30%" />
        {/* Filigran galerinin kardeşi, çocuğu değil: kaydırmayla kaymaz, dokunuşu yutmaz. */}
        {placeMark !== null && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-scrim px-4 text-center">
            <span className="line-clamp-3 font-sans text-body leading-[1.6] font-bold whitespace-pre-line text-on-image">{placeMark.label}</span>
          </span>
        )}
        {/* Düğmeler üst güvenli alanın 8px altında: saate binmesin. */}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+8px)] flex justify-between">
          <BackButton variant="photo" label={copy.back} fallback="/catalog" />
          <ShareButton variant="photo" label={copy.share} subject={{ subjectType: 'product', subjectId: product.id, productId: product.id }} />
        </div>
        {soldOut ? (
          <span className="absolute bottom-3 left-2.5 -rotate-4 rounded-badge bg-ink px-2 py-1 font-sans text-note font-bold text-sand-50">{copy.badge.soldOut}</span>
        ) : was !== undefined ? (
          <span className="absolute bottom-3 left-2.5 -rotate-4 rounded-badge bg-sand-50 px-2 py-1 font-sans text-note font-bold text-terracotta">
            {copy.badge.discount}
          </span>
        ) : null}
        {price !== null && (
          <span className="absolute right-3 -bottom-5.5 rotate-3 rounded-control bg-terracotta px-3 py-2 font-serif text-card-title text-card shadow-price">
            {formatPrice(price, locale)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-3.5 pt-3.5 pb-1.5">
        {categoryUpper !== null && <span className="font-sans text-eyebrow-xs text-terracotta">{categoryUpper}</span>}
        <h1 className="font-serif text-h1-sm text-ink">{product.name}</h1>
        <p className="font-sans text-micro text-muted">{metaLine}</p>
        {selected?.limitLabel && (
          <span className="self-start rounded-badge bg-terracotta-bg px-2 py-0.5 font-sans text-micro font-semibold text-terracotta">
            {copy.limit.replace('{n}', selected.limitLabel)}
          </span>
        )}
        {!product.shippable && (
          <span className="self-start rounded-badge bg-olive-bg px-2 py-1 font-sans text-micro font-semibold text-olive-dark">{copy.noShip}</span>
        )}

        {product.family.length > 0 && categoryUpper !== null && (
          <PhoneFamilyRail members={product.family} eyebrow={copy.family.browse.replace('{name}', categoryUpper)} currentLabel={copy.family.current} locale={locale} />
        )}

        {/* Boy çipleri yalnız çok boylu üründe: tek boyda seçilecek bir şey yok. */}
        {product.variants.length > 1 && selected !== null && (
          <div className="flex flex-wrap gap-2">
            {product.variants.map((option) => {
              const chosen = option.id === selected.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option.id)}
                  aria-pressed={chosen}
                  className={[
                    'flex cursor-pointer flex-col gap-0.5 rounded-control border-[1.5px] px-4 py-2.5 text-left transition-[scale,border-color] active:scale-[0.97]',
                    chosen ? 'border-ink bg-sand-150' : 'border-sand-400 hover:border-ink',
                  ].join(' ')}
                >
                  <span className="font-sans text-note font-bold text-ink">{variantNameOf(option, t.size, locale)}</span>
                  <span className="font-sans text-micro font-semibold text-olive-dark">
                    {option.priceCents === null ? '—' : formatPrice(option.priceCents, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {product.description && <p className="font-sans text-body-sm leading-[1.6] text-body">{product.description}</p>}
      </div>

      <PhoneDeclaration copy={copy} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} />

      <div className="px-3 pt-2.5">
        <PhoneReviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} />
      </div>

      {similar.length > 0 && (
        <section className="flex flex-col gap-2 pt-2.5">
          <h2 className="mx-3 font-serif text-card-title-sm text-ink">{copy.related}</h2>
          <div className="flex gap-2.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {similar.map((item) => (
              <ProductCircleCard
                key={item.id}
                size="sm"
                // Kardeş ürüne geçiş geçmişi büyütmez: geri, ürün zincirine girilen yere (katalog, ana sayfa, sepet) döner.
                replace
                href={{ pathname: '/product/[slug]', params: { slug: item.slug } }}
                name={item.name}
                priceLabel={productPriceLabel(item.priceCents, locale)}
                discountLabel={cardBadgeOf(item, { offer: copy.card.offer })}
                image={item.image}
              />
            ))}
          </div>
        </section>
      )}

      {/* Yapışkan barın payı. */}
      <div aria-hidden className="h-27 flex-none" />

      {/* Bar boy değişince yeniden kurulur: adet ve "haber ver" kaydı boya aittir. */}
      <PhonePurchaseBar
        key={selected?.id ?? 'none'}
        copy={copy}
        locale={locale}
        productName={product.name}
        variant={selected}
        placeMark={placeMark}
        postalCode={place?.postalCode ?? null}
      />
    </div>
  );
}
