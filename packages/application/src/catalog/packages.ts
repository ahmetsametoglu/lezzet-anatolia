import { BundleService, ProductService, ProductVariantService, StockService, type Db } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import {
  resolveLocalizedText,
  type Bundle,
  type BundleItem,
  type PreferredLanguage,
  type Product,
  type ProductAllergen,
  type ProductVariant,
} from '@lezzet/types';
import { decideBundleAgainstWarehouse } from '@lezzet/domain-core';
import { EMPTY_IMAGE, imageOf } from './map';
import { pickFeatured } from './featured';
import type { PlaceWarehouses, StorefrontPackage, StorefrontPackageDetail, StorefrontPackageItem } from './storefront-types';

/**
 * Paket okuması — vitrinin paket kapısı. Kartın bilgileri kalemlerden türetilir, operatörden istenmez: elle tazelenseydi ilk unutulanda ekran yalan söylerdi.
 * Paket kümesi operatörün kurduğu bir seçkidir, tek turda okunur; `db` çağırandan gelir ki mobil uç da aynı okumayı kullansın.
 */

/** Paket + kalemleri; `listSellable`/`getWithItems` ikisi de bu şekli döner. */
type BundleRow = Bundle & { items: BundleItem[] };

/**
 * `limit` verilirse liste ana sayfa bandıdır: önce vitrine işaretliler süzülür, sonra kesilir; verilmezse `/packages`in tam listesi.
 * Süzgeç kart üretiminden önce: iki kart için on paketin fiyatını ve stoğunu çözmek boşa iş olurdu.
 */
export async function listStorefrontPackages(
  db: Db,
  locale: PreferredLanguage,
  limit?: number,
  place: PackagePlace = {},
): Promise<StorefrontPackage[]> {
  // `listSellable` pasif paketi ve kalemi satıştan kalkmış paketi düşürür; stoğa burada bakılmaz, tükenmiş paket gizlenmez.
  const sellable = await new BundleService(db).listSellable();
  const bundles = limit === undefined ? sellable : pickFeatured(sellable, limit);
  if (bundles.length === 0) return [];

  const context = await loadContext(db, bundles, place);
  const rows = bundles.map((bundle) => toCard(bundle, locale, context));

  // Tükenmiş paket listeden düşmez, sona gider: paylaşılan link boşa düşmemeli. Sıralama kararlı, gruplar `sortOrder`da kalır.
  return [...rows.filter((p) => !p.soldOut), ...rows.filter((p) => p.soldOut)];
}

/** Tek paketin detayı; satılabilirlik listeyle aynı kapıdan geçer, yoksa listede görünmeyen paket doğrudan linkle satın alınabilirdi. */
export async function getPackageDetail(
  db: Db,
  slug: string,
  locale: PreferredLanguage,
  place: PackagePlace = {},
): Promise<StorefrontPackageDetail | null> {
  const bundle = (await new BundleService(db).listSellable()).find((b) => b.slug === slug);
  if (!bundle) return null;
  return (await resolveDetails(db, [bundle], locale, place))[0] ?? null;
}

/**
 * Sepetin paket kapısı — kimlikle çözer, satılamayanı eler ki sepet o satırı "kaynağı kayboldu" diye göstersin.
 * Dönüş `CartBundleSource`un yapısal ikizidir; arada ikinci bir dönüştürme yazılmaz.
 */
export async function getPackagesByIds(
  db: Db,
  ids: readonly string[],
  locale: PreferredLanguage,
  place: PackagePlace = {},
): Promise<StorefrontPackageDetail[]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const bundles = (await new BundleService(db).listSellable()).filter((b) => wanted.has(b.id));
  return resolveDetails(db, bundles, locale, place);
}

async function resolveDetails(
  db: Db,
  bundles: BundleRow[],
  locale: PreferredLanguage,
  place: PackagePlace,
): Promise<StorefrontPackageDetail[]> {
  if (bundles.length === 0) return [];
  const context = await loadContext(db, bundles, place);
  return bundles.map((bundle) => toDetail(bundle, locale, context));
}

function toDetail(bundle: BundleRow, locale: PreferredLanguage, context: PackageContext): StorefrontPackageDetail {
  const { byVariant, byProduct } = context;

  const products = bundle.items
    .map((item) => byVariant.get(item.variantId))
    .map((variant) => (variant ? byProduct.get(variant.productId) : undefined))
    .filter((p): p is Product => p !== undefined);

  // Alerjen birleşimi: aynı alerjen bir kez yazılır, sıra ilk görüldüğü kalemden (alfabetik sıra dile göre değişirdi).
  const allergens = [...new Set(products.flatMap((p) => p.allergens))] as ProductAllergen[];

  // Paketin ömrü en kısa ömürlü kalemidir; bilgisi olmayan sayılmaz, hiçbirinde yoksa null — varsayılan uydurmak gıdada yanlış söz olurdu.
  const lives = products.map((p) => p.shelfLifeDays).filter((d): d is number => d !== null);
  const shelfLifeDays = lives.length > 0 ? Math.min(...lives) : null;

  return { ...toCard(bundle, locale, context), allergens, shelfLifeDays };
}

/** Paketin yeri parametredir, burada çerez okunmaz: istek bağlamına bağlı okuma bu kapıyı cron, webhook ve mobil uçta çağrılamaz kılardı. */
type PackagePlace = Partial<PlaceWarehouses>;

/** Kalemlerin çözümü için gereken yan veriler — paket başına sorgu YOK, küme tek turda okunur. */
interface PackageContext {
  byVariant: Map<string, ProductVariant>;
  byProduct: Map<string, Product>;
  /** AĞ GENELİ — yalnız "hiç var mı" sorusunun (`soldOut`) dayanağı. */
  available: Map<string, number>;
  /** Müşterinin deposunda; yer bilinmiyorsa null (harita yok, sıfır DEĞİL). */
  local: Map<string, number> | null;
  /** Kargo deposunda; kargo deposu yoksa null. */
  shipping: Map<string, number> | null;
}

