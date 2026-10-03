import { cardBadgeOf, formatPrice, productPriceLabel, showsNoShipChip, variantNameOf } from '@lezzet/helper';
import productMessages from '@lezzet/i18n/customer/product';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { ProductCircleCard } from '@/components/customer/phone-kit/product-circle-card';
import { rememberProductPreview } from '@/lib/storefront/product-preview';
import { PhoneDeclaration } from './components/phone-declaration';
import { PhoneFamilyRail } from './components/phone-family-rail';
import { PhoneProductHead, phoneHeroMarkOf } from './components/phone-product-head';
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
  const placeMark = phoneHeroMarkOf(selected, place, locale);
  // Fiyatsız benzer çizilmez: satışa kapalı ürün rafta durmaz.
  const similar = product.similar.filter((item) => item.priceCents !== null);
  // Galeri yoksa tek kapak: ilk öğe zaten kapaktır.
  const heroPhotos = product.gallery.length > 0 ? product.gallery : [product.image];
  const categoryUpper = product.category?.name.toLocaleUpperCase(locale) ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <PhoneProductHead
        locale={locale}
        productId={product.id}
        name={product.name}
        images={heroPhotos}
        selling={selected}
        placeMark={placeMark}
        categoryLabel={categoryUpper}
      >
        {showsNoShipChip(product.shippable, placeMark?.tone ?? null) && (
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
                  <span className="font-sans text-note font-bold text-ink">{variantNameOf(option, locale)}</span>
                  <span className="font-sans text-micro font-semibold text-olive-dark">
                    {option.priceCents === null ? '—' : formatPrice(option.priceCents, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {product.description && <p className="font-sans text-body-sm leading-[1.6] text-body">{product.description}</p>}
      </PhoneProductHead>

      <PhoneDeclaration
        copy={copy}
        locale={locale}
        declaration={product.declaration}
        netQuantity={selected?.netQuantity ?? null}
        netUnit={selected?.netUnit ?? null}
      />

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
                onOpen={() => rememberProductPreview(item)}
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
