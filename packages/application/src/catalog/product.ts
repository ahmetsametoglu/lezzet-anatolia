import { CategoryService, ProductImageService, ProductService } from '@lezzet/database';
import { pickSimilar, requiresColdChain } from '@lezzet/domain-core';
import { parseEmphasis } from '@lezzet/helper';
import { hasNutrition, resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText, PreferredLanguage, ProductWithRelations } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignsByProduct, readScopeCampaigns } from './campaign';
import { EMPTY_PRODUCT_CONTEXT, deliversHere, imageOf, primaryVariantOf, toCategory, toProduct, toVariant } from './map';
import type { ProductContext } from './map';
import { loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import type {
  PlaceWarehouses,
  StorefrontDeclaration,
  StorefrontFamilyMember,
  StorefrontImage,
  StorefrontProductDetail,
} from './storefront-types';

/**
 * Ürün detay okuması — sayfanın tamamı (varyant, fiyat/stok bağlamı, galeri, kategori, aile, benzerler) tek turda gelir,
 * çünkü bu sayfa sosyal trafiğin ilk dokunuşu olabilir ve ilk boya eksiksiz gelmeli.
 * Yorum ve puan bu kapıdan geçmez: moderasyon kararı geri bildirim modülünde; buraya gelse vitrin sözleşmesi
 * moderasyonu bilmek zorunda kalırdı.
 */

/** Benzer ürün bölümünde kaç kart — tasarımda dörtlü ızgara. */
const SIMILAR_LIMIT = 4;

/**
 * Seçkinin taradığı aday havuzu — editoryal seçki sayfalanmaz, sabit sınırı olur (CLAUDE §1).
 * Dörtten büyük olmalı, çünkü alınabilirlik süzgeci ve aile kuralı adayları eliyor; büyüyen kategoride seçkinin ilk 40 adaydan
 * yapılması bilinçli: "benzer" bir keşif davetidir, kategorinin tam taraması değil.
 */
const SIMILAR_POOL = 40;

/**
 * Çeşit kartı tavanı — aile operatörün elle kurduğu küme olduğu için sayfalanmaz.
 * Tavan bir emniyet sınırıdır: elle kurulan küme yanlışlıkla yüz üyeye çıkarsa sayfa ilk boyada açılmazdı.
 */
const FAMILY_LIMIT = 24;

/** Çok dilli metni çözer; boş/boşluk metin YOK sayılır (bölüm başlığı boşuna açılmasın). */
function textOf(value: LocalizedText | null, locale: PreferredLanguage): string | null {
  if (!value) return null;
  const resolved = resolveLocalizedText(value, locale).trim();
  return resolved.length > 0 ? resolved : null;
}

/** Beyan metni → vurgulu parçalar. `**işaret**` SUNUCUDA çözülür, istemciye ham metin gitmez. */
function segmentsOf(value: LocalizedText | null, locale: PreferredLanguage) {
  const text = textOf(value, locale);
  return text ? parseEmphasis(text) : null;
}

/**
 * Galeri — kapak görseli HER ZAMAN ilk sıradadır. Ek görseller `product_image` sırasını korur;
 * kapak o listede yoksa (henüz kapak seçilmemiş ürün) yine başa eklenir, böylece galeri asla
 * ürünün kapağıyla çelişen bir görselle açılmaz.
 */
function galleryOf(cover: StorefrontImage, extras: StorefrontImage[]): StorefrontImage[] {
  if (!cover.url) return extras;
  return [cover, ...extras.filter((img) => img.url !== cover.url)];
}

/**
 * Beyan bloğu — 100 g üzerinden sabit olduğu için ürüne aittir.
 * Net miktar burada yok: boya göre değişir, seçimle birlikte varyanttan gelir (`StorefrontVariant.netQuantity`).
 */
function declarationOf(
  product: {
    ingredients: LocalizedText | null;
    storageInstructions: LocalizedText | null;
    nutrition: StorefrontDeclaration['nutrition'];
    allergens: StorefrontDeclaration['allergens'] | null;
    traces: StorefrontDeclaration['traces'];
  },
  locale: PreferredLanguage,
): StorefrontDeclaration {
  return {
    ingredients: segmentsOf(product.ingredients, locale),
    // Detay yalnız satıştaki ürünü okur ve onun beyanı veri kısıtıyla dolu; `?? []` tipi daraltır.
    allergens: product.allergens ?? [],
    traces: product.traces,
    // Hiçbir kalemi girilmemiş künye boş tablo çizdirmesin — "beyan var" izlenimi yanlış olur.
    nutrition: hasNutrition(product.nutrition) ? product.nutrition : null,
    storage: segmentsOf(product.storageInstructions, locale),
  };
}

/** Aynı kategoriden başka ürünler; kategorisiz üründe bölüm boş kalır, çünkü "benzer" iddiası karşılanamıyorsa rastgele ürün önerilmez. */
async function readSimilar(
  db: SupabaseClient,
  product: Pick<ProductWithRelations, 'id' | 'categoryId' | 'familyId'>,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
) {
  if (!product.categoryId) return [];
  const page = await new ProductService(db).listWithRelations({
    filters: { categoryId: product.categoryId, status: 'active' },
    limit: SIMILAR_POOL,
  });

  // Öneri alınamayan ürünü önermez: bu adrese gidemeyen (`elsewhere`) ve hiçbir yerde olmayan (`out_of_stock`) düşer,
  // kargoyla alınabilen (`shipping`) kalır.
  const candidates = page.rows.filter((p) => p.id !== product.id);
  // Alınabilirlik seçimden önce bilinmeli, bu yüzden bağlam havuzun tamamı için okunur; tur sayısı aday sayısından bağımsız.
  // Kartlar farklı kategori ve koleksiyonlardan gelir ve üstünde kampanyayı söyleyecek başlık yoktur, rozet kapsamı bu yüzden okunur.
  const [context, scopeCampaigns] = await Promise.all([
    loadProductContext(db, candidates, place, viewer),
    readScopeCampaigns(db, {
      categoryIds: candidates.flatMap((p) => (p.categoryId === null ? [] : [p.categoryId])),
      collectionIds: candidates.flatMap((p) => p.collections.map((c) => c.collectionId)),
    }),
  ]);
  const byProduct = campaignsByProduct(
    scopeCampaigns,
    candidates,
    new Map(candidates.map((p) => [p.id, p.collections.map((c) => c.collectionId)])),
  );
  const views = new Map(
    candidates.map((p) => [
      p.id,
      toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT, byProduct.get(p.id) ?? null),
    ]),
  );

  // Alınabilirlik iki soru: stokta mı ve bu kanalda fiyatı var mı; ikincisini motor cevaplar (`priceCents`), kuralın ikinci evi açılmaz.
  // Süzgeç SQL'de değil burada, çünkü öneri sayfalanmaz; imleçle sayfalanan katalogda aynı kural SQL'dedir (0032).
  const buyable = candidates.filter((p) => {
    const view = views.get(p.id);
    if (view?.priceCents == null) return false;
    return deliversHere(view.stockStatus);
  });

  // Aile kuralı süzgeçten sonra uygulanır ki elenen temsilcinin yerine ailenin alınabilir üyesi geçebilsin.
  // Hiçbiri kalmazsa bölüm çizilmez (`similar.length > 0`); alakasız öneri göstermektense hiç göstermemek doğru.
  return pickSimilar(buyable, SIMILAR_LIMIT, product.familyId).flatMap((p) => {
    const view = views.get(p.id);
    return view ? [view] : [];
  });
}

