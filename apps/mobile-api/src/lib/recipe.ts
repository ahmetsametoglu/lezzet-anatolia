import { ProductService, ProductVariantService, RecipeService } from '@lezzet/database';
import {
  EMPTY_PRODUCT_CONTEXT,
  imageOf,
  loadProductContext,
  sellingOf,
  stockStatusOf,
  type PlaceWarehouses,
  type PricingViewer,
} from '@lezzet/application';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { PreferredLanguage, ProductVariant, ProductWithRelations, RecipeDetail, RecipeRow } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvedOrNull } from './home';

/**
 * Tarif detayının okuma KAPISI — `GET /api/v1/recipes/:slug`un veri tarafı (21.14, tasarım 21).
 *
 * BURADA duruyor, `@lezzet/application`da DEĞİL (`lib/home.ts` ile aynı gerekçe): pakete girmenin
 * ölçütü en az iki yüzeyin çağırmasıdır ve tarif detayını bugün yalnız mobil okuyor — web'in tarif
 * sayfası açıldığı gün bu kompozisyon paket terfisinin adayıdır (`home.ts`teki tarif kartının
 * "ikinci tüketeni doğduğu gün aynı yolla" sözü). KARAR içermiyor: fiyat/stok/tükendi motorun
 * MEVCUT kapılarından okunur (`loadProductContext` + `sellingOf` + `stockStatusOf` — katalog
 * kartının okuduğu kararların tam aynısı, kopya değil çağrı); metin indirgemesi paylaşılan
 * ilkellerle (`resolveLocalizedText` · `splitLines` · `imageOf`).
 *
 * ── SABİT MALİYET: 5 DB TURU, KALEM SAYISINDAN BAĞIMSIZ ─────────────────────
 * tarif+kalemler (1) → kalem boyları (1) → ürünler+boyları (1) → fiyat/stok bağlamı (2 — yer
 * bilinmezken `loadProductContext` yalnız fiyat + ağ-toplamı okur, teklif/kargo okumaz). Kalem
 * başına sorgu YOK (N+1 kırılır); kalem kümesi editoryal ve doğal tavanlı, `ids` süzgecinin
 * taşıyabileceği boy (CLAUDE §1 "tek turda" dalı).
 */

/** Kalem boyu + ürünü — satıra inen ara birleşim (yalnız bu dosyanın içi). */
interface RowSource {
  variant: ProductVariant;
  product: ProductWithRelations;
}

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

  // Sıra BURADA sabitlenir (`product-context.ts`in dersi): gömülü ilişkinin dönüş sırası
  // PostgREST'te garantili değil; operatörün kurduğu kalem sırası (`sortOrder`) ekranın sırasıdır.
  const items = [...recipe.items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));

  const sources = await readRowSources(db, items.map((i) => i.variantId));
  const products = [...new Map([...sources.values()].map((s) => [s.product.id, s.product])).values()];
  const context = await loadProductContext(db, products, place, viewer);

  const rows: RecipeRow[] = items.flatMap((item) => {
    const source = sources.get(item.variantId);
    // Satıştan kalkmış (aday/pasif) ürünün satırı TAŞINMAZ (DOMAIN §13) — sözleşme başlığındaki
    // gerekçe: "tükendi" yalan olurdu (o "yeniden gelecek" der), ürünün detayı zaten 404.
    if (!source) return [];
    const ctx = context.get(source.product.id) ?? EMPTY_PRODUCT_CONTEXT;
    // Fiyat/stok kararı MOTORUN: pasif boyun fiyat satırı hiç yüklenmez → `priceCents: null`
    // (satışa kapalı) ve stok haritasında olmadığından `out_of_stock` — burada ayrıca kural yok.
    const selling = sellingOf(source.variant, ctx);
    const stockStatus = stockStatusOf(ctx, [source.variant.id], source.product.shippable);
    return [
      {
        productSlug: source.product.slug,
        variantId: source.variant.id,
        name: resolveLocalizedText(source.product.name, locale),
        variantLabel: resolveLocalizedText(source.variant.label, locale),
        qty: item.qty,
        priceCents: selling.priceCents,
        wasCents: selling.wasCents,
        image: imageOf(source.product),
        soldOut: stockStatus === 'out_of_stock',
      },
    ];
  });

  const pantry = resolvedOrNull(recipe.pantry, locale);
  const steps = resolvedOrNull(recipe.steps, locale);
  return {
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    description: resolvedOrNull(recipe.description, locale),
    duration: resolvedOrNull(recipe.duration, locale),
    serves: resolvedOrNull(recipe.serves, locale),
    image: imageOf(recipe),
    rows,
    // Satır = madde/adım kuralı TEK yerde (`splitLines` — operasyon önizlemesiyle aynı ilkel);
    // boş metin boş dizi olur ve ekran bölümü hiç çizmez.
    pantry: pantry ? splitLines(pantry) : [],
    steps: steps ? splitLines(steps) : [],
  };
}

/**
 * Kalem boylarını ürünleriyle eşler — İKİ toplu okuma, kalem başına sorgu yok.
 *
 * Ürün süzgeci `status: 'active'` KATALOĞUN ölçütüdür (`getProductDetail` aynı kapıyı 404'lüyor);
 * süzgece takılan ürünün boyu eşleşmeden kalır ve satırı yukarıda düşer.
 */
async function readRowSources(db: SupabaseClient, variantIds: string[]): Promise<Map<string, RowSource>> {
  const sources = new Map<string, RowSource>();
  if (variantIds.length === 0) return sources;

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const productIds = [...new Set(variants.map((v) => v.productId))];
  if (productIds.length === 0) return sources;

  const page = await new ProductService(db).listWithRelations({
    filters: { ids: productIds, status: 'active' },
    // Sayfalama YOK (CLAUDE §1): kalem kümesi operatörün elle kurduğu seçki, doğal tavanlı.
    limit: productIds.length,
  });
  const productById = new Map(page.rows.map((p) => [p.id, p]));

  for (const variant of variants) {
    const product = productById.get(variant.productId);
    if (product) sources.set(variant.id, { variant, product });
  }
  return sources;
}
