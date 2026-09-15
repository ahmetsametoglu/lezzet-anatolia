import type { ComponentProps } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { Link } from '@/i18n/navigation';
import { CirclePhoto } from './circle-photo';
import { Tag } from './tag';

/*
  Fiyat bilinmiyorsa çip hiç çizilmez (sıfır yazılmaz); indirim rozeti yalnız fırsat içindir, kampanya kesitin
  özelliğidir. Solma yalnız fotoğrafa uygulanır ki yer işaretinin cümlesi okunur kalsın.
*/

interface ProductCircleCardProps {
  href: ComponentProps<typeof Link>['href'];
  /** Geçmişe eklemeden yerine koy: kardeş ürüne geçişte geri, ürün zincirine girilen yere döner. */
  replace?: boolean;
  name: string;
  /** Biçimlenmiş fiyat (`productPriceLabel`); verilmezse çip çizilmez. */
  priceLabel?: string;
  image: CatalogImage;
  /** "Fırsat" rozeti — verilirse sol üstte hap köşe. */
  discountLabel?: string;
  /** Yer işaretinin cümlesi — yalnız kapalı kapı ve bekleyen bölge konuşur. */
  mark?: string;
  /** Bu adrese hiç gitmeyen ürün — daire solar. */
  dimmed?: boolean;
  size?: 'lg' | 'sm';
}

/** Çap ve baş harf kademesi boya göre: `lg` vitrin rayı, `sm` benzer ürün rayı. */
const SIZE = {
  lg: { diameter: 146, box: 'w-[146px]', circle: 'size-[146px]', initial: 'text-h1-sm text-muted' },
  sm: { diameter: 120, box: 'w-[120px]', circle: 'size-[120px]', initial: 'text-h2-sm text-muted' },
} as const;

export function ProductCircleCard({ href, replace = false, name, priceLabel, image, discountLabel, mark, dimmed = false, size = 'lg' }: ProductCircleCardProps) {
  const box = SIZE[size];
  return (
    <Link
      href={href}
      replace={replace}
      aria-label={[name, priceLabel, mark].filter(Boolean).join(' · ')}
      className={`flex ${box.box} flex-none cursor-pointer flex-col items-center gap-1.5 transition-transform hover:opacity-90 active:scale-[0.97]`}
    >
      <span className={`relative block ${box.circle}`}>
        <CirclePhoto
          image={image}
          initial={name.slice(0, 1)}
          size={box.diameter}
          initialClassName={box.initial}
          className={dimmed ? 'opacity-45' : undefined}
        />
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
