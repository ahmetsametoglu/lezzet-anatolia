import 'server-only';
import {
  PriceService,
  ProductService,
  ProductVariantService,
  RecipeItemService,
  RecipeService,
  serviceDb,
} from '@lezzet/database';
import { LOCALIZED_TEXT_KEYS, resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import type { RecipeItemView, RecipeView, RecipesData } from './recipes-types';

/**
 * **Tarif yönetiminin okuması** (09.21) — `design/project/Operasyon - Tarifler.dc.html`.
 *
 * Ekran zincirde KRİTİK YOL: tarif verisi buradan doğuyor, müşteri yüzeyi (08.24) bunu bekliyor.
 *
 * ── LİSTE KALEMSİZ, SEÇİLİ TARİF KALEMLİ ────────────────────────────────────
 * `listAll()` kalem getirmiyor ve tarif başına kalem okumak liste boyunca N+1 olurdu — tam olarak
 * `listActiveWithItems`'in künyesinde reddedilen şey. O yüzden kalemler YALNIZ seçili tarif için
 * okunuyor (tek sorgu). Listedeki "Malzeme" sütunu bu yüzden bugün çizilmiyor: uydurma bir sayı ya
 * da "0" yazmak, ölçülemeyeni ölçülmüş göstermek olurdu (`CLAUDE §1`).
 * BEKLEYEN(09.21) — `listAllWithItems` istendi (`docs/talep/arka-uc-tarif-listesi-kalemleriyle.md`).
 *
 * ── FİYAT OKUNUR, YAZILMAZ ──────────────────────────────────────────────────
 * Tasarımın kuralı: *"Fiyat burada girilmez — ürün kaydından okunur."* Tarif ekranı fiyatın
 * sahibi değil; ikinci bir yerde tutmak bir gün ayrışan iki gerçek demekti.
 */
export async function readRecipes(selectedId: string | null): Promise<RecipesData> {
  const db = serviceDb();
  const recipes = await new RecipeService(db).listAll();

  const selected = selectedId ? recipes.find((recipe) => recipe.id === selectedId) : undefined;
  const items = selected ? await new RecipeItemService(db).listByRecipe(selected.id) : [];
  const itemViews = items.length > 0 ? await describeItems(db, items) : [];

  const views: RecipeView[] = recipes.map((recipe) => {
    // Yayın kapısının ölçütü ADIN dolu olduğu diller: kısıt veritabanında (05.16), cümle burada.
    // Operatör düğmenin NEDEN kapalı olduğunu okuyabilmeli — yoksa kısıt ona anlaşılmaz bir hata
    // olarak döner (emsal: ürün formundaki `missingDeclarations`).
    // Dil listesi ŞEMADAN türer (`LOCALIZED_TEXT_KEYS`), elle yazılmaz: bir gün dil eklendiğinde
    // burayı güncellemeyi unutmak, eksik dili "dolu" saymak olurdu.
    const filledLocales = LOCALIZED_TEXT_KEYS.filter((locale) => (recipe.name[locale] ?? '').trim().length > 0);
    const missingLocales = LOCALIZED_TEXT_KEYS.filter((locale) => !filledLocales.includes(locale));
    const mine = recipe.id === selected?.id ? itemViews : [];
    const text = (value: typeof recipe.description): string =>
      value ? resolveLocalizedText(value, OPERATIONS_LOCALE) : '';
    const meal = text(recipe.meal);
    const serves = text(recipe.serves);
    return {
      ...recipe,
      title: resolveLocalizedText(recipe.name, OPERATIONS_LOCALE) || 'Adsız tarif',
      subtitle: [meal, serves].filter(Boolean).join(' · '),
      durationText: text(recipe.duration) || '—',
      descriptionText: text(recipe.description),
      stepLines: splitLines(text(recipe.steps)),
      pantryLines: splitLines(text(recipe.pantry)),
      // Kalemler yalnız seçili tarifte dolu; ötekilerde boş dizi "kalem yok" DEĞİL "okunmadı"
      // demek ve ekran o yüzden sayıyı hiç yazmıyor (yukarıdaki künye).
      items: recipe.id === selected?.id ? items : [],
      itemViews: mine,
      filledLocales,
      missingLocales,
      canPublish: missingLocales.length === 0,
      hasUnavailableItem: mine.some((item) => !item.isAvailable),
    };
  });

  return {
    recipes: views,
    activeCount: views.filter((recipe) => recipe.isActive).length,
    unavailableCount: views.filter((recipe) => recipe.hasUnavailableItem).length,
  };
}

/**
 * Metni maddelere böler: **satır = madde** (05.16 · `KARARLAR §3z`).
 *
 * Boş satır ATILIR — operatör iki madde arasına nefes bırakabilir ve o boşluk numaralı bir adım
 * olarak görünmemeli. `\r\n` de bölünür: Windows'tan yapıştırılan metin tek satır sayılmasın.
 */
function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Kalemleri okunur hâle getirir: varyant → ürün → ad + fiyat.
 *
 * Üç okuma da TOPLU (varyant başına sorgu yok) ve emsali paket kalemleri (`package/actions.ts`):
 * varyanttan ürüne çıkmak tek okuma, fiyat havuz kimlikleriyle tek turda geliyor.
 */
async function describeItems(
  db: ReturnType<typeof serviceDb>,
  items: readonly { id: string; variantId: string; qty: number; sortOrder: number }[],
): Promise<RecipeItemView[]> {
  const variantIds = items.map((item) => item.variantId);
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const productIds = [...new Set(variants.map((variant) => variant.productId))];

  const [products, prices] = await Promise.all([
    new ProductService(db).listByIds(productIds),
    // Kanal `b2c`: tarif müşteri yüzeyinin anlatısı ve orada görünen fiyat perakende fiyattır.
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
  ]);

  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));
  const productOf = new Map(products.map((product) => [product.id, product]));

  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const variant = variantOf.get(item.variantId);
      const product = variant ? productOf.get(variant.productId) : undefined;
      return {
        id: item.id,
        variantId: item.variantId,
        qty: item.qty,
        // Silinmiş/erişilemeyen varyant SESSİZ geçilmez: satır kalır ve "çözülemedi" der, çünkü
        // kaybolan bir malzeme tarifi sessizce eksiltir.
        // Ad ve boy çözücüden geçer (yedek zinciri TR→FR→DE): operasyon Türkçe okur ama bir ürünün
        // adı yalnız Fransızca yazılmış olabilir ve o hâlde boş satır göstermek yanlış olurdu.
        productName: product ? resolveLocalizedText(product.name, OPERATIONS_LOCALE) || 'Adsız ürün' : 'Ürün çözülemedi',
        variantLabel: variant ? resolveLocalizedText(variant.label, OPERATIONS_LOCALE) : '—',
        priceCents: prices.get(item.variantId)?.channelPrice?.amountCents ?? null,
        isAvailable: variant?.isActive === true && product?.status === 'active',
      };
    });
}

/** Listedeki başlık — ürün adı + boy, tek yerden (`titleOf`). */
export function recipeItemTitle(item: RecipeItemView): string {
  return titleOf(item.productName, item.variantLabel);
}
