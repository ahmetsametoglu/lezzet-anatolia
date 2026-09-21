import { meetsMinBasket, resolveShippingFee } from '@lezzet/domain-core';
import type { CouponRejection, DiscountRule, ShippingFeeResult } from '@lezzet/domain-core';
import type { AnalyticsBlockedReason, CartItem, CartLineGroup } from '@lezzet/types';
import type { LocalizedText } from '@lezzet/types';
import type { CartLineRoute } from '@lezzet/domain-core';
import type { StorefrontImage } from '../catalog/storefront-types';

/**
 * Sepet sözleşmesi, web ve mobil sipariş yolunun ortağıdır: çapraz istemci kuralı ya veritabanında ya paylaşılan pakette yaşar.
 */

/**
 * Kuponun neden tutmadığı — motorun sebepleri (`CouponRejection`) + kapının iki kendi hâli.
 *
 * Sebep listesi motordan TÜRER, elle kopyalanmaz: motora yeni bir koşul eklendiğinde ekranın
 * karşılaması gereken hâl de kendiliğinden büyür.
 */
export type CouponFailure =
  | CouponRejection
  /** Böyle bir kod yok. Kişisel kuponun başkasında olması da BURAYA düşer: varlığı sızdırılmaz. */
  | 'unknown_code'
  /** Kupon geçerli ama otomatik indirim / müşteri oranı daha büyük — sepete o uygulandı. */
  | 'outranked';

/**
 * Kendiliğinden inen indirimin sebebi, ekran "neden indi" diyebilsin diye. Kampanyanın iç adı kullanılmaz, çünkü tek dilde
 * ve operatör için yazılır; sebep türden doğar ve müşteriye görünen adın (`CartDiscount.label`) yedeğidir.
 */
export type DiscountReason =
  /**
   * `percent` yalnız oran bütün sepet için doğruysa dolar; kategoriye bağlı oran sepetin tamamına inmiş gibi okunmamalı.
   */
  | { kind: 'campaign'; percent: number | null }
;

/**
 * Sepete inen indirim ya da kuponun reddi. **Görünüm tipidir** — bu dosyada durur çünkü ekran onu
 * okur; çözümü yapan kapı sunucudadır (`lib/cart/discount.ts`, `server-only`).
 */
export type CartDiscount =
  /** `codeId`: hangi KAPIDAN girildi — kota kuralın tamamına aittir, bu yalnız kullanım kaydına iz. */
  | { status: 'applied'; source: 'coupon'; code: string; codeId: string; amountCents: number; lineShares: number[]; discountId: string | null; label: LocalizedText | null }
  /** Kupon girilmeden kazanan indirim (otomatik kampanya ya da müşterinin genel oranı). */
  | { status: 'automatic'; reason: DiscountReason; amountCents: number; lineShares: number[]; discountId: string | null; label: LocalizedText | null }
  /**
   * Kupon tutmasa da sepete inen indirim ve kimliği; kupon denendi diye sepetteki indirimin adı değişmesin.
   */
  | {
      status: 'rejected';
      reason: CouponFailure;
      code: string;
      appliedInsteadCents: number;
      appliedInstead: { reason: DiscountReason; label: LocalizedText | null } | null;
      /**
       * Kazanan indirimin kalem payları ve kimliği; DB kısıtı başlık indirimini payların toplamına eşit ister.
       */
      appliedInsteadShares: readonly number[];
      appliedInsteadId: string | null;
    }
  | { status: 'none' };

/**
 * Eşiğe az kalmış, sepeti büyüterek kazanılabilir otomatik kampanya; kazanandan bağımsızdır. Ölçüt motorda
 * (`findReachableDiscount`), `null` söylenecek bir şey yok demek, çünkü boş vaat müşteriyi boşuna alışverişe iter.
 */
export interface CartReachableDiscount {
  /** Eşiğe kalan tutar (cent) — cümlenin "{n} daha ekleyin" parçası. */
  missingCents: number;
  /** Eşiğin kendisi (cent). */
  minBasketCents: number;
  /** Eşiğe varıldığında inecek indirimin ALT SINIRI (cent) — müşteri daha azını bulmaz. */
  projectedCents: number;
  /** Kampanyanın müşteriye görünen adı; `null` = operatör ad yazmamış, yüzey adsız konuşur. */
  label: LocalizedText | null;
}

