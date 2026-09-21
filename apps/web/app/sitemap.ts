import type { MetadataRoute } from 'next';
import { BundleService, ProductListingService, RecipeService, serviceDb } from '@lezzet/database';
import { LOCALES, siteOrigin, type AppRoute } from '@lezzet/i18n';
import { languageAlternates } from '@/lib/seo/alternates';

/**
 * Çok dilli site haritası — yalnız indekslenebilir rotalar, her satır öteki dillere bağlı. Kişiye
 * özel sayfalar burada yok, `robots.ts` de onları kapatır.
 */

// İstek anında üretilir: derlemede üretilseydi besleme öncesindeki boş veriyle donardı; derleme de DB istemez.
export const dynamic = 'force-dynamic';

/** Harita tavanı — `listActive` varsayılanı editoryal şeridin sınırı, harita ise yayındaki tarifin tamamını ister. */
const SITEMAP_RECIPE_LIMIT = 200;

/** Menüden ulaşılan, herkese açık rotalar. */
const STATIC_ROUTES: AppRoute[] = [
  '/',
  '/catalog',
  '/packages',
  '/recipes',
  '/professionals',
  '/discover',
  '/legal/delivery',
  '/legal/faq',
  '/legal/sales',
  '/legal/terms',
  '/legal/privacy',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = serviceDb();
  // `listSellable` aday/pasif ürünü ve ziyaretçi kanalında fiyatı olmayanı zaten eler — ayrı okuma aynı kuralın ikinci tanımı olurdu.
  const [products, bundles, recipes] = await Promise.all([
    new ProductListingService(db).listSellable(),
    new BundleService(db).listAll(),
    new RecipeService(db).listActive(SITEMAP_RECIPE_LIMIT),
  ]);

  const entries: MetadataRoute.Sitemap = [];
  for (const route of STATIC_ROUTES) entries.push(...localizedEntries(route));
  for (const product of products) entries.push(...localizedEntries('/product/[slug]', { slug: product.slug }));
  for (const bundle of bundles.filter((b) => b.isActive)) entries.push(...localizedEntries('/package/[slug]', { slug: bundle.slug }));
  for (const recipe of recipes) entries.push(...localizedEntries('/recipe/[slug]', { slug: recipe.slug }));

  return entries;
}

/** Bir rotanın üç dildeki satırı — dil bağları sayfaların `hreflang`iyle aynı kaynaktan. */
function localizedEntries(route: AppRoute, params: Record<string, string> = {}): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const hrefs = languageAlternates(route, params);
  const languages = Object.fromEntries(Object.entries(hrefs).map(([lang, href]) => [lang, `${origin}${href}`]));
  // `lastModified` yazılmaz: sayfa başına güvenilir bir değişim tarihi yok, uydurma tarih tarayıcıyı yanıltır.
  return LOCALES.map((locale) => ({ url: `${origin}${hrefs[locale]}`, alternates: { languages } }));
}
