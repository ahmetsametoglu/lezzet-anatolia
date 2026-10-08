import {
  cardPlaceNoteOf,
  formatPrice,
  packageContentsLine,
  packageNoteOf,
  packageRouteStatusOf,
  packageThumbsOf,
  placeMarkOf,
} from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type packagesMessages from '@lezzet/i18n/customer/packages';
import placeMessages from '@lezzet/i18n/customer/place';
import { RATIO_BAND } from '@lezzet/types';
import { PhotoSurface } from '@/components/customer/phone-kit/photo-surface';
import { Tag } from '@/components/customer/phone-kit/tag';
import { ThumbStack } from '@/components/customer/phone-kit/thumb-stack';
import { Link } from '@/i18n/navigation';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';

/*
  Paket listesi kartı native'in kartıyla aynı: fotoğrafta fiyat ve ad, gövdede künye, yer notu, açıklama, içerik yığını ve teslim notu.
  Künye ve yer notu fotoğrafın üstünde durmaz, çünkü solan fotoğrafta okunmuyordu; kartın tamamı detaya bağdır.
*/

/** Yığında en çok bu kadar halka; fazlası "+N". */
const STACK_MAX = 3;

type PackagesCopy = LocalizedCopy<typeof packagesMessages>;

/** Kartın kabuğu; yükleme iskeleti de bununla çizilir ki veri gelince kart yerinden oynamasın. */
export const PACKAGE_CARD_SHELL =
  'overflow-hidden rounded-[24px] border-[1.5px] border-sand-200 bg-card shadow-[0_4px_18px_color-mix(in_srgb,var(--color-ink)_7%,transparent)]';

interface PhonePackageCardProps {
  pack: StorefrontPackage;
  copy: PackagesCopy;
  locale: Locale;
  /** Çözülmüş yerin rota bilgisi — yer notunun geçici mi kalıcı mı olduğunu söyler; `null` = yer bilinmiyor. */
  place: { inRoute: boolean } | null;
}

export function PhonePackageCard({ pack, copy, locale, place }: PhonePackageCardProps) {
  // Tükenmiş pakette adres sorusu anlamsız: yalnız paketin kendi gerçeği konuşur.
  const mark = pack.soldOut ? null : placeMarkOf(packageRouteStatusOf(pack.route), place, placeMessages[locale]);
  // Kart tam genişlikte: kapalı kapının kısa işareti yerine gerekçesinin tamamı sığıyor (`wide`).
  const { note: placeNote, dimmed } = cardPlaceNoteOf(mark, placeMessages[locale], { wide: true });
  const note = packageNoteOf(pack, mark?.tone ?? null, copy.note, locale);
  const thumbs = packageThumbsOf(pack.items, STACK_MAX);

  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      // Ekran okuyucu görenle aynı bilgiyi alır: ad · durum · teslim notu.
      aria-label={[copy.open.replace('{name}', pack.name), pack.soldOut ? copy.card.soldOut : undefined, placeNote, note]
        .filter(Boolean)
        .join(' · ')}
      className={[
        'block cursor-pointer transition-transform hover:opacity-95 active:scale-[0.985]',
        PACKAGE_CARD_SHELL,
        pack.soldOut ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="relative block h-49.5">
        <PhotoSurface image={pack.image} initial={pack.name.slice(0, 1)} ratio={RATIO_BAND} sizes="100vw" scrim faded={dimmed} className="absolute inset-0" />
        {pack.soldOut && (
          <span className="absolute top-3.5 left-3.5 rounded-badge bg-sand-50/94 px-2.75 py-1.25 font-sans text-micro font-bold text-body">
            {copy.card.soldOut}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <Tag label={formatPrice(pack.priceCents, locale)} tone={pack.soldOut ? 'muted' : 'terracotta'} size="lg" rotate={3} shadow />
        </span>
        <span className="absolute inset-x-4 bottom-3.5 font-serif text-card-title leading-[1.1] text-on-image">{pack.name}</span>
      </span>
      <span className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <span className="flex flex-col gap-1">
          <span className="font-sans text-eyebrow-xs text-olive-dark">{copy.meta.replace('{n}', String(pack.itemCount))}</span>
          {placeNote !== undefined && <span className="font-sans text-note leading-normal font-semibold text-terracotta">{placeNote}</span>}
        </span>
        {pack.description !== '' && <span className="line-clamp-2 font-sans text-body-sm leading-[1.6] text-body">{pack.description}</span>}
        {thumbs.shown.length > 0 && (
          <span className="flex items-center gap-2.5">
            <ThumbStack
              items={thumbs.shown.map((item, i) => ({ key: `${item.variantId}-${i}`, name: item.name, image: item.image }))}
              more={thumbs.more > 0 ? `+${thumbs.more}` : undefined}
            />
            <span className="min-w-0 font-sans text-note leading-snug font-semibold text-ink">{packageContentsLine(pack.items, copy.item)}</span>
          </span>
        )}
        <span className="flex items-center gap-2.5 border-t-[1.5px] border-sand-200 pt-2.5">
          <span className="min-w-0 flex-1 font-sans text-micro text-body">{note}</span>
          <span className={['flex-none font-sans text-note font-bold', pack.soldOut ? 'text-muted' : 'text-olive'].join(' ')}>{copy.cta}</span>
        </span>
      </span>
    </Link>
  );
}