/**
 * Sepetin indirim cevabı: inen indirim ve elinin altındaki; ayrı alanlar, çünkü indirimi olan müşteriye ikinci cümle de söylenir.
 */
export interface CartDiscountResult {
  discount: CartDiscount;
  reachable: CartReachableDiscount | null;
  /**
   * Motorun girdisi (kurallar ve bağlam), istemci adet değiştirince indirimi aynı motorla tazeleyebilsin diye.
   * Kupon kodlarının süzülmesi taşıma katmanının işidir (`mobile-api` → `toViewBody`).
   */
  rules: readonly DiscountRule[];
  context: { isFirstOrder: boolean };
}

/**
 * `CartEntry` niyettir (ne istendiği, fiyatsız), `CartLine` o niyetin bugünkü görünümüdür ve her okumada yeniden çözülür.
 * Sepetteki fiyat bağlayıcı değildir (DOMAIN §5); bağlayıcı fiyat checkout başlangıcında sabitlenir.
 */

/**
 * Sepetteki niyet: varyant satırı `{variantId, stockId}`, paket satırı `{bundleId}`. Birleşim, çünkü paketin partisi ya da
 * varyantı olamaz ve düz nesne bu imkânsız hâlleri yazılabilir bırakırdı.
 */
export type CartEntry = CartVariantEntry | CartBundleEntry;

export interface CartVariantEntry {
  /**
   * Tür açıkça taşınır, çünkü TypeScript `string` alanın doluluğuyla daraltma yapamaz.
   */
  kind: 'variant';
  variantId: string;
  qty: number;
  /** Teklif kalemi hangi partiye çıpalı; normal satışta null (DOMAIN §5). */
  stockId: string | null;
  bundleId?: never;
}

export interface CartBundleEntry {
  kind: 'bundle';
  bundleId: string;
  qty: number;
  variantId?: never;
  stockId?: never;
}

/**
 * Bir satırı GÖSTEREN kimlik — ekranın "şunu şu adede getir" derken tuttuğu şey.
 *
 * `CartEntry`'den ayrı durur çünkü adet TAŞIMAZ: `setQty` zaten adedi ayrı alıyor, referansın içinde
 * ikinci bir adet taşımak iki kaynağın ayrışabildiği bir yol açardı.
 */
export type CartRef = { kind: 'variant'; variantId: string; stockId: string | null; bundleId?: never } | { kind: 'bundle'; bundleId: string; variantId?: never; stockId?: never };

/**
 * Sepet satırının bugünkü görünümü; tür dağıtılmış kalır ki `line.bundleId` daraltma yapabilsin.
 */
export type CartLine = (CartVariantEntry & CartLineView) | (CartBundleEntry & CartLineView);

