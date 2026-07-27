import type { Locale } from '@lezzet/i18n';
import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Price } from '@/components/customer/ui/price';
import { Link } from '@/i18n/navigation';
import type { StorefrontProduct } from '@/lib/storefront/storefront-types';

/**
 * "Bunları da sevebilirsiniz" — MOBİL şerit. Yatay kaydırılan 140 px kartlar; yalnız görsel, ad ve
 * fiyat taşır.
 *
 * Neden tam ürün kartı değil: mobilde iki sütunluk bir ızgara, benzer ürünleri sayfanın ana konusu
 * gibi gösterir ve sabit satın alma çubuğunu ekranlarca aşağı iter. Şerit "devam etmek istersen
 * buradalar" der, "şimdi bunlara bak" demez — bu yüzden aksiyon düğmesi de yoktur; karar detayda.
 * Masaüstünde tasarım tam kartlı dört sütunluk ızgara gösterir, orası `ProductCard` kullanır.
 */
interface SimilarStripProps {
  products: StorefrontProduct[];
  locale: Locale;
}

export function SimilarStrip({ products, locale }: SimilarStripProps) {
  return (
    <div className="flex gap-2.5 overflow-x-auto">
      {products.map((p) => (
        <Link
          key={p.id}
          href={{ pathname: '/product/[slug]', params: { slug: p.slug } }}
          className="w-[140px] flex-none cursor-pointer overflow-hidden rounded-soft border border-sand-200 bg-card"
        >
          <FramedImage src={p.image.url} alt={p.name} ratio={RATIO_SOURCE} crop={p.image.crop} className="!rounded-none" />
          <div className="flex flex-col gap-1 p-2.5">
            <span className="font-sans text-micro font-bold text-ink">{p.name}</span>
            <Price cents={p.priceCents} wasCents={p.wasCents} locale={locale} size="sm" />
          </div>
        </Link>
      ))}
    </div>
  );
}
