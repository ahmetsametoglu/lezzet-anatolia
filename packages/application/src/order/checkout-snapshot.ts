import { AddressService, type Db } from '@lezzet/database';
import {
  resolveLocalizedText,
  type Address,
  type CheckoutShipping,
  type DeliveryType,
  type LocalizedText,
  type PaymentMethod,
  type PreferredLanguage,
  type Warehouse,
} from '@lezzet/types';
import { readPendingNeighborInvites } from '../customer/neighbor';
import { getCartView, type CartBundlePort } from '../cart/read';
import { laneEntriesOf, orderLaneOf, orderScopeOf, undeliverableLinesOf } from '../cart/cart-types';
import { cartFingerprint } from '../cart/fingerprint';
import type { CartDiscount, CartEntry, CartLine, DiscountReason } from '../cart/cart-types';
import { chooseShippingOption, homeShortlist, needsServicePoint } from '@lezzet/domain-core';
import { resolveCheckoutPayment } from './checkout-options';
import { optionForPricing, pricedOptions, shippingVatLines } from './shipping-selection';
import { quoteDataGap, quoteShipping } from '../shipping/quote';
import { notifyShippingDataMissing } from '../notification/staff-events';
import { sendcloudProvider, shippingProviderConfigured } from '../shipping/provider';
import type { ShippingRateProvider } from '../shipping/port';
import { readDeliveryInputs, resolveDelivery } from './delivery';
import { readPickupOffer } from './pickup-offer';

/**
 * Checkout ekranının adım verisi: adres, teslimat, sepet ve ödeme kapılarını belirli bir sırayla birleştirir. Web ve uygulama aynı
 * cevabı görmek zorunda olduğu için ekranda değil burada kurulur; kimlik ve sepet niyeti çağırandan gelir.
 */

/** Özetin tek satırı — dökümde ve kapsam dışı listede aynı şekil (`kind`: paket satırı ayrı yazılır). */
export interface CheckoutSummaryLine {
  kind: 'variant' | 'bundle';
  name: string;
  qty: number;
  lineTotalCents: number | null;
}