interface CartLineView {
  /**
   * Kampanya kapsamının üyeliği; sepet kendi kullanmaz, istemci motoru çalıştırabilsin diye taşınır. Pakette boş.
   */
  categoryId: string | null;
  collectionIds: readonly string[];
  /** Ürüne dönüş bağlantısı için; paket satırında paketin slug'ı. */
  slug: string;
  /**
   * Satırın ürün kimliği (pakette `null`); ölçüm için taşınır, satırı kuran okuma ürünü zaten elinde tutar.
   */
  productId: string | null;
  name: string;
  image: StorefrontImage;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş. */
  unitLabel: string;
  /** null = satışa kapalı (kanal fiyatı yok); satır çıkarılmadan devam edilemez. */
  unitPriceCents: number | null;
  /**
   * Pazarlık izi: personel fiyatı üstüne yazdıysa motorun çözdüğü liste fiyatı. Satırda durur ki toplam, indirim matrahı
   * ve kalem kaydı aynı sayıyı görsün.
   */
  listUnitPriceCents?: number | null;
  /** Teklif kazandıysa üstü çizilecek referans. */
  wasCents?: number;
  /** Müşteriye özel fiyatlı kalem; indirim matrahına girmez. Alan yoksa değildir. */
  specialPrice?: true;
  /** Teklifin adet tavanı (partide kalan); tavan yoksa null. */
  limitCap: number | null;
  /**
   * Fiyat arttı: müşteriye söylenir ve onayı istenir (DOMAIN §5); düşüş sessizce uygulanır. Yalnız sunucu sepetinde doğar,
   * çünkü ziyaretçi niyeti fiyat taşımaz.
   */
  priceChange?: { previousCents: number };
  /** Satır toplamı — fiyat yoksa null. */
  lineTotalCents: number | null;
  /**
   * Bu satır çıkarılmadan checkout'a geçilemez: ürün tükenmiş ya da satışa kapanmış.
   * "Size ayrıldı" vaadi hiçbir yerde yoktur — sepet stok ayırmaz (DOMAIN §4).
   */
  blocked: boolean;
  /**
   * Kalemin yolu, motordan (`decideCartAgainstWarehouse`): yolu stok belirler, müşteri seçmez. `null` yer bilinmiyor demek.
   */
  route: CartLineRoute | null;
  /**
   * Bu yerde şu an kaç adet var; söz değil sayı, sepet stok ayırmaz. `null` yol bilinmiyor; motorun `fulfillableQty`si
   * yetmez, çünkü istenen ile mevcut arasındaki farkı gizler.
   */
  availableHere: number | null;
  /**
   * Kalemin grubu, `route` ile aynı anda aynı kaynaktan doldurulur (`cartGroupOf`), yoksa bir yüzey `not_shippable_here`ı yutardı.
   */
  group: CartLineGroup;
  /**
   * Paket satırının salt okunur içeriği; varyant satırında boş. Paket bütün olarak satılır, fiyat taşımaz.
   */
  contents: { name: string; qty: number }[];
  /**
   * Kalem kargoya verilebilir mi; "buraya gönderilebilir mi" kararı yere bağlıdır ve ekranda verilir.
   */
  shippable: boolean;
  /**
   * KDV oranı; sepet göstermez, checkout kargo KDV'sini oransal bölmek için okur. Paket satırı en yüksek oranı taşır,
   * çünkü kargo KDV'sini fazla hesaplamak vergi tarafında güvenli yöndür.
   */
  vatRate: number;
}

/**
 * Sepet ekranının tek okuma sonucu. Kargo ücreti satırı yok, çünkü ücret adrese bağlıdır ve adres checkout'ta sorulur.
 */
export interface CartView {
  lines: CartLine[];
  /** Kalem toplamı (cent) — kargo ve indirim HARİÇ. */
  subtotalCents: number;
  /** Kararı üreten kurallar ve bağlam (`CartDiscountResult.rules`). */
  discountRules: readonly DiscountRule[];
  discountContext: { isFirstOrder: boolean };
  /**
   * Sepete inen indirim ya da kuponun neden inmediği; karar motorundur, kapı yalnız taşır.
   */
  discount: CartDiscount;
  /**
   * Eşiğe az kalmış kampanya; toplama girmez, bir bilgi, tahsilat değil.
   */
  reachableDiscount: CartReachableDiscount | null;
  /** Ara toplam − indirim. Kargo YOK: ücret teslimat türüne, tür adrese bağlıdır. */
  totalCents: number;
  /** Toplam adet — başlıktaki sepet rozetinin sayısı. */
  itemCount: number;
  /**
   * Satılamaz satır var mı; varsa "Checkout'a geç" pasifleşir. Teslim edilemeyen kalem buraya girmez, yoksa tek soğuk
   * zincir ürün bütün sepeti kilitlerdi.
   */
  hasBlocked: boolean;
  /**
   * Bu adrese gelemeyen kalemlerin toplamı; asgari sepete sayılmaz. `minBasketOk` ve `missingForMinBasketCents` bunu zaten düşmüştür.
   */
  undeliverableSubtotalCents: number;
  /** Asgari sepet tutuyor mu (DOMAIN §6, ayardan gelir); tutmuyorsa eksik tutar. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Eşiğin kendisi — "en az 25,00 € gerekir" cümlesi bunu yazar; ekran ayarı okumaz. */
  minBasketCents: number;
  /**
   * Ücretsiz kargo eşiği (DOMAIN §6); ücretin uygulanıp uygulanmayacağı adrese bağlı olduğu için yalnız eşik taşınır. 0 = tanımsız.
   */
  freeShippingCents: number;
  /**
   * Kargo grubunun toplamı; ücretsiz kargo eşiği buna bakar, rota grubunun tutarı kargo maliyetini karşılamaz. Yer bilinmiyorken 0.
   */
  shippingSubtotalCents: number;
  /**
   * Ayardaki ham kargo tarifesi; ücret kararı motorda (`shippingGroupFee`), çözülmüş sayı taşınsa aynı gerçeğin iki kopyası olurdu.
   */
  shippingTariffCents: number;
  /**
   * Sepetin tamamı kargo grubunda mı; öyleyse tek sipariş vardır ve müşteriye "iki sipariş" denmez.
   */
  shippingOnly: boolean;
}

