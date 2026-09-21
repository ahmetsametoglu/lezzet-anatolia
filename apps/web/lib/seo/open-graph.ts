import type { Metadata } from 'next';
import { brand } from '@lezzet/brand';
import { INTL_LOCALE, localizedHref, type AppRoute, type Locale } from '@lezzet/i18n';
import type { StorefrontImage } from '@lezzet/application';

/**
 * Paylaşım kartı (Open Graph) — tek kapı, çünkü sayfalara dağılmış kopyalar ancak WhatsApp'ta
 * görünen biçimde ayrışırdı. Görsel yoksa alan hiç yazılmaz: boş `og:image` kartı kırık üretir.
 */
interface OpenGraphInput {
  route: AppRoute;
  locale: Locale;
  /** `[param]` yer tutucuları — dinamik rotalarda slug. */
  params?: Record<string, string>;
  title: string;
  /** Yoksa alan yazılmaz; paylaşım aracı kendi özetini kurar. */
  description?: string | null;
  /** Çözülmüş görsel künyesi (`imageOf`). Görsel yoksa (`null` ya da `url` boş) alan hiç yazılmaz. */
  image?: StorefrontImage | null;
  /** Kartın çerçevesi — koleksiyon kapağı `band`, çünkü kırpma penceresi onu paylaşım kartı diye önizliyor. */
  shareFrame?: 'chat' | 'band';
  /** Kart türü; okunan içerik `article`. `product` yok: fiyat/stok alanlarını doğru doldurma sözü taşımıyoruz. */
  type?: 'website' | 'article';
}

/** Paylaşım kartının görsel adresi — CDN çerçevesi varsa onun tek adresi, yoksa özgün dosya. */
export function shareImageUrl(image: StorefrontImage | null | undefined, frame: 'chat' | 'band' = 'chat'): string | null {
  return image?.frames?.[frame].src ?? image?.url ?? null;
}

export function openGraphOf({ route, locale, params = {}, title, description, image, shareFrame, type = 'website' }: OpenGraphInput): Metadata['openGraph'] {
  const imageUrl = shareImageUrl(image, shareFrame);
  return {
    type,
    title,
    ...(description ? { description } : {}),
    url: localizedHref(route, locale, params),
    siteName: brand.name,
    // Open Graph dil_BÖLGE biçimi bekler (`fr_FR`).
    locale: INTL_LOCALE[locale].replace('-', '_'),
    ...(imageUrl ? { images: [imageUrl] } : {}),
  };
}
