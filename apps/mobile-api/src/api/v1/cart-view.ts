import { Hono } from 'hono';
import type { Context } from 'hono';
import type { z } from 'zod';
import {
  type CartDiscount,
  type CartEntry,
  type CartLine,
  type CartView,
  getCartView,
  getPackagesByIds,
  type PlaceWarehouses,
  resolvedOrNull,
  shippingGroupFee,
} from '@lezzet/application';
import { serviceDb, type Db } from '@lezzet/database';
import {
  CartViewBodySchema,
  MeCartViewSchema,
  PreferredLanguageEnum,
  type LocalizedText,
  type MeCartView,
  type PreferredLanguage,
} from '@lezzet/types';
import { readJsonBody } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import { readPlaceOrPickup } from './catalog';

/*
  Sepetin çözülmüş görünümü: aynı sepet web ve telefonda aynı tutarı göstermek zorunda, hesabın sahibi `getCartView`.
  Burada yalnız istek kapının girdisine çevrilir ve görünüm sözleşme şekline indirgenir; misafir ucu Bearer'sız, niyet gövdeden.
*/

/**
 * `?locale=` zorunlu ve varsayılansız, yoksa Fransız müşteriye sessizce Türkçe ad giderdi. Sepet ailesinin tek okuması budur.
 */
export function localeOf(c: Context): ReturnType<typeof PreferredLanguageEnum.safeParse> {
  return PreferredLanguageEnum.safeParse(c.req.query('locale'));
}

/**
 * Görünümün tek kuyruğu, girişli ve misafir sepeti buradan geçer; paket kapısı web'inkiyle aynıdır (`getPackagesByIds`).
 * Ülke ve bölge kapıya geçilmez, çünkü posta kodundan türetmek yer çözümünü ikinci kez yazmak olurdu.
 */
export async function readCartView(
  db: Db,
  locale: PreferredLanguage,
  entries: readonly CartEntry[],
  opts: {
    customerId: string | null;
    /** Zam bildiriminin ÇIPASI (`storedPrices`) — misafirde yoktur, niyet listesi bilerek fiyatsız. */
    previousPrices?: ReadonlyMap<string, number>;
    couponCode: string | null;
    /** Ham posta kodu; depoya çeviren `readPlace` — istemcinin yazdığı bir depo kimliği KABUL EDİLMEZ. */
    postalCode: string | undefined;
    /**
     * Gel-al seçimi (adres seçicideki depo kartı). Kimlik olduğu gibi yazılmaz: teklif kapısından geçer
     * (`readPickupOffer` — müşteri izni × gel-al deposu); geçemeyen seçim yok sayılır ve sepet posta koduyla okunur.
     */
    pickupWarehouseId?: string | undefined;
  },
): Promise<CartRead> {
  // Gel-al'da sepet SEÇİLEN DEPONUN stoğuyla okunur ve kargo dolgusu yoktur: depoda olmayan kalem "burada yok"tur.
  const { place, pickup } = await readPlaceOrPickup(db, {
    postalCode: opts.postalCode,
    pickupWarehouseId: opts.pickupWarehouseId,
    customerId: opts.customerId,
  });
  const view = await getCartView(db, locale, entries, {
    customerId: opts.customerId,
    previousPrices: opts.previousPrices,
    couponCode: opts.couponCode,
    warehouseId: place.warehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
    ...(pickup ? { country: pickup.countryCode, zoneId: null, pickup: true } : {}),
    // `db` bağlanır, başka hiçbir şey yapılmaz: port imzası (`CartBundlePort`) ile kapının imzası
    // `db` dışında birebir tutuyor ve dönüş şekli `CartBundleSource`un yapısal ikizi. Araya bir
    // eşleme yazmak, sepetin gördüğü paketi vitrinin gösterdiğinden ayırma riski demekti.
    bundles: (bundleIds, bundleLocale, bundlePlace) => getPackagesByIds(db, bundleIds, bundleLocale, bundlePlace),
  });
  // `parse` süzgeçtir: sunucuda kalan alanlar zarfa sızamaz. Kapının kendi görünümü ve yer de döner, çünkü ölçüm ikisini ister.
  return { body: MeCartViewSchema.parse(toViewBody(view, locale)), source: view, place };
}

