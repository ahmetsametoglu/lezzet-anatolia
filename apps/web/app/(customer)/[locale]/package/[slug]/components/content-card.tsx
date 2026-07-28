import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import type { StorefrontPackageItem } from '@/lib/storefront/storefront-types';
import type { Messages } from '../package-types';

/**
 * Paket içeriğinin tek kartı — "Pakette neler var?".
 *
 * **Kartın tamamı ürün detayına bağdır.** Sebebi yasal: alerjen ve içindekiler her üründe farklıdır,
 * müşteri satın almadan ÖNCE her kaleme ulaşabilmeli (`musteri-paket-detay.md §2`). Aynı sekmede
 * açılır — yeni sekme akışı koparır, geri dönüş pakete olmalı.
 *
 * **Fiyat YOK.** Tek fiyat kuralı (§6): kalem kırılımı gösterilmez, hediye kalem "0 €" olarak
 * görünmez. Sözleşmede alan zaten yok (`StorefrontPackageItem`), burada da basılacak bir şey yok.
 */
interface ContentCardProps {
  t: Messages;
  item: StorefrontPackageItem;
  /** Mobil: kart tek satıra iner, bağ metni sağa kayar ve kısalır. */
  compact?: boolean;
}

export function ContentCard({ t, item, compact = false }: ContentCardProps) {
  // Boy etiketi olmayan (tek boylu) üründe "· 1 adet" tek başına kalır; ayraç uydurulmaz.
  const qty = item.unitLabel
    ? t.contents.qty.replace('{label}', item.unitLabel).replace('{n}', String(item.qty))
    : t.contents.qtyPlain.replace('{n}', String(item.qty));

  return (
    <Link
      href={{ pathname: '/product/[slug]', params: { slug: item.slug } }}
      className={[
        'flex cursor-pointer items-center gap-3 rounded-soft border border-sand-100 bg-card transition-colors hover:border-olive-line',
        compact ? 'px-3 py-2.5' : 'p-3',
      ].join(' ')}
    >
      <FramedImage
        src={item.image.url}
        alt={item.name}
        ratio={1}
        crop={item.image.crop}
        className={compact ? 'size-13 flex-none' : 'size-16 flex-none'}
      />
      <div className="flex flex-col gap-0.5">
        <span className="font-sans text-note font-bold text-ink">{item.name}</span>
        <span className="font-sans text-micro text-muted">{qty}</span>
        {!compact && <span className="font-sans text-micro font-semibold text-olive">{t.contents.link}</span>}
      </div>
      {compact && <span className="ml-auto font-sans text-micro font-semibold text-olive">{t.contents.linkShort}</span>}
    </Link>
  );
}
