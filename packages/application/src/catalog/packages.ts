import { BundleService, ProductService, ProductVariantService, StockService, type Db } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import {
  CROP_CENTER,
  resolveLocalizedText,
  type Bundle,
  type BundleItem,
  type PreferredLanguage,
  type Product,
  type ProductAllergen,
  type ProductVariant,
} from '@lezzet/types';
import { decideBundleAgainstWarehouse } from '@lezzet/domain-core';
import { imageOf } from './map';
import { pickFeatured } from './featured';
import type { PlaceWarehouses, StorefrontPackage, StorefrontPackageDetail, StorefrontPackageItem } from './storefront-types';

/**
 * Paket okuması (05.5'in müşteri tarafı) — vitrinin paket KAPISI.
 *
 * **Kartın bilgileri TÜRETİLİR, girilmez** (tasarım sözleşmesi): kalem sayısı · stok · kargo kısıtı ·
 * toplam net ağırlık · toplu alerjen · tüketim süresi. Operatörden bunları ayrıca istemek, paketi her
 * düzenlediğinde altı alanı elle tazelemesini istemek olurdu — ilk unutulanda ekran yalan söylerdi.
 *
 * Türetmenin kuralları, hepsi tasarımdan:
 *   stok  → BİR kalem bile yetmiyorsa paket tükendi. Paket bütün olarak satılır; "yarısı var" diye
 *           bir hâli yok.
 *   kargo → kargolanamayan (soğuk zincir) BİR kalem varsa paketin tamamı yalnız rota içi.
 *   ağırlık → bir kalemin net ağırlığı bilinmiyorsa toplam UYDURULMAZ, satır hiç basılmaz.
 *   süre  → EN KISA ömürlü kalem paketin tamamını bağlar; ortalama alınmaz.
 *   alerjen → kalemlerin BİRLEŞİMİ; tam beyan yine ürün sayfasında kalır, burası özettir.
 *
 * **Tek turda okur.** Paket sayısı operatörün elle kurduğu bir seçkidir (CLAUDE.md §1: doğal tavanı
 * olan küme), veriyle büyümez — keyset sayfalama gerekmez. Tasarımın "12 + daha fazla" düzeni bir
 * GÖSTERİM kararıdır ve ekranda çözülür; sorgu bölünmez.
 *
 * ── TERFİ (09.08) · WEB'DEN FARKLARI ─────────────────────────────────────────
 * Kaynağı `apps/web/lib/storefront/packages.ts`tı; web kopyası KÖPRÜ olarak duruyor ve `apps/web`
 * çağrı yerleri (paket sayfası, paket detayı, ana sayfa şeridi, sepet, checkout, tekrar sipariş)
 * hiç değişmedi. **Kural tarafında hiçbir şey değişmedi** — değişen üç şey taşımanın kendisi:
 *   · `db` ÇAĞIRANDAN gelir (`serviceDb()` pakette çağrılmaz) — paketin ortak deseni.
 *   · `server-only` düştü: bu dosyanın `apps/mobile-api` (Hono) tarafından okunabilmesi terfinin
 *     TEK sebebiydi.
 *   · Dil birimi `Locale` (`@lezzet/i18n`) yerine `PreferredLanguage` (`@lezzet/types`). Aynı üçlü
 *     birlik (`tr|fr|de`); paket i18n'e bağlı değil ve bağlanmamalı — dil birimi bir domain
 *     sözlüğüdür, web yönlendirmesinin ayrıntısı değil.
 *
 * **TERFİ TETİĞİ ÖLÇÜLMÜŞ BİR ARIZAYDI:** mobil sepette paket satırı sunucuya yazılıyor ama
 * `getCartView`in paket kapısı (`CartBundlePort`) mobilde geçilemiyordu — kapıyı besleyecek okuma
 * burasıydı ve `apps/web`te yaşıyordu. Sonuç: satır `name: ""`, `unitPriceCents: null`,
 * `blocked: true` dönüyor ve paketin tutarı sepet toplamına HİÇ girmiyordu. Kopyalamak yasaktı
 * (CLAUDE §1) — stok zinciri, yol kararı, KDV ve kargo kısıtı tek yerde durmak zorunda: yoksa aynı
 * paket vitrinde "var", sepette "tükendi" diyebilirdi.
 */

/** Paket + kalemleri; `listSellable`/`getWithItems` ikisi de bu şekli döner. */
type BundleRow = Bundle & { items: BundleItem[] };

/**
 * `limit` verilirse liste ANA SAYFA BANDIDIR: önce vitrine işaretliler süzülür, sonra kesilir
 * (08.26 · `pickFeatured` künyesi). Verilmezse `/packages` sayfasının tam listesi döner.
 *
 * Süzgeç kart üretiminden ÖNCE: iki kart çizecekken on paketin fiyatını ve stoğunu çözmek boşa
 * iştir ve maliyeti paket sayısıyla büyürdü.
 */
