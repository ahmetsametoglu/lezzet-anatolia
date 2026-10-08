import { BundleService, RecipeService } from '@lezzet/database';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { HomePackage, HomeRecipe, PreferredLanguage, RecipeWithItems } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from './map';
import { getPackagesByIds, listStorefrontPackages } from './packages';
import { readShownRecipeVariantIds } from './recipe';
import { resolvedOrNull } from './resolved-text';
import type { PlaceWarehouses, StorefrontPackage } from './storefront-types';

/**
 * Tarif ve paket kartının okuma kapısı: telefonun "Fikirler" listeleri ve vitrin şeritleri tek karttan okur, fiyat, tükendi ve yol kararları
 * paket kapısından gelir. İki küme de operatörün kurduğu editoryal seçki, o yüzden sayfalama yok, sınır var.
 */

/** "Sofradan Fikirler" şeridi: tasarımda üç kart. */
export const HOME_RECIPE_LIMIT = 3;
/** Vitrinin "Hazır paketler" bölümü: tasarımda iki büyük kart. */
export const HOME_PACKAGE_LIMIT = 2;

/**
 * Tarif listesinin emniyet tavanı, sayfalama değil: elle kurulan küme bu sayıya yaklaşırsa cevap sınırı gözden geçirmektir.
 */
export const RECIPE_LIST_LIMIT = 60;

/**
 * Tarif kartı bir içerik kartıdır, fiyat ve stok okunmaz. Malzeme sayısı tarif sayfasında çizilen satırlardan sayılır.
 */
function toRecipeCard(recipe: RecipeWithItems, locale: PreferredLanguage, shown: ReadonlySet<string>): HomeRecipe {
  const pantry = resolvedOrNull(recipe.pantry, locale);
  return {
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    duration: resolvedOrNull(recipe.duration, locale),
    serves: resolvedOrNull(recipe.serves, locale),
    itemCount: recipe.items.filter((item) => shown.has(item.variantId)).length,
    // "Evinizden" maddeleri: satır = madde (`splitLines`, iki yüzeyin tek kuralı).
    pantryCount: pantry ? splitLines(pantry).length : 0,
    image: imageOf(recipe),
  };
}

/**
 * Paket kartı kapının ürettiği vitrin kartını sözleşme şekline indirger; kapının kartı ekranın taşımadığı alanları da içerir.
 */
function toPackageCard(pack: StorefrontPackage): HomePackage {
  return {
    slug: pack.slug,
    name: pack.name,
    priceCents: pack.priceCents,
    // Satır sayısı, adet toplamı DEĞİL ("5 ürün" — sözleşme künyesi).
    itemCount: pack.itemCount,
    image: pack.image,
    // `soldOut` ağ geneli ("hiç var mı"), `route` yere bağlı ve yer bilinmiyorsa `null`.
    soldOut: pack.soldOut,
    route: pack.route,
    description: pack.description,
    coldChain: pack.coldChain,
    inRouteOnly: pack.inRouteOnly,
    items: pack.items.map((item) => ({ name: item.name, unitLabel: item.unitLabel, qty: item.qty, thumbUrl: item.thumbUrl })),
  };
}

/**
 * Yayındaki tarifler editoryal sırada, kart şeklinde; kalemler tek sorguda gelir ve taslak tarif taşınmaz.
 */
export async function readRecipeCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  limit: number,
): Promise<HomeRecipe[]> {
  const rows = await new RecipeService(db).listActiveWithItems(limit);
  const shown = await readShownRecipeVariantIds(db, rows);
  return rows.map((recipe) => toRecipeCard(recipe, locale, shown));
}

/**
 * Paket kartları satılabilirliği detayla aynı kapıdan (`listSellable`) okur, yoksa listede görünen paket dokununca 404 verirdi. İşaret
 * süzgeci yalnız vitrinde: işaret bir seçimdir ve yedeği yoktur; `limit` verilmezse liste kümenin tamamıdır.
 */
export async function readPackageCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  options: { featuredOnly: boolean; limit?: number; place: PlaceWarehouses },
): Promise<HomePackage[]> {
  const place = options.place;

  if (!options.featuredOnly) {
    /* Liste sayfası kapının tam listesi: `limit` verilmeden çağrılır ki kapı masaüstünün "işaret yoksa ilk N" yedeğine girmesin. */
    const cards = await listStorefrontPackages(db, locale, undefined, place);
    const page = options.limit === undefined ? cards : cards.slice(0, options.limit);
    return page.map(toPackageCard);
  }

  /* Vitrin şeridi iki adım: işaret ham satırda, kart kapıda; bir tur fazlası, "işaret yoksa şerit yok" kuralını korur. */
  const marked = (await new BundleService(db).listSellable()).filter((b) => b.isFeatured);
  const page = options.limit === undefined ? marked : marked.slice(0, options.limit);
  if (page.length === 0) return [];
  /* Sıra operatörün; tükenmişi sona atma kuralı uygulanmaz, çünkü şeridi operatör seçti. */
  return (await getPackagesByIds(db, page.map((b) => b.id), locale, place)).map(toPackageCard);
}