/** Boş sepet — hiç kalem yokken ve okuma yapılamadığında aynı şekil döner. */
export const EMPTY_CART: CartView = {
  lines: [],
  subtotalCents: 0,
  /* Boş sepette kural TAŞINMAZ: kalem yokken indirim de yoktur ve okunamamış bir sepette kuralı
     "yok" diye sunmak, ölçülmemişi ölçülmüş göstermek olurdu. İlk gerçek okumada dolar. */
  discountRules: [],
  discountContext: { isFirstOrder: false },
  discount: { status: 'none' },
  reachableDiscount: null,
  totalCents: 0,
  itemCount: 0,
  hasBlocked: false,
  undeliverableSubtotalCents: 0,
  minBasketOk: false,
  missingForMinBasketCents: 0,
  minBasketCents: 0,
  freeShippingCents: 0,
  shippingSubtotalCents: 0,
  shippingTariffCents: 0,
  shippingOnly: false,
};

/**
 * Sepetin ilerleyememe sebebi, tip olarak, çünkü üç ekran aynı iki koşulu soruyor. Gönderilemeyen kalem asgari sepetten önce
 * gelir, çünkü kalem çıkınca tutar değişir; cümleye çeviren yer ekrandır.
 */
type CartBlockReason = 'undeliverable_line' | 'min_basket';

export function cartBlockReason(view: Pick<CartView, 'hasBlocked' | 'minBasketOk'>): CartBlockReason | null {
  if (view.hasBlocked) return 'undeliverable_line';
  if (!view.minBasketOk) return 'min_basket';
  return null;
}

/**
 * İstemcinin beyan ettiği ekleme, yalnız ölçüme akar; `productId`yi sunucu sepet görünümünden doldurur.
 */
export interface AddToCartIntent {
  subjectType: 'variant' | 'bundle';
  subjectId: string;
  qty: number;
}

/**
 * Turun künyesi: istemci anı beyan eder, sunucu sonucu görür; yalnız ölçüme akar, yazma nesnesine giremez.
 */
export interface CartSignal {
  /** Bu turu ne başlattı — sebep yalnız kendi turunda sayılır. */
  trigger?: 'add' | 'coupon' | 'place';
  added?: AddToCartIntent[];
  /**
   * Tur öncesinde sepet bölünmüş müydü; ölçülen şey geçiş, yoksa tek bölünme her turda sayılırdı.
   */
  wasSplit?: boolean;
}

/**
 * Sepet iki gruba bölündü mü: kapıya ve kargoyla giden kalem birlikte var, yani iki sipariş ve iki ödeme.
 */
export function isSplitCart(view: Pick<CartView, 'lines'>): boolean {
  const { route, shipping } = splitByRoute(view.lines);
  return route.length > 0 && shipping.length > 0;
}

/**
 * Ekranın engelini defterin sebebine çevirir (`ANALYTICS §3`); defter `not_shippable` ile `out_of_stock`u ayırır.
 */
