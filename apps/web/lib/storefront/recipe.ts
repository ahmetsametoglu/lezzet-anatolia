import 'server-only';
import { RecipeService, serviceDb } from '@lezzet/database';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText, Recipe } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { imageOf, readRecipeItems, recipeSoldOut, recipeTotalCents } from '@lezzet/application';
import type { RecipeItemReading } from '@lezzet/application';
import type { PricingViewer } from './read-viewer';
import type { StorefrontRecipe, StorefrontRecipeDetail, StorefrontRecipeItem } from './storefront-types';

/**
 * Tarif okuması, "Sofradan Fikirler": malzeme kararı pakettedir (`readRecipeItems`), burada kart künyesi, metin maddeleri ve web
 * görünümüne indirgeme kalır. Tarif satış birimi değildir, her kalem kendi başına alınır ve toplam tükenen kalemi saymaz.
 */

/**
 * Liste sayfasının tavanı, emniyet sınırıdır: tarif kümesi editoryal seçkidir ve tek turda çekilir, sınır yanlışlıkla büyüyen
 * kümeye karşıdır.
 */
const RECIPE_PAGE_LIMIT = 60;

/** Ana sayfa şeridinin sınırı, tasarımın üçlü ızgarası: şerit tıklatma davetidir ve dördüncü kart ızgarayı ikinci satıra taşırdı. */
export const HOME_RECIPE_LIMIT = 3;

/** Çok dilli metni çözer; boş/boşluk metin YOK sayılır (rozet ve bölüm boşuna açılmasın). */
function textOf(value: LocalizedText | null, locale: Locale): string | null {
  if (!value) return null;
  const resolved = resolveLocalizedText(value, locale).trim();
  return resolved.length > 0 ? resolved : null;
}

/** Metni maddelere böler — `null` alanda boş liste (satır = madde kuralı `@lezzet/helper`de). */
function linesOf(value: LocalizedText | null, locale: Locale): string[] {
  const text = textOf(value, locale);
  return text ? splitLines(text) : [];
}

/**
 * Yayındaki tarifler, vitrin listesi: kalemler tek sorguda gelir, çünkü kartın "1 ürün + 3 ev malzemesi · 6,40 €" satırı
 * onlardan türer.
 */
export async function listStorefrontRecipes(
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
  limit: number = RECIPE_PAGE_LIMIT,
): Promise<StorefrontRecipe[]> {
  const db = serviceDb();
  const recipes = await new RecipeService(db).listActiveWithItems(limit);
  if (recipes.length === 0) return [];

  const byRecipe = await readRecipeItems(db, recipes, locale, place, viewer);
  return recipes.map((recipe) => toCard(recipe, locale, byRecipe.get(recipe.id) ?? []));
}

/**
 * Slug ile tarif detayı; tarif yoksa ya da yayında değilse `null` döner ve sayfa 404'e çevirir. Taslak tarif doğrudan linkle de
 * açılmaz, yoksa yarım çevrilmiş tarif paylaşılan bağlantıyla okunurdu.
 */
export async function getRecipeDetail(
  slug: string,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontRecipeDetail | null> {
  const db = serviceDb();
  const recipe = await new RecipeService(db).findBySlugWithItems(slug);
  if (!recipe || !recipe.isActive) return null;

  const rows = (await readRecipeItems(db, [recipe], locale, place, viewer)).get(recipe.id) ?? [];

  return {
    ...toCard(recipe, locale, rows),
    meal: textOf(recipe.meal, locale),
    steps: linesOf(recipe.steps, locale),
    pantry: linesOf(recipe.pantry, locale),
    items: rows.map(toItem),
  };
}

/**
 * Okunmuş satırı web görünüm tipine indirger, karar yoktur; `wasCents` taşınmaz, çünkü web tarif satırı üstü çizili fiyat
 * çizmez.
 */
function toItem(row: RecipeItemReading): StorefrontRecipeItem {
  return {
    variantId: row.variantId,
    productSlug: row.productSlug,
    name: row.name,
    unitLabel: row.variantLabel,
    image: row.image,
    qty: row.qty,
    unitPriceCents: row.priceCents,
    lineTotalCents: row.lineTotalCents,
    stockId: row.stockId,
    soldOut: row.soldOut,
  };
}

/** Tarifin KART yüzü — liste ve detay aynı künyeyi gösterir, iki yerde hesaplanmaz. */
function toCard(recipe: Recipe, locale: Locale, rows: readonly RecipeItemReading[]): StorefrontRecipe {
  return {
    id: recipe.id,
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    description: textOf(recipe.description, locale) ?? '',
    image: imageOf(recipe),
    duration: textOf(recipe.duration, locale),
    serves: textOf(recipe.serves, locale),
    // Sayı GÖSTERİLEN satırlardan gelir: satıştan kalkmış malzeme listede yoksa sayıda da yoktur,
    // yani "1 ürün" diyen kart bir satır gösterir.
    itemCount: rows.length,
    pantryCount: linesOf(recipe.pantry, locale).length,
    totalCents: recipeTotalCents(rows),
    soldOut: recipeSoldOut(rows),
  };
}
