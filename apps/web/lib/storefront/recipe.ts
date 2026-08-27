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
 * **Tarif okuması — "Sofradan Fikirler"** (08.24 · veri modeli 05.16 · tasarım
 * `design/project/Musteri - Tarifler.dc.html`).
 *
 * ── MALZEME KARARI ARTIK BURADA DEĞİL, PAKETTE ──────────────────────────────
 * Bu dosya bir zamanlar malzeme satırını kendi indirgiyordu ve mobil-api'de onun İKİZİ vardı;
 * `05.16`nın *"okuma tek sözleşmeyle hem web hem mobil"* sözü böyle karşılanmamış kalmıştı. Nüsha
 * `@lezzet/application/catalog/recipe`e terfi etti (`readRecipeItems`) — gerekçesi ve birleştirilen
 * kararlar orada. Geriye kalan iş SAYFANIN kendi işi: kart künyesi, metin maddeleri ve web görünüm
 * tipine indirgeme.
 *
 * ── TARİF BİR SATIŞ BİRİMİ DEĞİL ────────────────────────────────────────────
 * Kendi fiyatı, stoğu ve sipariş kalemi YOKTUR; yalnız var olan varyantları sepete taşır. Paket
 * (`packages.ts`) buna benzemez ve karıştırılmamalı: paket bütün olarak satılır, tek fiyatı vardır
 * ve bir kalemi yetmiyorsa tamamı tükenir. Tarifte ise **her kalem kendi başına alınabilir** —
 * biri tükendiğinde tarif okunmaya devam eder, yalnız o satır düşer. Bu ayrım korunmazsa tarif bir
 * gün faturaya kalem olarak düşmeye çalışır.
 *
 * ── TOPLAM TÜKENEN KALEMİ SAYMAZ ────────────────────────────────────────────
 * Tasarımın açık kuralı: *"Tükenen malzeme listeden düşer; toplam, kalan ürünlerle hesaplanır."*
 * Hesap `recipeTotalCents`te, yani mobil de aynı cevabı veriyor.
 */

/**
 * Liste sayfasının TAVANI — sayfalama değil **emniyet sınırı** (emsal: `FAMILY_LIMIT`).
 *
 * Tarif kümesi operatörün elle kurduğu editoryal bir seçkidir, veriyle büyümez (`CLAUDE §1`:
 * doğal tavanı olan küme tek turda çekilir). Sınır bir tasarım kararı değil: elle kurulan bir küme
 * de bir gün yanlışlıkla yüz satıra çıkabilir ve o sayfa ilk boyada açılmazdı.
 */
const RECIPE_PAGE_LIMIT = 60;

/**
 * **Ana sayfa şeridinin sınırı** — tasarımın üçlü ızgarası (`Musteri - Anasayfa.dc.html`).
 *
 * Liste sayfasının 60'ı bir EMNİYET sınırıyken bu bir SUNUM kararı: şerit bir liste değil, tıklatma
 * davetidir (`CLAUDE §1`). Dördüncü kart ızgarayı ikinci satıra taşırdı.
 */
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
 * Yayındaki tarifler — vitrin listesi.
 *
 * `listActiveWithItems` kalemleri TEK sorguda getiriyor; tarif başına kalem okumak liste boyunca
 * N+1 olurdu. Kalemler kartta da gerekli: "1 ürün + 3 ev malzemesi · 6,40 €" satırının üç parçası
 * da onlardan türüyor.
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
 * Slug ile tarif detayı; tarif yoksa ya da yayında değilse `null` → sayfa 404'e çevirir.
 *
 * **Taslak tarif doğrudan linkle AÇILMAZ:** `isActive` kontrolü listedeki süzgeçle aynı kararı
 * verir. Ayrı bir kapı bıraksaydık, yayın kısıtının (üç dil dolmadan yayın yok — 05.16) taşıdığı
 * karar boşa çıkardı: yarım çevrilmiş bir tarif paylaşılan bir linkle okunabilirdi.
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
 * Okunmuş satırı WEB görünüm tipine indirger — yalnız ad değişimi ve alan seçimi, karar yok.
 *
 * `wasCents` bilerek TAŞINMIYOR: web tarif satırı üstü çizili referans çizmiyor (tasarımda yok).
 * Kapı onu üretiyor ve mobil kullanıyor; taşımayan taraf alanı boşuna sürüklemez — `05.16`nın
 * kusuru alan farkı değil, aynı KARARIN iki kez yazılmasıydı ve o kusur kapıyla kapandı.
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