/** `available_stock` satırlarını varyant→miktar haritasına indirger. */
function qtyMap(rows: readonly { variantId: string; availableQty: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.variantId, r.availableQty]));
}

async function loadContext(db: Db, bundles: BundleRow[], place: PackagePlace): Promise<PackageContext> {
  const variantIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.variantId)))];
  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const stocks = new StockService(db);

  // `limit` açıkça verilir, yoksa varsayılan sayfa boyu bazı ürünleri sessizce düşürürdü. Ağ geneli "hiç var mı"yı, depo
  // okumaları "buraya gelir mi"yi yanıtlar; yer belliyken bile ağ geneli okunur, "tükendi" demenin tek dayanağı odur.
  const [products, network, local, shipping] = await Promise.all([
    new ProductService(db).list({ filters: { ids: productIds }, limit: productIds.length }),
    stocks.getNetworkAvailabilityMap(variantIds),
    place.warehouseId ? stocks.listAvailableAcross([place.warehouseId], variantIds) : Promise.resolve(null),
    place.shippingWarehouseId ? stocks.listAvailableAcross([place.shippingWarehouseId], variantIds) : Promise.resolve(null),
  ]);

  return {
    byVariant: new Map(variants.map((v) => [v.id, v])),
    byProduct: new Map(products.rows.map((p) => [p.id, p])),
    available: new Map(variantIds.map((id) => [id, network.get(id)?.availableQty ?? 0])),
    local: local ? qtyMap(local) : null,
    shipping: shipping ? qtyMap(shipping) : null,
  };
}

/** Paketin KART yüzü — liste ve detay aynı künyeyi gösterir, iki yerde hesaplanmaz. */
function toCard(bundle: BundleRow, locale: PreferredLanguage, context: PackageContext): StorefrontPackage {
  const { byVariant, byProduct, available, local, shipping } = context;
  const items = bundle.items.map((item) => ({ item, variant: byVariant.get(item.variantId) }));

  const contents = items.map<StorefrontPackageItem>(({ item, variant }) => {
    const product = variant ? byProduct.get(variant.productId) : undefined;
    return {
      variantId: item.variantId,
      // Ürünü çözülemeyen kalem sessizce düşmez: paket "8 ürün" diyorsa sekizi de görünmeli; `listSellable` bu hâli zaten eler.
      slug: product?.slug ?? '',
      name: product ? resolveLocalizedText(product.name, locale) : '',
      unitLabel: variant ? resolveLocalizedText(variant.label, locale) : '',
      qty: item.qty,
      image: product ? imageOf(product) : EMPTY_IMAGE,
    };
  });

  // Ağırlık: bir kalem bile bilinmiyorsa toplam yok; eksiği 0 saymak paketi olduğundan hafif gösterirdi.
  const weights = items.map(({ item, variant }) => (variant?.netWeightG != null ? variant.netWeightG * item.qty : null));
  const totalWeightG = weights.every((w) => w !== null) ? weights.reduce((sum: number, w) => sum + (w ?? 0), 0) : null;

  // Kargo kısıtı ÜRÜNÜN alanı (`shippable`), varyantın değil.
  const inRouteOnly = items.some(({ variant }) => variant !== undefined && byProduct.get(variant.productId)?.shippable === false);

  // Soğuk zincir ürünün saklama rejimidir; yalnız çözülmüş üründe söylenir ki bilinmeyen kalem soğuk zincir sayılmasın.
  const coldChain = items.some(({ variant }) => {
    const product = variant ? byProduct.get(variant.productId) : undefined;
    return product !== undefined && product.storageType !== 'ambient';
  });

  // KDV: karışık oranlı pakette EN YÜKSEĞİ taşınır (bkz. `StorefrontPackage.vatRate`).
  const vatRate = Math.max(0, ...items.map(({ variant }) => (variant ? (byProduct.get(variant.productId)?.vatRate ?? 0) : 0)));

  // Yol kararı motordan; yer bilinmiyorsa hiç sorulmaz. Koşul `local || shipping`: rota dışında yalnız kargo deposu vardır ve yol yine bilinir.
  const decision =
    local || shipping
      ? decideBundleAgainstWarehouse({
        items: bundle.items.map((item) => ({
          variantId: item.variantId,
          qty: item.qty,
          localAvailable: local?.get(item.variantId) ?? 0,
          shippingAvailable: shipping?.get(item.variantId) ?? 0,
        })),
        // İstenen adet kartta bilinmiyor: kart kaç tane yapılabileceğini söyler, sepet tavanı okur.
        qty: 1,
        shippable: !inRouteOnly,
      })
    : null;

  return {
    id: bundle.id,
    slug: bundle.slug,
    name: resolveLocalizedText(bundle.name, locale),
    description: bundle.description ? resolveLocalizedText(bundle.description, locale) : '',
    image: imageOf(bundle),
    itemCount: bundle.items.length,
    items: contents,
    priceCents: toCents(bundle.totalPrice),
    serves: bundle.serves,
    totalWeightG,
    inRouteOnly,
    coldChain,
    vatRate,
    // Ağ geneli: "tükendi" ancak hiçbir depoda yoksa söylenir; yere bağlı hâli `route` taşır.
    soldOut: items.some(({ item }) => (available.get(item.variantId) ?? 0) < item.qty),
    route: decision?.route ?? null,
    maxQty: decision?.maxBundles ?? null,
  };
}