/**
 * Ailenin çeşit kartları — tükenen üye bakılan çeşit dahil düşer; adrese göre süzülmez, çünkü orası öneri değil ürünün kendi
 * çeşit seçicisidir. Ekran başlığını bundan türetir: listede `isCurrent` yoksa bakılan çeşit satılmıyordur ("Alınabilir çeşitler").
 */
async function readFamily(
  db: SupabaseClient,
  product: ProductWithRelations,
  locale: PreferredLanguage,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontFamilyMember[]> {
  if (!product.familyId) return [];

  const page = await new ProductService(db).listWithRelations({
    filters: { familyId: product.familyId, status: 'active' },
    // Aile doğal tavanlı bir kümedir (operatör elle kurar) — sayfalanmaz, tek turda okunur.
    limit: FAMILY_LIMIT,
  });
  if (page.rows.length < 2) return [];

  const context = await loadProductContext(db, page.rows, place, viewer);
  const cards = page.rows
    // "Tükendi mi" ve başlangıç fiyatı `toProduct`tan okunur: kart, katalog ve detay aynı ürün için farklı sayı göstermemeli.
    // Fiyat en ucuz aktif boyunki olduğu için çizimdeki "…'dan" eki doğru bir alt sınırdır.
    .map((row) => ({ row, card: toProduct(row, locale, context.get(row.id) ?? EMPTY_PRODUCT_CONTEXT) }))
    // Kanalında fiyatı olmayan üye de düşer: "Alınabilir çeşitler" başlığının altında alınamayan çeşit başlığın sözünü bozar.
    // Aile tavanlı olduğu için süzgeç okumadan sonra koşar, `readSimilar` ile aynı gerekçe.
    .filter(({ card }) => !card.soldOut && card.priceCents != null)
    .map(({ row, card }) => ({
      slug: row.slug,
      // Etiket veri kısıtıyla zorunlu; yine de savunmalı okuma — dil yedek zinciri boş dönerse
      // kart etiketsiz kalmasın diye ürün adına düşer.
      label: textOf(row.familyLabel, locale) ?? resolveLocalizedText(row.name, locale),
      image: imageOf(row),
      fromPriceCents: card.priceCents,
      isCurrent: row.id === product.id,
    }));

  // Eşik bakılan çeşide göre değişir: o alınabiliyorsa tek kart seçim sunmaz ve blok çizilmez;
  // alınamıyorsa tek kardeş bile müşterinin çıkış yoludur.
  const bakilanVar = cards.some((c) => c.isCurrent);
  const yeter = bakilanVar ? cards.length > 1 : cards.length > 0;
  return yeter ? cards : [];
}

export interface ProductDetailInput {
  locale: PreferredLanguage;
  slug: string;
  /**
   * Müşterinin yerinden çözülen depolar — `CatalogInput.place` ile aynı sözleşme: zorunlu,
   * varsayılansız; `warehouseId: null` "yer bilinmiyor" demektir ve depo-ÜSTÜ okumaya düşer.
   */
  place: PlaceWarehouses;
  /** **Kim soruyor** — kanal/onay/kimlik; fiyatın çözüldüğü eksen. */
  viewer: PricingViewer;
}

/**
 * Slug ile ürün detayı; ürün yoksa ya da satışta değilse `null` (çağıran 404'e çevirir), çünkü katalogda görünmeyen ürünün
 * linkle alınabilmesi `status` kararını boşa çıkarırdı (DOMAIN §13).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`).
 */
export async function getProductDetail(
  db: SupabaseClient,
  input: ProductDetailInput,
): Promise<StorefrontProductDetail | null> {
  const { locale, slug, place, viewer } = input;
  const product = await new ProductService(db).findBySlug(slug);
  if (!product || product.status !== 'active') return null;

  const [family, context, images, category, similar] = await Promise.all([
    readFamily(db, product, locale, place, viewer),
    loadProductContext(db, [product], place, viewer),
    new ProductImageService(db).listByProduct(product.id),
    product.categoryId ? new CategoryService(db).getById(product.categoryId) : Promise.resolve(null),
    // Aynı künye "benzer ürünler"e de gider: detay B2B fiyat gösterirken altındaki kartların
    // perakende göstermesi, sayfayı kendi kendisiyle çelişkiye düşürürdü.
    readSimilar(db, product, locale, place, viewer),
  ]);

  const ctx: ProductContext = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
  const variants = ctx.variants.filter((v) => v.isActive);
  const cover = imageOf(product);

  return {
    id: product.id,
    slug: product.slug,
    name: resolveLocalizedText(product.name, locale),
    description: textOf(product.description, locale),
    image: cover,
    gallery: galleryOf(cover, images.map(imageOf)),
    category: category ? toCategory(category, locale) : null,
    variants: variants.map((v) => toVariant(v, locale, ctx, product.shippable)),
    // Açılışta seçili boy kartla aynı ölçütten gelir (`primaryVariantOf`); `variants` sırası `sortOrder`da kalır.
    primaryVariantId: primaryVariantOf(variants, ctx)?.id ?? null,
    declaration: declarationOf(product, locale),
    shippable: product.shippable,
    coldChain: requiresColdChain(product.storageType),
    family,
    similar,
  };
}
