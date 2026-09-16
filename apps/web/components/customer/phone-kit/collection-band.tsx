import type { ComponentProps } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { Link } from '@/i18n/navigation';
import { CirclePhoto } from './circle-photo';
import { Tag } from './tag';

/*
  KOLEKSİYON BANDI — vitrinin kenardan kenara uzanan renkli şeridi; kesitin adını ve kaç çeşit
  olduğunu söyler, katalogda o süzgeci açar. Native vitrinin bandıyla aynı tasarım.

  · Ton ve yön SIRADAN türer, veriden değil: zeytin → kum → terracotta; tek sırada metin solda/daire
    sağda, çift sırada tersi.
  · Daire (148) banttan (132) taşar ve şeridin dışına sarkar — tasarımın imzası. Daire kendi bandının
    içinde `z-10` ile komşu bandın üstüne çıkıyor; yatay taşmayı sayfa kaydırmasına çevirmemek
    çağıranın işi (`overflow-x-clip`).
  · Basılı geri bildirim YALNIZ metne uygulanır: banda opaklık vermek bir yığın bağlamı açar ve
    dairesi komşu bandın altında kalırdı.
  · Kampanya rozeti dairenin BANDA BAKAN köşesinde; eşikli kampanya rozete girmez, sayaç satırında
    tam cümlesiyle durur (`bandCountLabel`).
*/

const TONES = ['olive', 'sand', 'terracotta'] as const;

const TONE: Record<(typeof TONES)[number], { band: string; accent: string; title: string }> = {
  olive: { band: 'bg-olive', accent: 'text-olive-light', title: 'text-sand-50' },
  sand: { band: 'bg-sand-150', accent: 'text-terracotta', title: 'text-ink' },
  terracotta: { band: 'bg-terracotta', accent: 'text-terracotta-line', title: 'text-card' },
};

interface CollectionBandProps {
  href: ComponentProps<typeof Link>['href'];
  name: string;
  /** Adın altındaki cümle; `null` = yazılmamış → satır çizilmez (yedek metin uydurulmaz). */
  subtitle: string | null;
  /** "12 çeşit ›" — sayı veriden, cümle ortak kurucudan (`bandCountLabel`). */
  countLabel: string;
  /** Kesitin eşiksiz kampanya rozeti (`scopeBadgeOf`). */
  discountLabel?: string;
  /** Listedeki sıra — ton ve yön bundan türer. */
  index: number;
  image: CatalogImage;
}

export function CollectionBand({ href, name, subtitle, countLabel, discountLabel, index, image }: CollectionBandProps) {
  const tone = TONE[TONES[index % TONES.length] ?? 'olive'];
  const mirrored = index % 2 === 1;
  const align = mirrored ? 'text-right' : '';
  return (
    <Link href={href} aria-label={`${name} · ${countLabel}`} className={['group relative flex h-[132px] cursor-pointer items-center', tone.band].join(' ')}>
      <span
        className={[
          'flex max-w-[56%] flex-col gap-0.5 transition-opacity group-hover:opacity-80 group-active:opacity-55',
          mirrored ? 'mr-5.5 ml-auto' : 'ml-5.5',
        ].join(' ')}
      >
        <span className={['truncate font-sans text-eyebrow-xs tracking-normal uppercase', tone.accent, align].join(' ')}>{name}</span>
        {subtitle !== null && (
          <span className={['line-clamp-2 font-serif text-h2-sm leading-[1.15]', tone.title, align].join(' ')}>{subtitle}</span>
        )}
        <span className={['font-sans text-helper font-bold', tone.accent, align].join(' ')}>{countLabel}</span>
      </span>
      <span
        aria-hidden
        style={{ rotate: mirrored ? '-6deg' : '5deg' }}
        className={['absolute -top-2 z-10 block', mirrored ? '-left-7.5' : '-right-7.5'].join(' ')}
      >
        <CirclePhoto
          image={image}
          initial={name.slice(0, 1)}
          size={148}
          emptyClassName="bg-scrim-soft"
          initialClassName="text-h1-sm text-on-image-soft"
        />
        {discountLabel !== undefined && (
          <span className={['absolute top-3', mirrored ? '-right-2' : '-left-2'].join(' ')}>
            <Tag label={discountLabel} shape="pill" shadow />
          </span>
        )}
      </span>
    </Link>
  );
}
