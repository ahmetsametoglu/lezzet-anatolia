import { ProductService, ProductVariantService, SettingsService, type Db } from '@lezzet/database';
import { decideCartAgainstWarehouse, meetsMinBasket, type CartLineInput, type CartLineRoute, type DiscountableLine } from '@lezzet/domain-core';
import { CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type { PreferredLanguage, ProductVariant, ProductWithRelations } from '@lezzet/types';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toVariant } from '../catalog/map';
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
 * Sepetin PAKET satırı için gereken alanlar — paket okumasının sonucunun sepete bakan yüzü.
 *
 * Paket ÇÖZÜMÜ (stok/kargo/ağırlık/alerjen türetmesi) bu pakette henüz yok: kaynağı
 * `apps/web/lib/storefront/packages.ts` ve terfisi ayrı bir adım (rapora "terfi ihtiyacı" olarak
 * yazıldı). Sepet o güne kadar çözümü KAPIDAN alır; web'in `StorefrontPackageDetail`'i bu şeklin
 * yapısal ikizidir, yani köprü hiçbir dönüştürme yazmadan geçer.
 *
 * Şeklin dar tutulması bilinçli: sepet paketin alerjenini, ağırlığını, kalem görsellerini
 * KULLANMIYOR. Geniş bir tip istemek, paketi hiç okumayan bir çağıranı olmayan alanları
 * doldurmaya zorlardı.
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
  /** Soğuk zincir kalemi varsa paketin tamamı rota içi kalır (05.5). */
  inRouteOnly: boolean;
  items: readonly { name: string; qty: number }[];
}

/**
 * Paket çözümünün KAPISI — sepet paketi kendisi okumaz, çağıran okutur.
 *
 * Verilmezse paket satırı kimliğiyle ve **ENGELLİ** durur (`orphanLine`), yani satıştan kalkmış
 * paketle aynı hâl: sepetten sessizce düşmez, müşteri neyi kaybettiğini görür. Mobil yüzeyde
 * paket akışı açıldığında kapı geçilir; bugün mobilde paket satırı doğmuyor.
 */
export type CartBundlePort = (
  bundleIds: readonly string[],
  locale: PreferredLanguage,
  place: PlaceWarehouses,
) => Promise<readonly CartBundleSource[]>;

