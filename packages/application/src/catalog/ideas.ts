import { BundleService, RecipeService } from '@lezzet/database';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { HomePackage, HomeRecipe, PreferredLanguage, RecipeWithItems } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from './map';
import { getPackagesByIds, listStorefrontPackages } from './packages';
import { resolvedOrNull } from './resolved-text';
import type { PlaceWarehouses, StorefrontPackage } from './storefront-types';

/**
 * Tarif ve paket kartının okuma kapısı: telefon yüzeylerinin "Fikirler" listeleri ve vitrin bantları aynı kartı buradan okur. Kural
 * hesaplanmaz; paket kartı kapının vitrin kartından süzülür, kümeler editoryal seçki olduğu için tek turda okunur ve sayılar sınırdır.
 */

/** "Sofradan Fikirler" bandının kart sayısı, tasarımın üçlü ızgarası. */
export const HOME_RECIPE_LIMIT = 3;
/** Vitrin "Hazır paketler" bölümü — v3'te iki büyük kart. */
export const HOME_PACKAGE_LIMIT = 2;

/**
 * Tarif LİSTESİNİN tavanı — sayfalama değil **emniyet sınırı** (web `RECIPE_PAGE_LIMIT` emsali,
 * aynı sayı): elle kurulan bir küme de bir gün yanlışlıkla yüz satıra çıkabilir ve o sayfa ilk
 * boyada açılmazdı. Kümenin kendisi bu sayıya YAKLAŞIRSA cevap sayfalama kurmak değil, sınırı
 * gözden geçirmektir — o gün kümenin editoryal olmadığı anlaşılmış olur.
 */
export const RECIPE_LIST_LIMIT = 60;

/**
 * Tarif kartı — İÇERİK kartı: fiyat/stok okunmaz (o birleştirme tarif DETAYININ işi).
 * `duration`/`serves` SERBEST METİNDİR ("35 dk"), boş/boşluk `null` sayılır → rozet parçası düşer.
 */
function toRecipeCard(recipe: RecipeWithItems, locale: PreferredLanguage): HomeRecipe {
  const pantry = resolvedOrNull(recipe.pantry, locale);
  return {
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    duration: resolvedOrNull(recipe.duration, locale),
    serves: resolvedOrNull(recipe.serves, locale),
    itemCount: recipe.items.length,
    // "Evinizden" maddeleri: satır = madde (`splitLines` — tek kural, iki yüzey).
    pantryCount: pantry ? splitLines(pantry).length : 0,
    image: imageOf(recipe),
  };
}

/**
 * Paket kartı: kapının (`listStorefrontPackages` → `toCard`) ürettiği vitrin kartını sözleşme şekline indirger, stok ve yol kararı
 * burada yeniden hesaplanmaz. Kapının kartındaki iç alanlar (KDV oranı, ağırlık, tavan, rota kilidi) tele çıkmaz.
 */
function toPackageCard(pack: StorefrontPackage): HomePackage {
  return {
    slug: pack.slug,
    name: pack.name,
    priceCents: pack.priceCents,
    // Satır sayısı, adet toplamı DEĞİL ("5 ürün" — sözleşme künyesi).
    itemCount: pack.itemCount,
    image: pack.image,
    // İKİ EKSEN, İKİ ALAN: `soldOut` ağ geneli ("hiç var mı"), `route` yere bağlı ("bana nasıl
    // gelir") ve yer bilinmiyorsa `null` — künyesi `HomePackageSchema`da, kural burada değil.
    soldOut: pack.soldOut,
    route: pack.route,
  };
}

/**
 * Yayındaki tarifler editoryal sırada; kalemler tek sorguda gelir, kalem başına sorgu N+1 olurdu. Taslak tarif taşınmaz, yayın kapısı
 * (üç dil dolmadan yayın yok) burada da geçerlidir.
 */
export async function readRecipeCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  limit: number,
): Promise<HomeRecipe[]> {
  const rows = await new RecipeService(db).listActiveWithItems(limit);
  return rows.map((recipe) => toRecipeCard(recipe, locale));
}

/**
 * Paket kartları: liste ve vitrin bandı `listSellable` süzgecinden geçen kapılardan okur, böylece satılabilirlik listeyle detayda
 * ayrışmaz. `isFeatured` yalnız vitrinde uygulanır ve yedeği yoktur; `limit` verilmezse liste kesilmez.
 */
export async function readPackageCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  options: { featuredOnly: boolean; limit?: number; place: PlaceWarehouses },
): Promise<HomePackage[]> {
  const place = options.place;

  if (!options.featuredOnly) {
    /* Liste sayfası kapının tam listesidir: `limit` verilmez ki kapı web masaüstünün `pickFeatured` yedeğine girmesin, kesme burada
       yapılır. Kapının sırası korunur, tükenmiş paket sona gider. */
    const cards = await listStorefrontPackages(db, locale, undefined, place);
    const page = options.limit === undefined ? cards : cards.slice(0, options.limit);
    return page.map(toPackageCard);
  }

  /* Vitrin bandı iki adımdır, çünkü işaret süzgeci `isFeatured` ister ve kapının kartı onu taşımaz: seçim ham satırdan yapılır,
     seçilenler kimlikle kapıya sorulur. Bedeli bir fazladan `listSellable` turudur, karşılığında işaretsiz vitrin kendi kendine paket seçmez. */
  const marked = (await new BundleService(db).listSellable()).filter((b) => b.isFeatured);
  const page = options.limit === undefined ? marked : marked.slice(0, options.limit);
  if (page.length === 0) return [];
  /* Sıra `sortOrder`dan gelir ve kapı onu korur; tükenmişi sona atma burada uygulanmaz, çünkü seçimi operatör yapmıştır ve sırayı
     stoğa göre değiştirmek işaretin anlamını zayıflatırdı. */
  return (await getPackagesByIds(db, page.map((b) => b.id), locale, place)).map(toPackageCard);
}