export async function listStorefrontPackages(
  db: Db,
  locale: PreferredLanguage,
  limit?: number,
  place: PackagePlace = {},
): Promise<StorefrontPackage[]> {
  // `listSellable` pasif paketi ve kalemi satıştan kalkmış paketi zaten düşürür; STOK burada
  // bakılmaz çünkü tükenmiş paket GİZLENMEZ — sona alınır (tasarım: link boşa düşmesin).
  const sellable = await new BundleService(db).listSellable();
  const bundles = limit === undefined ? sellable : pickFeatured(sellable, limit);
  if (bundles.length === 0) return [];

  const context = await loadContext(db, bundles, place);
  const rows = bundles.map((bundle) => toCard(bundle, locale, context));

  // Tükenmiş paket listeden DÜŞMEZ, sonuna gider (tasarım kararı: paket bir pazarlama aracı —
  // sosyal medyada dolaşan link boşa düşmemeli, "yakında yeniden" beklentisi sürmeli).
  // Sıralama kararlı: aynı gruptakiler yönetimin verdiği `sortOrder`'da kalır.
  return [...rows.filter((p) => !p.soldOut), ...rows.filter((p) => p.soldOut)];
}

/**
 * Tek paketin detayı — sosyal medyadan gelen linkin düştüğü sayfa (birincil senaryo).
 *
 * **Satılabilirlik listeyle AYNI kapıdan geçer** (`listSellable`): pasif paket ya da kalemi satıştan
 * kalkmış paket burada da yoktur → 404. Ayrı bir "slug ile getir" yazılsaydı, listede görünmeyen bir
 * paket doğrudan linkle satın alınabilirdi.
 */
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
 * Sepetin paket kapısı — kimlikle çözer, satılamayanı ELER.
 *
 * Sepet aylarca bekleyebilir: içindeki paket bu arada pasife alınmış ya da bir kalemi satıştan
 * kalkmış olabilir. `listSellable` süzgecinden geçmeyen paket burada da dönmez; sepet o satırı
 * "kaynağı kayboldu" olarak gösterir (`cart/read.ts`) — sessizce düşürmek, müşterinin sepetinden bir
 * şeyin kaybolduğunu görmemesi demekti.
 *
 * Dönüş şekli `CartBundleSource`un yapısal ikizidir, yani çağıran `db`yi bağlayıp bu fonksiyonu
 * doğrudan `CartBundlePort` olarak geçebilir — arada ikinci bir dönüştürme YAZILMAZ (yazılsaydı
 * sepetin gördüğü paket ile vitrinin gösterdiği paket iki ayrı eşlemeden geçerdi).
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

  const items = bundle.items.map<StorefrontPackageItem>((item) => {
    const variant = byVariant.get(item.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    return {
      variantId: item.variantId,
      // Ürünü çözülemeyen kalem sessizce DÜŞMEZ: paket "8 ürün" diyorsa sekizi de görünmeli.
      // Bağsız ve adsız kalır — `listSellable` bu durumu zaten eliyor, burası son çare.
      slug: product?.slug ?? '',
      name: product ? resolveLocalizedText(product.name, locale) : '',
      unitLabel: variant ? resolveLocalizedText(variant.label, locale) : '',
      qty: item.qty,
      image: product ? imageOf(product) : { url: null, crop: CROP_CENTER },
    };
  });

  const products = bundle.items
    .map((item) => byVariant.get(item.variantId))
    .map((variant) => (variant ? byProduct.get(variant.productId) : undefined))
    .filter((p): p is Product => p !== undefined);

  // Alerjen BİRLEŞİMİ — aynı alerjen iki üründe geçse de bir kez yazılır. Sıra ilk görüldüğü
  // kalemden gelir; alfabetik sıralamak dile göre değişen bir liste doğururdu.
  const allergens = [...new Set(products.flatMap((p) => p.allergens))] as ProductAllergen[];

  // Paketin ömrü EN KISA ömürlü kalemindir. Bilgisi olmayan kalem sayılmaz; hiçbirinde yoksa null
  // (satır basılmaz) — "3 gün" gibi bir varsayılan uydurmak gıdada yanlış bir söz olurdu.
  const lives = products.map((p) => p.shelfLifeDays).filter((d): d is number => d !== null);
  const shelfLifeDays = lives.length > 0 ? Math.min(...lives) : null;

  return { ...toCard(bundle, locale, context), items, allergens, shelfLifeDays };
}

/**
 * **Paketin yeri** (19.22) — yer eksenleri PARAMETREDİR, burada çerez okunmaz.
 *
 * Gerekçesi ölçülmüş bir hatadır (`cart/setting-scope.ts` künyesi, 08.08): istek bağlamına bağlı bir
 * okumayı orkestrasyonun içine koymak, o orkestrasyonu istek DIŞINDA çağrılamaz hâle getirir —
 * cron, webhook ve mobil uç dâhil. Yeri çözen taraf isteğin sahibi olan sayfadır.
 *
 * Verilmezse (ya da iki eksen de `null`) davranış BUGÜNKÜYLE AYNI kalır: ağ-geneli okuma, yol
 * bilinmiyor. Ziyaretçinin gördüğü ekran değişmez.
 */
