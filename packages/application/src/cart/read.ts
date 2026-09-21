import { ProductService, ProductVariantService, SettingsService, type Db } from '@lezzet/database';
import { decideCartAgainstWarehouse, meetsMinBasket, type CartLineInput, type CartLineRoute, type DiscountableLine } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type { PreferredLanguage, ProductVariant, ProductWithRelations } from '@lezzet/types';
import { EMPTY_IMAGE, EMPTY_PRODUCT_CONTEXT, imageOf, sellingOf, toVariant } from '../catalog/map';
import type { ProductContext } from '../catalog/map';
import { loadProductContext } from '../catalog/product-context';
import { pricingViewerOf } from '../catalog/pricing-viewer';
import type { PlaceWarehouses, StorefrontImage } from '../catalog/storefront-types';
import { minBasketFor } from './min-basket';
import { settingScopeOf } from './setting-scope';
import {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from './settings-keys';
import { resolveCartDiscount } from './discount';
import { EMPTY_CART, cartGroupOf, cartKey, discountAmountOf, undeliverableTotalOf, type CartEntry, type CartLine, type CartView } from './cart-types';

/**
 * Sepetin paket satırının istediği alanlar; paket çözümü kapıdan gelir. Şekil dar, çünkü sepet alerjen, ağırlık ve kalem görselini kullanmaz.
 */
export interface CartBundleSource {
  id: string;
  slug: string;
  name: string;
  image: StorefrontImage;
  /** Paketin KENDİ fiyatı — kalemlerin toplamı değil (tek fiyat kuralı, DOMAIN §13). */
  priceCents: number;
  /** Ağ geneli tükendi (C3): "tükendi" ancak hiçbir depoda yoksa denir. */
  soldOut: boolean;
  /** Yol paketin BÜTÜNÜ için — kararı `decideBundleAgainstWarehouse` verir, sepet hesaplamaz. */
  route: CartLineRoute | null;
  /** Bu yerden şu an kaç PAKET yapılabilir; `null` = yer bilinmiyor. */
  maxQty: number | null;
  /** Kalemlerin EN YÜKSEK KDV oranı (%) — kargo KDV'sinin oransal bölünmesi için. */
  vatRate: number;
  /** Soğuk zincir kalemi varsa paketin tamamı rota içi kalır. */
  inRouteOnly: boolean;
  items: readonly { name: string; qty: number }[];
}

/**
 * Paket çözümünün kapısı; verilmezse paket satırı kimliğiyle ve engelli durur ki sepetten sessizce düşmesin.
 */
export type CartBundlePort = (
  bundleIds: readonly string[],
  locale: PreferredLanguage,
  place: PlaceWarehouses,
) => Promise<readonly CartBundleSource[]>;

/**
 * Sepet okuması: niyeti bugünkü görünüme çevirir; ad, fiyat, stok ve tavan yeniden çözülür (DOMAIN §5), sorgu sayısı sabittir.
 * Teklif kalemi eklendiği partiye bağlıdır; parti tükendiyse indirim başka partiye taşınmaz, satır teklifsiz görünür.
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`)
 */
export async function getCartView(
  db: Db,
  locale: PreferredLanguage,
  entries: readonly CartEntry[],
  /**
   * İndirim bağlamı. Sepetin parası zaten burada hesaplandığı için indirim de burada çözülür:
   * ayrı bir okumaya alınsaydı ürün/kategori/koleksiyon ikinci kez çekilir ve iki okuma arasında
   * fiyat değiştiğinde ekran kendi toplamıyla çelişirdi.
   */
  opts: {
    customerId?: string | null;
    couponCode?: string | null;
    /**
     * Sunucu sepetinde saklanan fiyatlar (`cartKey` → cent); artış varsa satır `priceChange` taşır. Ziyaretçide yok.
     */
    previousPrices?: ReadonlyMap<string, number>;
    /**
     * Pazarlıklı fiyatlar (`variantId` → cent), yalnız personel yolundan; satış fiyatı bu okumada tek sayıya iner. Satışa kapalı
     * ürünü diriltmez ve paket satırına uygulanmaz, çünkü paket fiyatı parçalarının paylarının toplamıdır.
     */
    priceOverrides?: ReadonlyMap<string, number>;
    /**
     * Müşterinin yerinden çözülen rota deposu (DOMAIN §17); `null` yer bilinmiyor, sepet depo-üstü okunur ve yalnız hiçbir
     * depoda yoksa tükendi denir. Sonraya kaydedilenler ve tekrar sipariş bilerek yere göre daraltılmaz.
     */
    warehouseId?: string | null;
    /**
     * Ülkenin kargo deposu; `decideCartAgainstWarehouse` "bu kalem kargoyla gelebilir" kararı için okur. `null` yer bilinmiyor
     * ya da o ülkeye kargo yok.
     */
    shippingWarehouseId?: string | null;
    /**
     * Ayar kapsamının yer eksenleri; parametre olarak gelir, çünkü çerez okuması okumayı istek dışında çağrılamaz yapardı.
     */
    country?: string | null;
    zoneId?: string | null;
    /**
     * Paket çözümünün kapısı (`CartBundlePort`). Verilmezse paket satırı ENGELLİ durur — sepette
     * paket taşımayan yüzey (bugün mobil) bu kapıyı hiç geçmez.
     */
    bundles?: CartBundlePort;
  } = {},
): Promise<CartView> {
  const settings = new SettingsService(db);
  // Eşikler parametrik ve checkout ile aynı anahtar ve kapsamla okunur (`settingScopeOf`), yoksa sepetin gösterdiği eşik kasada
  // tutmazdı. Görüntüleyen oturumdan değil sepetin kimliğinden bir kez çözülür, misafir OTP yolunda oturum yoktur.
  const viewer = await pricingViewerOf(db, opts.customerId ?? null);
  const scope = settingScopeOf(viewer, {
    country: opts.country,
    zoneId: opts.zoneId,
    warehouseId: opts.warehouseId,
  });
  /**
   * Asgari sepet iki değer okunur, çünkü hangisinin geçerli olduğunu sepetin içeriği söyler (`shippingOnly`).
   */
  const [minBasketRouteCents, minBasketShippingCents, freeShippingCents, shippingTariffCents] = await Promise.all([
    minBasketFor(settings, 'route', scope),
    minBasketFor(settings, 'shipping', scope),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
    // Tarife de aynı sebeple ortak anahtardan: kargo grubunun blokunda yazdığımız sayı, checkout'un
    // keseceği sayının ta kendisi olmalı.
    settings.getNumber(SHIPPING_FEE_KEY, SHIPPING_FEE_DEFAULT, scope),
  ]);
  // Boş sepette yol da yok: kapıya teslim tabanı yazılır ki ekran "en az şu kadar" diyebilsin.
  if (entries.length === 0) return { ...EMPTY_CART, freeShippingCents, shippingTariffCents, ...meets(0, minBasketRouteCents) };
  // Motorun kalem sözleşmesi: satır çözülürken doldurulur (kategori/koleksiyon oradan gelir).
  const discountable: DiscountableLine[] = [];

  // İki tür satır, iki okuma — ikisi de TOPLU. Paketler kendi kapısından gelir (`lib/storefront`),
  // türetme (stok, kargo, ağırlık) orada tek yerde durur; sepette ikinci kez yazılsaydı vitrindeki
  // kartla sepetteki satır aynı paket için farklı "tükendi" diyebilirdi.
  const bundleIds = [...new Set(entries.map((e) => e.bundleId).filter((id): id is string => id !== undefined))];
  const variantIds = [...new Set(entries.map((e) => e.variantId).filter((id): id is string => id !== undefined))];

  const place: PlaceWarehouses = {
    warehouseId: opts.warehouseId ?? null,
    shippingWarehouseId: opts.shippingWarehouseId ?? null,
  };
  const [variants, packageRows] = await Promise.all([
    new ProductVariantService(db).listByIds(variantIds),
    // Yer paket kapısına da geçer ki kart, sepet ve checkout aynı yolu görsün; paket yoksa okuma yapılmaz.
    opts.bundles && bundleIds.length > 0 ? opts.bundles(bundleIds, locale, place) : Promise.resolve([]),
  ]);
  const packages = new Map(packageRows.map((p) => [p.id, p]));
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const productIds = [...new Set(variants.map((v) => v.productId))];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds }, limit: productIds.length });
  const byProduct = new Map(page.rows.map((p) => [p.id, p]));
  const context = await loadProductContext(db, page.rows, place, viewer);

  const lines: CartLine[] = [];
  for (const entry of entries) {
    // PAKET satırı ayrı bir kapıdan çözülür: fiyatı kendi alanından gelir (kalem toplamı değil),
    // stok kararı kalemlerinin en zayıfına bağlıdır ve teklif/parti kavramı hiç yoktur.
    if (entry.kind === 'bundle') {
      const line = bundleLine(entry.bundleId, entry.qty, packages.get(entry.bundleId));
      lines.push({ ...line, ...priceChangeOf(entry, line.unitPriceCents, opts.previousPrices) });
      // Pakete indirim BİNMEZ (DOMAIN §13) — motor bunu `bundleId` dolu olduğu için kendisi eler;
      // satır yine de gönderilir ki pay dizisi kalem sırasıyla hizalı kalsın.
      discountable.push({ variantId: '', qty: entry.qty, unitPriceCents: line.unitPriceCents ?? 0, bundleId: entry.bundleId });
      continue;
    }
    const variant = byVariant.get(entry.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    // Varyant ya da ürün kaybolduysa (silinmiş/pasifleşmiş) satır SESSİZCE DÜŞMEZ: müşteri neyi
    // kaybettiğini görmeli. Elimizdeki tek şey kimlik, o yüzden adsız ama engelleyen satır kurulur.
    if (!variant || !product) {
      lines.push(orphanLine(entry));
      // Kaynağı kayboldu → fiyatı da yok; matraha 0 ile girer, payı 0 olur.
      discountable.push({ variantId: entry.variantId, qty: entry.qty, unitPriceCents: 0 });
      continue;
    }

    const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
    const view = toVariant(variant, locale, ctx, product.shippable);
    // Sepetteki çıpa bugünkü teklifle uyuşmuyorsa teklif bu satırda GEÇERSİZDİR.
    const offerHolds = entry.stockId !== null && view.stockId === entry.stockId;
    // Pazarlık: personel fiyat yazdıysa satış fiyatı odur; burada yazılır ki toplam, indirim matrahı, KDV ve sipariş tek sayıdan türesin.
    const listPriceCents = view.priceCents;
    const negotiatedCents = opts.priceOverrides?.get(entry.variantId);
    const unitPriceCents = negotiatedCents ?? listPriceCents;
    // Pazarlık müşteriye özel fiyatın yerine geçer; o kalem eskisi gibi indirime açıktır.
    const specialPrice = negotiatedCents == null && sellingOf(variant, ctx).specialPrice;

    lines.push({
      ...entry,
      slug: product.slug,
      name: resolveLocalizedText(product.name, locale),
      image: imageOf(product),
      unitLabel: view.label,
      unitPriceCents,
      // Yalnız gerçekten pazarlık edildiyse dolu — eşit sayı yazmak "indirim verildi" der.
      listUnitPriceCents: negotiatedCents != null && negotiatedCents !== listPriceCents ? listPriceCents : undefined,
      specialPrice: specialPrice || undefined,
      wasCents: offerHolds ? view.wasCents : undefined,
      limitCap: offerHolds && view.limitLabel ? Number(view.limitLabel) : null,
      lineTotalCents: unitPriceCents === null ? null : unitPriceCents * entry.qty,
      // ÖLÇÜT LİSTE FİYATI, pazarlıklı olan DEĞİL: kanal fiyatı kalkmış (satışa kapalı) bir ürünü
      // elle fiyat yazarak diriltmek, kapanmış bir ürünü sessizce yeniden satmak olurdu.
      blocked: listPriceCents === null || view.soldOut,
      // Yol kararı satırlar kurulduktan SONRA toplu veriliyor (motor sepetin tamamını görmeli).
      route: null,
      // Grup yolla birlikte tazelenir; başlangıç değeri yolun `null` hâlinin karşılığı (`cartGroupOf`).
      group: 'local',
      availableHere: null,
      contents: [],
      // Kapsam üyeliği satırla birlikte taşınır (künye: `CartLineView.categoryId`) — `discountable`
      // zaten aynı iki değeri okuyor, ikinci bir sorgu yok.
      categoryId: product.categoryId,
      // Ürün kimliği ÖLÇÜM için taşınıyor (künyesi `CartLineView.productId`) — `categoryId` ile
      // aynı yerden, aynı okumadan; ikinci bir sorgu doğurmuyor.
      productId: product.id,
      collectionIds: product.collections?.map((row) => row.collectionId) ?? [],
      shippable: product.shippable,
      vatRate: product.vatRate,
      ...priceChangeOf(entry, unitPriceCents, opts.previousPrices),
    });

    discountable.push({
      variantId: entry.variantId,
      qty: entry.qty,
      unitPriceCents: unitPriceCents ?? 0,
      categoryId: product.categoryId,
      collectionIds: product.collections?.map((row) => row.collectionId) ?? [],
      // Teklif satırı kendi özel fiyatındadır: indirim matrahına GİRMEZ (DOMAIN §5).
      offerStockId: offerHolds ? entry.stockId : null,
      specialPrice,
    });
  }

  // Yol kararı motordan (`decideCartAgainstWarehouse`); yer bilinmiyorsa `route` null kalır, "rota deposu yok" ile "yer
  // bilinmiyor" ayrımını `place` taşır.
  const routeByIndex = decideRoutes(lines, context, byVariant, byProduct, place);
  for (const [index, decision] of routeByIndex.entries()) {
    const line = lines[index];
    if (!line) continue;
    line.route = decision.route;
    // Grup yolla aynı anda ve aynı kaynaktan doldurulur (`cartGroupOf`).
    line.group = cartGroupOf(line);
    line.availableHere = decision.availableHere;
  }

  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  /**
   * Bu adrese gelemeyen kalemlerin toplamı asgari sepete sayılmaz; kalem sepetten silinmez, yalnız eşiğin matrahından düşer.
   */
  const undeliverableSubtotalCents = undeliverableTotalOf(lines);
  // Kargo grubunun kendi toplamı — ücretsiz kargo eşiği BUNA bakar (K37).
  const shippingSubtotalCents = lines.reduce((sum, l) => (l.route === 'shipping' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
  const hasLocal = lines.some((l) => l.route === 'local');
  const hasShipping = lines.some((l) => l.route === 'shipping');
  const {
    discount,
    reachable: reachableDiscount,
    rules: discountRules,
    context: discountContext,
  } = await resolveCartDiscount(db, {
    lines: discountable,
    customerId: opts.customerId,
    couponCode: opts.couponCode,
  });

  return {
    lines,
    subtotalCents,
    discount,
    /* Elinin altındaki indirim — inen indirimden AYRI alan: ikisi aynı anda var olabilir
       (`cart-types` künyesi). Toplama girmez, yalnız söylenir. */
    reachableDiscount,
    // Sepetin ödenecek hâli — kargo HARİÇ (o adreste belli olur).
    totalCents: Math.max(0, subtotalCents - discountAmountOf(discount)),
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    /* Motorun girdisi görünümle taşınır ki istemci adet değişince indirimi aynı motorla tazelesin. */
    discountRules,
    discountContext,
    hasBlocked: lines.some((l) => l.blocked),
    freeShippingCents,
    shippingSubtotalCents,
    // Eşiğe kalan ve ücret KARGO grubundan çözülür (`shippingGroupFee`) — sepetin tamamından
    // çözülseydi 80 €'luk bir rota siparişi 5 €'luk kargo kalemini bedava taşıtırdı: kendi
    // aracımızla giden malın tutarı, bir kargo firmasına ödediğimiz ücreti karşılamaz. Tarife ham
    // taşınır, karar motorun.
    shippingTariffCents,
    // Tamamı kargodaysa salt-kargo siparişi kendiliğinden doğar; müşteriye "iki sipariş
    // vereceksiniz" denmez, verilecek tek sipariş vardır.
    shippingOnly: hasShipping && !hasLocal,
    undeliverableSubtotalCents,
    /**
     * Tamamı kargo grubundaysa doğacak tek sipariş kargo siparişidir ve lojistik tabanı yoktur; karışık sepette kapıya
     * teslim tabanı yazılır.
     */
    ...meets(subtotalCents - undeliverableSubtotalCents, hasShipping && !hasLocal ? minBasketShippingCents : minBasketRouteCents),
  };
}

/**
 * Satırların yol kararı `decideCartAgainstWarehouse`tan gelir ve o yolun havuzundaki miktar da döner; paket satırı buradan
 * geçmez. Çıkış koşulu "iki depo da yok"tur, yoksa rota dışında kargo deposu doluyken her kalem kapıya teslim görünürdü.
 */
function decideRoutes(
  lines: readonly CartLine[],
  context: Map<string, ProductContext>,
  byVariant: Map<string, ProductVariant>,
  byProduct: Map<string, ProductWithRelations>,
  place: PlaceWarehouses,
): Map<number, { route: CartLineRoute; availableHere: number }> {
  const result = new Map<number, { route: CartLineRoute; availableHere: number }>();
  if (!place.warehouseId && !place.shippingWarehouseId) return result;

  const inputs: CartLineInput[] = [];
  const indexOfInput: number[] = [];
  lines.forEach((line, index) => {
    if (line.bundleId || !line.variantId) return;
    const variant = byVariant.get(line.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    if (!variant || !product) return;
    const ctx = context.get(product.id);
    inputs.push({
      variantId: line.variantId,
      qty: line.qty,
      shippable: product.shippable,
      localAvailable: ctx?.stock.get(line.variantId)?.availableQty ?? 0,
      // Kargo deposu yoksa 0 — motorun sözleşmesi bunu bekliyor ve `shipping` yolunu açmıyor.
      shippingAvailable: ctx?.shippingStock?.get(line.variantId)?.availableQty ?? 0,
    });
    indexOfInput.push(index);
  });

  const decision = decideCartAgainstWarehouse(inputs);
  decision.lines.forEach((d, i) => {
    const index = indexOfInput[i];
    const input = inputs[i];
    if (index === undefined || !input) return;
    // İki olumsuz yolda havuz tanım gereği boş — motor oraya ancak ikisi de tükendiğinde düşürür.
    const availableHere = d.route === 'shipping' ? input.shippingAvailable : d.route === 'local' ? input.localAvailable : 0;
    result.set(index, { route: d.route, availableHere });
  });
  return result;
}

/**
 * Fiyat artışı işareti; düşüş sessizce uygulanır. Saklanan 0 "henüz çözülmedi" demektir ve karşılaştırılmaz.
 */
function priceChangeOf(
  entry: CartEntry,
  currentCents: number | null,
  previous?: ReadonlyMap<string, number>,
): { priceChange?: { previousCents: number } } {
  if (!previous || currentCents === null) return {};
  const previousCents = previous.get(cartKey(entry));
  if (!previousCents || currentCents <= previousCents) return {};
  return { priceChange: { previousCents } };
}

function meets(subtotalCents: number, minBasketCents: number) {
  const { ok, missingCents } = meetsMinBasket(subtotalCents, minBasketCents);
  return { minBasketOk: ok, missingForMinBasketCents: missingCents, minBasketCents };
}

/** Kaynağı kaybolmuş satır — adı yok ama sepette duruyor; çıkarılmadan devam edilemez. */
function orphanLine(entry: CartEntry): CartLine {
  return {
    ...entry,
    // Kaynağı kaybolmuş satırın kapsamı da bilinmiyor — ve zaten fiyatı `null`, indirime girmiyor.
    categoryId: null,
    // Ürünü de bilinmiyor: ölçüm bu satırı kimliksiz yazar, UYDURMAZ.
    productId: null,
    collectionIds: [],
    slug: '',
    name: '',
    image: EMPTY_IMAGE,
    unitLabel: '',
    unitPriceCents: null,
    limitCap: null,
    lineTotalCents: null,
    blocked: true,
    route: null,
    // Yolu bilinmeyen satır ana grupta durur (`cartGroupOf`): kaynağı kaybolduğu için "gelemez"
    // denemez — satırın sorunu yol değil, kalemin kendisi (`blocked`).
    group: 'local',
    // Kaynağı kaybolmuş satırın "burada kaç tane var" sorusu yok: sorulacak bir ürün kalmadı.
    availableHere: null,
    contents: [],
    vatRate: 0,
    // Kaynağı kayboldu: kargolanıp kargolanamayacağı da bilinmiyor. `true` demek kısıt uyarısını
    // yutmak olurdu; satır zaten engelli, çıkarılmadan devam edilemiyor.
    shippable: false,
  };
}

/**
 * Paket satırı: fiyat paketin kendi alanından, teklif ve indirim yok. Satıştan kalkmış paket kimliğiyle ve engelli durur.
 */
function bundleLine(bundleId: string, qty: number, pack: CartBundleSource | undefined): CartLine {
  if (!pack) return orphanLine({ kind: 'bundle', bundleId, qty });
  return {
    kind: 'bundle',
    bundleId,
    qty,
    // Paket kalemleri indirim matrahına GİRMEZ (DOMAIN §13) — kapsam üyeliği sorulmaz bile.
    categoryId: null,
    // Paket bir ÜRÜN değildir: ürün kırılımına girmez ve kimliği de yoktur.
    productId: null,
    collectionIds: [],
    slug: pack.slug,
    name: pack.name,
    image: pack.image,
    unitLabel: '',
    unitPriceCents: pack.priceCents,
    limitCap: null,
    lineTotalCents: pack.priceCents * qty,
    blocked: pack.soldOut,
    // Yol paketin bütünü için paket kapısında (`decideBundleAgainstWarehouse`) çözülür ve burada yalnız taşınır; dolu olması
    // checkout kapılarının paketi yakalaması için şart.
    route: pack.route,
    // Paketin grubu da BÜTÜNÜ için: soğuk zincir kalemi taşıyan paket rota dışı adreste
    // `not_shippable_here` döner ve grup onu teslim edilemeyene taşır — parça parça değil.
    group: cartGroupOf({ route: pack.route }),
    // "Şu an en fazla kaç adet" — en zayıf kalemden (`min⌊mevcut ÷ kalem-adedi⌋`). Bir söz değil,
    // bir sayı: sepet stok ayırmıyor (DOMAIN §4).
    availableHere: pack.maxQty,
    contents: pack.items.map((item) => ({ name: item.name, qty: item.qty })),
    vatRate: pack.vatRate,
    // Pakette tek bir soğuk zincir kalemi bile varsa paketin tamamı rota içi kalır.
    shippable: !pack.inRouteOnly,
  };
}