/** Ekranın bir adımda ihtiyacı olan her şey — tek turda, çünkü üçü birbirine bağlı. */
export interface CheckoutSnapshot {
  addresses: Address[];
  /** Seçili adrese göre çözülmüş teslimat; adres seçilmemişse null. */
  delivery: {
    /** Adresin cevabı (`route`/`shipping`) ya da müşterinin seçtiği gel-al (`pickup`); gel-al'da gün, davet ve engel boş. */
    deliveryType: DeliveryType;
    availableDates: string[];
    requiresDateChoice: boolean;
    /**
     * Komşu davetlerinin çağırdığı seferler; ekran cümleyi kurar ve günü önseçili getirir, yoksa davetli günü bulamaz ve davet işe
     * yaramaz. Günü `availableDates`te olmayan davet girmez; gün başına bir kayıt döner, aynı güne iki davet varsa son kabul edilen.
     */
    neighborInvites: { inviteId: string; inviterName: string; deliveryDate: string }[];
    /** Rota dışı + soğuk zincir: sipariş verilemez, sepet bölünmeli. */
    blocked: boolean;
    /** Adres bir teslimat bölgesinde mi; bölge içindeki kargo siparişinde kapı yolunun kapalı olma sebebi başkadır. */
    addressInRoute: boolean;
  } | null;
  /** Canlı kargo teklifi; sözleşmesi ve alanların anlamı `CheckoutShippingSchema`da. */
  shipping: CheckoutShipping | null;
  /** Ödeme seçenekleri, kargo ve toplam; adres seçilmemişse null. */
  payment: {
    methods: PaymentMethod[];
    creditAvailable: boolean;
    codBlockedReason: string | null;
    cashWarning: boolean;
    /** `null` = eşik altında ve taşıyıcı fiyat vermedi; sipariş açılmaz. */
    shippingFeeCents: number | null;
    shippingFreeReason: 'route' | 'threshold' | 'pickup' | null;
    orderTotalCents: number | null;
    minBasketOk: boolean;
    missingForMinBasketCents: number;
    /**
     * Eşiklerin dayandığı yer ("67000 Strasbourg"): asgari sepet seçili adresin bölgesinin ayarıdır, sepet ise çerezdeki koda göre
     * gösterdiği için sayı değişebilir. Yer cümlenin içinde durur ve tek kaynaktan, seçili adresten gelir.
     */
    placeLabel: string;
  } | null;
  /**
   * Ekranın çizeceği döküm (adres seçilmemişse `null`); döküm ve toplam aynı okumadan gelir ki ekran iki ayrı sepet anlatmasın.
   * `lines` taslağın tahsil edeceği kümedir, bu adrese gelemeyenler `excludedLines`ta üstü çizili gösterilsin diye taşınır.
   */
  summary: {
    lines: CheckoutSummaryLine[];
    /** İndirim ÖNCESİ ara toplam — asgari sepet eşiğinin ölçtüğü tutar (`orderScopeOf` künyesi). */
    subtotalCents: number;
    /**
     * Bu siparişe inen indirim (`null` yok); tutar kapsamdaki satırların payı kadardır, çünkü siparişe girmeyen kalemin indirimi
     * tahsil edilecek tutardan düşülemez. `label` `null`sa ekran sebebi yazar; kural istemcide (`discount-label`).
     */
    discount: { amountCents: number; label: string | null; reason: DiscountReason | null } | null;
    /**
     * Siparişe girmeyen, sepette bekleyen satırlar; ekran üstünü çizer. Satırların kendisi taşınır ki ekran adları yerel kopyasından
     * okumasın.
     */
    excludedLines: CheckoutSummaryLine[];
    /**
     * Özetin dayandığı sepetin içerik imzası: onay çağrısı bunu geri gönderir ve taslak farklı bir sepette `cart_changed` ile
     * reddeder, çünkü son okuma ile onay dokunuşu arasında hep bir aralık vardır.
     */
    fingerprint: string;
  } | null;
  /**
   * Gel-al teklifi: yalnız `pickup_allowed` müşteriye ve gel-al noktası olan tesisler için dolu, yoksa `null` ve kart çizilmez. Depo
   * adresi burada görünür, çünkü müşteri oraya gidecek; tanınmayan `selectedWarehouseId` düşer ve sunucu adresin cevabına döner.
   */
  pickup: {
    warehouses: { id: string; name: string; addressLine: string }[];
    selectedWarehouseId: string | null;
  } | null;
}

export interface CheckoutSnapshotInput {
  /**
   * Sunucuda çözülmüş müşteri kimliği, istemciden alınmaz; girişsiz ziyaretçide kapı hiç çağrılmaz.
   */
  customerId: string;
  entries: readonly CartEntry[];
  /** Seçili adres; `null` ise varsayılan, o da yoksa ilk adres kullanılır. */
  addressId: string | null;
  /**
   * Sepette girilen kupon; buraya taşınmazsa kalemler kuponlu, toplam ve siparişe yazılan tutar kuponsuz olur ve müşteri kuponu
   * kullanmış görünüp tam fiyat öder.
   */
  couponCode?: string | null;
  /**
   * Sepetin kargo grubundan açılan ikinci sipariş mi (`/checkout?group=shipping`); taslakla aynı açık bayrak. Geçmezse ekran adresin
   * cevabını gösterir, taslak kargo siparişi açar ve müşteri ekranda seçtiği yöntemle kasada reddedilir.
   */
  shippingOrder?: boolean;
  /**
   * Müşterinin seçtiği kargo servisi (`code`); tutar istemciden alınmaz, sunucudaki teklif listesinden okunur.
   */
  shippingOptionCode?: string | null;
  /** Kargo tarifesi sağlayıcısı — test sahte sağlayıcı geçirir, üretimde varsayılan kullanılır. */
  rateProvider?: ShippingRateProvider | null;
  /**
   * Gel-al seçimi: müşterinin malı alacağı depo. Taslakla AYNI alan, aynı gerekçe (`shippingOrder` gibi açık seçim,
   * türetilmez): ekran gel-al gösterirken taslak adresin cevabını açsaydı müşteri kasada reddedilirdi.
   */
  pickupWarehouseId?: string | null;
  /**
   * Paket çözümünün kapısı (`CartBundlePort`) — sepet okumasına olduğu gibi geçilir. Verilmezse
   * paket satırı ENGELLİ durur; sepette paket taşımayan yüzey bu kapıyı hiç geçmez.
   */
  bundles?: CartBundlePort;
}

