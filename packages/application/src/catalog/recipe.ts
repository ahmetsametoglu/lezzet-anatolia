import { ProductService, ProductVariantService, type Db } from '@lezzet/database';
import { resolveLocalizedText, type PreferredLanguage, type ProductVariant, type ProductWithRelations, type RecipeWithItems } from '@lezzet/types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, sellingOf, stockStatusOf } from './map';
import { loadProductContext } from './product-context';
import type { PlaceWarehouses, StorefrontImage } from './storefront-types';
import type { PricingViewer } from './pricing-viewer';

/**
 * **TARİF MALZEME OKUMASININ TEK KAPISI** (05.16 · web 08.24 · mobil 21.14).
 *
 * ── NEDEN TERFİ ETTİ: VAAT EDİLEN SÖZLEŞME KURULMAMIŞTI ─────────────────────
 * `05.16`nın bitti-ölçütü *"okuma TEK SÖZLEŞMEYLE hem web hem mobil yüzeyi besliyor"* diyordu ve
 * satır `[x]` idi; ölçünce **iki ayrı kapı** çıktı (`apps/web/lib/storefront/recipe.ts` ve
 * `apps/mobile-api/src/lib/recipe.ts`). Üstelik ayrışma teorik değildi, BAŞLAMIŞTI: `stockId`
 * yalnız webde, `wasCents` yalnız mobilde okunuyordu — aynı tarifin aynı malzemesi iki yüzeyde
 * farklı bilgi taşıyordu. Mobil dosyanın kendi künyesi terfi ölçütünü zaten yazmıştı (*"web'in
 * tarif sayfası açıldığı gün bu kompozisyon paket terfisinin adayıdır"*); o gün gelmiş, terfi
 * yapılmamıştı. Emsal `packages.ts`: paket okuması ikinci tüketeni doğunca aynı yolla terfi etti.
 *
 * ── ASIL TEHLİKE ALAN ADI DEĞİL, AYRIŞAN KARARDI ────────────────────────────
 * İki nüsha aynı soruya **farklı cevap** veriyordu: satıştan kalkmış (aday/pasif) ürünün satırını
 * mobil DÜŞÜRÜYOR, web ise "tükendi" diye ÇİZİYORDU. Mobilinki doğru ve gerekçesi `DOMAIN §13`:
 * *"tükendi"* o satırın hâli olamaz — tükendi **"yeniden gelecek"** der, satıştan kalkan gelmeyecek;
 * ürünün detay sayfası da zaten 404. Kural burada mobilin lehine birleştirildi.
 *
 * **Çözülemeyen kalem de DÜŞER** ve bu, web'in eski davranışının bilinçli düzeltmesidir: web
 * ürünü/boyu okunamayan malzeme için adı ve slug'ı BOŞ bir "tükendi" satırı çiziyordu — ekranda
 * adsız, tıklanamaz, hiçbir şey anlatmayan bir satır. Sayaç tutarlılığı bundan bozulmuyor:
 * `itemCount` gösterilen satırlardan sayılıyor, yani liste ne diyorsa sayı onu diyor.
 *
 * ── KARAR YOK, ÇAĞRI VAR ────────────────────────────────────────────────────
 * Fiyat, kıyas fiyatı, parti çıpası ve tükendi kararı motorun MEVCUT kapılarından okunuyor
 * (`sellingOf` + `stockStatusOf`) — katalog kartının okuduğu kararların tam aynısı, kopyası değil.
 * Aynı ürün katalogda başka, tarifte başka fiyatlanamaz. Depo süzgeci de oradan gelir; süzgeci
 * unutulan sorgu tek depolu veride DOĞRU cevap verir ve sistem sessizce olmayan malı satar
 * (`DOMAIN §17`).
 *
 * ── SABİT MALİYET: KALEM SAYISINDAN BAĞIMSIZ ────────────────────────────────
 * Kaç tarif verilirse verilsin sorgu sayısı sabit: boylar (1) → ürünler (1) → fiyat/stok bağlamı.
 * Tarif ya da kalem başına sorgu YOK. Liste sayfası bu yüzden tek turda okunuyor.
 */

/**
 * Bir tarif malzemesinin OKUNMUŞ hâli — iki yüzeyin ortak ham maddesi.
 *
 * **Görünüm tipi DEĞİL, okuma sonucudur.** Web `StorefrontRecipeItem`e, mobil `RecipeRow`a
 * indirger ve ikisi meşru biçimde farklı alan taşır: web satırı sepete parti çıpasıyla ekler
 * (`stockId`), mobil satırı indirim rozetini çizer (`wasCents`). Ayrışan şey EKRAN, karar değil —
 * `05.16`nın kusuru alan farkı değil, aynı kararın iki kez ve farklı yazılmasıydı.
 */
export interface RecipeItemReading {
  variantId: string;
  productSlug: string;
  /** Ürün adı, seçili dilde çözülmüş — ekran dil bilmez. */
  name: string;
  /** Boy etiketi ("700 g tepsi"), seçili dilde; tek boylu üründe boş olabilir. */
  variantLabel: string;
  image: StorefrontImage;
  /** Tarifin bu boydan istediği adet (`toplam = Σ qty × fiyat`). */
  qty: number;
  /** Birim fiyat. `null` = bu kanalda fiyatı yok → satır satışa kapalı. Sıfır YAZILMAZ. */
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
 * Verilen tariflerin malzemelerini okunmuş satırlara indirger — anahtarı tarif kimliği.
 *
 * Tek tarif de bir liste de aynı kapıdan geçer: detay sayfası tek elemanlı dizi verir. İki ayrı
 * imza (biri tekil, biri çoğul) açmak, toplu okumanın N+1 kırma sözünü ikinci imzada sessizce
 * kaybetmenin en kolay yoluydu.
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

  // `limit` AÇIKÇA verilir: yoksa `listWithRelations` varsayılan sayfa boyunda keser ve bir tarifin
  // malzemesi sessizce çözülemeyen satıra düşerdi (emsal `packages.ts` künyesi).
  //
  // **`status` süzgeci sorguya KONMADI ve bu bilinçli:** süzgeç koysaydık "ürün satıştan kalkmış"
  // ile "ürün hiç okunamadı" tek dala düşerdi ve ikisi ayrı şeydir. Ayrım aşağıda açıkça yapılır ki
  // ileride biri (ör. anomali logu) ötekinden ayrı ele alınabilsin.
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
        variantLabel: resolveLocalizedText(variant.label, locale),
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
 * Tarifin ALINABİLİR kalemlerinin toplamı — `null` = alınabilir kalem yok.
 *
 * **Tükenen kalem toplama GİRMEZ** (tasarımın açık kuralı, `DOMAIN §13`): müşteri o kalemi sepete
 * koyamayacağına göre ödeyeceği tutar da onu içermez. Fiyatı çözülmemiş kalem de aynı sebeple
 * dışarıda — iki ayrı gerekçe, tek sonuç: sepete giremeyen kalem toplama da girmez.
 *
 * **Sıfır DÖNMEZ:** alınabilir kalem yoksa `null`, çünkü "0,00 €" tarifi bedava gösterirdi
 * (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
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
