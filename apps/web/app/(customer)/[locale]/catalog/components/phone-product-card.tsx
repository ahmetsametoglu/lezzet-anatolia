import type { ComponentProps } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { Link } from '@/i18n/navigation';
import { Tag } from '@/components/customer/phone-kit/tag';

/*
  Kare ürün kartı, native kataloğun kart ikizi: ad fotoğrafın içinde, fiyat çipi sağ üst köşeden taşar ve bu yüzden
  yalnız fotoğraf katmanı kırpılır. Solma fotoğrafa uygulanır, bilgiye değil: rozet, künye ve yer notu okunur kalır.
*/

interface PhoneProductCardProps {
  href: ComponentProps<typeof Link>['href'];
  name: string;
  image: CatalogImage;
  /** Biçimlenmiş fiyat (`productPriceLabel`); verilmezse çip çizilmez. */
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

export function PhoneProductCard({
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
}: PhoneProductCardProps) {
  // Hiçbir yerde olmayan üründe "bu adrese gelmez" demek, cevabı olmayan bir soruya cevap vermek olurdu.
  const note = soldOut ? undefined : placeNote;
  /* Şerit varken indirim rozeti çizilmez (tasarım): ikisi de fotoğrafın üst şeridinde durur ve bu adrese gelmeyen
     üründe indirim, alınamayacak bir şeyin vaadidir. */
  const statusLabel = soldOut ? soldOutLabel : note !== undefined ? undefined : discountLabel;
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
        {/* Şerit KÜNYENİN ÜSTÜNDE: fiyat çipi kartın sağ üst köşesinden dışarı taşıyor ve şerit
            tepede dursaydı çip onun sağ ucuna binerdi. */}
        {note !== undefined && (
          <span className="mb-1 flex items-center gap-1.5 rounded-badge bg-sand-50/94 px-2 py-1">
            <MobileIcon name="delivery-off" size={11} className="flex-none text-terracotta" />
            <span className="truncate font-sans text-badge-sm font-bold tracking-(--text-badge--letter-spacing) text-terracotta uppercase">
              {note}
            </span>
          </span>
        )}
        <span className="line-clamp-2 font-serif text-body leading-[1.15] font-semibold text-on-image">{name}</span>
        {optionsLabel !== undefined && <span className="truncate font-sans text-micro font-semibold text-on-image-soft">{optionsLabel}</span>}
      </span>

      {priceLabel !== undefined && (
        <span className="absolute -top-2 -right-1.5">
          <Tag label={priceLabel} tone={note === undefined ? 'terracotta' : 'blocked'} rotate={4} shadow />
        </span>
      )}
    </Link>
  );
}