type PackagePlace = Partial<PlaceWarehouses>;

/** Kalemlerin çözümü için gereken yan veriler — paket başına sorgu YOK, küme tek turda okunur. */
interface PackageContext {
  byVariant: Map<string, ProductVariant>;
  byProduct: Map<string, Product>;
  /** AĞ GENELİ — yalnız "hiç var mı" sorusunun (C3 · `soldOut`) dayanağı. */
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

  // Küme paketlerin kalemleriyle sınırlı olduğu için tam satır okumak burada ucuz; `limit` açıkça
  // verilir, yoksa `getPage` varsayılan sayfa boyunda keser ve bazı ürünler sessizce düşerdi.
  //
  // ── ÜÇ OKUMA, ÜÇ AYRI SORU (19.22) ─────────────────────────────────────────
  // Ağ geneli "hiç var mı"yı (C3 rozeti) yanıtlar; depo okumaları "buraya gelir mi"yi. Üçü tek
  // turda gider — yer belliyken bile ağ-geneli okumak şart, çünkü "tükendi" demenin tek meşru
  // dayanağı odur (`getNetworkAvailabilityMap` künyesi: satış kararı onu okuyamaz, ama C3 okur).
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

  // Ağırlık: kalemlerden BİRİ bile bilinmiyorsa toplam yok. Eksik veriyi 0 saymak, 4,2 kg'lık bir
  // paketi 3,1 kg gösterip müşteriyi yanıltmak olurdu.
  const weights = items.map(({ item, variant }) => (variant?.netWeightG != null ? variant.netWeightG * item.qty : null));
  const totalWeightG = weights.every((w) => w !== null) ? weights.reduce((sum: number, w) => sum + (w ?? 0), 0) : null;

  // Kargo kısıtı ÜRÜNÜN alanı (`shippable`), varyantın değil — soğuk zincir ürünün özelliğidir.
  const inRouteOnly = items.some(({ variant }) => variant !== undefined && byProduct.get(variant.productId)?.shippable === false);

  // KDV: karışık oranlı pakette EN YÜKSEĞİ taşınır (bkz. `StorefrontPackageDetail.vatRate`).
  const vatRate = Math.max(0, ...items.map(({ variant }) => (variant ? (byProduct.get(variant.productId)?.vatRate ?? 0) : 0)));

  /**
   * **Yol kararı MOTORDAN** (19.22) — burada hesaplanmaz, `domain-core`'a sorulur (`STACK §4`).
   *
   * Yer bilinmiyorsa hiç sorulmaz: `null` "yol bilinmiyor" demektir ve ziyaretçiye bilmediğimiz
   * bir şeyi söylemeyiz. Kargo deposu yoksa havuz 0 verilir — motorun sözleşmesi bunu bekliyor ve
   * `shipping` yolunu açmıyor.
   *
   * **KOŞUL `local || shipping`, yalnız `local` DEĞİL (09.08'de ölçülerek düzeltildi).** Önce
   * `local ? … : null` yazıyordu ve bu, BÖLGE DIŞINDAKİ müşteriyi tümüyle dışarıda bırakıyordu:
   * orada rota deposu yoktur (`warehouseId` null), yalnız kargo deposu vardır — yani yol
   * BİLİNİYOR ("kargoyla gelir") ama karar hiç hesaplanmadığı için `route` null kalıyor ve kart
   * yer bilinmiyormuş gibi davranıyordu. Ölçüldü: 75011 ile paketler sayfasında "Kargoyla
   * gönderilir" işareti hiç çıkmıyordu. İki depodan BİRİ bile biliniyorsa yol sorulabilir.
   */
  const decision =
    local || shipping
      ? decideBundleAgainstWarehouse({
        items: bundle.items.map((item) => ({
          variantId: item.variantId,
          qty: item.qty,
          localAvailable: local?.get(item.variantId) ?? 0,
          shippingAvailable: shipping?.get(item.variantId) ?? 0,
        })),
        // İstenen adet kartta bilinmiyor: kart "kaç tane yapılabilir"i söyler, "bunu karşılar mı"yı
        // değil. Sepet kendi adediyle aynı motoru tekrar çağırmaz — tavanı okur.
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
    priceCents: toCents(bundle.totalPrice),
    serves: bundle.serves,
    totalWeightG,
    inRouteOnly,
    vatRate,
    // **Ağ geneli ve öyle kalıyor** (C3): "tükendi" ancak hiçbir depoda yoksa söylenir. Yere bağlı
    // hâli `route` taşıyor — ikisini tek bayrakta toplamak öbür depoda duran malı tükenmiş ilan
    // etmek olurdu (denetim ölçümü 08.08: bugünkü ret mesajının tam olarak yaptığı şey).
    soldOut: items.some(({ item }) => (available.get(item.variantId) ?? 0) < item.qty),
    route: decision?.route ?? null,
    maxQty: decision?.maxBundles ?? null,
  };
}