/**
 * Sepet okuması (08.4) — NİYETİ bugünkü görünüme çevirir.
 *
 * Girdi yalnız `{variantId, qty, stockId}` üçlüsüdür; ad, fiyat, stok ve tavan burada YENİDEN
 * çözülür. Sebep DOMAIN §5: sepetteki fiyat bağlayıcı değildir, gösterimdir. Sepet aylarca
 * bekleyebilir — fiyat da stok da o arada değişir.
 *
 * Tek turda okur: varyantlar → ürünler → fiyat/stok/teklif bağlamı. Sepette 20 kalem olsa da sorgu
 * sayısı sabittir (kalem başına sorgu N+1 doğurur).
 *
 * **Çıpalı parti kontrolü:** teklif kalemi eklendiği partiye bağlıdır. O parti tükendiyse indirim
 * başka partiye TAŞINMAZ; satır bugünkü çözümde teklifsiz görünür ve fiyatı normale döner
 * (müşteriye checkout'ta bildirilir — 07.4'ün işi).
 *
 * ── TERFİ (aşama 1/3) · WEB'DEN FARKLARI ─────────────────────────────────────
 * Kaynağı `apps/web/lib/cart/read.ts`tı; web kopyası KÖPRÜ olarak duruyor. Kural tarafında hiçbir
 * şey değişmedi — değişen yalnız kapının taşımayla bağını kesen üç şey:
 *   · `db` çağırandan gelir (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni.
 *   · Paket çözümü `opts.bundles` kapısından gelir (künyesi `CartBundlePort`'ta).
 *   · Ayar kapsamı için görüntüleyen BİR KEZ çözülür ve hem kapsama hem fiyat bağlamına verilir;
 *     web'de aynı profil satırı iki kez okunuyordu (`settingScopeOf` kendi içinde okuyordu).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`).
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
     * Sunucu sepetinde SAKLANAN fiyatlar (`cartKey` → cent). Bugünkü çözümle karşılaştırılır;
     * artış varsa satır `priceChange` taşır (DOMAIN §5). Verilmezse karşılaştırma yapılmaz —
     * ziyaretçide saklanan fiyat yoktur.
     */
    previousPrices?: ReadonlyMap<string, number>;
    /**
     * Müşterinin yerinden çözülen depo (DOMAIN §17). Null = yer bilinmiyor: sepet depo-ÜSTÜ okunur
     * ve "burada satılmıyor" denmez — yalnız hiçbir depoda yoksa tükendi denir (C3).
     *
     * Adlandırılmış alan, konumsal parametre DEĞİL: sepet okumasının imzası zaten üç şey taşıyordu
     * ve araya girecek dördüncü bir konum, mevcut çağrıları sessizce kaydırırdı.
     *
     * Yer bağlamı v2 bunu artık DOLDURUYOR (19.9): çerezden okunan cevap `readPlaceWarehouses` ile
     * çözülüp geçiliyor. **Boş geçen üç çağrı bilinçli:** sonraya kaydedilenler ve tekrar sipariş
     * yere göre DARALTILMAMALI — ikisinin de sorusu "bu ürün hâlâ satılıyor mu", "senin deponda var
     * mı" değil. Depo-üstü okumanın tek meşru kullanımı bu olumsuz cevaptır (C3).
     */
    warehouseId?: string | null;
    /**
     * Ülkenin kargo deposu (19.10) — sepetin "bu kalem kargoyla gelebilir" ayrımı için. `null` =
     * yer bilinmiyor ya da o ülkeye kargo yok. Satır bazlı grup ayrımı bunu
     * `decideCartAgainstWarehouse` motoruna veriyor (19.11).
     *
     * **Bu cümle 10.08'e kadar YALANDI ve bedeli ağırdı:** alan motora hiç geçmiyordu, `decideRoutes`
     * imzasında yoktu bile. Künye vaadi yazmış, kod tutmamıştı — ve okuyan taraf künyeye güvenip
     * kodu bir daha açmadığı için arıza aylarca görünmedi (mobil şeridin cihaz ölçümüyle çıktı).
     * Bir künye kodun ne yaptığını değil ne YAPMASI GEREKTİĞİNİ anlatmaya başladığı gün, denetimden
     * kaçan bir yalana dönüşür.
     */
    shippingWarehouseId?: string | null;
    /**
     * Ayar kapsamının yer eksenleri (07.15) — `warehouseId` zaten yukarıda; ülke ve bölge de
     * kapsamlı ayar sorabiliyor (DE kargo tarifesi, bölge asgari sepeti).
     *
     * **Parametre, çerez okuması DEĞİL** ve bu bilinçli: yeri çözen taraf isteğin sahibi olan
     * sayfadır. Sepet okuması `cookies()`e bağlansaydı istek dışında (cron, webhook, test)
     * çağrılamaz hâle gelirdi — ölçüldü, 34 test o yüzden düştü.
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
  // İkisi de DOMAIN §6'ya göre PARAMETRİK — kod sabiti değil, işletme ayarı.
  //
  // Anahtarlar ORTAK sabitten gelir (`./settings-keys`): burada `free_shipping_cents` yazıyordu
  // ve öyle bir ayar hiç yoktu — okuma sessizce varsayılana düşüyor, checkout ise gerçek ayarı
  // okuyordu. İkisi tesadüfen aynı değerde olduğu için görünmüyordu (29.07).
  // **KAPSAM ŞART** (07.15): üçü de kapsamsız okunuyordu ve b2b/DE/bölge satırları hiç
  // uygulanmıyordu — ayar yazılıyor, okunmuyordu. Kapsamı checkout ile AYNI yerden kuruyoruz
  // (`settingScopeOf`): anahtar ortaklığı 29.07'de yetmemişti, kapsam da ortak olmalı — yoksa
  // sepette "13 € eşik" yazıp checkout'ta 0 € uygulanır ve müşteri arada ne olduğunu anlamaz.
  //
  // Görüntüleyen (kanal + özel fiyat kimliği) BURADA bir kez çözülür: kapsamın kanal ekseni de
  // fiyat bağlamı da aynı profil satırından çıkıyor. Oturumdan DEĞİL sepete verilen KİMLİKTEN
  // çözülür — checkout taslağı müşteriyi misafir OTP çerezinden de çözebiliyor ve o yolda oturum
  // yok; oturuma bağlasaydık misafir olarak doğrulanmış bir B2B müşteri perakende fiyat görürdü.
  const viewer = await pricingViewerOf(db, opts.customerId ?? null);
  const scope = settingScopeOf(viewer, {
    country: opts.country,
    zoneId: opts.zoneId,
    warehouseId: opts.warehouseId,
  });
  /**
   * Alt sınır İKİ değer olarak okunuyor, çünkü hangisinin geçerli olduğunu sepetin İÇERİĞİ söyler
   * (kullanıcı kararı 10.08 · `min-basket.ts`): sepetin tamamı kargo grubundaysa tek bir sipariş
   * doğar ve o siparişin lojistik tabanı yoktur. Seçim satırlar çözüldükten sonra yapılıyor
   * (`shippingOnly`), okuma ise burada — ayar okuması önbellekli, ikinci tur bedelsiz.
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
    // Yer paket kapısına da GEÇER (19.22): kart, sepet ve checkout aynı yolu görmeli. Geçmeseydi
    // paket ağ-geneli okunmaya devam eder ve checkout'un iki kapısı onu yine muaf geçerdi.
    // Kapı yoksa ya da sepette paket yoksa okuma hiç yapılmaz.
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
    const unitPriceCents = view.priceCents;

    lines.push({
      ...entry,
      slug: product.slug,
      name: resolveLocalizedText(product.name, locale),
      image: imageOf(product),
      unitLabel: view.label,
      unitPriceCents,
      wasCents: offerHolds ? view.wasCents : undefined,
      limitCap: offerHolds && view.limitLabel ? Number(view.limitLabel) : null,
      lineTotalCents: unitPriceCents === null ? null : unitPriceCents * entry.qty,
      // Satışa kapalı ya da tükendi → çıkarılmadan devam edilemez.
      blocked: unitPriceCents === null || view.soldOut,
      // Yol kararı satırlar kurulduktan SONRA toplu veriliyor (motor sepetin tamamını görmeli).
      route: null,
      // Grup yolla birlikte tazelenir; başlangıç değeri yolun `null` hâlinin karşılığı (`cartGroupOf`).
      group: 'local',
      availableHere: null,
      contents: [],
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
    });
  }

  // ── YOL KARARI: MOTOR VERİR, EKRAN DEĞİL (19.11) ──────────────────────────
  // `decideCartAgainstWarehouse` 19.3'ten beri yazılıydı ve çağıranı yoktu. Karar burada verilir
  // çünkü aynı ayrımı checkout da isteyecek (kargo grubu ikinci bir taslak açar) ve iş gerçeğini
  // ekran hesaplayamaz (`STACK §4`).
  //
  // Yer bilinmiyorsa ayrım YAPILMAZ: hangi yoldan geleceğini bilmediğimiz bir kaleme yol atamak,
  // bilmediğimiz bir şeyi söylemektir. `route` o hâlde null kalır. **Ama "rota deposu yok" ile
  // "yer bilinmiyor" AYNI ŞEY DEĞİL** — ayrımı `place` taşıyor (`decideRoutes` künyesi).
  const routeByIndex = decideRoutes(lines, context, byVariant, byProduct, place);
  for (const [index, decision] of routeByIndex.entries()) {
    const line = lines[index];
    if (!line) continue;
    line.route = decision.route;
    // Grup yolun EKRANA ve siparişe bakan izdüşümü; yolla aynı anda, aynı kaynaktan doldurulur —
    // ayrı zamanlarda türetilen iki cevap bir gün ayrışır (10.08 ölçümü, `cartGroupOf` künyesi).
    line.group = cartGroupOf(line);
    line.availableHere = decision.availableHere;
  }

  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  /**
   * Bu adrese HİÇ gelemeyen kalemlerin toplamı — asgari sepete SAYILMAZ (kullanıcı kararı 10.08).
   *
   * Sayılsaydı müşteri sipariş edemeyeceği bir ürünle eşiği geçmiş görünür ve kasada geri düşerdi;
   * eşik kapıya teslimin kuralıdır, gelmeyecek malın onunla ilgisi yok. Kalem sepetten SİLİNMEZ —
   * yalnız eşiğin matrahından düşer.
   */
  const undeliverableSubtotalCents = undeliverableTotalOf(lines);
  // Kargo grubunun kendi toplamı — ücretsiz kargo eşiği BUNA bakar (K37).
  const shippingSubtotalCents = lines.reduce((sum, l) => (l.route === 'shipping' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
  const hasLocal = lines.some((l) => l.route === 'local');
  const hasShipping = lines.some((l) => l.route === 'shipping');
  const discount = await resolveCartDiscount(db, {
    lines: discountable,
    customerId: opts.customerId,
    couponCode: opts.couponCode,
  });

  return {
    lines,
    subtotalCents,
    discount,
    // Sepetin ödenecek hâli — kargo HARİÇ (o adreste belli olur).
    totalCents: Math.max(0, subtotalCents - discountAmountOf(discount)),
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
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
     * Hangi taban geçerli — **sepetin İÇERİĞİ söyler** (kullanıcı kararı 10.08). Tamamı kargo
     * grubundaysa doğacak tek sipariş kargo siparişidir ve onun lojistik tabanı yoktur; kanal şartı
     * (toptan) iki değerde de duruyor, çünkü o ticari bir şart ve mesafeyle ilgisi yok.
     *
     * Karışık sepette kapıya teslim tabanı yazılır: rota grubu var demektir ve asıl akış odur.
     * Rota grubunun KENDİ toplamıyla ölçülmesi ayrı bir iş (ekran bugün sepetin tamamına bakıyor);
     * bu satır yalnız hangi SAYININ geçerli olduğunu düzeltiyor.
     */
    ...meets(subtotalCents - undeliverableSubtotalCents, hasShipping && !hasLocal ? minBasketShippingCents : minBasketRouteCents),
  };
}

/**
 * Satırların yol kararı — motorun girdisini kurar, kararı ona verir.
 *
 * **Paket satırı buradan geçmez ve bu doğru** (19.22): paket bölünmez, yolu BÜTÜNÜ için verilir ve
 * kararı kendi motoru üretir (`decideBundleAgainstWarehouse`, paket kapısında çözülür). Kalemlerini
 * bu süzgece tek tek versek üç kalemli bir paket için üç ayrı yol çıkardı ve hiçbiri paketin cevabı
 * olmazdı. `bundleLine` sonucu taşıyor, yani paket satırının `route`/`availableHere`'i artık dolu —
 * checkout'un iki kapısı onu kendiliğinden yakalıyor.
 *
 * Yolla birlikte **o yolun havuzundaki miktar** da döner (`availableHere`). Motorun kendi
 * `fulfillableQty` alanı bu soruyu cevaplayamıyor: o `min(istenen, mevcut)` — yani 2 adet isteyip
 * 2 adet bulunan satır ile 5 isteyip 2 bulunan satır aynı sayıyı üretir, "tavana dayandım mı"
 * sorusu ondan okunamaz. Hangi havuza bakılacağını yine MOTOR söylüyor (`route`); burada yalnız
 * o havuzun sayısı alınıyor — bir kural değil, bir arama.
 *
 * ── ÇIKIŞ KOŞULU "ROTA DEPOSU YOK" DEĞİL, "İKİ DEPO DA YOK" (10.08) ─────────
 * Fonksiyon bir tur yalnız `warehouseId` alıyordu ve o boşsa boş harita dönüyordu. `warehouseId`
 * boşluğu İKİ ayrı şey demek ve ikisi tek sayılıyordu:
 *
 * - **yer bilinmiyor** — posta kodu hiç yok; iki depo da `null`. Yol atamamak DOĞRU.
 * - **yer biliniyor, rota dışı** — 67380 gibi; rota deposu `null` ama KARGO deposu dolu. Yol
 *   atanmalı, atanmıyordu.
 *
 * Bedeli dardı ama sonucu değildi (mobil şeridin ölçümü, iki yüzeyde birden): boş harita dönünce
 * hiçbir satırın yolu güncellenmiyor, satırlar kuruluş değerinde kalıyordu — `route: null`,
 * `group: 'local'`. Yani rota DIŞINDAKİ her adreste sepet her kalemi "kapıya teslim ediyoruz" diye
 * gösteriyordu; soğuk zincir kalemi de öyle görünüyordu, gerçekte o adrese hiç gelemezken.
 * `undeliverableSubtotalCents` daima 0 kalıyor (asgari sepet matrahı yanlış), `shippingOnly` daima
 * false kalıyordu (salt-kargo sepeti rota sepeti sanılıyor).
 *
 * Motorun kendisi zaten DOĞRUYDU (`decideCartAgainstWarehouse`) — hiç çağrılmıyordu. Aynı dosyanın
 * yer bağlamı künyesi de "bunu motora veriyor" diyordu; kod ile künye ayrışmıştı. İkinci havuz da
 * zaten okunuyor (`product-context`: rota dışında yerel havuz BOŞ HARİTA, kargo havuzu ayrıca
 * çekiliyor), yani düzeltme tek bir parametre ve tek bir koşul — ek sorgu yok.
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
 * Fiyat değişimi işareti (DOMAIN §5). **Yalnız ARTIŞ** döner: düşen fiyat sessizce uygulanır.
 *
 * Saklanan fiyat 0 ise karşılaştırma yapılmaz — o, fiyatın "henüz çözülmedi" hâlidir (niyet
 * sunucuya yazılırken 0 girer, çözülen değeri `writeCartAction` üstüne yazar). Sıfırı geçerli bir
 * "önceki fiyat" saymak, her yeni kalemi "zamlandı" diye işaretlerdi.
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
    slug: '',
    name: '',
    image: { url: null, crop: CROP_CENTER },
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
 * Paket satırı. Fiyat paketin KENDİ alanından gelir — kalemlerin toplamı değil (tek fiyat kuralı,
 * DOMAIN §13). Teklif/parti kavramı yok: indirim pakete uygulanmaz, bu yüzden `wasCents` ve
 * `limitCap` daima boştur.
 *
 * Paket bu arada satıştan kalkmışsa (`packages` içinde yok) satır SESSİZCE DÜŞMEZ: kimliğiyle ve
 * engelli olarak durur — müşteri sepetinden bir şeyin kaybolduğunu görmeli.
 */
function bundleLine(bundleId: string, qty: number, pack: CartBundleSource | undefined): CartLine {
  if (!pack) return orphanLine({ kind: 'bundle', bundleId, qty });
  return {
    kind: 'bundle',
    bundleId,
    qty,
    slug: pack.slug,
    name: pack.name,
    image: pack.image,
    unitLabel: '',
    unitPriceCents: pack.priceCents,
    limitCap: null,
    lineTotalCents: pack.priceCents * qty,
    blocked: pack.soldOut,
    // **Yol paketin BÜTÜNÜ için** (19.22) — "paketi ikiye böl" yok (`DOMAIN §13`, K5). Karar
    // `decideBundleAgainstWarehouse` motorundan geliyor ve paket KAPISINDA çözülüyor
    // (`storefront/packages.ts`); burada yalnız taşınıyor, ikinci kez hesaplanmıyor — kartla sepet
    // aynı paket için farklı yol söyleyemesin.
    //
    // İki alanın `null` kalması checkout'un iki kapısının (`!== null` süzgeci) paketi MUAF geçmesi
    // demekti ve iş rezervasyonda, müşteri onaya bastıktan SONRA patlıyordu. Değer akınca kapılar
    // paketi kendiliğinden yakalıyor: yeni kapı eklenmedi, **mevcut kapı beslendi.**
    route: pack.route,
    // Paketin grubu da BÜTÜNÜ için: soğuk zincir kalemi taşıyan paket rota dışı adreste
    // `not_shippable_here` döner ve grup onu teslim edilemeyene taşır — parça parça değil.
    group: cartGroupOf({ route: pack.route }),
    // "Şu an en fazla kaç adet" — en zayıf kalemden (`min⌊mevcut ÷ kalem-adedi⌋`). Bir söz değil,
    // bir sayı: sepet stok ayırmıyor (DOMAIN §4).
    availableHere: pack.maxQty,
    contents: pack.items.map((item) => ({ name: item.name, qty: item.qty })),
    vatRate: pack.vatRate,
    // Pakette TEK bir soğuk zincir kalemi bile varsa paketin tamamı rota içi kalır (05.5).
    shippable: !pack.inRouteOnly,
  };
}
