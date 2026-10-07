import { formatPrice, placeMarkOf } from '@lezzet/helper';
import placeMessages from '@lezzet/i18n/customer/place';
import productMessages from '@lezzet/i18n/customer/product';
import type { Locale } from '@lezzet/i18n';
import type { StorefrontImage } from '@lezzet/application';
import { RATIO_SQUARE } from '@lezzet/types';
import type { ReactNode } from 'react';
import { PhotoGallery } from '@/components/customer/phone-kit/photo-gallery';
import { BackButton } from '@/components/customer/ui/back-button';
import { Icon } from '@/components/customer/ui/icons';
import { ShareButton } from '@/components/customer/ui/share-button';
import { phoneMetaLine, type HeadSelling } from './phone-meta-line';

type HeroPlace = Parameters<typeof placeMarkOf>[1];

/** Filigranda yalnız uyarı konuşur: `info` (kargoyla gelir) gösterilmez, fiyatsız ürün susar. */
export function phoneHeroMarkOf(selling: HeadSelling | null, place: HeroPlace, locale: Locale) {
  const mark = selling === null || selling.priceCents === null ? null : placeMarkOf(selling.stockStatus, place, placeMessages[locale]);
  return mark === null || mark.tone === 'info' ? null : mark;
}

interface PhoneProductHeadProps {
  locale: Locale;
  productId: string;
  name: string;
  images: StorefrontImage[];
  selling: HeadSelling | null;
  /** Kutunun içi ya da net miktar (`contentLineOf`). `undefined`: boylar henüz gelmedi, satırın yeri tutulur; `null`: satır yok. */
  content: string | null | undefined;
  placeMark: ReturnType<typeof phoneHeroMarkOf>;
  /** `undefined`: ürünün kategorisi var ama adı henüz gelmedi; satırın yeri aynı stille boş tutulur. `null`: kategorisi yok. */
  categoryLabel: string | null | undefined;
  /** Künyenin ilk satırlarından sonra gelenler (kargo çipi, aile, boylar, açıklama); yükleme karesinde yoktur. */
  children?: ReactNode;
}

/**
 * Telefonda ürün sayfasının üst bölümü (kahraman ve künyenin ilk satırları). Yükleme karesi kartın bildiğiyle, sayfa gelen detayla
 * aynı bileşeni çizer ki veri gelince satırlar yerinden oynamasın.
 */
export function PhoneProductHead({
  locale,
  productId,
  name,
  images,
  selling,
  content,
  placeMark,
  categoryLabel,
  children,
}: PhoneProductHeadProps) {
  const copy = productMessages[locale];
  const price = selling?.priceCents ?? null;
  const was = selling?.wasCents;
  const soldOut = selling?.soldOut ?? true;
  const metaLine = phoneMetaLine(selling, locale);

  return (
    <>
      {/* Kahraman içeriğin üstünde (`z-10`): fiyat rozeti alt komşuya sarkıyor. */}
      <div className="relative z-10 h-[400px] flex-none">
        <PhotoGallery images={images} alt={name} photoLabel={copy.gallery.photo} initial={name.slice(0, 1)} ratio={RATIO_SQUARE} />
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-b from-scrim-soft to-ink-deep/0 to-30%" />
        {/* Filigran galerinin kardeşi, çocuğu değil: kaydırmayla kaymaz, dokunuşu yutmaz. */}
        {placeMark !== null && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center bg-scrim px-4 text-center">
            <span className="line-clamp-3 font-sans text-copy leading-[1.6] font-bold whitespace-pre-line text-on-image">
              {placeMark.label}
            </span>
          </span>
        )}
        {/* Düğmeler üst güvenli alanın 8px altında: saate binmesin. */}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+8px)] flex justify-between">
          <BackButton variant="photo" label={copy.back} fallback="/catalog" />
          <ShareButton variant="photo" label={copy.share} subject={{ subjectType: 'product', subjectId: productId, productId }} />
        </div>
        {soldOut ? (
          <span className="absolute bottom-3 left-2.5 -rotate-4 rounded-badge bg-ink px-2 py-1 font-sans text-note font-bold text-sand-50">
            {copy.badge.soldOut}
          </span>
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
        {categoryLabel === undefined ? (
          <span aria-hidden className="invisible font-sans text-eyebrow-xs">
            &nbsp;
          </span>
        ) : (
          categoryLabel !== null && <span className="font-sans text-eyebrow-xs text-terracotta">{categoryLabel}</span>
        )}
        <h1 className="font-serif text-h1-sm text-ink">{name}</h1>
        {content !== null && (
          <span
            aria-hidden={content === undefined}
            className={`flex items-center gap-2 self-start rounded-badge bg-sand-150 px-2.5 py-1.5 font-sans text-note font-bold text-ink ${content === undefined ? 'invisible' : ''}`}
          >
            <Icon name="box" size={15} className="flex-none" />
            {content ?? ' '}
          </span>
        )}
        <p className="font-sans text-micro text-muted">{metaLine}</p>
        {selling?.limitLabel && (
          <span className="self-start rounded-badge bg-terracotta-bg px-2 py-0.5 font-sans text-micro font-semibold text-terracotta">
            {copy.limit.replace('{n}', selling.limitLabel)}
          </span>
        )}
        {children}
      </div>
    </>
  );
}
