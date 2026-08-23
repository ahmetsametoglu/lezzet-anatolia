import { CategoryService, ProductImageService, ProductService } from '@lezzet/database';
import { pickSimilar, requiresColdChain } from '@lezzet/domain-core';
import { parseEmphasis } from '@lezzet/helper';
import { hasNutrition, resolveLocalizedText } from '@lezzet/types';
import type { LocalizedText, PreferredLanguage, ProductWithRelations } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignsByProduct, readScopeCampaigns } from './campaign';
import { EMPTY_PRODUCT_CONTEXT, imageOf, primaryVariantOf, toCategory, toProduct, toVariant } from './map';
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
 * Ürün detay okuması (08.11; terfi 21.6 — kaynağı `apps/web/lib/storefront/product.ts`).
 *
 * Sayfanın TAMAMI tek turda gelir: ürün + varyantlar, fiyat/stok/teklif bağlamı, galeri, kategori,
 * aile ve benzer ürünler. Bölüm başına ayrı çağrı yapılmaz — bu sayfa sosyal/WhatsApp trafiğinin
 * ilk dokunuşu olabilir, ilk boya eksiksiz gelmelidir.
 *
 * **Yorum ve puan bu kapıdan GEÇMEZ** (17.1): yorum vitrinin değil geri bildirim modülünün
 * verisi, moderasyon durumu ve "kim yazabilir" kararı orada yaşıyor. Buraya taşınsaydı vitrin
 * sözleşmesi moderasyonu bilmek zorunda kalırdı.
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
 * Beyan bloğu. Net ağırlık BURADA YOK: paket ağırlığı boya göre değişir, dolayısıyla varyanta aittir
 * ve seçimle birlikte güncellenir (`StorefrontVariant.netWeightG`). Beyanın kendisi 100 g üzerinden
 * sabittir — ürüne aittir, boya değil.
 */
