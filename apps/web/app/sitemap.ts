import type { MetadataRoute } from 'next';
import { BundleService, ProductListingService, RecipeService, serviceDb } from '@lezzet/database';
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

/**
 * Haritaya girecek tarif TAVANI (08.24). `listActive` varsayılanı 12 ve o sayı mobil ana ekrandaki
 * şeridin sınırı — editoryal bir seçki. Harita ise seçki değil, indekslenebilir sayfaların listesi:
 * varsayılanla çağırmak yayındaki tariflerin çoğunu sessizce haritanın dışında bırakırdı.
 */
const SITEMAP_RECIPE_LIMIT = 200;

/** Menüden ulaşılan ve herkese açık olan rotalar — sıra önem sırasıdır, `priority` ondan türer. */
const STATIC_ROUTES: AppRoute[] = [
  '/',
  '/catalog',
  '/packages',
  // Tarifler (08.24) — ziyaretçiye açık ve ARAMADAN trafik alan bir sayfa: "recette börek",
  // "türkisches rezept" türü sorgular ürün sayfalarına değil buraya düşer. Menüden de ulaşılıyor.
  '/recipes',
  // Professionnels (08.7) — ziyaretçiye açık ve aranan bir sayfa: "grossiste turc" türü sorgular
  // tam olarak buraya düşer. Adres dile göre çevrildiği için üç satırı da harita taşıyor.
  '/professionals',
  // Keşif (08.7) — ziyaretçiye açık; menüden ulaşılıyor ve kimlik istemiyor. İçeriği (aday
  // kartları) değişken ve satılık DEĞİL, yani sayfanın indekslenen değeri kartlar değil çerçevesi;
  // yine de menüden ulaşılan her açık sayfa gibi haritada yeri var.
  '/discover',
  '/legal/delivery',
  '/legal/faq',
  '/legal/sales',
  '/legal/terms',
  '/legal/privacy',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = serviceDb();
  // `listSellable` "aday ve pasif hariç" VE "ziyaretçinin kanalında fiyatı var" süzüyor (08.46) —
  // haritaya özel ikinci bir okuma yazmak, aynı kuralın iki tanımı olurdu ve biri bir gün aday
  // ürünleri indekse açardı. İkinci süzgeç 24.08'de eklendi: yalnız toptana fiyatlanmış bir ürünün
  // adresi haritada duruyordu, yani arama motoru anonim ziyaretçinin alamayacağı sayfaya çağrılıyordu.
  const [products, bundles, recipes] = await Promise.all([
    new ProductListingService(db).listSellable(),
    new BundleService(db).listAll(),
    // `listActive` zaten yalnız YAYINDAKİLERİ veriyor — taslak tarif haritaya girmez, çünkü sayfası
    // da 404 döner (`getRecipeDetail`). Sınır listenin sayfa tavanı değil harita tavanıdır: harita
    // "şunları indeksle" davetidir, gösterim kararı değil.
    new RecipeService(db).listActive(SITEMAP_RECIPE_LIMIT),
  ]);

  const entries: MetadataRoute.Sitemap = [];
  for (const route of STATIC_ROUTES) entries.push(...localizedEntries(route));
  for (const product of products) entries.push(...localizedEntries('/product/[slug]', { slug: product.slug }));
  // Pasif paket haritaya girmez: satılmayan bir sayfaya trafik çekmek, ziyaretçiyi boş bir rafa
  // götürmektir. Aynı süzme ürün tarafında sorgunun içinde yapılıyor.
  for (const bundle of bundles.filter((b) => b.isActive)) entries.push(...localizedEntries('/package/[slug]', { slug: bundle.slug }));
  for (const recipe of recipes) entries.push(...localizedEntries('/recipe/[slug]', { slug: recipe.slug }));

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
