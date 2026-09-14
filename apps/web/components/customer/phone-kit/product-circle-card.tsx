import type { ComponentProps } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { Link } from '@/i18n/navigation';
import { CirclePhoto } from './circle-photo';
import { Tag } from './tag';

/*
  YUVARLAK ÜRÜN KARTI — native `ProductCircleCard`ın web ikizi (vitrin rayı, 146'lık çap · 14.09).

  · Fiyat çipi dairenin sağ alt köşesinden taşan eğik rozettir; fiyat BİLİNMİYORSA çip hiç çizilmez
    (sıfır yazılmaz — `productPriceLabel` künyesi).
  · İndirim rozeti yalnız FIRSAT içindir (`cardBadgeOf`): kampanya ürünün değil kesitin özelliği.
  · Yer işareti (bu adrese gelmeyen ürün) dairenin İÇİNDE, filigranın üstünde yazı olarak durur;
    solma yalnız fotoğrafa uygulanır ki solmanın SEBEBİ okunur kalsın (native 10.08 kararı).
*/

interface ProductCircleCardProps {
  href: ComponentProps<typeof Link>['href'];
  name: string;
  /** Biçimlenmiş fiyat ("12,90 €" ya da çok boyluda "12,90 €'dan"); verilmezse çip çizilmez. */
  priceLabel?: string;
  image: CatalogImage;
  /** "Fırsat" rozeti — verilirse sol üstte hap köşe. */
  discountLabel?: string;
  /** Yer işaretinin cümlesi — yalnız kapalı kapı ve bekleyen bölge konuşur. */
  mark?: string;
  /** Bu adrese hiç gitmeyen ürün — daire solar. */
  dimmed?: boolean;
}

export function ProductCircleCard({ href, name, priceLabel, image, discountLabel, mark, dimmed = false }: ProductCircleCardProps) {
  return (
    <Link
      href={href}
      aria-label={[name, priceLabel, mark].filter(Boolean).join(' · ')}
      className="flex w-[146px] flex-none cursor-pointer flex-col items-center gap-1.5 transition-transform hover:opacity-90 active:scale-[0.97]"
    >
      <span className="relative block size-[146px]">
        <CirclePhoto image={image} initial={name.slice(0, 1)} size={146} className={dimmed ? 'opacity-45' : undefined} />
        {discountLabel !== undefined && (
          <span className="absolute top-2.5 left-0">
            <Tag label={discountLabel} tone="cream" rotate={-7} shadow shape="pill" />
          </span>
        )}
        {mark !== undefined && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-scrim px-2.5 text-center font-sans text-badge-sm leading-3 font-bold whitespace-pre-line text-cream">
            {mark}
          </span>
        )}
        {priceLabel !== undefined && (
          <span className="absolute -right-0.5 -bottom-0.5">
            <Tag label={priceLabel} rotate={4} shadow />
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-center font-serif text-body-sm leading-[1.15] font-semibold text-ink">{name}</span>
    </Link>
  );
}