export function cartBlockedAnalyticsReason(view: CartView): AnalyticsBlockedReason | null {
  switch (cartBlockReason(view)) {
    case 'min_basket':
      return 'min_basket';
    case 'undeliverable_line':
      return view.lines.some((l) => l.route === 'not_shippable_here') ? 'not_shippable' : 'out_of_stock';
    case null:
      return null;
  }
}

/**
 * Kalemin grubu, kararın tek yeri: `local` kapıya teslim, `shipping` kargo, `undeliverable` bu adrese gelemez.
 * Bilinmeyen yol ana gruba düşer, çünkü ana akıştan çıkarmak siparişten sessizce kalem düşürmek olurdu.
 */
export function cartGroupOf(line: Pick<CartLine, 'route'>): CartLineGroup {
  if (line.route === 'shipping') return 'shipping';
  // Soğuk zincir + bu adresin deposunda yok: ne araç gider ne kargo çıkar (motorun `not_shippable_here`ı).
  if (line.route === 'not_shippable_here') return 'undeliverable';
  return 'local';
}

/**
 * Siparişin kapsayabildiği satırlar: teslim edilemeyen kalem siparişten düşer ama sepette kalır. Engelli satırlar burada
 * elenmez, kendi kapılarında ret üretir.
 */
export function orderableLines(lines: readonly CartLine[]): CartLine[] {
  return lines.filter((l) => cartGroupOf(l) !== 'undeliverable');
}

/**
 * Sepetin iki şeridi (kapıya ve kargoya); karar `cartGroupOf`. Teslim edilemeyen kalem rota şeridinde görünmeye devam eder,
 * siparişin kapsamı ayrı soru ve ayrı kapıdır (`orderableLines`).
 */
export function splitByRoute(lines: readonly CartLine[]): { route: CartLine[]; shipping: CartLine[] } {
  return {
    route: lines.filter((l) => cartGroupOf(l) !== 'shipping'),
    shipping: lines.filter((l) => cartGroupOf(l) === 'shipping'),
  };
}

/**
 * Teslim edilemeyen kalemlerin toplamı — asgari sepete SAYILMAYAN tutar (`CartView` künyesi).
 *
 * Fiyatı çözülememiş satır 0 katar: sepet okuması orada `lineTotalCents: null` üretiyor ve
 * bilinmeyen bir tutarı sıfır saymakla toplamayı reddetmek arasında fark yok — eksilteceği bir şey
 * yok (`CLAUDE §1`: ölçülemeyen değer sıfır değildir; burada ölçüm zaten toplama girmiyor).
 */
export function undeliverableTotalOf(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => (cartGroupOf(l) === 'undeliverable' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
}

/**
 * Kargo grubunun ücret kararı; sepet, ekran ve checkout aynı eşikle sorar ki ekranın sözü tutsun. Grup yoksa erken çıkar.
 */
export function shippingGroupFee(
  view: Pick<CartView, 'shippingSubtotalCents' | 'freeShippingCents' | 'shippingTariffCents'>,
): ShippingFeeResult {
  // Kargo grubu yok: ücret sorusu doğmuyor, o yüzden kaynağı da yok (`source: null`).
  if (view.shippingSubtotalCents <= 0) return { feeCents: 0, freeReason: null, remainingForFreeCents: 0, source: null };
  return resolveShippingFee({
    deliveryType: 'shipping',
    basketCents: view.shippingSubtotalCents,
    freeThresholdCents: view.freeShippingCents,
    feeCents: view.shippingTariffCents,
  });
}

/**
 * Sepetin ödenecek tutarı, tek kaynak: ara toplam − indirim, kargo grubu varsa ücret de eklenir. Pakette durur ki iki
 * yüzeyin "ödenecek tutar" tanımı ayrışmasın.
 */
export function cartPayableCents(
  view: Pick<CartView, 'totalCents' | 'shippingOnly' | 'shippingSubtotalCents' | 'freeShippingCents' | 'shippingTariffCents'>,
): number {
  return view.totalCents + (view.shippingOnly ? shippingGroupFee(view).feeCents : 0);
}

/**
 * Satırın kimliği — aynı varyantın farklı partisi AYRI satır (React anahtarı da budur).
 * Paket kendi kimliğiyle anılır ve `b:` ile önlenir: bir paketin kimliği ile bir varyantınki
 * teorik olarak çakışmaz ama iki farklı KÜMEDEN gelirler; önek bunu okuyana da söyler.
 */
export function cartKey(ref: CartRef | CartEntry): string {
  return ref.kind === 'bundle' ? `b:${ref.bundleId}` : `${ref.variantId}:${ref.stockId ?? ''}`;
}

/**
 * Saklanan satırdan niyete (`entryOf`in ham satır ikizi); tür bayraktan okunur, çünkü `bundleId` doluluğu daraltma yapmaz.
 */
export function entryOfItem(item: CartItem): CartEntry {
  return item.bundleId
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId ?? '', qty: item.qty, stockId: item.stockId ?? null };
}