function declarationOf(
  product: {
    ingredients: LocalizedText | null;
    storageInstructions: LocalizedText | null;
    nutrition: StorefrontDeclaration['nutrition'];
    allergens: StorefrontDeclaration['allergens'];
    traces: StorefrontDeclaration['traces'];
  },
  locale: PreferredLanguage,
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
 * Seçim kuralı burada DEĞİL, `@lezzet/domain-core`'un `pickSimilar`ında: kendi ailesi tamamen
 * dışarıda, öteki ailelerden birer temsilci, dörtlü dolmazsa yalnız ikinci kural kalkar (kullanıcı
 * kararları 04.08). Saf olduğu için testi de DB'siz.
 */
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

  /**
   * ── SEÇKİ ARTIK ALINAMAYAN ÜRÜNÜ ÖNERMİYOR (kullanıcı kararı 19.08, ekran turuyla) ──────────
   *
   * Ekranda görüldü: 67400'e bakan müşteriye "Bunları da sevebilirsiniz" şeridinde **"Haber ver"**
   * düğmeli kartlar çıkıyordu — yani sisteme göre o adrese gidemeyen ürünler. Sistem bunu ZATEN
   * biliyordu (kartın üstüne yazıyordu), ama seçime hiç sokmuyordu: süzgeç yalnız kategori +
   * `status`tü, `place` sadece kartı ETİKETLEMEK için kullanılıyordu.
   *
   * En keskin gerekçe sayfanın kendi içindeydi: teslimat kutusunun birincil düğmesi *"Kargolanabilir
   * benzerleri gör"* diyor, iki blok aşağıdaki şerit alınamayanları sıralıyordu. Sayfa kendi
   * kendisiyle çelişiyordu.
   *
   * **Düşen iki hâl:** `elsewhere` (bu adrese gidemez) ve `out_of_stock` (hiçbir yerde yok). Kalan
   * `shipping` DÜŞMEZ — kargoyla da olsa müşteri onu alabiliyor.
   *
   * **Bu kural yalnız ÖNERİ şeridinindir.** Ailenin çeşit kartları (`readFamily`) süzülmez ve
   * süzülmemeli: orası bir öneri değil, bakılan ürünün kendi seçicisidir — adrese göre süzmek,
   * ürünü kendi çeşitlerinden gizlemek olurdu. Katalog listesi de ayrı: orada "Haber ver" bilinçli
   * bir talep toplama aracı (tasarımda çizili).
   *
   * ── BAĞLAM ARTIK HAVUZUN TAMAMI İÇİN OKUNUYOR ─────────────────────────────────────────────
   * Önce 4 aday seçilip bağlam onlar için okunuyordu; alınabilirlik seçimden ÖNCE bilinmek zorunda
   * olduğu için sıra tersine döndü. Bedeli yok ve bu ölçüldü: `loadProductContext` satır sayısından
   * BAĞIMSIZ olarak 5 paralel sorgu atıyor (kimlikler `in(...)` listesine giriyor) — 40 aday, 4
   * adayla aynı tur sayısı demek.
   *
   * Aile kuralı (her aileden tek temsilci) süzgeçten SONRA uygulanıyor: önce uygulasaydık, elenen
   * bir temsilcinin yerine ailenin alınabilir üyesi geçemezdi.
   */
  const candidates = page.rows.filter((p) => p.id !== product.id);
  /* Öneri şeridi KARIŞIK bir listedir — kartları farklı kategori ve koleksiyonlardan gelir ve
     üstünde kampanyayı söyleyecek bir başlık yoktur. Kullanıcı kararı 23.08 tam bu yeri tarif
     ediyor: "rozet, başlığın söyleyemediği yerde". Bağlam okumasıyla PARALEL koşuyor; ek sorgu
     doğmuyor, çünkü kapsam kimlikleri zaten elimizdeki satırlarda (`categoryId` + `collections`). */
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

  const buyable = candidates.filter((p) => {
    const status = views.get(p.id)?.stockStatus;
    return status !== 'elsewhere' && status !== 'out_of_stock';
  });

  // Hiçbiri kalmazsa bölüm HİÇ ÇİZİLMEZ (`product.desktop`: `similar.length > 0`) — alakasız bir
  // şerit göstermektense hiç göstermemek doğru.
  return pickSimilar(buyable, SIMILAR_LIMIT, product.familyId).flatMap((p) => {
    const view = views.get(p.id);
    return view ? [view] : [];
  });
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
    // Hem "tükendi mi" hem BAŞLANGIÇ FİYATI `toProduct`tan okunur, ikinci bir hesap yazılmaz: kart,
    // katalog ve detay aynı ürün için farklı sayı gösterirse müşteri hangisine inanacağını bilemez.
    // `toProduct`un fiyatı EN UCUZ aktif boyunki (09.08), yani çizimdeki "…'dan" tam olarak o.
    // Düzeltmeden önce "ilk boyun fiyatı"ydı ve "…'dan" eki o hâlde YANLIŞ bir vaatti: en ucuz
    // olmayan bir sayının önüne "…'dan" yazmak, olmayan bir alt sınır sözü vermekti.
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
 * Slug ile ürün detayı; ürün yoksa ya da satışta değilse `null` → çağıran 404'e çevirir.
 *
 * Aday ve pasif ürün müşteriye AÇILMAZ: katalogda görünmeyen bir ürünün doğrudan linkle satın
 * alınabilir olması, `status`'ün taşıdığı kararı boşa çıkarırdı (DOMAIN §13).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`), `auth/otp` deseni.
 */
export async function getProductDetail(
  db: SupabaseClient,
  input: ProductDetailInput,
): Promise<StorefrontProductDetail | null> {
  const { locale, slug, place, viewer } = input;
  const product = await new ProductService(db).findBySlug(slug);
  if (!product || product.status !== 'active') return null;

  // Aile ve benzer-listesi PARALEL okunur. Sıra bir zamanlar zorunluydu: benzer-listesi ailenin
  // kimliklerini eleyeceği için önce onları bilmek gerekiyordu. Kural değişti (04.08 — eleme yok,
  // aile başına bir temsilci var) ve bağımlılık da onunla birlikte düştü.
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
    // Açılışta seçili boy — ölçüt kartla BİREBİR aynı (`primaryVariantOf`). Sıra DEĞİŞMİYOR:
    // `variants` yine `sortOrder`'da, yalnız hangisinin seçili açılacağı buradan geliyor.
    primaryVariantId: primaryVariantOf(variants, ctx)?.id ?? null,
    declaration: declarationOf(product, locale),
    shippable: product.shippable,
    coldChain: requiresColdChain(product.storageType),
    family,
    similar,
  };
}
