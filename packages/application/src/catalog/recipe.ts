import { ProductService, ProductVariantService, type Db } from '@lezzet/database';
import { resolveLocalizedText, type PreferredLanguage, type ProductVariant, type ProductWithRelations, type RecipeWithItems } from '@lezzet/types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, sellingOf, stockStatusOf, variantNameIn } from './map';
import { loadProductContext } from './product-context';
import type { PlaceWarehouses, StorefrontImage } from './storefront-types';
import type { PricingViewer } from './pricing-viewer';

/**
 * Tarif malzemesi okumasının tek kapısı: web ve mobil aynı satırı alır; fiyat, kıyas, parti çıpası ve tükendi kararı katalog kartının
 * kapılarından (`sellingOf`, `stockStatusOf`) okunur ki aynı ürün tarifte başka fiyatlanmasın. Satıştan kalkmış ya da okunamayan
 * kalem düşer, çünkü "tükendi" yeniden geleceği söyler (`DOMAIN §13`); sorgu sayısı kalem sayısından bağımsızdır.
 */

/**
 * Bir tarif malzemesinin okunmuş hâli, iki yüzeyin ortak ham maddesi; görünüm tipi değildir. Web `StorefrontRecipeItem`e (parti
 * çıpasıyla, `stockId`), mobil `RecipeRow`a (indirim rozetiyle, `wasCents`) indirger: ayrışan ekrandır, karar değil.
 */
export interface RecipeItemReading {
  variantId: string;
  productSlug: string;
  /** Ürün adı, seçili dilde çözülmüş — ekran dil bilmez. */
  name: string;
  /** Boyun müşteriye görünen adı ("4 adet · 420 g", `variantNameIn`), seçili dilde. */
  variantLabel: string;
  image: StorefrontImage;
  /** Tarifin bu boydan istediği adet (`toplam = Σ qty × fiyat`). */
  qty: number;
  /** Birim fiyat; `null` bu kanalda fiyatı olmayan, satışa kapalı satırdır ve sıfır yazılmaz. */
  priceCents: number | null;
  /** Teklifin yerine geçtiği fiyat — **alan yoksa indirim de yoktur** (kart sözleşmesinin kuralı). */
  wasCents: number | undefined;
  /** `qty × priceCents`. Fiyatsız kalemde 0 DEĞİL `null`: sıfır kalemi bedava gösterirdi. */
  lineTotalCents: number | null;
  /** Teklif kazandıysa kalemin çıpalandığı parti (`DOMAIN §5`) — sepet bu kimliği taşır. */
  stockId: string | null;
  /** YALNIZ gerçek tükenmede `true`; "senin deponda yok" bunun cevabı değil (C3). */
  soldOut: boolean;
}

/**
 * Verilen tariflerin malzemelerini okunmuş satırlara indirger, anahtar tarif kimliği. Tek tarif de tek elemanlı diziyle bu kapıdan
 * geçer: ayrı bir tekil imza, toplu okumanın N+1 kırma sözünü sessizce kaybetmenin en kolay yolu olurdu.
 */
export async function readRecipeItems(
  db: Db,
  recipes: readonly RecipeWithItems[],
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<Map<string, RecipeItemReading[]>> {
  const sonuc = new Map<string, RecipeItemReading[]>();
  for (const recipe of recipes) sonuc.set(recipe.id, []);

  const variantIds = [...new Set(recipes.flatMap((r) => r.items.map((i) => i.variantId)))];
  if (variantIds.length === 0) return sonuc;

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const productIds = [...new Set(variants.map((v) => v.productId))];
  if (productIds.length === 0) return sonuc;

  // `limit` açıkça verilir, yoksa `listWithRelations` varsayılan sayfa boyunda keser ve malzeme çözülemeyen satıra düşerdi. `status`
  // süzgeci bilerek sorguda yok: "satıştan kalkmış" ile "hiç okunamadı" aşağıda ayrı dallarda kalır.
  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds }, limit: productIds.length });
  const context = await loadProductContext(db, page.rows, place, viewer);

  const byVariant = new Map<string, ProductVariant>(variants.map((v) => [v.id, v]));
  const byProduct = new Map<string, ProductWithRelations>(page.rows.map((p) => [p.id, p]));

  for (const recipe of recipes) {
    // Sıra BURADA sabitlenir (`product-context.ts`in dersi): gömülü ilişkinin dönüş sırası
    // PostgREST'te garantili değil; operatörün kurduğu kalem sırası ekranın sırasıdır. Eşitlikte
    // `createdAt` ayırır — iki kalem aynı `sortOrder` ile durursa sıra en azından KARARLI olur.
    const items = [...recipe.items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const rows: RecipeItemReading[] = [];

    for (const item of items) {
      const variant = byVariant.get(item.variantId);
      const product = variant ? byProduct.get(variant.productId) : undefined;
      // Okunamayan kalem: adı ve slug'ı olmayan bir satır ekranda hiçbir şey anlatmaz.
      if (!variant || !product) continue;
      // Satıştan kalkmış ürünün satırı TAŞINMAZ (`DOMAIN §13`) — "tükendi" burada yalan olurdu.
      if (product.status !== 'active') continue;

      const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
      const selling = sellingOf(variant, ctx);
      const stockStatus = stockStatusOf(ctx, [variant.id], product.shippable);
      const priceCents = selling.priceCents;

      rows.push({
        variantId: variant.id,
        productSlug: product.slug,
        name: resolveLocalizedText(product.name, locale),
        variantLabel: variantNameIn(variant, locale),
        image: imageOf(product),
        qty: item.qty,
        priceCents,
        wasCents: selling.wasCents,
        lineTotalCents: priceCents != null ? priceCents * item.qty : null,
        stockId: selling.stockId,
        soldOut: stockStatus === 'out_of_stock',
      });
    }

    sonuc.set(recipe.id, rows);
  }

  return sonuc;
}

/**
 * Tarifin alınabilir kalemlerinin toplamı: tükenen ve fiyatı çözülmemiş kalem girmez, çünkü sepete giremeyen kalemin tutarını müşteri
 * ödemez (`DOMAIN §13`). Alınabilir kalem yoksa `null`, "0,00 €" tarifi bedava gösterirdi.
 */
export function recipeTotalCents(rows: readonly RecipeItemReading[]): number | null {
  const alinabilir = rows.filter((r) => !r.soldOut && r.lineTotalCents != null);
  if (alinabilir.length === 0) return null;
  return alinabilir.reduce((sum, r) => sum + (r.lineTotalCents ?? 0), 0);
}

/**
 * Tarif tümüyle alınamaz mı — kart "tükendi" hâli.
 *
 * **Kalemsiz tarif "tükendi" DEĞİLDİR:** malzemesi girilmemiş bir tarif de okunabilir bir içeriktir
 * ve sepet bloğu zaten hiç çizilmez (`RecipeItemService.syncItems` künyesi).
 */
export function recipeSoldOut(rows: readonly RecipeItemReading[]): boolean {
  return rows.length > 0 && recipeTotalCents(rows) === null;
}