/**
 * Sepet okumasının TAM çıktısı: tele giden gövde + kapının kendi görünümü + çözülmüş yer.
 *
 * `body` dışındakiler SUNUCUDA KALIR — zarfa girmezler (`MeCartViewSchema.parse` zaten süzüyor);
 * çağıran onları yalnız ölçüm ve karar için kullanır.
 */
export interface CartRead {
  body: MeCartView;
  source: CartView;
  place: PlaceWarehouses;
}

/** Kapının görünümü → sözleşme şekli. `z.input` KİLİTTİR: kapı saparsa burası DERLENMEZ. */
function toViewBody(view: CartView, locale: PreferredLanguage): z.input<typeof MeCartViewSchema> {
  const fee = shippingGroupFee(view);
  return {
    lines: view.lines.map(toLineBody),
    subtotalCents: view.subtotalCents,
    discount: toDiscountBody(view.discount, locale),
    /* Elinin altındaki indirim — ad burada çözülür (sözleşme tek dize taşır, istemci üç dilli
       nesneyi hiç görmez; `labelOf` künyesi). Alan `null` ise ekran susar. */
    reachableDiscount:
      view.reachableDiscount === null
        ? null
        : { ...view.reachableDiscount, label: labelOf(view.reachableDiscount.label, locale) },
    totalCents: view.totalCents,
    itemCount: view.itemCount,
    /* Motorun girdisi: yalnız kendiliğinden inen kampanyalar ve kodsuz, çünkü kupon kodu göndermek geçerli kod listesi vermektir. */
    discountRules: view.discountRules
      .filter((rule) => rule.trigger === 'automatic')
      .map((rule) => ({
        id: rule.id,
        type: rule.type,
        percent: rule.percent ?? null,
        amountCents: rule.amountCents ?? null,
        scope: rule.scope,
        categoryId: rule.categoryId ?? null,
        collectionId: rule.collectionId ?? null,
        minBasketCents: rule.minBasketCents ?? null,
      })),
    isFirstOrder: view.discountContext.isFirstOrder,
    hasBlocked: view.hasBlocked,
    // Asgari sepete sayılmayan tutar; kapı zaten düştü, burada yalnız taşınır.
    undeliverableSubtotalCents: view.undeliverableSubtotalCents,
    minBasketOk: view.minBasketOk,
    missingForMinBasketCents: view.missingForMinBasketCents,
    minBasketCents: view.minBasketCents,
    freeShippingCents: view.freeShippingCents,
    shippingSubtotalCents: view.shippingSubtotalCents,
    shippingTariffCents: view.shippingTariffCents,
    shippingOnly: view.shippingOnly,
    /* Kargo grubunun çözülmüş ücreti motordan (`shippingGroupFee`); istemci eşiği kendi karşılaştırsa kural iki yerde yaşardı. */
    shippingGroupFeeCents: fee.feeCents,
    shippingFreeRemainingCents: fee.remainingForFreeCents,
    localOrderDiscountCents: view.localOrderDiscountCents,
  };
}

/**
 * Satır, iki tür; `vatRate` ve `shippable` düşer, ilki checkout'un işi, ikincisinin kararı `route`ta.
 */
