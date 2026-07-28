import { RATIO_SOURCE } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatPrice, formatWeight } from '@/lib/storefront/format';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';
import { buttonClass } from './button';

/**
 * K28 · Paket Liste Kartı — Paketler sayfasının tek yapı taşı.
 *
 * **Kartın TAMAMI bağlantıdır** ve detaya gider; listede "sepete ekle" YOKTUR. Sebep tasarımda
 * yazılı: paket bütün olarak satılıyor, karar detayda veriliyor — listeden tek dokunuşla sepete
 * atmak, içeriğini görmeden 50 €'luk bir sofra almak demek.
 *
 * Künye satırları TÜRETİLMİŞ bilgilerdir ve **hesaplanamıyorsa hiç basılmaz** (uydurulmaz):
 * "kaç kişilik" girilmemişse rozet yok, bir kalemin ağırlığı bilinmiyorsa toplam ağırlık yok.
 *
 * Tükendi hâli kartı GİZLEMEZ, soluklaştırır: paket bir pazarlama aracı — sosyal medyada dolaşan
 * link boşa düşmemeli, "yakında yeniden" beklentisi sürmeli. Kart tıklanabilir kalır.
 */
interface PackageCardLabels {
  serves: string;
  items: string;
  weight: string;
  inRouteOnly: string;
  soldOut: string;
  cta: string;
}

interface PackageListCardProps {
  pack: StorefrontPackage;
  locale: Locale;
  labels: PackageCardLabels;
  compact?: boolean;
}

export function PackageListCard({ pack, locale, labels, compact = false }: PackageListCardProps) {
  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      className={[
        'flex cursor-pointer flex-col overflow-hidden rounded-card border border-sand-200 bg-card transition-colors hover:border-olive-line',
        pack.soldOut ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="relative">
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SOURCE} crop={pack.image.crop} className="!rounded-none" />
        {/* "6 kişilik" künyesi fotoğrafın üstünde durur; girilmemişse rozet HİÇ çizilmez. */}
        {pack.serves !== null && (
          <span className="pointer-events-none absolute top-3 left-3 rounded-soft bg-ink/80 px-2.5 py-1 font-sans text-micro font-bold text-white">
            {labels.serves.replace('{n}', String(pack.serves))}
          </span>
        )}
      </div>

      <div className={['flex flex-1 flex-col gap-2', compact ? 'p-3' : 'px-4.5 pt-4 pb-4.5'].join(' ')}>
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{pack.name}</span>

        <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
          {labels.items.replace('{n}', String(pack.itemCount))}
          {pack.totalWeightG !== null && ` · ${labels.weight.replace('{weight}', formatWeight(pack.totalWeightG, locale))}`}
        </span>

        {/* Açıklama kartın esneyen parçası: ızgara boyunca kart yükseklikleri eşitlensin diye
            `flex-1` ondadır, fiyat satırı böylece daima alt hizada durur (tasarım). */}
        {!compact && pack.description && (
          <p className="line-clamp-3 flex-1 font-sans text-note leading-relaxed text-body">{pack.description}</p>
        )}

        {pack.inRouteOnly && (
          <span className="w-max rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-micro font-semibold text-olive-dark">
            {labels.inRouteOnly}
          </span>
        )}

        <div className={['mt-auto flex items-center justify-between gap-2 pt-1', compact ? 'flex-col items-start gap-1.5' : ''].join(' ')}>
          {pack.soldOut ? (
            <span className="font-sans text-note font-semibold text-muted">{labels.soldOut}</span>
          ) : (
            <span className={['font-sans font-bold text-ink', compact ? 'text-body' : 'text-card-title'].join(' ')}>
              {formatPrice(pack.priceCents, locale)}
            </span>
          )}
          {!compact && !pack.soldOut && <span className={buttonClass({ size: 'sm', className: '!px-5 !py-2.5 !text-body-sm' })}>{labels.cta}</span>}
        </div>
      </div>
    </Link>
  );
}
