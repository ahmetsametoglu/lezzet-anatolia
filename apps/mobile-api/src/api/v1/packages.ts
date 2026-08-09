import { Hono } from 'hono';
import type { z } from 'zod';
import { BundleService, ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { imageOf } from '@lezzet/application';
import { toCents } from '@lezzet/helper';
import { CROP_CENTER, PackageDetailSchema, PreferredLanguageEnum, resolveLocalizedText } from '@lezzet/types';
import type { AppEnv } from '../../context';
import { fail, ok } from '../../lib/respond';
import { resolvedOrNull } from '../../lib/home';

/**
 * Paket detay ucu (21.14) — vitrinin "Hazır paketler" kartının açtığı sayfa. Katalog kümesindendir:
 * **oturumsuz gezilir** (`router.ts`te `bearerAuth`tan ÖNCE bağlı — 02-mimari §4 "oturumsuz
 * kullanım = müşteri gezinmesi") ve kimlik OKUNMAZ bile: paket YALNIZ B2C'dedir ve tek fiyat taşır
 * (`bundle.totalPrice`, veri modelinin kendi hükmü) — kişiselleşecek bir fiyat yok, `readViewer`
 * çağırmak boşa bir tur olurdu.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * Yaptığı şey taşımadır: slug'ı çözer, kalemleri ürün adına/görseline bağlar (MEVCUT servislerin
 * toplu okumalarıyla — kalem başına sorgu yok), sözleşme şekline indirger ve zarflar. Tek türetme
 * kargo kısıtıdır ve o da web'in kararının okunuşu (aşağıda).
 *
 * ── SATILABİLİRLİK/STOK ZİNCİRİ BİLEREK YOK ─────────────────────────────────
 * Web'in paket kapısı (`apps/web/lib/storefront/packages.ts`) pasif-kalemli paketi `listSellable`
 * ile eler ve tükenmeyi stok zincirinden türetir; o karar HENÜZ `@lezzet/application`a terfi
 * etmedi ve kopyası yasak (CLAUDE §1). Bu uç yalnız paketin KENDİ niyetine bakar: pasif paket ve
 * kalemsiz paket 404 (aday/pasif ürünün 404 kararıyla aynı sınıf — DOMAIN §13), gerisi döner.
 * Sözleşme de `soldOut` taşımıyor (`package-api.schema.ts` künyesi). Terfi gününde bu uç
 * `listSellable`ın application karşılığına döner. BEKLEYEN(21.14).
 */
export const packages = new Hono<AppEnv>();

/**
 * `locale` zorunlu ve varsayılansız (`catalog.ts` `LocaleSchema` künyesi: sessizce Türkçeye düşmek
 * gizli arıza). Aday/eksik slug 404 — katalogda görünmeyen paket linkle de açılmaz.
 */
packages.get('/packages/:slug', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const db = serviceDb();
  // Paket kataloğu DOĞAL TAVANLI küçük bir kümedir (operatör elle kurar, CLAUDE §1 "tek turda"
  // dalı): kalemler gömülü TEK sorguda gelir, slug bellekte çözülür — vitrin okumasının
  // (`readHomePackages`) aynı deseni; slug için ikinci bir sorgu yolu açılmaz.
  const bundle = (await new BundleService(db).listWithItems()).find((b) => b.slug === c.req.param('slug'));
  // Kalemsiz paket de 404: boş kutu satılmaz — vitrin kartının `positive` kilidiyle aynı kural.
  if (!bundle || !bundle.isActive || bundle.items.length === 0) return fail(c, 'package_not_found', 404);

  // Kalem → ürün köprüsü İKİ toplu okumayla (kalem varyant taşır, ad/görsel/slug üründe): önce
  // varyantlar, sonra ürünleri — kalem başına sorgu yok (web `loadContext`in aynı zinciri).
  const variants = await new ProductVariantService(db).listByIds(bundle.items.map((i) => i.variantId));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const byProduct = new Map(products.map((p) => [p.id, p]));

  // Satır sırası paketin kendi sırasıdır (kalemler `sortOrder`la geldi); ürünü çözülemeyen kalem
  // sessizce DÜŞMEZ — paket "4 ürün" diyorsa dördü de görünür, bağsız ve adsız kalır (web
  // `toDetail`in aynı son çaresi; öksüz kalem zaten `restrict` FK'ler yüzünden kurulamaz).
  const items = bundle.items.map((item) => {
    const variant = byVariant.get(item.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    return {
      slug: product?.slug ?? '',
      name: product ? resolveLocalizedText(product.name, locale.data) : '',
      unitLabel: variant ? resolveLocalizedText(variant.label, locale.data) : '',
      qty: item.qty,
      image: product ? imageOf(product) : { url: null, crop: CROP_CENTER },
    };
  });

  // Kargo kısıtı ÜRÜNÜN alanıdır ve BİR kalem bile kargolanamıyorsa (soğuk zincir) paketin tamamı
  // bölge-içine kilitlenir — web `toCard`ın `inRouteOnly` türetmesinin kendisi, yön çevrilmiş.
  const inRouteOnly = bundle.items.some((item) => {
    const variant = byVariant.get(item.variantId);
    return variant !== undefined && byProduct.get(variant.productId)?.shippable === false;
  });

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ──────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: şekil sözleşmeden saparsa burası DERLENMEZ; `parse` da
  // süzgeçtir — fazla alan (kalem fiyatı gibi) zarfa sızamaz.
  const body: z.input<typeof PackageDetailSchema> = {
    slug: bundle.slug,
    name: resolveLocalizedText(bundle.name, locale.data),
    description: resolvedOrNull(bundle.description, locale.data),
    priceCents: toCents(bundle.totalPrice),
    shippable: !inRouteOnly,
    image: imageOf(bundle),
    items,
  };
  return ok(c, PackageDetailSchema.parse(body));
});
