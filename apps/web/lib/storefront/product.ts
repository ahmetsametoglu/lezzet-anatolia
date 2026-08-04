import 'server-only';
import { CategoryService, ProductImageService, ProductService, serviceDb } from '@lezzet/database';
import { parseEmphasis } from '@lezzet/helper';
import { hasNutrition, resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText, ProductWithRelations } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import type { PlaceWarehouses } from '@/lib/delivery/place-types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toCategory, toProduct, toVariant } from './map';
import { loadProductContext } from './read-context';
import { pickSimilar } from './similar';
import type { PricingViewer } from './read-viewer';
import type { ProductContext } from './map';
import type { StorefrontDeclaration, StorefrontFamilyMember, StorefrontImage, StorefrontProductDetail } from './storefront-types';

/**
 * Ürün detay okuması (08.11) — vitrinin üçüncü veri kapısı.
 *
 * Sayfanın TAMAMI tek turda gelir: ürün + varyantlar, fiyat/stok/teklif bağlamı, galeri, kategori
 * ve benzer ürünler. Bölüm başına ayrı çağrı yapılmaz — bu sayfa sosyal/WhatsApp trafiğinin ilk
 * dokunuşu olabilir, ilk boya eksiksiz gelmelidir.
 *
 * Bugünkü kaynak durumu:
 *   ürün · varyant · fiyat · stok · fırsat · beyan · galeri · benzer ürünler → GERÇEK
 *   sepete ekleme                                                           → 07-siparis
 *
 * **Yorum ve puan bu kapıdan GEÇMİYOR ama sayfada VAR** (17.1): `page.tsx` onları
 * `lib/feedback/product-feedback`ten ayrı okuyor (`listProductReviews` · `getProductScore` ·
 * `getReviewEligibility`) ve `reviews.tsx` çiziyor. Ayrı durmasının sebebi sahiplik: yorum
 * vitrinin değil geri bildirim modülünün verisi, moderasyon durumu ve "kim yazabilir" kararı da
 * orada yaşıyor. Buraya taşınsaydı vitrin sözleşmesi moderasyonu bilmek zorunda kalırdı.
 * (Künye bir süre "yorumlar → YOK, model gelene kadar bölüm sözleşmede de sayfada da yoktur"
 * diyordu; model de bölüm de inmişti — denetim M-Y4.)
 */

/** Benzer ürün şeridinde kaç kart — tasarımda dörtlü ızgara. */
const SIMILAR_LIMIT = 4;

/**
 * Seçkinin taradığı aday havuzu — **sabit sınır, sayfalama değil** (`CLAUDE §1`: editoryal seçki
 * sayfalanmaz ama sınırı olur).
 *
 * Dörtten büyük olmak zorunda çünkü aile kuralı adayları eliyor: yedi üyeli bir ailenin altısı
 * yedeğe düşer ve havuz dar olsaydı bölüm ailenin tek temsilcisiyle yarım kalırdı. 40, bugünkü
 * kategorilerin (~15 ürün) tamamını rahatça kapsıyor; büyüyen bir kategoride seçki havuzun ilk
 * 40'ından yapılır ve bu bilinçli — "benzer" bir keşif daveti, kategorinin tam taraması değil.
 */
const SIMILAR_POOL = 40;

/**
 * Çeşit kartı TAVANI (05.15). Aile operatörün elle kurduğu bir kümedir ve brief 2 ile 10+ arası bir
 * boy öngörüyor — sayfalanmaz. Tavan bir tasarım sınırı değil bir EMNİYET sınırıdır: elle kurulan
 * kümenin de bir gün yanlışlıkla yüz üyeye çıkması mümkün ve o sayfa ilk boyada açılmazdı.
 */
const FAMILY_LIMIT = 24;

/** Çok dilli metni çözer; boş/boşluk metin YOK sayılır (bölüm başlığı boşuna açılmasın). */
function textOf(value: LocalizedText | null, locale: Locale): string | null {
  if (!value) return null;
  const resolved = resolveLocalizedText(value, locale).trim();
  return resolved.length > 0 ? resolved : null;
}

