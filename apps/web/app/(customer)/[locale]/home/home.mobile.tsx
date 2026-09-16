import {
  bandCountLabel,
  cardBadgeOf,
  formatPrice,
  offerDiscountLabel,
  offerLimitOf,
  productPriceLabel,
  scopeBadgeOf,
  type HomeCopy,
} from '@lezzet/helper';
import homeMessages from '@lezzet/i18n/customer/home';
import { useAccount, useWholesale } from '@/components/customer/account/account-context';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { PhoneCollectionBand } from './components/phone-collection-band';
import { DashedInvite } from '@/components/customer/phone-kit/dashed-invite';
import { PhotoTile } from '@/components/customer/phone-kit/photo-tile';
import { ProductCircleCard } from '@/components/customer/phone-kit/product-circle-card';
import { SectionHeader } from '@/components/customer/phone-kit/section-header';
import { Tag } from '@/components/customer/phone-kit/tag';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { Link } from '@/i18n/navigation';
import type { HomeMobileProps } from './home-types';

/**
 * Anasayfanın telefon görünümü, native vitrinin web ikizi: sıra native'in, veri native uçla aynı okumadan (`readHome`), metin ortak
 * sözlükten. Web'e özgü: `h1` arama motoru için görünmez durur, çünkü native vitrinin kahramanı yok ve selamlama sayfanın konusu
 * değil; aşağı çekme, iskelet ve bağlantı hatası ekranı yok, çünkü sayfa sunucuda çözülür.
 */