function toLineBody(line: CartLine): z.input<typeof MeCartViewSchema>['lines'][number] {
  const view = {
    slug: line.slug,
    name: line.name,
    image: line.image,
    unitLabel: line.unitLabel,
    unitPriceCents: line.unitPriceCents,
    wasCents: line.wasCents,
    limitCap: line.limitCap,
    priceChange: line.priceChange,
    lineTotalCents: line.lineTotalCents,
    blocked: line.blocked,
    route: line.route,
    // Grup kapıdan gelir, `route`tan türetilmez; kural `cartGroupOf`ta.
    group: line.group,
    availableHere: line.availableHere,
    contents: line.contents,
  };
  return line.kind === 'bundle'
    ? { kind: 'bundle', bundleId: line.bundleId, qty: line.qty, ...view }
    : {
        kind: 'variant',
        variantId: line.variantId,
        stockId: line.stockId,
        qty: line.qty,
        // Kapsam üyeliği YALNIZ varyant satırında: paket kalemleri matraha girmiyor (DOMAIN §13).
        categoryId: line.categoryId,
        collectionIds: [...line.collectionIds],
        specialPrice: line.specialPrice,
        ...view,
      };
}

/**
 * İndirim — dört hâl aynen taşınır, iki şey değişir: kampanyanın adı SUNUCUDA çözülür (çok dilli
 * metin `resolveLocalizedText`ten geçer, katalog sözleşmesinin aynı kuralı) ve kalem payları
 * (`lineShares`/`discountId`) düşer — onlar sipariş yazımının bilgisidir, ekranın değil.
 *
 * `source`/`codeId` de düşüyor: kuponun hangi kapıdan girildiği kota kaydının izidir, müşteriye
 * söylenecek bir şey değil.
 */
function toDiscountBody(discount: CartDiscount, locale: PreferredLanguage): z.input<typeof MeCartViewSchema>['discount'] {
  switch (discount.status) {
    case 'applied':
      return { status: 'applied', code: discount.code, amountCents: discount.amountCents, label: labelOf(discount.label, locale) };
    case 'automatic':
      return { status: 'automatic', amountCents: discount.amountCents, label: labelOf(discount.label, locale), reason: discount.reason };
    case 'rejected':
      return {
        status: 'rejected',
        code: discount.code,
        reason: discount.reason,
        // Kupon tutmasa da sepete inen indirim kimliğiyle taşınır ki özet satırı adını kaybetmesin.
        appliedInsteadCents: discount.appliedInsteadCents,
        appliedInstead: discount.appliedInstead
          ? { label: labelOf(discount.appliedInstead.label, locale), reason: discount.appliedInstead.reason }
          : null,
      };
    default:
      return { status: 'none' };
  }
}

/** Kampanyanın müşteriye görünen adı; adı yoksa `null` — ekran o hâlde kodu ya da sebebi yazar. */
function labelOf(label: LocalizedText | null, locale: PreferredLanguage): string | null {
  return resolvedOrNull(label, locale);
}

/**
 * Misafirin görünüm ucu (`POST /cart/view`), Bearer'sız ve `bearerAuth`ın önünde. Gövde yalnız satırın adresini ve adedini
 * taşır, fiyat gelmez; `previousPrices` geçilmez, çünkü misafirin çıpası olamaz.
 */
export const cartView = new Hono();

cartView.post('/view', async (c) => {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const body = CartViewBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const read = await readCartView(serviceDb(), locale.data, body.data.items.map(entryOfWrite), {
    customerId: null,
    couponCode: body.data.couponCode,
    postalCode: c.req.query('postalCode'),
  });
  /* YALNIZ `body` tele gider. `CartRead` künyesinin dediği gibi `source` ve `place` SUNUCUDA
     KALIR — `ok()` gevşek tiplidir ve tamamını göndermek derlemede HATA VERMEZDİ. */
  return ok(c, read.body);
});

/**
 * Gövde satırından niyete, sepet ailesinin tek eşlemesi; tür şemanın `kind`ından daraltılır.
 */
export function entryOfWrite(item: z.infer<typeof CartViewBodySchema>['items'][number]): CartEntry {
  return item.kind === 'bundle'
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: item.stockId };
}
