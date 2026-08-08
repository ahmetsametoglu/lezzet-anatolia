import type { Metadata } from 'next';
import { brand } from '@lezzet/brand';
import { localizedPath, type AppRoute, type Locale } from '@lezzet/i18n';

/**
 * **Paylaşım kartı (Open Graph)** — `localeAlternates`'in kardeşi ve aynı disiplinde (08.1).
 *
 * ── NEDEN BİR KAPI, DÖRT SAYFAYA DAĞITILMIŞ BLOK DEĞİL ──────────────────────
 * Blok her `generateMetadata`'ya elle yazılsaydı dört kopya doğardı ve aralarındaki fark ilk gün
 * görünmezdi: biri `siteName` yazar öteki yazmaz, biri `locale` geçer öteki geçmez. Paylaşım
 * kartının test edilmesi zor (WhatsApp'ta görünene kadar fark edilmez), yani sessizce ayrışan bir
 * kopya haftalarca yanlış kart üretir. Kapı tek olunca yeni bir sayfa açan kişi de og'yi hreflang
 * gibi otomatik düşünür — sözleşme `SEO_I18N`'de yazılı.
 *
 * ── GÖRSEL YOKSA ALAN HİÇ YAZILMAZ ──────────────────────────────────────────
 * Boş bir `og:image` kartı görselsiz üretmez, KIRIK üretir: paylaşım aracı adresi çeker, alamaz ve
 * bazı istemcilerde kartın tamamını düşürür. Alanı hiç yazmamak, boş yazmaktan iyi
 * (`json-ld.tsx`'in "ne söylenirse doğru söylenir" kuralının aynısı).
 *
 * ── ADRES YOL TABLOSUNDAN TÜRER ─────────────────────────────────────────────
 * `og:url` elle yazılsaydı segment kelimesi dile göre değiştiği için (`/recettes` · `/tarifler`)
 * bir dilde yanlış adrese işaret ederdi. `metadataBase` (layout) göreli adresi mutlaklaştırıyor.
 */
interface OpenGraphInput {
  route: AppRoute;
  locale: Locale;
  /** `[param]` yer tutucuları — dinamik rotalarda slug. */
  params?: Record<string, string>;
  title: string;
  /** Yoksa alan yazılmaz; paylaşım aracı kendi özetini kurar. */
  description?: string | null;
  /** MUTLAK görsel adresi (`publicImageUrl` üretir). `null` → alan hiç yazılmaz. */
  image?: string | null;
  /**
   * Kart TÜRÜ. Varsayılan `website`; okunan içerik (tarif, yazı) `article` verir.
   *
   * `product` BİLEREK yok: paylaşımı alışveriş kartı olarak gösterip fiyat/stok beklentisi
   * doğurur, ve o alanları doğru doldurmak (`og:price`, `availability`) bizim bugün taşımadığımız
   * bir söz. Ürün sayfası da `website` olarak paylaşılıyor — kart yine ad, açıklama ve fotoğraf
   * gösteriyor, yalnız satın alma vaadi vermiyor.
   */
  type?: 'website' | 'article';
}

export function openGraphOf({ route, locale, params = {}, title, description, image, type = 'website' }: OpenGraphInput): Metadata['openGraph'] {
  return {
    type,
    title,
    ...(description ? { description } : {}),
    url: `/${locale}${localizedPath(route, locale, params)}`,
    siteName: brand.name,
    locale,
    ...(image ? { images: [image] } : {}),
  };
}