/** Beyan metni → vurgulu parçalar. `**işaret**` SUNUCUDA çözülür, tarayıcıya ham metin gitmez. */
function segmentsOf(value: LocalizedText | null, locale: Locale) {
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
 * Beyan bloğu. Net ağırlık BURADA YOK: paket ağırlığı boya göre değişir, dolayısıyla varyanta aittir
 * ve seçimle birlikte güncellenir (`StorefrontVariant.netWeightG`). Beyanın kendisi 100 g üzerinden
 * sabittir — ürüne aittir, boya değil.
 */
function declarationOf(
  product: { ingredients: LocalizedText | null; storageInstructions: LocalizedText | null; nutrition: StorefrontDeclaration['nutrition']; allergens: StorefrontDeclaration['allergens']; traces: StorefrontDeclaration['traces'] },
  locale: Locale,
): StorefrontDeclaration {
  return {
    ingredients: segmentsOf(product.ingredients, locale),
    allergens: product.allergens,
    traces: product.traces,
    // Hiçbir kalemi girilmemiş künye boş tablo çizdirmesin — "beyan var" izlenimi yanlış olur.
    nutrition: hasNutrition(product.nutrition) ? product.nutrition : null,
    storage: segmentsOf(product.storageInstructions, locale),
  };
}

/**
 * Aynı kategoriden başka ürünler. Ürünün kendisi listeden düşer; kategorisiz üründe bölüm boş kalır
 * (rastgele ürün önerilmez — "benzer" iddiası karşılanamıyorsa hiç iddia edilmez).
 *
 * Seçim kuralı burada DEĞİL, `./similar`de: kendi ailesi tamamen dışarıda, öteki ailelerden birer
 * temsilci, dörtlü dolmazsa yalnız ikinci kural kalkar (kullanıcı kararları 04.08). Saf olduğu
 * için testi de DB'siz.
 */
async function readSimilar(
  db: SupabaseClient,
  product: Pick<ProductWithRelations, 'id' | 'categoryId' | 'familyId'>,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
) {
  if (!product.categoryId) return [];
  const page = await new ProductService(db).listWithRelations({
    filters: { categoryId: product.categoryId, status: 'active' },
    limit: SIMILAR_POOL,
  });
  const rows = pickSimilar(
    page.rows.filter((p) => p.id !== product.id),
    SIMILAR_LIMIT,
    product.familyId,
  );
  const context = await loadProductContext(db, rows, place, viewer);
  return rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
}

/**
 * **Ailenin çeşit kartları** (05.15).
 *
 * ── ÜÇ SÜZGEÇ, ÜÇÜ DE BRIEF'İN KENDİ KURALI ────────────────────────────────
 * `status = 'active'` (aday ve pasif üye satılamaz, kartı da olmaz) · TÜKENEN üye düşer ·
 * aile tek üyeye inmişse blok hiç çizilmez.
 *
 * ── BAKILAN ÇEŞİT TÜKENDİYSE KARTI DA DÜŞER ────────────────────────────────
 * Çizimin etkileşim sözleşmesi: *"Bakılan çeşidin kendisi tükendiyse sayfa açılmaya devam eder,
 * blok başlığı 'Alınabilir çeşitler' olur ve **aktif işaret basılmaz**."* Yani tükenmiş üye hiçbir
 * kartta görünmez — kendisi bile. Sayfa yine açılır (`getProductDetail` `null` dönmez), kardeşleri
 * de görünür; müşteriye çıkış yolu kartların KENDİSİDİR.
 *
 * Ekran başlığı bundan türetir: listede `isCurrent` YOKSA bakılan çeşit satılmıyor demektir →
 * "Alınabilir çeşitler". Ayrı bir bayrak göndermeye gerek yok.
 */
async function readFamily(
  db: SupabaseClient,
  product: ProductWithRelations,
  locale: Locale,
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
    // Hem "tükendi mi" hem BAŞLANGIÇ FİYATI `toProduct`tan okunur, ikinci bir hesap yazılmaz: kart,
    // katalog ve detay aynı ürün için farklı sayı gösterirse müşteri hangisine inanacağını bilemez.
    // `toProduct`un fiyatı zaten "ilk aktif varyantın fiyatı", yani çizimdeki "…'dan" tam olarak o.
    .map((row) => ({ row, card: toProduct(row, locale, context.get(row.id) ?? EMPTY_PRODUCT_CONTEXT) }))
    // Tükenen HER üye düşer — bakılan çeşit dâhil (çizimin etkileşim sözleşmesi).
    .filter(({ card }) => !card.soldOut)
    .map(({ row, card }) => ({
      slug: row.slug,
      // Etiket veri kısıtıyla zorunlu; yine de savunmalı okuma — dil yedek zinciri boş dönerse
      // kart etiketsiz kalmasın diye ürün adına düşer.
      label: textOf(row.familyLabel, locale) ?? resolveLocalizedText(row.name, locale),
      image: imageOf(row),
      fromPriceCents: card.priceCents,
      isCurrent: row.id === product.id,
    }));

  // **Eşik, bakılan çeşidin listede olup olmamasına göre DEĞİŞİR** ve ikisi farklı sorular:
  //  · Bakılan çeşit alınabiliyorsa (`isCurrent` var) tek kart bir SEÇİM sunmaz — blok çizilmez.
  //  · Bakılan çeşit tükendiyse (`isCurrent` yok) tek kart bile bir ÇIKIŞ YOLUDUR: müşteri bu
  //    ürünü alamıyor, alabileceği bir kardeşi var. Burada gizlemek onu çıkışsız bırakırdı — ki
  //    kuralın var olma sebebi tam olarak buydu.
  const bakilanVar = cards.some((c) => c.isCurrent);
  const yeter = bakilanVar ? cards.length > 1 : cards.length > 0;
  return yeter ? cards : [];
}

/**
 * Slug ile ürün detayı; ürün yoksa ya da satışta değilse `null` → sayfa 404'e çevirir.
 *
 * Aday ve pasif ürün müşteriye AÇILMAZ: katalogda görünmeyen bir ürünün doğrudan linkle satın
 * alınabilir olması, `status`'ün taşıdığı kararı boşa çıkarırdı (DOMAIN §13).
 */
/**
 * `warehouseId` — müşterinin yerinden çözülen depo. **Zorunlu ve varsayılansız**: `null` meşru bir
 * değerdir ("yer bilinmiyor", posta kodu zorunlu değil — K1) ama VERİLMESİ zorunludur. Varsayılan
 * bıraksaydık argümanı unutan çağrı derlenir ve sessizce depo-üstü okurdu — `getAvailableMap`'i
 * kurtaran şey (T8) tam olarak parametrenin zorunluluğuydu, aynı disiplin burada da geçerli.
 *
 * `null` → depo-ÜSTÜ okuma: "tükendi" demenin tek dayanağı hiçbir depoda bulunmamasıdır (C3).
 */
export async function getProductDetail(
  locale: Locale,
  slug: string,
  place: PlaceWarehouses,
  viewer: PricingViewer,
): Promise<StorefrontProductDetail | null> {
  const db = serviceDb();
  const product = await new ProductService(db).findBySlug(slug);
  if (!product || product.status !== 'active') return null;

  // Aile ve benzer-listesi artık PARALEL okunuyor. Sıra bir zamanlar zorunluydu: benzer-listesi
  // ailenin kimliklerini eleyeceği için önce onları bilmek gerekiyordu. Kural değişti (04.08 —
  // eleme yok, aile başına bir temsilci var) ve bağımlılık da onunla birlikte düştü; iki okuma
  // birbirini beklemiyor.
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
    declaration: declarationOf(product, locale),
    shippable: product.shippable,
    family,
    similar,
  };
}