/**
 * Niyetten sunucu sepeti kalemine; fiyat istemciden kabul edilmez, çağıran kendi çözdüğünü geçer. Birim euro
 * (`cart.unit_price` numeric).
 */
export function itemOfEntry(entry: CartEntry, unitPrice = 0): { variantId: string | null; bundleId: string | null; qty: number; unitPrice: number; stockId: string | null } {
  return {
    variantId: entry.variantId ?? null,
    bundleId: entry.bundleId ?? null,
    qty: entry.qty,
    unitPrice,
    stockId: entry.stockId ?? null,
  };
}

/**
 * Sunucu sepetinde saklanan fiyatlar (`cartKey` → cent), bugünkü çözümle karşılaştırılır; ziyaretçide yoktur.
 */
export function storedPrices(items: readonly CartItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.unitPrice) continue; // 0 = henüz çözülmemiş, geçerli bir "önceki" değil
    map.set(cartKey(entryOfItem(item)), Math.round(item.unitPrice * 100));
  }
  return map;
}

/**
 * Çözülmüş satırdan NİYETE geri dönüş — sunucu yanıtı geldiğinde istemcinin listesi buna göre
 * tazelenir. Tek yerde durur çünkü iki tür satırın hangi alanları taşıdığı bilgisi budur; her
 * çağrı yerinde elle kurulsaydı paket satırı bir yerde varyant satırına dönüşürdü.
 */
export function entryOf(line: CartLine): CartEntry {
  return line.kind === 'bundle'
    ? { kind: 'bundle', bundleId: line.bundleId, qty: line.qty }
    : { kind: 'variant', variantId: line.variantId, qty: line.qty, stockId: line.stockId };
}

/**
 * Toplamdan düşen tutar; reddedilen kuponda kazanan indirim düşer. Sunucu okuması ve ekran bunu kullanır.
 */
export function discountAmountOf(discount: CartDiscount): number {
  if (discount.status === 'applied' || discount.status === 'automatic') return discount.amountCents;
  return discount.status === 'rejected' ? discount.appliedInsteadCents : 0;
}

/**
 * Siparişe yazılacak kampanya kimliği; siparişi yazan her kapı aynı kuralı kullanır. Reddedilen kuponda `null`.
 */
export function discountIdOf(discount: CartDiscount): string | null {
  return discount.status === 'applied' || discount.status === 'automatic' ? (discount.discountId ?? null) : null;
}

/**
 * İndirimin müşteriye görünen adının sipariş anındaki kopyası, çünkü kampanya sonradan değişebilir ya da silinebilir.
 */
export function discountLabelOf(discount: CartDiscount): LocalizedText | null {
  return discount.status === 'applied' || discount.status === 'automatic' ? discount.label : null;
}

/**
 * Sunucu görünümünü bugünkü niyetle tazeler ki adet değişimi anında görünsün; istemci fiyat çözmez, yalnız çarpar.
 */
