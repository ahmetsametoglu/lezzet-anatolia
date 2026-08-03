import type { MetadataRoute } from 'next';
import { BundleService, ProductService, serviceDb } from '@lezzet/database';
import { LOCALES, localizedPath, siteOrigin, type AppRoute } from '@lezzet/i18n';

/**
 * Çok dilli site haritası (08.1) — üç dilin üç ayrı URL'i, her biri diğerlerine `alternates` ile
 * bağlı.
 *
 * **Neden `alternates` şart:** harita olmadan da sayfalar bulunur, ama Google hangi üç URL'in aynı
 * sayfanın çevirisi olduğunu ancak burada (ve `hreflang` etiketlerinde) öğrenir. İkisi birden
 * verilir çünkü ikisi farklı zamanlarda okunur — harita taramayı yönlendirir, etiket sayfayı
 * gördüğünde doğrular.
 *
 * **Yalnız İNDEKSLENEBİLİR rotalar.** Sepet, checkout, hesap, siparişler ve talepler burada yok ve
 * `robots.ts` de onları kapatıyor: kişiye özel ya da oturum gerektiren sayfaların arama sonucunda
 * işi yok. Harita bir "sitede neler var" listesi değil, "şunları indeksle" davetidir.
 *
 * Ürün ve paket slug'ları veritabanından okunuyor; slug dilden BAĞIMSIZ (içerikten türer,
 * `PATHNAMES` künyesi) — yani üç dil aynı slug'ı paylaşır, yalnız segment kelimesi değişir.
 */

/** Menüden ulaşılan ve herkese açık olan rotalar — sıra önem sırasıdır, `priority` ondan türer. */
const STATIC_ROUTES: AppRoute[] = [
  '/',
  '/catalog',
  '/packages',
  // Professionnels (08.7) — ziyaretçiye açık ve aranan bir sayfa: "grossiste turc" türü sorgular
  // tam olarak buraya düşer. Adres dile göre çevrildiği için üç satırı da harita taşıyor.
  '/professionals',
  '/legal/delivery',
  '/legal/faq',
  '/legal/sales',
  '/legal/terms',
  '/legal/privacy',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = serviceDb();
  // `listSellable` zaten "aday ve pasif hariç" süzüyor — haritaya özel ikinci bir okuma yazmak,
  // aynı kuralın iki tanımı olurdu ve biri bir gün aday ürünleri indekse açardı.
  const [products, bundles] = await Promise.all([
    new ProductService(db).listSellable(),
    new BundleService(db).listAll(),
  ]);

  const entries: MetadataRoute.Sitemap = [];
  for (const route of STATIC_ROUTES) entries.push(...localizedEntries(route));
  for (const product of products) entries.push(...localizedEntries('/product/[slug]', { slug: product.slug }));
  // Pasif paket haritaya girmez: satılmayan bir sayfaya trafik çekmek, ziyaretçiyi boş bir rafa
  // götürmektir. Aynı süzme ürün tarafında sorgunun içinde yapılıyor.
  for (const bundle of bundles.filter((b) => b.isActive)) entries.push(...localizedEntries('/package/[slug]', { slug: bundle.slug }));

  return entries;
}

/** Bir rotanın üç dildeki satırı — her satır diğer ikisine `alternates` ile bağlanır. */
function localizedEntries(route: AppRoute, params: Record<string, string> = {}): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${origin}/${l}${localizedPath(route, l, params)}`]));
  return LOCALES.map((locale) => ({
    url: `${origin}/${locale}${localizedPath(route, locale, params)}`,
    // `lastModified` YAZILMIYOR ve bu bilinçli: elimizde sayfa başına güvenilir bir değişim tarihi
    // yok (ürün satırının `updatedAt`i fiyat değişiminde de oynar, sayfanın içeriği değişmese de).
    // Uydurma bir tarih, tarayıcıya yanlış bilgi vermektir — alanı hiç yazmamak dürüst olanı.
    alternates: { languages },
  }));
}
