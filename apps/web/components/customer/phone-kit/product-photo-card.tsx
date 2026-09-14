import type { ComponentProps } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { Tag } from './tag';

/*
  KARE ÜRÜN KARTI — native `ProductPhotoCard`ın (`apps/mobile/src/components/ui/product-photo-card.tsx`) web
  telefon görünümündeki ikizi (14.09): katalog ızgarasının iki sütunlu kartı. Daire kart (`ProductCircleCard`)
  "fotoğraf + altında ad", bu kart "fotoğrafın İÇİNDE ad" — iki düzen, iki bileşen (native'in kararı).

  · Fiyat çipi kartın sağ üst köşesinden TAŞAR (+4°); bu yüzden kart kırpılmaz, kırpılan yalnız fotoğraf
    katmanı. Fiyat bilinmiyorsa çip hiç çizilmez (`productPriceLabel` künyesi).
  · Tek rozet yuvası sol üstte: tükendi indirimin önüne geçer — tükenmiş üründe indirim alınabilir bir şey
    söylemez.
  · SOLMA FOTOĞRAFA UYGULANIR, BİLGİYE DEĞİL (native 10.08): rozet, künye ve yer notu solan grubun dışında;
    solmanın sebebini söyleyen cümle okunur kalmalı. Skrim solan grupta kalır.
  · Yer notu (gönderemediğimiz ya da bölgede şu an olmayan ürün) kartın ortasında, kartı örten filigranın
    üstünde; "kargoyla gelir" kartta yazılmaz — listenin başındaki bant söyler (native 10.08).
*/

interface ProductPhotoCardProps {
  href: ComponentProps<typeof Link>['href'];
  name: string;
  image: CatalogImage;
  /** Biçimlenmiş fiyat ("12,90 €" · çok boyluda "12,90 €'dan"); verilmezse çip çizilmez. */
  priceLabel?: string;
  soldOut?: boolean;
  /** "Tükendi" — tükendiyse zorunlu (rozet metinsiz çizilmez). */
  soldOutLabel?: string;
  /** "Fırsat" rozeti — yalnız birim fiyatı gerçekten düşen üründe (`cardBadgeOf`). */
  discountLabel?: string;
  /** Yer notunun cümlesi — yalnız kapalı kapı ve bekleyen bölge konuşur. */
  placeNote?: string;
  /** Bu adrese hiç gitmeyen ürün — fotoğraf solar; kart yine açılır (detay "neden"i söyler). */
  dimmed?: boolean;
  /** "3 seçenek" — yalnız çok boylu üründe. */
  optionsLabel?: string;
}

export function ProductPhotoCard({
  href,
  name,
  image,
  priceLabel,
  soldOut = false,
  soldOutLabel,
  discountLabel,
  placeNote,
  dimmed = false,
  optionsLabel,
}: ProductPhotoCardProps) {
  const statusLabel = soldOut ? soldOutLabel : discountLabel;
  // Hiçbir yerde olmayan üründe "bu adrese gelmez" demek, cevabı olmayan bir soruya cevap vermek olurdu.
  const note = soldOut ? undefined : placeNote;
  const faded = soldOut || dimmed;

  return (
    <Link
      href={href}
      // Ekran okuyucu görenle aynı bilgiyi alır: ad · fiyat · rozet · yer notu.
      aria-label={[name, priceLabel, statusLabel, note].filter(Boolean).join(' · ')}
      className="relative block aspect-square cursor-pointer transition-transform hover:opacity-95 active:scale-[0.97]"
    >
      <span className={['absolute inset-0 block overflow-hidden rounded-card bg-sand-300', faded ? 'opacity-45' : ''].filter(Boolean).join(' ')}>
        {image.url !== null && (
          <FramedImage src={image.url} crop={image.crop} frames={image.frames} sizes="45vw" ratio={1} alt="" className="h-full w-full" />
        )}
        <span className="absolute inset-0 bg-linear-to-b from-ink-deep/0 from-40% to-scrim-heavy" />
      </span>

      {statusLabel !== undefined && (
        <span
          className={[
            'absolute top-2.5 left-2.5 rounded-badge px-2.5 py-1 font-sans text-badge-sm font-bold tracking-(--text-badge--letter-spacing) uppercase',
            soldOut ? 'bg-scrim-72 text-sand-50' : 'bg-sand-50 text-terracotta',
          ].join(' ')}
        >
          {statusLabel}
        </span>
      )}

      {/* İki satır kırpması kare kartta zorunlu: ad fotoğrafın üstünde yukarı büyür. */}
      <span className="absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5">
        <span className="line-clamp-2 font-serif text-body leading-[1.15] font-semibold text-on-image">{name}</span>
        {optionsLabel !== undefined && <span className="truncate font-sans text-micro font-semibold text-on-image-soft">{optionsLabel}</span>}
      </span>

      {note !== undefined && (
        <span className="absolute inset-0 grid place-items-center rounded-card bg-scrim px-3 text-center">
          <span className="line-clamp-3 font-sans text-body leading-[1.6] font-bold whitespace-pre-line text-on-image">{note}</span>
        </span>
      )}

      {priceLabel !== undefined && (
        <span className="absolute -top-2 -right-1.5">
          <Tag label={priceLabel} rotate={4} shadow />
        </span>
      )}
    </Link>
  );
}