export function viewWithEntries(view: CartView, entries: readonly CartEntry[]): CartView {
  const wanted = new Map(entries.map((e) => [cartKey(e), e.qty]));
  const lines = view.lines
    .filter((l) => wanted.has(cartKey(l)))
    .map((l) => {
      const qty = wanted.get(cartKey(l)) ?? l.qty;
      return qty === l.qty ? l : { ...l, qty, lineTotalCents: l.unitPriceCents === null ? null : l.unitPriceCents * qty };
    });
  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  /**
   * Teslim edilemeyen kalemler eşiğe sayılmaz, sunucu okumasıyla aynı kural.
   */
  const undeliverableSubtotalCents = undeliverableTotalOf(lines);
  // Eşik kuralı MOTORDAN sorulur, burada yeniden yazılmaz — sunucu okumasıyla aynı karar.
  const basket = meetsMinBasket(subtotalCents - undeliverableSubtotalCents, view.minBasketCents);
  /**
   * Kargo grubunun sayıları da tazelenir; ücret motora sorulur (`shippingGroupFee`), son kargo satırı gidince `shippingOnly` düşer.
   */
  const shippingSubtotalCents = lines.reduce((sum, l) => (l.route === 'shipping' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
  const hasShipping = lines.some((l) => l.route === 'shipping');
  return {
    ...view,
    lines,
    subtotalCents,
    shippingSubtotalCents,
    shippingOnly: hasShipping && !lines.some((l) => l.route === 'local'),
    /**
     * Toplam burada yeniden kurulur, yoksa eski toplamdan türeyen olmayan bir indirim görünürdü; indirim tutarı sunucunun
     * son kararıdır ve yalnız taşınır.
     */
    totalCents: Math.max(0, subtotalCents - discountAmountOf(view.discount)),
    // Sayaç NİYETTEN sayılır, satırlardan değil: katalogdan yeni eklenen ürünün henüz çözülmüş
    // satırı yoktur ama sepette vardır — rozet onu beklemeden göstermeli.
    itemCount: entries.reduce((sum, e) => sum + e.qty, 0),
    hasBlocked: lines.some((l) => l.blocked),
    undeliverableSubtotalCents,
    minBasketOk: basket.ok,
    missingForMinBasketCents: basket.missingCents,
  };
}

/**
 * Siparişin kapsamı; taslak ve anlık görüntü aynı kümeyi kullanır ki müşteri gördüğü tutarı ödesin. İndirim payları
 * konum dizisidir ve satırla birlikte süzülür.
 */
export function orderScopeOf(
  view: Pick<CartView, 'lines' | 'discount'>,
  outOfRoute: boolean,
): { lines: CartLine[]; shares: number[]; subtotalCents: number; basketCents: number } {
  const all = discountSharesOf(view.discount);
  const kept = view.lines
    .map((line, index) => ({ line, share: all[index] ?? 0 }))
    .filter(({ line }) => !outOfRoute || line.shippable);
  const lines = kept.map((k) => k.line);
  const shares = kept.map((k) => k.share);
  /* İki tutar AYNI ŞEY DEĞİL: asgari sepet indirim ÖNCESİNİ ölçer (sepet okumasındaki `meets` de
     öyle), ödeme/kargo kapısı indirim SONRASINI ister. */
  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  return { lines, shares, subtotalCents, basketCents: subtotalCents - shares.reduce((sum, v) => sum + v, 0) };
}

/** İndirimin kalem payları — dört hâlin ikisinde dolu, ötekilerde boş. */
export function discountSharesOf(discount: CartDiscount): readonly number[] {
  if (discount.status === 'applied' || discount.status === 'automatic') return discount.lineShares;
  return discount.status === 'rejected' ? discount.appliedInsteadShares : [];
}

/**
 * Checkout retlerinin ölçüm karşılığı; iki yüzey aynı retleri sayar. `price_changed` engel değil, `date_unavailable`in
 * enum karşılığı yok, iç arızalar sürtünme değil hata olduğu için ölçülmez.
 */
export function checkoutBlockedAnalyticsReason(reason: string): AnalyticsBlockedReason | null {
  if (reason === 'blocked_lines') return 'not_shippable';
  if (reason === 'insufficient_here' || reason === 'insufficient_stock') return 'out_of_stock';
  // Ödeme oturumu açılamadı — enum'da KENDİ karşılığı var ve kapı onu adıyla veriyor.
  if (reason === 'payment_failed') return 'payment_failed';
  return null;
}
