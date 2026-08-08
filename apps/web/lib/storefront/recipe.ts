import 'server-only';
import { ProductService, ProductVariantService, RecipeService, serviceDb } from '@lezzet/database';
import { splitLines } from '@lezzet/helper';
import { CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText, ProductVariant, ProductWithRelations, Recipe, RecipeItem, RecipeWithItems } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toVariant, loadProductContext } from '@lezzet/application';
import type { ProductContext } from '@lezzet/application';
import type { PricingViewer } from './read-viewer';
import type { StorefrontRecipe, StorefrontRecipeDetail, StorefrontRecipeItem } from './storefront-types';

/**
 * **Tarif okuması — "Sofradan Fikirler"** (08.24 · veri modeli 05.16 · tasarım
 * `design/project/Musteri - Tarifler.dc.html`).
 *
 * ── TARİF BİR SATIŞ BİRİMİ DEĞİL ────────────────────────────────────────────
 * Kendi fiyatı, stoğu ve sipariş kalemi YOKTUR; yalnız var olan varyantları sepete taşır. Paket
 * (`packages.ts`) buna benzemez ve karıştırılmamalı: paket bütün olarak satılır, tek fiyatı vardır
 * ve bir kalemi yetmiyorsa tamamı tükenir. Tarifte ise **her kalem kendi başına alınabilir** —
 * biri tükendiğinde tarif okunmaya devam eder, yalnız o satır düşer. Bu ayrım korunmazsa tarif bir
 * gün faturaya kalem olarak düşmeye çalışır.
 *
 * ── FİYAT VE TÜKENME KARARI BURADA, SERVİSTE DEĞİL ──────────────────────────
 * `RecipeService` bilerek karar vermiyor (`STACK §4`, kendi künyesi): fiyat personaya (B2B toptan,
 * müşteriye özel) ve depoya bağlıdır. Servise ya da tabloya yazılmış bir toplam ilk gün yalan
 * söyler. Birleştirme vitrin okumalarının kullandığı AYNI kapıdan geçiyor (`loadProductContext` +
 * `toVariant`) — ikinci bir "tükendi" ya da "fiyat" kuralı yazılmadı. Depo süzgeci de oradan gelir;
 * süzgeci unutulan sorgu tek depolu veride DOĞRU cevap verir ve sistem sessizce olmayan malı satar
 * (`DOMAIN §17`).
 *
 * ── TOPLAM TÜKENEN KALEMİ SAYMAZ ────────────────────────────────────────────
 * Tasarımın açık kuralı: *"Tükenen malzeme listeden düşer; toplam, kalan ürünlerle hesaplanır."*
 * Müşteri o kalemi sepete koyamayacağına göre ödeyeceği tutar da onu içermez. Tükendiği hâlde
 * toplama katılan bir kalem, sepete geçişte açıklanamayan bir fark üretirdi.
 */

/**
 * Liste sayfasının TAVANI — sayfalama değil **emniyet sınırı** (emsal: `FAMILY_LIMIT`).
 *
 * Tarif kümesi operatörün elle kurduğu editoryal bir seçkidir, veriyle büyümez (`CLAUDE §1`:
 * doğal tavanı olan küme tek turda çekilir). Sınır bir tasarım kararı değil: elle kurulan bir küme
 * de bir gün yanlışlıkla yüz satıra çıkabilir ve o sayfa ilk boyada açılmazdı.
 */
const RECIPE_PAGE_LIMIT = 60;

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
): Promise<StorefrontRecipe[]> {
  const db = serviceDb();
  const recipes = await new RecipeService(db).listActiveWithItems(RECIPE_PAGE_LIMIT);
  if (recipes.length === 0) return [];

  const context = await loadItemContext(db, recipes, place, viewer);
  return recipes.map((recipe) => toCard(recipe, locale, describeItems(recipe.items, locale, context)));
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

  const context = await loadItemContext(db, [recipe], place, viewer);
  const items = describeItems(recipe.items, locale, context);

  return {
    ...toCard(recipe, locale, items),
    meal: textOf(recipe.meal, locale),
    steps: linesOf(recipe.steps, locale),
    pantry: linesOf(recipe.pantry, locale),
    items,
  };
}

/** Kalemlerin çözümü için gereken yan veriler — tarif başına sorgu YOK, küme tek turda okunur. */
interface ItemContext {
  byVariant: Map<string, ProductVariant>;
  byProduct: Map<string, ProductWithRelations>;
  productContext: Map<string, ProductContext>;
}

/**
 * Tariflerin kalemlerini ürüne ve fiyat/stok bağlamına bağlar.
 *
 * Varyanttan ürüne çıkmak zorundayız çünkü `loadProductContext` ÜRÜN satırlarıyla çalışıyor (fiyat
 * ve stok varyant düzeyinde okunuyor ama bağlam ürün başına kuruluyor — kartın kendi kuralı).
 * Üç okuma da toplu: varyantlar → ürünler → bağlam.
 */
