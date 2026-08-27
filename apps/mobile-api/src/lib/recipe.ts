import { RecipeService } from '@lezzet/database';
import { imageOf, readRecipeItems, type PlaceWarehouses, type PricingViewer, type RecipeItemReading } from '@lezzet/application';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { PreferredLanguage, RecipeDetail, RecipeRow } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvedOrNull } from './home';

/**
 * Tarif detayının okuma KAPISI — `GET /api/v1/recipes/:slug`un veri tarafı (21.14, tasarım 21).
 *
 * ── MALZEME OKUMASI ARTIK BURADA DEĞİL, PAKETTE (05.16, 28.08) ──────────────
 * Bu dosya kendi künyesinde terfi ölçütünü yazmıştı: *"web'in tarif sayfası açıldığı gün bu
 * kompozisyon paket terfisinin adayıdır."* O gün gelmişti ama terfi yapılmamıştı, ve sonuç
 * ölçüldü: web `apps/web/lib/storefront/recipe.ts`te İKİZİNİ taşıyordu, şekiller ayrışmıştı
 * (`stockId` webde, `wasCents` burada) ve **aynı soruya farklı cevap** veriliyordu — satıştan
 * kalkmış ürünün satırını burası düşürüyor, web "tükendi" diye çiziyordu. Kompozisyon
 * `@lezzet/application/catalog/recipe`e (`readRecipeItems`) taşındı; buradaki kural (satıştan
 * kalkanın satırı taşınmaz, `DOMAIN §13`) oraya GEÇTİ ve web de artık onu uyguluyor.
 *
 * Geriye kalan iş UCUN kendi işi: tarif künyesi, metin maddeleri ve sözleşme şekline indirgeme.
 *
 * ── SABİT MALİYET, KALEM SAYISINDAN BAĞIMSIZ ────────────────────────────────
 * tarif+kalemler (1) → kalem boyları (1) → ürünler+boyları (1) → fiyat/stok bağlamı (2 — yer
 * bilinmezken `loadProductContext` yalnız fiyat + ağ-toplamı okur, teklif/kargo okumaz). Kalem
 * başına sorgu YOK; kalem kümesi editoryal ve doğal tavanlı (CLAUDE §1 "tek turda" dalı).
 */

/**
 * Slug ile yayındaki tarif; yoksa ya da TASLAKSA `null` → çağıran 404'e çevirir. Taslak müşteriye
 * AÇILMAZ (üç dil dolmadan yayın yok — `0038` kısıtı; vitrin şeridi de yalnız yayındakileri taşır).
 */
export async function readRecipeDetail(
  db: SupabaseClient,
  slug: string,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<RecipeDetail | null> {
  const recipe = await new RecipeService(db).findBySlugWithItems(slug);
  if (!recipe || !recipe.isActive) return null;

  // Sıra da, satırın taşınıp taşınmayacağı da kapının kararı — burada yeniden verilmiyor.
  const items = (await readRecipeItems(db, [recipe], locale, place, viewer)).get(recipe.id) ?? [];

  const pantry = resolvedOrNull(recipe.pantry, locale);
  const steps = resolvedOrNull(recipe.steps, locale);
  return {
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    description: resolvedOrNull(recipe.description, locale),
    duration: resolvedOrNull(recipe.duration, locale),
    serves: resolvedOrNull(recipe.serves, locale),
    image: imageOf(recipe),
    rows: items.map(toRow),
    // Satır = madde/adım kuralı TEK yerde (`splitLines` — operasyon önizlemesiyle aynı ilkel);
    // boş metin boş dizi olur ve ekran bölümü hiç çizmez.
    pantry: pantry ? splitLines(pantry) : [],
    steps: steps ? splitLines(steps) : [],
  };
}

/**
 * Okunmuş satırı SÖZLEŞME şekline indirger — yalnız alan seçimi, karar yok.
 *
 * `stockId` ve `lineTotalCents` bilerek TAŞINMIYOR: mobil satır çarpımı kendi çiziyor ve sepet
 * kimliğini `${productSlug}-${variantId}` üzerinden kuruyor (sözleşmenin kendi künyesi). Kapı
 * ikisini de üretiyor; taşımayan taraf alanı boşuna sürüklemez — `05.16`nın kusuru alan farkı
 * değil, aynı KARARIN iki kez ve farklı yazılmasıydı.
 */
function toRow(row: RecipeItemReading): RecipeRow {
  return {
    productSlug: row.productSlug,
    variantId: row.variantId,
    name: row.name,
    variantLabel: row.variantLabel,
    qty: row.qty,
    priceCents: row.priceCents,
    wasCents: row.wasCents,
    image: row.image,
    soldOut: row.soldOut,
  };
}
