import { Hono } from 'hono';
import { z } from 'zod';
import {
  CategoryService,
  ProductImageService,
  ProductListingService,
  ProductService,
  serviceDb,
} from '@lezzet/database';
import { parseEmphasis } from '@lezzet/helper';
import { publicImageUrl } from '@lezzet/storage';
import {
  cropOf,
  hasNutrition,
  resolveLocalizedText,
  CatalogSortEnum,
  DEFAULT_PAGE_SIZE,
  KeysetCursorSchema,
  PreferredLanguageEnum,
  type Category,
  type ImageMeta,
  type KeysetCursor,
  type LocalizedText,
  type PreferredLanguage,
  type Product,
  type ProductVariant,
  type ProductWithRelations,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import {
  CatalogCategorySchema,
  CatalogPageSchema,
  CatalogProductDetailSchema,
  CatalogProductSchema,
} from './contract';

/**
 * Katalog uçları (21.6) — **oturumsuz gezilir** (02-mimari §4: "oturumsuz kullanım = müşteri
 * gezinmesi"). `router.ts`te `bearerAuth`tan ÖNCE bağlanırlar; Authorization başlığı gelse bile
 * okunmaz, çünkü kimliğin bugün değiştireceği tek şey FİYAT ve fiyat bu dilimde hiç yok
 * (`contract.ts`'in ticari-bağlam notu). Bearer'lı okuma, terfi gelip B2B fiyat bağlandığı gün
 * anlam kazanır — o gün bu uçlar `bearerAuth`ın ALTINA değil, isteğe bağlı bir kimlik çözümüne
 * bağlanır (katalog kapanmaz).
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Yaptığı üç şey var: (1) sorgu dizesini servis süzgeçlerine çevirmek, (2) servisin döndürdüğü
 * satırı sözleşme şekline indirgemek, (3) zarflamak. Fiyat/stok/teklif/seçki kararlarının hiçbiri
 * burada yok — hepsi terfi bekliyor (bkz. `contract.ts`).
 */

/** Sayfa boyutu tavanı — istemci daha büyüğünü isteyemez (tek istekle katalogu boşaltmak sayfalamayı anlamsız kılar). */
const MAX_PAGE_SIZE = 50;

/**
 * `locale` ZORUNLU ve varsayılansız.
 *
 * `resolveLocalizedText` dil verilmezse kanonik sıraya (TR → FR → DE) düşer, yani sessizce TÜRKÇE
 * döner — Fransız müşteriye Türkçe ürün adı göndermek "makul varsayılan" değil, gizli bir arıza.
 * Web'de bu soru hiç doğmuyor çünkü dil adresin ilk segmentinde (`/fr/catalog`); mobilde adres yok,
 * dilin geldiği yer uygulamanın kendi seçimi (onboarding 1. adım). Eksikse 400 — cevapsız bırakmak
 * yerine soruyu istemciye geri veriyoruz.
 */
const LocaleSchema = PreferredLanguageEnum;

const ProductQuerySchema = z.object({
  locale: LocaleSchema,
  /** Ad araması — üç dilde birden (`ProductService` SQL'de çözer). */
  q: z.string().trim().min(1).optional(),
  /** Kategori SLUG'ı (dil-bağımsız). Tanınmayan slug 400 alır — bkz. `resolveCategoryId`. */
  category: z.string().trim().min(1).optional(),
  /**
   * Bozuk sıralama değeri hata DEĞİL: istemci ya da kayıtlı bir bağlantı eskimiş olabilir, ve
   * yanlış sıralama listeyi YANLIŞ yapmaz — yalnız beklenenden farklı sıralar. Web de aynı şeyi
   * yapıyor (`catalog/page.tsx` — `CATALOG_SORTS.includes(...) ? ... : 'featured'`).
   *
   * `.catch` verilmemiş değeri de yakalar (zorunluluk ihlali de bir parse hatasıdır), o yüzden
   * ayrıca `.default` yazılmıyor — iki yerde duran aynı varsayılan bir gün ayrışır.
   */
  sort: CatalogSortEnum.catch('featured'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * İmleç TELDE opak bir dize (base64url'lenmiş keyset nesnesi) — saf TAŞIMA adaptörü, kural değil.
 *
 * İstemci imlecin içini bilmez ve bilmemeli: keyset'in `{value,id}` şekli bir uygulama ayrıntısı,
 * yarın değişirse istemci kırılmamalı. Web'de bu soru yok çünkü nesne server action'a olduğu gibi
 * geçiyor; HTTP'de sorgu dizesi düz metin olduğu için kodlama şart.
 */
function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Bozuk imleç **hata değil, geçersiz bir istek**: eskimiş bir bağlantı ya da elle oynanmış bir
 * parametre. Doğru cevap 400 değil, listeyi BAŞTAN vermek — müşterinin göreceği en anlamlı sonuç o
 * (web'in aynı kararı: `catalog/actions.ts` `safeParse` notu, denetim H3).
 */
function decodeCursor(raw: string | undefined): KeysetCursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const cursor = KeysetCursorSchema.safeParse(parsed);
    return cursor.success ? cursor.data : undefined;
  } catch {
    // Base64/JSON çözülemedi — imleç yok sayılır ve liste başa döner. Kayıt DÜŞÜLMEZ: bu bir arıza
    // değil, dışarıdan gelen geçersiz bir değer; her yenilenen eski bağlantı hata defterini şişirirdi.
    return undefined;
  }
}

/** Çok dilli metni çözer; boş/boşluk metin YOK sayılır (bölüm başlığı boşuna açılmasın). */
function textOf(value: LocalizedText | null, locale: PreferredLanguage): string | null {
  if (!value) return null;
  const resolved = resolveLocalizedText(value, locale).trim();
  return resolved.length > 0 ? resolved : null;
}

/** Görsel künyesi → çözülmüş URL + kırpma. `publicImageUrl` tek kaynak (anahtar→adres kuralı orada). */
function imageOf(row: ImageMeta) {
  return { url: publicImageUrl(row.imageKey, row.imageUpdatedAt), crop: cropOf(row) };
}

function toCategory(row: Category, locale: PreferredLanguage) {
  return CatalogCategorySchema.parse({
    id: row.id,
    slug: row.slug,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
  });
}

/**
 * Aktif boylar, SIRASI SABİTLENMİŞ.
 *
 * PostgREST gömülü ilişkinin sırasını garanti ETMEZ; sabitlenmezse aynı ürün iki istekte farklı
 * "ilk boy" (dolayısıyla farklı `unitLabel`) gösterir. Ölçüt uydurulmadı: `product_listing`
 * görünümünün `primary_variant` CTE'si de tam olarak `sort_order, created_at` diyor (0032) —
 * yani okuma ile sıralama aynı boyu birinci sayar.
 */
function activeVariants(row: ProductWithRelations): ProductVariant[] {
  return row.variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

function toProduct(row: ProductWithRelations, locale: PreferredLanguage) {
  const variants = activeVariants(row);
  return CatalogProductSchema.parse({
    id: row.id,
    slug: row.slug,
    shippable: row.shippable,
    name: resolveLocalizedText(row.name, locale),
    image: imageOf(row),
    unitLabel: variants[0] ? resolveLocalizedText(variants[0].label, locale) : '',
    variants: variants.map((v) => ({ id: v.id, netWeightG: v.netWeightG, label: resolveLocalizedText(v.label, locale) })),
  });
}

/**
 * Kategori slug'ı → kimlik. **Tanınmayan slug 400 alır ve bu web'den BİLİNÇLİ bir sapmadır.**
 *
 * Web tanınmayan slug'ı sessizce yok sayıp süzgeçsiz katalogu gösteriyor
 * (`lib/storefront/catalog.ts` — `find(...) ?? null`), çünkü orada çip görünür durumda: müşteri
 * seçiminin uygulanmadığını ekrandan anlar. HTTP istemcisinde öyle bir geri bildirim yok; sessizce
 * daha GENİŞ bir küme dönmek, süzgecin bir kopyadan düşmesiyle aynı sınıf arıza olurdu
 * (`catalog-types.ts`'in `onlyShippable` anlatısı).
 *
 * Pasif kategori de tanınmaz: `activeOnly` süzgeci hem `/categories` cevabının hem bu çözümün
 * kaynağı, yani istemcinin göremediği bir kategoriyle süzme yapılamaz.
 */
async function resolveCategoryId(db: SupabaseClient, slug: string): Promise<string | null> {
  // Kategori DOĞAL TAVANLI bir küme (operatör elle kurar) → tek turda, sayfalamasız (`CLAUDE §1`).
  const categories = await new CategoryService(db).list({ activeOnly: true });
  return categories.find((c) => c.slug === slug)?.id ?? null;
}

/**
 * Galeri — kapak HER ZAMAN ilk sırada, ek görseller `product_image` sırasını korur. Kapak listede
 * zaten varsa iki kez basılmaz; kapağı olmayan üründe galeri ek görsellerden ibarettir (galeri asla
 * ürünün kapağıyla çelişen bir görselle açılmaz).
 */
function galleryOf(cover: { url: string | null }, extras: Array<{ url: string | null }>) {
  if (!cover.url) return extras;
  return [cover, ...extras.filter((img) => img.url !== cover.url)];
}

/**
 * Yasal beyan. Net ağırlık BURADA YOK: paketin ağırlığı boya göre değişir, dolayısıyla varyanta
 * aittir; beyanın kendisi 100 g üzerinden sabittir ve ürüne aittir.
 *
 * Hiçbir kalemi girilmemiş besin künyesi `null` döner (`hasNutrition`) — boş bir tablo çizdirmek
 * "beyan var" izlenimi verirdi, ki yoktur.
 */
function declarationOf(
  product: Pick<Product, 'ingredients' | 'storageInstructions' | 'nutrition' | 'allergens' | 'traces'>,
  locale: PreferredLanguage,
) {
  const segmentsOf = (value: LocalizedText | null) => {
    const text = textOf(value, locale);
    return text ? parseEmphasis(text) : null;
  };
  return {
    ingredients: segmentsOf(product.ingredients),
    storage: segmentsOf(product.storageInstructions),
    nutrition: hasNutrition(product.nutrition) ? product.nutrition : null,
    allergens: product.allergens,
    traces: product.traces,
  };
}

export const catalog = new Hono<AppEnv>();

/**
 * Kategoriler — tek tur, `sort_order` sırasında. Web `fixtures.ts` yedeğine düşüyor (katalog
 * tamamen boşken kabuk çizilsin diye); API düşmez: boş liste doğru cevaptır ve uydurma kimliklerle
 * ürün isteyen bir istemci üretmek, boş bir şerit çizmekten pahalıya patlar.
 */
catalog.get('/categories', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const rows = await new CategoryService(serviceDb()).list({ activeOnly: true });
  return ok(c, { categories: rows.map((r) => toCategory(r, locale.data)) });
});

/**
 * Ürün listesi — keyset sayfalama + arama + kategori + sıralama.
 *
 * ── DEPO BAĞLAMI: "YER BİLİNMİYOR" (`warehouseId = null`) ────────────────────
 * Bu, web'in POSTA KODU VERMEMİŞ ZİYARETÇİSİYLE birebir aynı hâldir: web depoyu
 * `lezzet.place.v2` çerezinden çözüyor (`lib/delivery/read-place.ts`), çerez yoksa
 * `warehouseId: null` geçiyor ve okuma depo-ÜSTÜNE düşüyor. Mobilde o çerezin karşılığı cihazdaki
 * `onbZip` ama posta kodunu depoya çeviren çözüm (`resolvePlaceByPostalCode` + bölge/depo girdileri
 * + kargo deposu seçimi) web lib'inde yaşayan bir orkestrasyon — kopyalanmaz, terfi eder
 * (02-mimari §3.1). Bugünkü tek tüketicisi fiyat sıralamasıdır ve `null` orada da meşru bir
 * değerdir: görünümün `warehouse_id is null` satırı LİSTE fiyatıyla sıralar, parti-bağlı teklif
 * tutarını hiç kullanmaz (0032'nin kararı — verilmemiş bir söz bozulamaz).
 *
 * Yani bu uç "depo süzgeçsiz okuma" YAPMIYOR: depo boyutunda bilinçli olarak *yeri bilinmeyen*
 * satırı seçiyor. `CLAUDE §1`'in yasakladığı şey süzgeci UNUTMAKTIR; burada süzgeç var, değeri
 * `null` ve `null`ın anlamı sözleşmede yazılı.
 */
catalog.get('/products', async (c) => {
  const parsed = ProductQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.path[0] === 'locale' ? 'invalid_locale' : 'invalid_query', 400);
  }
  const { locale, q, category, sort, limit } = parsed.data;

  const db = serviceDb();
  // Kategori listesi YALNIZ süzgeç varken okunur: `/products` kategorileri döndürmüyor (kendi ucu
  // var), yani süzgeçsiz her istekte o sorguyu atmak boşa bir tur olurdu.
  const categoryId = category ? await resolveCategoryId(db, category) : null;
  if (category && !categoryId) return fail(c, 'unknown_category', 400);

  // Aday ve pasif ürün katalogda GÖRÜNMEZ (`status: 'active'` — DOMAIN §13).
  const filters = { query: q, categoryId: categoryId ?? undefined, status: 'active' as const };
  const cursor = decodeCursor(parsed.data.cursor);
  const productSvc = new ProductService(db);
  // Fiyat sıralaması AYRI kaynaktan okunur (`product_listing` görünümü, 0032): sıralama anahtarı
  // ürün tablosunda yok. Süzgeçler ve satır şeması ortak — ayrışan tek şey sıra.
  const direction = sort === 'priceAsc' ? 'asc' : sort === 'priceDesc' ? 'desc' : null;
  const [page, counts] = await Promise.all([
    direction
      ? new ProductListingService(db).listByPrice({ filters, cursor, limit, direction, warehouseId: null })
      : productSvc.listWithRelations({ filters, cursor, limit }),
    productSvc.counts(filters),
  ]);

  return ok(
    c,
    CatalogPageSchema.parse({
      products: page.rows.map((row) => toProduct(row, locale)),
      total: counts.total,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    }),
  );
});

/**
 * Ürün detayı. Aday ve pasif ürün doğrudan bağlantıyla da AÇILMAZ (404): katalogda görünmeyen bir
 * ürünün linkle satılabilir olması `status`'ün taşıdığı kararı boşa çıkarırdı (DOMAIN §13).
 *
 * Sayfanın bölümleri TEK turda gelir; bölüm başına çağrı yok. Bugün eksik olan bölümler
 * (`family` · `similar` · fiyat · stok) sözleşmede HİÇ YOK — boş dizi gönderseydik istemci
 * "ailesi yok" diye okur ve terfi geldiğinde kimse farkı görmezdi.
 */
catalog.get('/products/:slug', async (c) => {
  const locale = LocaleSchema.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  const product = await new ProductService(db).findBySlug(c.req.param('slug'));
  if (!product || product.status !== 'active') return fail(c, 'product_not_found', 404);

  const [images, category] = await Promise.all([
    new ProductImageService(db).listByProduct(product.id),
    product.categoryId ? new CategoryService(db).getById(product.categoryId) : Promise.resolve(null),
  ]);

  const cover = imageOf(product);
  return ok(
    c,
    CatalogProductDetailSchema.parse({
      ...toProduct(product, locale.data),
      description: textOf(product.description, locale.data),
      gallery: galleryOf(cover, images.map(imageOf)),
      category: category ? toCategory(category, locale.data) : null,
      declaration: declarationOf(product, locale.data),
    }),
  );
});
