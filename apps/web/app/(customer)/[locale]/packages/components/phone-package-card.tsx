import { cardPlaceNoteOf, formatPrice, packageRouteStatusOf, placeMarkOf } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type packagesMessages from '@lezzet/i18n/customer/packages';
import placeMessages from '@lezzet/i18n/customer/place';
import { RATIO_BAND } from '@lezzet/types';
import { PhotoSurface } from '@/components/customer/phone-kit/photo-surface';
import { Tag } from '@/components/customer/phone-kit/tag';
import { Link } from '@/i18n/navigation';
import type { StorefrontPackage, StorefrontPackageItem } from '@/lib/storefront/storefront-types';
import { packageNoteOf } from './package-note';

/*
  Paket listesi kartı (tasarım "Paketler"): fotoğrafta fiyat rozeti, ad ve künye; beyaz gövdede açıklama, içerik çipleri, teslim notu ve "Paketi incele".
  Kartın tamamı detaya bağdır: paket içeriği görülmeden sepete eklenmez.
*/

type PackagesCopy = LocalizedCopy<typeof packagesMessages>;

interface PhonePackageCardProps {
  pack: StorefrontPackage;
  copy: PackagesCopy;
  locale: Locale;
  /** Çözülmüş yerin rota bilgisi — yer notunun geçici mi kalıcı mı olduğunu söyler; `null` = yer bilinmiyor. */
  place: { inRoute: boolean } | null;
}

/** İçerik çipi: boy etiketi + ürün adı, birden çok adette sonda "(×2)". */
function itemLabelOf(item: StorefrontPackageItem, copy: PackagesCopy): string {
  const label = [item.unitLabel, item.name].filter((part) => part !== '').join(' ');
  return item.qty > 1 ? copy.item.replace('{label}', label).replace('{qty}', String(item.qty)) : label;
}

export function PhonePackageCard({ pack, copy, locale, place }: PhonePackageCardProps) {
  // Tükenmiş pakette adres sorusu anlamsız: yalnız paketin kendi gerçeği konuşur.
  const mark = pack.soldOut ? null : placeMarkOf(packageRouteStatusOf(pack.route), place, placeMessages[locale]);
  const { dimmed } = cardPlaceNoteOf(mark, placeMessages[locale]);
  const note = packageNoteOf(pack, mark?.tone ?? null, copy.note, locale);

  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      // Ekran okuyucu görenle aynı bilgiyi alır: ad · durum · teslim notu.
      aria-label={[copy.open.replace('{name}', pack.name), pack.soldOut ? copy.card.soldOut : undefined, note].filter(Boolean).join(' · ')}
      className={[
        'block cursor-pointer overflow-hidden rounded-[24px] border-[1.5px] border-sand-200 bg-card shadow-[0_4px_18px_color-mix(in_srgb,var(--color-ink)_7%,transparent)] transition-transform hover:opacity-95 active:scale-[0.985]',
        pack.soldOut ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="relative block h-49.5">
        <PhotoSurface
          image={pack.image}
          initial={pack.name.slice(0, 1)}
          ratio={RATIO_BAND}
          sizes="100vw"
          scrim
          // Paket bu adrese hiç gelmiyorsa fotoğraf solar; sebebi alt satırda okunur.
          className={['absolute inset-0', dimmed ? 'opacity-45' : ''].filter(Boolean).join(' ')}
        />
        {pack.soldOut && (
          <span className="absolute top-3.5 left-3.5 rounded-badge bg-sand-50/94 px-2.75 py-1.25 font-sans text-micro font-bold text-body">
            {copy.card.soldOut}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <Tag label={formatPrice(pack.priceCents, locale)} tone={pack.soldOut ? 'muted' : 'terracotta'} size="lg" rotate={3} shadow />
        </span>
        <span className="absolute inset-x-4 bottom-3.5 flex flex-col gap-0.75">
          <span className="font-serif text-card-title leading-[1.1] text-on-image">{pack.name}</span>
          <span className="font-sans text-eyebrow-xs text-olive-light">{copy.meta.replace('{n}', String(pack.itemCount))}</span>
        </span>
      </span>
      <span className="flex flex-col gap-2.75 px-4 pt-3.5 pb-4">
        {pack.description !== '' && <span className="font-sans text-note leading-[1.55] text-body">{pack.description}</span>}
        {pack.items.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {pack.items.map((item, i) => (
              <span key={`${item.variantId}-${i}`} className="rounded-[11px] bg-sand-50 px-2.5 py-1.25 font-sans text-micro font-semibold text-body">
                {itemLabelOf(item, copy)}
              </span>
            ))}
          </span>
        )}
        <span className="flex items-center gap-2.5 border-t-[1.5px] border-dashed border-sand-200 pt-2.75">
          <span className="min-w-0 flex-1 font-sans text-micro text-muted">{note}</span>
          <span className={['flex-none font-sans text-note font-bold', pack.soldOut ? 'text-muted' : 'text-olive'].join(' ')}>{copy.cta}</span>
        </span>
      </span>
    </Link>
  );
}