/** Yatay ray — native `ScrollView horizontal`ın karşılığı; üstteki nefes rozetlerin taşması için. */
const RAIL = 'flex overflow-x-auto px-5.5 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export function HomeMobile({ t, locale, data }: HomeMobileProps) {
  const copy: HomeCopy = homeMessages[locale];
  const signedIn = useAccount() !== null;
  const wholesale = useWholesale();
  const { home, orders, b2bPending } = data;
  // Süren sipariş varken "tekrarla" bandı çizilmez: aktif teslimatın üstüne "geçen siparişi tekrarla" demek olan biteni gizlerdi.
  const live = orders.live;
  const last = live === null ? orders.last : null;

  return (
    <div className="flex flex-col gap-4.5 pt-4.5 pb-5.5">
      <h1 className="sr-only">{t.meta.title}</h1>

      {live !== null && (
        <Link
          href={{ pathname: '/orders/[reference]', params: { reference: live.id } }}
          className="mx-5.5 flex cursor-pointer items-center gap-3 rounded-card bg-ink px-4 py-3 transition-transform hover:opacity-95 active:scale-[0.98]"
        >
          <MobileIcon name="truck" size={17} className="flex-none text-olive-light" />
          <span className="min-w-0 flex-1 truncate font-sans text-control text-sand-50">
            {copy.liveOrder.title.replace('{status}', copy.liveOrder.status[live.status]).replace('{reference}', live.referenceNo)}
          </span>
          <span className="flex-none rotate-3 rounded-badge bg-olive-light px-2.5 py-1.5 font-sans text-micro font-bold text-ink-deep">
            {copy.liveOrder.track}
          </span>
        </Link>
      )}

      {last !== null && (
        <Link
          href={{ pathname: '/orders/[reference]', params: { reference: last.id } }}
          aria-label={copy.lastOrder.title}
          className="mx-5.5 flex cursor-pointer items-center gap-3 rounded-card bg-sand-150 px-4 py-3 transition-transform hover:opacity-95 active:scale-[0.98]"
        >
          <MobileIcon name="refresh" size={17} className="flex-none text-terracotta" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-sans text-note font-bold text-ink">{copy.lastOrder.title}</span>
            <span className="font-sans text-body-sm text-muted">
              {copy.lastOrder.summary.replace('{reference}', last.referenceNo).replace('{total}', formatPrice(last.totalCents, locale))}
            </span>
          </span>
          <span aria-hidden className="font-sans text-icon-sm leading-none text-terracotta">
            ›
          </span>
        </Link>
      )}

      {home.offers.length > 0 && (
        <div className={`${RAIL} gap-3`}>
          {home.offers.map((offer) => {
            const limit = offerLimitOf(offer.limitLabel, copy.offers);
            return (
              <Link
                key={offer.slug}
                href={{ pathname: '/product/[slug]', params: { slug: offer.slug } }}
                aria-label={offer.name}
                className="relative flex flex-none -rotate-1 cursor-pointer items-center gap-3 rounded-control border-[1.5px] border-dashed border-terracotta bg-terracotta-bg py-2.5 pr-4 pl-2.5 transition-transform hover:opacity-90 active:scale-[0.97]"
              >
                <span className="absolute -top-2.5 -left-2 z-[1]">
                  {/* Fiyatsız ürün fırsat rayına giremez (uç süzer); `?? 0` tip daraltmasıdır. */}
                  <Tag label={offerDiscountLabel(offer.priceCents ?? 0, offer.wasCents, copy.offers)} rotate={-7} shadow />
                </span>
                <CirclePhoto image={offer.image} initial={offer.name.slice(0, 1)} size={48} initialClassName="text-h2-sm text-muted" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-sans text-body-sm font-bold whitespace-nowrap text-ink">{offer.name}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-sans text-body-sm font-bold text-terracotta">{formatPrice(offer.priceCents ?? 0, locale)}</span>
                    <span className="font-sans text-micro text-muted line-through">{formatPrice(offer.wasCents, locale)}</span>
                  </span>
                  {/* Sınır satırı veriden gelir: sınır yoksa hiçbir şey yazılmaz. */}
                  {limit !== null && <span className="font-sans text-eyebrow-xs tracking-normal text-terracotta">{limit}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {home.bands.length > 0 && (
        // Daireler bandın dışına sarkıyor: yatay taşma sayfayı kaydırmasın, dikey taşma görünür kalsın.
        <section className="overflow-x-clip">
          <p className="px-5.5 pb-2 font-sans text-eyebrow-xs text-terracotta uppercase">{copy.collections.eyebrow}</p>
          {home.bands.map((band, index) => (
            <PhoneCollectionBand
              key={band.slug}
              // Her iki tür de katalogu KENDİ süzgeciyle açar; parametre adları katalogunkiyle aynı.
              href={
                band.kind === 'category'
                  ? { pathname: '/catalog', query: { category: band.slug } }
                  : { pathname: '/catalog', query: { collection: band.slug } }
              }
              name={band.name}
              subtitle={band.subtitle}
              countLabel={bandCountLabel(band, copy, locale)}
              discountLabel={scopeBadgeOf(band.campaign, copy.campaign, locale)}
              index={index}
              image={band.image}
            />
          ))}
        </section>
      )}

      {home.featured.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="px-5.5">
            <SectionHeader eyebrow={copy.featured.eyebrow} title={copy.featured.title} />
          </div>
          <div className={`${RAIL} gap-4.5`}>
            {/* Vitrin kartı yer işareti TAŞIMAZ (tasarım): ilk ekranda her soğuk zincir ürününe not düşmek rafı bir uyarı
                duvarına çevirirdi. Adresin gerçeği katalogda bant ve kart şeridiyle, ürün detayında büyük puntoyla söyleniyor. */}
            {home.featured.map((product) => (
              <ProductCircleCard
                key={product.slug}
                href={{ pathname: '/product/[slug]', params: { slug: product.slug } }}
                name={product.name}
                priceLabel={productPriceLabel(product.priceCents, locale)}
                discountLabel={cardBadgeOf(product, { offer: copy.card.offer })}
                image={product.image}
              />
            ))}
            {/* Rayın sonundaki KATALOG kartı — ürün dairesinin ikizi ama ürün değil: fiyat çipi yerine
                ok rozeti, fotoğraf yerine katalog ikonu. */}
            <Link
              href="/catalog"
              aria-label={copy.featured.allCatalogLabel}
              className="flex w-[146px] flex-none cursor-pointer flex-col items-center gap-1.5 transition-transform hover:opacity-90 active:scale-[0.97]"
            >
              <span className="relative block size-[146px]">
                <span className="grid size-full place-items-center rounded-full bg-sand-250">
                  <MobileIcon name="catalog" size={44} className="text-sand-600" />
                </span>
                <span className="absolute -right-0.5 -bottom-0.5">
                  <Tag label="→" rotate={4} shadow />
                </span>
              </span>
              <span className="text-center font-serif text-body-sm leading-[1.15] font-semibold text-ink">{copy.featured.allCatalog}</span>
            </Link>
          </div>
        </section>
      )}

      {home.recipes.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="px-5.5">
            <SectionHeader eyebrow={copy.recipes.eyebrow} title={copy.recipes.title} />
          </div>
          <div className={`${RAIL} gap-3`}>
            {home.recipes.map((recipe) => (
              <PhotoTile
                key={recipe.slug}
                href={{ pathname: '/recipe/[slug]', params: { slug: recipe.slug } }}
                label={recipe.name}
                image={recipe.image}
                initial={recipe.name.slice(0, 1)}
                className="h-[280px] w-[220px]"
                ratio={220 / 280}
                sizes="220px"
                // `duration` hazır metin ("35 dk"); girilmemiş süreye rozet uydurulmaz.
                topBadge={recipe.duration === null ? undefined : <Tag label={recipe.duration} tone="cream" rotate={-3} />}
              >
                <span className="block font-serif text-card-title-sm text-on-image">{recipe.name}</span>
                {/* "N malzeme" = bizim ürün satırları + evden malzemeler (sözleşme ikisini ayrı taşır). */}
                <span className="block font-sans text-micro font-bold text-olive-light">
                  {copy.recipes.meta.replace('{n}', String(recipe.itemCount + recipe.pantryCount))}
                </span>
              </PhotoTile>
            ))}
            {/* Rayın sonundaki KOYU kart → tarifler listesi; toplam tarif sayısı sözleşmede yok, cümle sayısız. */}
            <Link
              href="/recipes"
              aria-label={copy.recipes.moreLabel}
              className="flex h-[280px] w-[220px] flex-none cursor-pointer flex-col justify-between rounded-card bg-ink p-3.5 transition-transform hover:opacity-95 active:scale-[0.98]"
            >
              <span className="flex flex-col gap-1.5">
                <span className="font-sans text-eyebrow-xs text-olive-light uppercase">{copy.recipes.eyebrow}</span>
                <span className="font-serif text-page-title-sm leading-[1.15] text-on-image">{copy.recipes.moreTitle}</span>
              </span>
              <span className="flex items-center gap-2.5">
                <span className="grid size-[34px] place-items-center rounded-full border-[1.5px] border-olive-light font-sans text-icon-sm leading-none text-olive-light">
                  →
                </span>
                <span className="font-sans text-badge tracking-normal text-on-image">{copy.recipes.moreAction}</span>
              </span>
            </Link>
          </div>
        </section>
      )}

      {home.packages.length > 0 && (
        <>
          <p className="px-5.5 font-sans text-eyebrow-xs text-terracotta uppercase">{copy.packages.eyebrow}</p>
          <div className="flex flex-col gap-3 px-5.5">
            {/* Paket kartı da yer işareti taşımaz; solma yalnız tükendide kalır (ürün rafıyla aynı gerekçe). */}
            {home.packages.map((pack) => (
              <PhotoTile
                key={pack.slug}
                href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
                label={[pack.name, pack.soldOut ? copy.packages.soldOut : undefined].filter(Boolean).join(' · ')}
                image={pack.image}
                initial={pack.name.slice(0, 1)}
                className="h-[172px] w-full"
                ratio={2}
                sizes="100vw"
                dimmed={pack.soldOut}
                topBadge={
                  pack.soldOut ? (
                    <span className="block rounded-badge bg-scrim-72 px-2.5 py-1 font-sans text-badge-sm font-bold tracking-(--text-badge--letter-spacing) text-sand-50 uppercase">
                      {copy.packages.soldOut}
                    </span>
                  ) : undefined
                }
              >
                <span className="flex items-end justify-between gap-2.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-sans text-eyebrow-xs text-olive-light">{copy.packages.badge.replace('{n}', String(pack.itemCount))}</span>
                    <span className="truncate font-serif text-card-title-sm text-on-image">{pack.name}</span>
                  </span>
                  <span className="flex-none rotate-3 rounded-badge bg-terracotta px-3.5 py-2 font-serif text-screen-title text-card shadow-badge">
                    {formatPrice(pack.priceCents, locale)}
                  </span>
                </span>
              </PhotoTile>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-col gap-3 px-5.5 pt-3">
        {/* Oylanacak kart kalmadıysa davet çizilmez; misafire koşullu cümle: giriş yaparsa puan kazandırır. */}
        {home.discoverCards > 0 && (
          <DashedInvite href="/discover" title={copy.discover.title} description={signedIn ? copy.discover.body : copy.discover.guestBody} />
        )}
        {/* Cevabı belli soru sorulmaz: onaylı toptancıya ve başvurusu incelemede olana davet yok. */}
        {!wholesale && !b2bPending && (
          <DashedInvite href="/professionals" tone="olive" title={copy.professional.title} description={copy.professional.body} />
        )}
      </div>
    </div>
  );
}