async function loadItemContext(
  db: SupabaseClient,
  recipes: readonly RecipeWithItems[],
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<ItemContext> {
  const variantIds = [...new Set(recipes.flatMap((r) => r.items.map((i) => i.variantId)))];
  const empty: ItemContext = { byVariant: new Map(), byProduct: new Map(), productContext: new Map() };
  if (variantIds.length === 0) return empty;

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const productIds = [...new Set(variants.map((v) => v.productId))];
  if (productIds.length === 0) return empty;

  // `limit` AÇIKÇA verilir: yoksa `listWithRelations` varsayılan sayfa boyunda keser ve bir tarifin
  // malzemesi sessizce çözülemeyen satıra düşerdi (emsal `packages.ts` künyesi).
  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds }, limit: productIds.length });
  const productContext = await loadProductContext(db, page.rows, place, viewer);

  return {
    byVariant: new Map(variants.map((v) => [v.id, v])),
    byProduct: new Map(page.rows.map((p) => [p.id, p])),
    productContext,
  };
}

/**
 * Kalemleri müşteri satırına indirger — sıra tarifin kendi sırası (`sortOrder`, operatörün verdiği).
 *
 * **Çözülemeyen kalem DÜŞMEZ, satılamaz olarak kalır.** Ürünü ya da varyantı okunamayan bir malzeme
 * sessizce silinseydi tarif "3 malzeme" derken iki satır gösterirdi; tarif de eksik anlatılırdı.
 * Satır fiyatsız ve tükenmiş görünür — yani sepete girmez ve toplamı bozmaz.
 */
function describeItems(items: readonly RecipeItem[], locale: Locale, ctx: ItemContext): StorefrontRecipeItem[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const variant = ctx.byVariant.get(item.variantId);
      const product = variant ? ctx.byProduct.get(variant.productId) : undefined;
      if (!variant || !product) {
        return {
          variantId: item.variantId,
          productSlug: '',
          name: '',
          unitLabel: '',
          image: { url: null, crop: CROP_CENTER },
          qty: item.qty,
          unitPriceCents: null,
          lineTotalCents: null,
          stockId: null,
          soldOut: true,
        };
      }

      // Fiyat, stok hâli ve teklif çıpası vitrinin AYNI indirgemesinden geliyor: kartta indirimli,
      // tarifte normal gösteren ikinci bir hesap yazılmadı.
      const selling = toVariant(variant, locale, ctx.productContext.get(product.id) ?? EMPTY_PRODUCT_CONTEXT, product.shippable);
      const unitPriceCents = selling.priceCents;

      return {
        variantId: item.variantId,
        productSlug: product.slug,
        name: resolveLocalizedText(product.name, locale),
        unitLabel: selling.label,
        image: imageOf(product),
        qty: item.qty,
        unitPriceCents,
        // Fiyatsız kalemde çarpım 0 DEĞİL null: sıfır yazmak kalemi bedava gösterirdi (`CLAUDE §1`).
        lineTotalCents: unitPriceCents != null ? unitPriceCents * item.qty : null,
        stockId: selling.stockId,
        soldOut: selling.soldOut,
      };
    });
}

/** Tarifin KART yüzü — liste ve detay aynı künyeyi gösterir, iki yerde hesaplanmaz. */
function toCard(recipe: Recipe, locale: Locale, items: readonly StorefrontRecipeItem[]): StorefrontRecipe {
  // Alınabilir kalem = tükenmemiş VE fiyatı çözülmüş. İkisi ayrı sebep ama sonuç aynı: sepete
  // giremeyen kalem toplama da girmez.
  const buyable = items.filter((item) => !item.soldOut && item.lineTotalCents != null);
  const totalCents = buyable.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0);

  return {
    id: recipe.id,
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    description: textOf(recipe.description, locale) ?? '',
    image: imageOf(recipe),
    duration: textOf(recipe.duration, locale),
    serves: textOf(recipe.serves, locale),
    itemCount: items.length,
    pantryCount: linesOf(recipe.pantry, locale).length,
    // Alınabilir kalem yoksa toplam YOK — 0 € yazmak tarifi bedava gösterirdi.
    totalCents: buyable.length > 0 ? totalCents : null,
    // Kalemsiz tarif "tükendi" DEĞİLDİR: malzemesi girilmemiş bir tarif de okunabilir bir içeriktir
    // ve sepet bloğu zaten hiç çizilmez (`RecipeItemService.syncItems` künyesi).
    soldOut: items.length > 0 && buyable.length === 0,
  };
}