/**
 * Adım verisini çözer. Adres seçilmeden de çağrılır (liste gelsin diye) — o zaman teslimat ve
 * ödeme null döner, çünkü ikisi de adresin cevabıdır ve adres yokken uydurulamaz.
 */
export async function readCheckoutSnapshot(
  db: Db,
  locale: PreferredLanguage,
  input: CheckoutSnapshotInput,
): Promise<CheckoutSnapshot> {
  const addresses = await new AddressService(db).listByCustomer(input.customerId);
  const selected = addresses.find((a) => a.id === input.addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  // Gel-al teklifi adresten bağımsız okunur: kart adres seçilmeden de görünsün ki müşteri yolu bilsin; ama teslimat
  // ve ödeme yine adresi bekler — gel-al'da da adres fatura adresi olarak siparişe yazılır.
  const pickup = await readPickupOffer(db, input.customerId, input.pickupWarehouseId ?? null);
  if (!selected) return { addresses, delivery: null, shipping: null, payment: null, summary: null, pickup: pickup.offer };
  if (pickup.warehouse) return pickupSnapshot(db, locale, input, { addresses, offer: pickup.offer, warehouse: pickup.warehouse });

  // Yer seçilen adresten çözülür, çerezden değil: eşik, tarife ve bölge müşterinin gönderdiği adresin değeridir. Teslimat iki kez
  // çözülür (önce depo, sepet bilinince kargo kararı) ve taslak aynı deseni koşar ki ekranla kasa aynı hesaptan çıksın.
  const deliveryInputs = await readDeliveryInputs(db);
  const place = await resolveDelivery(db, {
    postalCode: selected.postalCode,
    country: selected.country,
    inputs: deliveryInputs,
  });
  const readOptions = {
    customerId: input.customerId,
    couponCode: input.couponCode,
    /* Bu alan bu siparişin çıkacağı depoyu söyler, sepet ucundaki "yalnız rota deposu" anlamı burada geçerli değil; fiyat ve teklif
       de bu depodan okunur, rota dışı adreste kargo deposu gelmesi bu yüzden doğrudur. */
    warehouseId: place.warehouseId,
    shippingWarehouseId: place.shippingWarehouseId,
    country: selected.country,
    // Kargo siparişi bir BÖLGEYE ait değildir (taslakla aynı kural): rota bölgesi yalnız araçla
    // gidilen teslimatın kaydıdır, kargoda bölge eşiği uygulanmaz.
    zoneId: input.shippingOrder ? null : place.zoneId,
    bundles: input.bundles,
  };
  const fullCart = await getCartView(db, locale, input.entries, readOptions);
  /* Taslakla aynı daraltma: sipariş yalnız kendi grubunu alır ve indirim daraltılmış kalemlerle yeniden çözülür. Bütün sepetin
     indirim payını süzmek, taslağın keseceğinden farklı bir indirim gösterirdi. */
  const addressOutOfRoute = place.deliveryType === 'shipping';
  const laneEntries = laneEntriesOf(fullCart, input.entries, orderLaneOf(Boolean(input.shippingOrder), addressOutOfRoute), addressOutOfRoute);
  const cart =
    laneEntries.length > 0 && laneEntries.length < input.entries.length
      ? await getCartView(db, locale, laneEntries, readOptions)
      : fullCart;
  /* Ekran taslağın tahsil edeceği kümeyi gösterir: bu adrese hiç gelemeyen kalemler siparişin dışında kalıp sepette bekler. Tamamı
     okunsaydı genel toplam gelemeyen kalemi içerir ve asgari sepet sipariş edilemeyecek bir kalemle geçilmiş görünürdü. */
  const scope = orderScopeOf(cart, !input.shippingOrder && place.deliveryType === 'shipping');

  // İkinci tur: kargo kararı ancak sepet bilinince verilebilir (soğuk zincir kalemi var mı).
  const delivery = await resolveDelivery(db, {
    postalCode: selected.postalCode,
    country: selected.country,
    // Kapsam DIŞINDA kalan kalem kargo kararını da etkilememeli: siparişe girmeyen bir soğuk
    // zincir kalemi yüzünden kargo yolunu kapatmak, olmayan bir kısıtı uygulamaktır.
    hasNonShippableItem: scope.lines.some((l) => !l.shippable),
    inputs: deliveryInputs,
  });

  // Kargo siparişinde tür adresin cevabını ezer ve gün sorulmaz, çünkü tarih taşıyıcıya bağlıdır; ezme tek yönlüdür.
  const deliveryType = input.shippingOrder ? ('shipping' as const) : delivery.deliveryType;

  /* Canlı kargo teklifi yalnız kargo kulvarında sorulur; sağlayıcı yapılandırılmamışsa ağa hiç çıkılmaz. Teklif yoksa ücret de yoktur:
     eşik altında toplam `null` döner ve ekran siparişi durdurur. */
  const rateProvider = input.rateProvider ?? (shippingProviderConfigured() ? sendcloudProvider() : null);
  // Kargo çıkış deposu, rota deposu değil; depo çözülemediyse teklif sorulmaz, çünkü uydurma bir depodan sorulan fiyat yanlış olur.
  const quoteWarehouseId = place.shippingWarehouseId ?? place.warehouseId;
  const shipping =
    deliveryType === 'shipping' && rateProvider && quoteWarehouseId
      ? await quoteShipping(db, rateProvider, {
          warehouseId: quoteWarehouseId,
          to: { countryCode: selected.country, postalCode: selected.postalCode, city: selected.city ?? undefined },
          items: scope.lines.flatMap((l) => (l.variantId ? [{ variantId: l.variantId, qty: l.qty }] : [])),
        })
      : null;
  // Verimizin eksiği teklifi durdurur; operasyon hangi ürün ya da depo olduğunu zilden öğrenir.
  const dataGap = quoteDataGap(shipping);
  if (dataGap && quoteWarehouseId) await notifyShippingDataMissing(db, { ...dataGap, warehouseId: quoteWarehouseId });

  // Fiyat sunucudan okunur, istemci yalnız kodu söyler; ön seçim de burada yapılır ki liste ile ücret aynı hesaptan çıksın.
  const vatLines = shippingVatLines(scope.lines);
  const quoted = shipping?.status === 'ok' ? pricedOptions(shipping.options, vatLines) : [];
  const priced = optionForPricing(quoted, input.shippingOptionCode ?? null);

  const options = await resolveCheckoutPayment(db, {
    customerId: input.customerId,
    deliveryType,
    quotedFeeCents: priced?.priceCents ?? null,
    basketCents: scope.basketCents,
    // Asgari sepet indirim öncesini ister; `basketCents` kargo ve toplam içindir.
    subtotalCents: scope.subtotalCents,
    // Oran satırın kendi gerçeğinden gelir (paketse kalemlerin en yükseği) — sabit yazmak
    // malzeme gibi %20'lik kalemlerde kargo KDV'sini yanlış bölerdi.
    lines: vatLines,
    /* Ayar kapsamının üç ekseni sepet okumasıyla aynı ifadelerle geçer, yoksa kalem bloğu kapsamlı eşiği, ödeme bloğu global eşiği
       gösterirdi. */
    country: selected.country,
    zoneId: input.shippingOrder ? null : place.zoneId,
    warehouseId: place.warehouseId,
  });

  const free = options.shippingFreeReason === 'threshold';
  const finalChoice = free ? chooseShippingOption(quoted, { free: true, requestedCode: null }) : null;
  const chosen = free ? (finalChoice?.ok ? finalChoice.option : null) : priced;

  // Komşu daveti kişiye yazılı kabulden okunur, çerezden değil; kargo siparişinde sefer olmadığı için sorulmaz.
  /* Bütün davetler döner: müşteriyi birden çok komşusu farklı günlere çağırmış olabilir ve gün seçici her günün davetini söylemeli. */
  const pendingInvites = input.shippingOrder ? [] : await readPendingNeighborInvites(db, input.customerId);
  const matchingInvites = pendingInvites.filter(
    (invite) => invite.deliveryZoneId === place.zoneId && delivery.availableDates.includes(invite.deliveryDate),
  );

  return {
    addresses,
    delivery: {
      deliveryType,
      availableDates: input.shippingOrder ? [] : delivery.availableDates,
      requiresDateChoice: input.shippingOrder ? false : delivery.requiresDateChoice,
      neighborInvites: matchingInvites.map((invite) => ({
        inviteId: invite.inviteId,
        inviterName: invite.inviterName,
        deliveryDate: invite.deliveryDate,
      })),
      // Kargo siparişi soğuk zincir kalemi TAŞIYAMAZ — adres rota içinde olsa bile. Taslak
      // bunu ayrıca reddediyor (`cold_chain_unshippable`); ekran aynı gerçeği önce söyler.
      blocked: input.shippingOrder ? scope.lines.some((l) => !l.shippable) : delivery.shippingBlockedReason === 'cold_chain',
      addressInRoute: !addressOutOfRoute,
    },
    // Kargo bloğu yalnız kargo kulvarında dolu; `off` = teklif sorulmadı (sağlayıcı ya da çıkış deposu yok).
    shipping:
      shipping === null
        ? deliveryType === 'shipping'
          ? {
              status: 'off' as const,
              options: [],
              parcelCount: 0,
              selectedCode: null,
              mode: free ? ('auto' as const) : ('customer' as const),
              unshippable: [],
            }
          : null
        : {
            status: shipping.status,
            // Ad kapsamın satırlarından: teklif varyant kimliği söyler, müşteri ürünün adını tanır.
            unshippable: scope.lines.flatMap((l) => (l.variantId && dataGap?.variantIds.includes(l.variantId) ? [l.name] : [])),
            options:
              shipping.status === 'ok'
                ? // Eve teslimde en ucuz ve en hızlı, noktaya teslimde hepsi (harita taşıyıcı başına fiyatı bunlardan okur).
                  [...homeShortlist(quoted), ...quoted.filter((o) => needsServicePoint(o.lastMile))].map((o) => ({
                    code: o.code,
                    carrierCode: o.carrierCode,
                    carrierName: o.carrierName,
                    name: o.name,
                    priceCents: o.priceCents,
                    leadTimeHours: o.leadTimeHours,
                    lastMile: o.lastMile,
                    needsServicePoint: needsServicePoint(o.lastMile),
                    tracked: o.tracked,
                  }))
                : [],
            parcelCount: shipping.status === 'ok' ? shipping.parcelCount : 0,
            selectedCode: chosen?.code ?? null,
            // Eşik geçildiyse ücret sıfır ve koli eve gider: seçimin tutara etkisi yok, o yüzden sorulmuyor.
            mode: free ? ('auto' as const) : ('customer' as const),
          },
    // Eşiği belirleyen yer seçili adrestir; bölge adı değil posta kodu ve şehir yazılır, çünkü müşteri bölgemizin adını değil adresini bilir.
    payment: paymentSlice(options, `${selected.postalCode} ${selected.city}`),
    /* Döküm ve toplam aynı okumadan: `scope` yukarıda çözüldü, ekran kendi kopyasından çizmesin diye küme de döner. */
    summary: summarySlice(cart, scope, input.entries, locale, undeliverableLinesOf(fullCart, addressOutOfRoute)),
    pickup: pickup.offer,
  };
}

/**
 * Gel-al anlık görüntüsü: sepet seçilen deponun stoğuyla okunur ve bölünmez, depoda olmayan kalemi taslak reddeder. Ödeme rotanın
 * kurallarından çıkar; gün, davet ve kargo teklifi yoktur.
 */
async function pickupSnapshot(
  db: Db,
  locale: PreferredLanguage,
  input: CheckoutSnapshotInput,
  ctx: { addresses: Address[]; offer: CheckoutSnapshot['pickup']; warehouse: Warehouse },
): Promise<CheckoutSnapshot> {
  const cart = await getCartView(db, locale, input.entries, {
    customerId: input.customerId,
    couponCode: input.couponCode,
    warehouseId: ctx.warehouse.id,
    shippingWarehouseId: null,
    country: ctx.warehouse.countryCode,
    zoneId: null,
    pickup: true,
    bundles: input.bundles,
  });
  const scope = orderScopeOf(cart, false);
  const options = await resolveCheckoutPayment(db, {
    customerId: input.customerId,
    deliveryType: 'pickup',
    quotedFeeCents: null,
    basketCents: scope.basketCents,
    subtotalCents: scope.subtotalCents,
    lines: scope.lines.map((l) => ({ totalCents: l.lineTotalCents ?? 0, vatRate: l.vatRate })),
    country: ctx.warehouse.countryCode,
    zoneId: null,
    warehouseId: ctx.warehouse.id,
  });
  return {
    addresses: ctx.addresses,
    delivery: {
      deliveryType: 'pickup',
      availableDates: [],
      requiresDateChoice: false,
      neighborInvites: [],
      blocked: false,
      addressInRoute: false,
    },
    shipping: null,
    payment: paymentSlice(options, ctx.warehouse.name),
    summary: summarySlice(cart, scope, input.entries, locale),
    pickup: ctx.offer,
  };
}

/** Ödeme dilimi — iki yol (adres, gel-al) aynı motor cevabını aynı şekle döker; `placeLabel` eşiğin dayandığı yerdir. */
function paymentSlice(
  options: Awaited<ReturnType<typeof resolveCheckoutPayment>>,
  placeLabel: string,
): NonNullable<CheckoutSnapshot['payment']> {
  return {
    methods: options.methods,
    creditAvailable: options.creditAvailable,
    codBlockedReason: options.codBlockedReason,
    cashWarning: options.cashWarning,
    shippingFeeCents: options.shippingFeeCents,
    shippingFreeReason: options.shippingFreeReason,
    orderTotalCents: options.orderTotalCents,
    minBasketOk: options.minBasketOk,
    missingForMinBasketCents: options.missingForMinBasketCents,
    placeLabel,
  };
}

/** Özet dilimi — döküm ve toplam aynı okumadan (alan künyesi); kapsam dışı satırlar nesne kimliğiyle ayrılır. */
function summarySlice(
  cart: Awaited<ReturnType<typeof getCartView>>,
  scope: ReturnType<typeof orderScopeOf>,
  entries: readonly CartEntry[],
  locale: PreferredLanguage,
  /** Sepette bekleyen, bu adrese gelemeyen satırlar; verilmezse okumanın kapsam dışı satırları. Öteki grubun kalemi buraya girmez. */
  excluded?: readonly CartLine[],
): NonNullable<CheckoutSnapshot['summary']> {
  return {
    lines: scope.lines.map(summaryLineOf),
    subtotalCents: scope.subtotalCents,
    // Kapsamın payı kadar — sepetin toplam indirimi değil (alan künyesi).
    discount: discountOf(cart.discount, scope.subtotalCents - scope.basketCents, locale),
    excludedLines: (excluded ?? cart.lines.filter((l) => !scope.lines.includes(l))).map(summaryLineOf),
    fingerprint: cartFingerprint(entries),
  };
}

/** Sepet satırı → özet satırı. Tek yerde, çünkü döküm ve kapsam dışı liste aynı şekli taşıyor. */
function summaryLineOf(line: CartLine): CheckoutSummaryLine {
  return { kind: line.kind, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents };
}

/**
 * Sepet indiriminin özet karşılığı: tutar kapsamdan, ad çok dilli alandan. `rejected` hâli de indirim taşır, çünkü kupon tutmasa da
 * sepete inen kampanya yerinde durur; tutarı yine kapsamdan okunur.
 */
function discountOf(
  discount: CartDiscount,
  scopedCents: number,
  locale: PreferredLanguage,
): { amountCents: number; label: string | null; reason: DiscountReason | null } | null {
  if (scopedCents <= 0) return null;
  const label = (text: LocalizedText | null): string | null => (text === null ? null : resolveLocalizedText(text, locale));
  switch (discount.status) {
    /* Adı yoksa kod yazılır, sepetin aynı kuralı; alan "müşterinin okuduğu künye" olduğu için kod ayrı bir alana konmaz. */
    case 'applied':
      return { amountCents: scopedCents, label: label(discount.label) ?? discount.code, reason: null };
    case 'automatic':
      return { amountCents: scopedCents, label: label(discount.label), reason: discount.reason };
    case 'rejected':
      return discount.appliedInstead === null
        ? { amountCents: scopedCents, label: null, reason: null }
        : { amountCents: scopedCents, label: label(discount.appliedInstead.label), reason: discount.appliedInstead.reason };
    default:
      return null;
  }
}
