import {
  AddressService,
  BundleItemService,
  CartService,
  ConversationService,
  OrderService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import { cityMatchesPlaces } from '@lezzet/address';
import {
  chooseShippingOption,
  costsAtSale,
  deriveChannel,
  meetsMinBasket,
  needsServicePoint,
  resolveVatTreatment,
  servicePointAccepts,
} from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type {
  DeliveryType,
  OrderItemInsert,
  OrderSource,
  ParcelPlanSnapshot,
  PaymentMethod,
  PreferredLanguage,
  ServicePointSnapshot,
} from '@lezzet/types';
import { getCartView, type CartBundlePort } from '../cart/read';
import { matchNeighborInviteForOrder } from '../customer/neighbor';
import { placesForPostalCode } from '../delivery/places';
import { cartFingerprint } from '../cart/fingerprint';
import {
  discountAmountOf,
  discountIdOf,
  discountLabelOf,
  entryOf,
  itemOfEntry,
  laneEntriesOf,
  orderLaneOf,
  orderScopeOf,
  storedPrices,
  type CartEntry,
  type CartLine,
} from '../cart/cart-types';
import { resolveCheckoutPayment } from './checkout-options';
import { readDeliveryInputs, resolveDelivery } from './delivery';
import { readUnitCosts } from './unit-costs';
import { optionForPricing, parcelPlanSnapshot, pricedOptions, servicePointSnapshot, shippingVatLines } from './shipping-selection';
import { quoteShipping } from '../shipping/quote';
import { sendcloudProvider, shippingProviderConfigured } from '../shipping/provider';
import type { ShippingRateProvider } from '../shipping/port';

/*
  Bağlayıcı fiyat burada sabitlenir: sepet sunucuda yeniden okunur ve istemciden yalnız seçimler (adres, gün, ödeme yöntemi) alınır,
  tutar hiç alınmaz. Her seçim yeniden doğrulanır, çünkü ekran açıkken bölge kapanmış, tavan değişmiş ya da ürün tükenmiş olabilir.
*/

export type CheckoutDraftOutcome =
  // Adresin cevabı ya da müşterinin seçtiği gel-al: üç tür de bu kapıdan doğar (yerinde satış hâlâ kendi kapısında).
  | { status: 'ok'; orderId: string; totalCents: number; deliveryType: DeliveryType }
  /**
   * `ambiguous_zone` veri hatası, `no_shipping_warehouse` yapılandırma eksiğidir; ikisi de müşteriye "bölge dışısınız"
   * dedirtmemeli.
   */
  | { status: 'warehouse_unresolved'; reason: 'ambiguous_zone' | 'no_shipping_warehouse' }
  | { status: 'empty_cart' }
  /** Tükenmiş ya da satışa kapanmış satır; çıkarılmadan sipariş açılmaz. */
  | { status: 'blocked_lines'; lines: string[] }
  /**
   * `blocked_lines`ten ayrı, çünkü burada kalemin azı alınabilir. Adet sessizce düşürülmez; müşteri sepet satırında tek tıkla
   * düzeltir.
   */
  | { status: 'insufficient_here'; lines: { name: string; available: number }[] }
  | { status: 'min_basket'; missingCents: number }
  | { status: 'address_not_found' }
  /**
   * Rota siparişinde adresin şehri posta kodunun yerleşimlerinden biri değilse kurye kapıya gidemez. Sipariş sessizce kargoya
   * çevrilmez, çünkü tür değişimi ücreti ve ödeme yöntemlerini de değiştirir; `places` ekranın doğrusunu söyleyebilmesi için taşınır.
   */
  | { status: 'address_city_mismatch'; postalCode: string; city: string; places: string[] }
  /** Rota dışı adreste soğuk zincir kalemi ne kapıya ne kargoya gider. */
  | { status: 'cold_chain_unshippable' }
  | { status: 'date_unavailable'; availableDates: string[] }
  | { status: 'payment_not_allowed'; methods: PaymentMethod[] }
  /**
   * Zam müşterinin onayını ister, indirim sessiz uygulanır. Fiyatın bağlayıcı olduğu anda da sorulur; sorulmasaydı teklif partisi
   * tükenince sipariş tam fiyattan sessizce açılırdı.
   */
  | { status: 'price_changed'; lines: { name: string; fromCents: number; toCents: number }[] }
  /** Yük taşımaz: söylenecek şey ekranın kendisidir, özet yeniden okununca yeni liste görünür. */
  | { status: 'cart_changed' }
  | { status: 'customer_not_found' }
  /** Seçilen kargo servisi bu sepette yok ya da seçim bize kalmışken eve giden servis yok; ekran listeyi yeniden okur. */
  | { status: 'shipping_option_unavailable' }
  /** Servis teslim noktası istiyor ama nokta yok, kapalı ya da başka taşıyıcının. */
  | { status: 'service_point_invalid' }
  /** Gel-al istendi ama müşterinin izni yok — ekran kartı göstermemişti, istek elle kurulmuştur. */
  | { status: 'pickup_not_allowed' }
  /** Seçilen depo gel-al noktası değil, pasif, araç ya da yok. */
  | { status: 'pickup_warehouse_unavailable' };

export interface CheckoutDraftInput {
  locale: PreferredLanguage;
  /** Sunucuda çözülür (oturum ya da OTP sonrası çerez), istemciden asla alınmaz. */
  customerId: string;
  entries: readonly CartEntry[];
  addressId: string;
  /**
   * Taslağı personel açıyorsa dolu. Ayrı bir akış yazılmadı: telefonla gelen sipariş de aynı KDV, depo, stok ve indirim
   * kurallarına tabi.
   */
  staff?: {
    /** Pazarlık izinin "kim" tarafı. */
    actorId: string;
    /** Pazarlıklı birim fiyat (`variantId` → cent); verilmeyen kalem liste fiyatından gider. */
    priceOverrides?: ReadonlyMap<string, number>;
    /** Patron ikramı: operasyon ve iç muhasebe normal, yalnız muhasebe dışa aktarımına girmez. */
    isGiftOrder?: boolean;
    /** Varsayılan `manual`; sohbetten açılan sipariş kendi kanalını geçirir, çünkü kanal ile kaynak ayrı eksenlerdir. */
    orderSource?: OrderSource;
  };
  /** Kargoda `null`: tarih taşıyıcıya bağlıdır, söz verilmez. */
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  /** Vadeli ("hesaba") satın alma: ödeme yöntemi değil, siparişin bayrağı. */
  onAccount?: boolean;
  couponCode?: string | null;
  /** Çift sipariş kalkanı: istemcinin o deneme için ürettiği anahtar. */
  idempotencyKey?: string | null;
  /** Sunucunun ekrana verdiği imzanın yankısı; istemci hesaplamaz. Boşsa kontrol atlanır. */
  expectedCartFingerprint?: string | null;
  /**
   * Sepetin kargo grubundan açılan ikinci sipariş: depo kargo deposudur, tür `shipping`, gün seçilmez. Açık bir seçimdir, türetilmez,
   * çünkü stok arada değişirse türetilen tür sessizce değişirdi.
   */
  shippingOrder?: boolean;
  /** Müşterinin seçtiği kargo servisi; seçmediyse ya da kargo ücretsizse eve giden en ucuz alınır. */
  shippingOptionCode?: string | null;
  /** Servis teslim noktası istiyorsa seçilen nokta; sağlayıcıdan yeniden okunur, istemcinin söylediği adres alınmaz. */
  servicePointId?: string | null;
  /** Testte sahte sağlayıcı; verilmezse ortamın Sendcloud'u, o da yoksa teklifsiz (sabit tarife). */
  rateProvider?: ShippingRateProvider | null;
  /**
   * Gel-al: müşterinin malı alacağı depo; doluysa tür `pickup`, bölge ve gün yok, adres fatura adresi olarak yazılır. Açık seçimdir
   * (`shippingOrder` gibi), çünkü anlık görüntü gel-al gösterirken taslak adresin cevabını açamaz.
   */
  pickupWarehouseId?: string | null;
  /** Verilmezse paket satırı engelli durur; paket taşımayan yüzey bu kapıyı geçmez. */
  bundles?: CartBundlePort;
  /**
   * Kampanya künyesi çerezde durduğu için port; beklenmez, çünkü ölçüm siparişin açılmasını geciktirmemeli. Geçen taraf kendi
   * hatasını yutar.
   */
  onCustomerAcquired?: (customerId: string) => void;
}

export async function createCheckoutDraft(db: Db, input: CheckoutDraftInput): Promise<CheckoutDraftOutcome> {
  const customer = await new UserProfileService(db).getById(input.customerId);
  if (!customer) return { status: 'customer_not_found' };

  // Adres müşterinin kendi adresleri arasından aranır, çünkü `addressId` istemciden geliyor.
  const address = (await new AddressService(db).listByCustomer(customer.id)).find((a) => a.id === input.addressId);
  if (!address) return { status: 'address_not_found' };

  // Gel-al: izin ve depo SUNUCUDA sorulur — ekran kartı göstermemiş olsa da istek elle kurulabilir.
  const pickupWarehouse = input.pickupWarehouseId ? await pickupWarehouseOf(db, input.pickupWarehouseId) : null;
  if (input.pickupWarehouseId) {
    if (!customer.pickupAllowed) return { status: 'pickup_not_allowed' };
    if (!pickupWarehouse) return { status: 'pickup_warehouse_unavailable' };
  }
  // Malın teslim edildiği ülke: adresinki, gel-al'da deponunki — KDV oraya bağlıdır (DOMAIN §5); Almanya adresli müşteri
  // Strasbourg'dan alıyorsa mal Fransa'da teslim edilmiştir.
  const deliveryCountry = pickupWarehouse?.countryCode ?? address.country;

  // KDV ülkesi müşterinin kimliğinden değil malın gittiği yerden gelir. Kanal siparişe yazılanla aynı ifadeden türer ki
  // sipariş kendi KDV'siyle çelişmesin.
  const channel = deriveChannel({ isCompany: customer.type === 'company' });
  // Doğrulanmamış numara %0 açmaz: yanlış %0 uygulamak bizim riskimizdir.
  const vat = resolveVatTreatment({
    channel,
    deliveryCountry,
    vatNumberValid: customer.vatNumberValid ?? undefined,
  });

  // Bölge ve depo listeleri bir kez okunup iki teslimat çözümüne verilir: iki tur farklı liste görürse sipariş bir turun
  // deposundan, öteki turun bölgesinden doğardı.
  const deliveryInputs = await readDeliveryInputs(db);

  // Depo önce, çünkü sepet o deponun stoğuyla okunur; seçilen adresin kodu seçili yerin kodundan farklıysa adres kazanır. Teslimat
  // iki kez çözülür ama döngü yok: depo yalnız adrese bağlı, sepet yalnız "kargo da kapalı mı" kararını etkiler.
  const place = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    inputs: deliveryInputs,
  });

  // Kargo siparişinin deposu ülkenin kargo deposudur, çünkü kalemler orada; yoksa sebep ayrı söylenir. Gel-al'da depo
  // müşterinin seçtiği tesistir (DATA_MODEL: "adresten değil seçilen depodan çözülür").
  const orderWarehouseId = pickupWarehouse ? pickupWarehouse.id : input.shippingOrder ? place.shippingWarehouseId : place.warehouseId;
  if (input.shippingOrder && !orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: 'no_shipping_warehouse' };
  }

  // Sipariş yalnız kendi şeridini alır ve şerit müşterinin gerçek yeriyle okunur, çünkü aşağıdaki okuma kargo siparişinde kargo
  // deposuyla yapılır ve orada her satır `local` görünür. Personel siparişi daraltılmaz, kalemi sessizce düşürmek yerine reddedilir.
  const addressOutOfRoute = place.deliveryType === 'shipping';
  let entries = input.entries;
  if (!pickupWarehouse && !input.staff) {
    const classified = await getCartView(db, input.locale, input.entries, {
      customerId: customer.id,
      warehouseId: place.warehouseId,
      shippingWarehouseId: place.shippingWarehouseId,
      country: address.country,
      zoneId: place.zoneId,
      bundles: input.bundles,
    });
    const lane = orderLaneOf(Boolean(input.shippingOrder), addressOutOfRoute);
    const narrowed = laneEntriesOf(classified, input.entries, lane, addressOutOfRoute);
    // Şerit boşsa ret yolları olduğu gibi çalışsın diye kalemler daraltılmaz.
    if (narrowed.length > 0) entries = narrowed;
  }

  // Saklanan fiyatlar sepet okumasından önce alınır: karşılaştırmanın "önceki"si müşterinin en son gördüğü fiyattır.
  const cartService = new CartService(db);
  const storedCart = await cartService.get(customer.id);
  const previousPrices = storedPrices(storedCart.items);
  const cart = await getCartView(db, input.locale, entries, {
    customerId: customer.id,
    couponCode: input.couponCode,
    // Pazarlıklı fiyat sepet okumasına girer: toplam, indirim matrahı, KDV kırılımı ve kargo eşiği bu okumadan türer.
    priceOverrides: input.staff?.priceOverrides,
    warehouseId: orderWarehouseId,
    // Gel-al'da sepet bölünmez: kargo deposu verilmez, depoda olmayan kalem "burada yok" olarak reddedilir.
    shippingWarehouseId: pickupWarehouse ? null : place.shippingWarehouseId,
    // Kapsamlı ayarların (kargo tarifesi, asgari sepet) ülke ekseni çerezden değil malın teslim edildiği yerden okunur.
    country: deliveryCountry,
    // Kargo ve gel-al siparişi bir bölgeye ait değildir; bölgenin asgari sepeti onlara uygulanmaz.
    zoneId: input.shippingOrder || pickupWarehouse ? null : place.zoneId,
    pickup: pickupWarehouse !== null,
    shippingOrder: !pickupWarehouse && (Boolean(input.shippingOrder) || addressOutOfRoute),
    previousPrices,
    bundles: input.bundles,
  });
  if (cart.lines.length === 0) return { status: 'empty_cart' };

  /* Sepet müşteriye gösterildiğinden beri değiştiyse onay yenilenir; fiyat karşılaştırmasından önce, çünkü içerik değiştiyse o
     başka bir sepeti anlatır. İmzasız istek reddedilmez: kontrol imzayı gönderen çağıranı korur. */
  if (input.expectedCartFingerprint != null && input.expectedCartFingerprint !== cartFingerprint(input.entries)) {
    return { status: 'cart_changed' };
  }

  /* Rota dışı adreste gelemeyen soğuk zincir kalemi sipariş kapsamından düşer ama sepette kalır; ret yalnız geriye kalem kalmazsa
     doğar. İndirim payları satırla birlikte süzülür, yoksa kalan kalemlere başkasının indirimi yazılırdı. */
  const scope = orderScopeOf(cart, !input.shippingOrder && !pickupWarehouse && place.deliveryType === 'shipping');
  const orderedLines = scope.lines;
  const orderedShares = scope.shares;
  if (orderedLines.length === 0) return { status: 'cold_chain_unshippable' };

  // Kapsam dışı kalem kargo kararını etkilemez: siparişe girmeyen kalem yüzünden kargo yolunu kapatmak olmayan bir kısıt olurdu.
  const hasNonShippableItem = orderedLines.some((l) => !l.shippable);
  const delivery = await resolveDelivery(db, {
    postalCode: address.postalCode,
    country: address.country,
    hasNonShippableItem,
    inputs: deliveryInputs,
  });

  // Gel-al ve kargo seçimi adresin cevabını ezer, tersi olmaz; aşağıdaki her karar bu türü izler.
  const deliveryType: DeliveryType = pickupWarehouse ? 'pickup' : input.shippingOrder ? 'shipping' : delivery.deliveryType;

  // Adres tutarlılığı yalnız rota siparişinde sorulur: kurye sokağa gider ve kod ile şehir çelişiyorsa hangisinin yanlış olduğunu
  // biz bilemeyiz. Kargoda adresi taşıyıcı doğrular; kural formda değil kapıda, çünkü form atlanabilir.
  if (deliveryType === 'route') {
    const places = await placesForPostalCode(db, address.country, address.postalCode);
    if (!cityMatchesPlaces(address.city, places)) {
      return { status: 'address_city_mismatch', postalCode: address.postalCode, city: address.city, places };
    }
  }

  // Soğuk zincir engeli "şu an yok"tan önce söylenir, yoksa müşteri o adrese hiç gitmeyecek ürünü beklerdi. Kargo siparişi ayrıca
  // denetlenir, çünkü rota içi adreste `shippingBlockedReason` boştur.
  if (input.shippingOrder && hasNonShippableItem) return { status: 'cold_chain_unshippable' };
  // Gel-al'da soğuk zincir engeli yok: mal hiç yola çıkmıyor, müşteri depodan alıyor.
  if (!pickupWarehouse && delivery.shippingBlockedReason === 'cold_chain') return { status: 'cold_chain_unshippable' };
  if (cart.hasBlocked) return { status: 'blocked_lines', lines: cart.lines.filter((l) => l.blocked).map((l) => l.name) };

  // Sipariş tek depodan çıkar: o depoda olmayan kalem buraya giremez, yoksa iş ödemeden sonra rezervasyonda patlar.
  const unfulfillable = orderedLines.filter((l) => l.route !== null && l.route !== 'local');
  if (unfulfillable.length > 0) return { status: 'blocked_lines', lines: unfulfillable.map((l) => l.name) };

  // Adet de karşılanmalı; sayı sepetin gösterdiği `availableHere`den okunur.
  const overCap = orderedLines.filter((l) => l.availableHere !== null && l.availableHere < l.qty);
  if (overCap.length > 0) {
    return { status: 'insufficient_here', lines: overCap.map((l) => ({ name: l.name, available: l.availableHere ?? 0 })) };
  }
  /* Asgari sepet siparişe giren tutara bakar, çünkü gelemeyen kalemle eşiği geçen müşteri kasada geri düşerdi. Personel yolunda
     sorulmaz: küçük siparişi alıp almamak operatörün kararı. */
  // Gel-al'da sepetin eşiği (rota/kargo, içeriğe göre) geçerli değil: eşik ödeme kapısında `pickup` kuralıyla okunur (aşağıda).
  const basket = meetsMinBasket(scope.subtotalCents, cart.minBasketCents);
  if (!input.staff && !pickupWarehouse && !basket.ok) return { status: 'min_basket', missingCents: basket.missingCents };

  // Gün kabul edilmez, doğrulanır: ekran açıkken kesim saati geçmiş olabilir. Kargoda gün sorulmaz.
  if (deliveryType === 'route') {
    const chosen = input.deliveryDate ?? (delivery.availableDates.length === 1 ? delivery.availableDates[0]! : null);
    if (!chosen || !delivery.availableDates.includes(chosen)) {
      return { status: 'date_unavailable', availableDates: delivery.availableDates };
    }
  }

  const items = await expandToOrderItems(db, orderedLines, orderedShares, vat.zeroRated, input.staff?.actorId ?? null);
  // Kargo teklifi ekranınkiyle aynı kapıdan yeniden alınır: fiyat istemciden gelmez, yalnız servis kodu ve nokta gelir.
  const rateProvider = input.rateProvider === undefined ? (shippingProviderConfigured() ? sendcloudProvider() : null) : input.rateProvider;
  const quote =
    deliveryType === 'shipping' && rateProvider && orderWarehouseId
      ? await quoteShipping(db, rateProvider, {
          warehouseId: orderWarehouseId,
          to: { countryCode: address.country, postalCode: address.postalCode, city: address.city ?? undefined },
          items: orderedLines.flatMap((l) => (l.variantId ? [{ variantId: l.variantId, qty: l.qty }] : [])),
        })
      : null;
  // Ücretin KDV'si ekranın satırlarından: sipariş kalemleri (açılmış paket, ters vergilendirmede sıfır oran) başka bir ücret çıkarırdı.
  const vatLines = shippingVatLines(scope.lines);
  const quoted = quote?.status === 'ok' ? pricedOptions(quote.options, vatLines) : [];
  const priced = optionForPricing(quoted, input.shippingOptionCode ?? null);

  const options = await resolveCheckoutPayment(db, {
    customerId: customer.id,
    deliveryType,
    quotedFeeCents: priced?.priceCents ?? null,
    basketCents: scope.basketCents,
    // Asgari sepet eşiği indirim öncesini ister; `basketCents` kargo ve toplam içindir.
    subtotalCents: scope.subtotalCents,
    lines: vatLines,
    /* Ayar kapsamı ödeme kapısına da sepet okumasındaki ifadelerle geçer; geçmeseydi sepet kapsamlı ayarı, siparişe yazılan kargo
       ücreti ise genel değeri okurdu. */
    country: deliveryCountry,
    // Kargo ve gel-al siparişi bölgeye ait değildir.
    zoneId: input.shippingOrder || pickupWarehouse ? null : place.zoneId,
    warehouseId: orderWarehouseId,
  });
  if (!options.methods.includes(input.paymentMethod)) {
    return { status: 'payment_not_allowed', methods: options.methods };
  }
  // Gel-al eşiği: araç çıkmadığı için yalnız kanal satırı (kargo kuralı) — kapı `pickup` türüyle okudu, karar onun.
  if (pickupWarehouse && !input.staff && !options.minBasketOk) {
    return { status: 'min_basket', missingCents: options.missingForMinBasketCents };
  }

  // Teklif alınamadıysa sipariş sabit tarifeyle açılır ve seçimsiz kalır; servisi o zaman depo seçer.
  let shippingChoice: { code: string; costCents: number; servicePoint: ServicePointSnapshot | null; plan: ParcelPlanSnapshot } | null =
    null;
  if (quote?.status === 'ok') {
    const choice = chooseShippingOption(quoted, {
      free: options.shippingFreeReason === 'threshold',
      requestedCode: input.shippingOptionCode ?? null,
    });
    if (!choice.ok) return { status: 'shipping_option_unavailable' };
    let servicePoint: ServicePointSnapshot | null = null;
    if (needsServicePoint(choice.option.lastMile)) {
      const point = input.servicePointId ? await rateProvider!.servicePoint(input.servicePointId) : null;
      if (
        !point ||
        !point.active ||
        point.carrierCode !== choice.option.carrierCode ||
        point.country !== address.country ||
        !servicePointAccepts(choice.option.lastMile, point.kind)
      ) {
        return { status: 'service_point_invalid' };
      }
      servicePoint = servicePointSnapshot(point);
    }
    shippingChoice = { code: choice.option.code, costCents: choice.option.costCents, servicePoint, plan: parcelPlanSnapshot(quote.plan) };
  }

  // Deposuz sipariş yazılamaz; sebep çağırana taşınır, çünkü "bölge dışısınız" ile "kargo deposu tanımlı değil" aynı cümle olamaz.
  if (!orderWarehouseId) {
    return { status: 'warehouse_unresolved', reason: delivery.unresolvedReason ?? 'no_shipping_warehouse' };
  }

  // Zam onayı en sonda ve yalnız siparişe giren kalem için sorulur: zaten açılmayacak siparişte fiyat onayı müşteriyi iki kez
  // durdururdu. Reddederken saklanan fiyatlar sepetin tamamı için tazelenir, yoksa müşteri tekrar onaylayınca aynı reddi alırdı.
  const raised = orderedLines.filter((l) => l.priceChange);
  if (raised.length > 0) {
    await cartService.replace(
      customer.id,
      cart.lines.map((l) => itemOfEntry(entryOf(l), (l.unitPriceCents ?? 0) / 100)),
    );
    return {
      status: 'price_changed',
      lines: raised.map((l) => ({
        name: l.name,
        fromCents: l.priceChange!.previousCents,
        toCents: l.unitPriceCents ?? 0,
      })),
    };
  }

  // Adres anlık görüntü olarak da yazılır ki müşteri adresini sonradan düzenlese de sipariş nereye gittiğini bilsin.
  const deliveryDate = deliveryType === 'route' ? (input.deliveryDate ?? delivery.availableDates[0] ?? null) : null;
  const orderZoneId = input.shippingOrder || pickupWarehouse ? null : delivery.zoneId;

  // Komşu daveti kişinin kendi kabul kaydından okunur ve ancak sefer belli olunca sorulabilir; eşleşmeme sessizdir.
  const neighborInviteId = await matchedNeighborInviteId(db, {
    customerId: customer.id,
    deliveryZoneId: orderZoneId,
    deliveryDate,
  });

  const { order } = await new OrderService(db).create(
    {
      customerId: customer.id,
      // Sipariş tek depodan çıkar ve depo adresin posta kodundan gelir; varsayılan depo yoktur.
      warehouseId: orderWarehouseId,
      channel,
      // Kaynak yüzeyi söyler, kanaldan ayrı eksendir; müşteri yolunda sohbetin dokunduğu sepet sohbetin siparişidir, ödeme sitede
      // alınsa da.
      orderSource: input.staff ? (input.staff.orderSource ?? 'manual') : await chatSourceOf(db, storedCart.sourceConversationId),
      // Patron ikramı yalnız personel yolundan işaretlenir.
      isGiftOrder: input.staff?.isGiftOrder ?? false,
      status: 'draft',
      idempotencyKey: input.idempotencyKey ?? null,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount ?? false,
      deliveryType,
      // Rota bölgesi yalnız araçla gidilen teslimatın kaydıdır.
      deliveryZoneId: orderZoneId,
      deliveryDate,
      neighborInviteId,
      addressId: address.id,
      addressSnapshot: { ...address },
      deliveryCountry,
      vatTreatment: vat.treatment,
      // Vergi numarasının o anki kopyası, yalnız %0 uygulandığında: numara sonradan değişse de denetimde cevap siparişte durur.
      vatNumberSnapshot: vat.zeroRated ? customer.vatNumber : null,
      shippingFeeCents: options.shippingFeeCents,
      orderedTotalCents: options.orderTotalCents,
      // Doğrudan maliyetler sipariş anının değeriyle yazılır; kargoda seçilen servisin teklifi, bildirimde gerçek kutularla düzelir.
      // Maliyet taşıyıcının KDV hariç fiyatıdır; müşterinin KDV dahil ücreti `shippingFeeCents`te.
      ...costsAtSale(deliveryType, await readUnitCosts(db), shippingChoice?.costCents ?? null),
      shippingOptionCode: shippingChoice?.code ?? null,
      servicePoint: shippingChoice?.servicePoint ?? null,
      parcelPlan: shippingChoice?.plan ?? null,
      // Reddedilen kuponun yerine kampanya kazanmış olabilir; tutar sepet toplamının kullandığı aynı fonksiyondan okunur.
      discountAmountCents: discountAmountOf(cart.discount),
      discountId: discountIdOf(cart.discount),
      discountLabel: discountLabelOf(cart.discount),
      // Mailler bu dilden konuşur.
      locale: input.locale,
    },
    items,
    // Kupon kotası siparişle birlikte tükenir; buradan yalnız kodun hangi kapıdan girildiği geçer.
    { discountCodeId: discountCodeIdOf(cart) },
  );

  // Edinim kaynağı ödeme oturumunda değil burada yazılır: kapıda ve vadeli ödeme o oturumu hiç açmaz ve kaynakları ölçülmemiş
  // kalırdı.
  input.onCustomerAcquired?.(customer.id);

  return { status: 'ok', orderId: order.id, totalCents: options.orderTotalCents, deliveryType };
}

/**
 * Paket burada varyant kalemlerine parçalanır, çünkü depo ürün toplar ve stok varyanttan düşer; kalem `bundle_id` taşır ki paket
 * yeniden kurulabilsin. Birim fiyat paketin payıdır; indirim payı da kaleme yazılır, çünkü ödeme durumu borcu kalemlerden toplar.
 */
async function expandToOrderItems(
  db: Db,
  lines: readonly CartLine[],
  shares: readonly number[],
  /** Ters vergilendirme: kalem oranı sıfırdır. */
  zeroRated: boolean,
  /** `null`: müşteri yolu, pazarlık izi yazılmaz. */
  priceSetBy: string | null,
): Promise<Omit<OrderItemInsert, 'orderId'>[]> {
  const items = new BundleItemService(db);
  const bundleItems = new Map(
    await Promise.all(
      lines.filter((l) => l.kind === 'bundle').map(async (l) => [l.bundleId, await items.listByBundle(l.bundleId)] as const),
    ),
  );

  // KDV oranı ürünün alanıdır; varyantlar ürünlerine tek turda bağlanır.
  const variantIds = [
    ...lines.filter((l) => l.kind === 'variant').map((l) => l.variantId),
    ...[...bundleItems.values()].flat().map((i) => i.variantId),
  ];
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const vatByProduct = new Map(products.map((p) => [p.id, p.vatRate]));
  // Sıfırlama haritanın kendisinde: kalem ve paket parçası aynı haritadan okur.
  const vatByVariant = new Map(variants.map((v) => [v.id, zeroRated ? 0 : (vatByProduct.get(v.productId) ?? 0)]));

  const rows: Omit<OrderItemInsert, 'orderId'>[] = [];
  lines.forEach((line, index) => {
    if (line.kind === 'variant') {
      rows.push({
        variantId: line.variantId,
        qty: line.qty,
        stockId: line.stockId,
        bundleId: null,
        unitPriceCents: line.unitPriceCents ?? 0,
        // Pazarlık izi ikisi birlikte yazılır (`order_item_negotiation_complete`); pazarlıksız satırda ikisi de `null`, yoksa her
        // kalem sahte bir taviz kaydı taşırdı.
        listUnitPriceCents: line.listUnitPriceCents ?? null,
        priceSetBy: line.listUnitPriceCents != null ? priceSetBy : null,
        vatRate: vatByVariant.get(line.variantId) ?? 0,
        lineDiscountAmountCents: shares[index] ?? 0,
      });
      return;
    }
    for (const item of bundleItems.get(line.bundleId) ?? []) {
      rows.push({
        variantId: item.variantId,
        // Paketin adedi kalemin adedini çarpar.
        qty: item.qty * line.qty,
        stockId: null,
        bundleId: line.bundleId,
        // `allocatedUnitPrice` euro olarak saklanıyor; çevrim ortak `toCents` ile.
        unitPriceCents: toCents(item.allocatedUnitPrice),
        vatRate: vatByVariant.get(item.variantId) ?? 0,
        // Pakete sepet indirimi binmez; paketin kendi indirimi birim fiyatın içinde.
        lineDiscountAmountCents: 0,
      });
    }
  });
  return rows;
}

/** Yalnız `applied` hâlde vardır: `outranked` hâlde kazanan kampanyadır ve uygulanmamış kod "karşılık buldu" diye sayılırdı. */
function discountCodeIdOf(cart: { discount: { status: string; codeId?: string } }): string | null {
  return cart.discount.status === 'applied' ? (cart.discount.codeId ?? null) : null;
}

/**
 * Eşleşmeme sebebi taşınmaz, çünkü ödeme adımında "davetin tutmadı" demek ilgisiz bir kaygı yaratırdı. Beklenmedik hata da
 * siparişi düşürmez: davet bir kolaylıktır.
 */
async function matchedNeighborInviteId(
  db: Db,
  input: { customerId: string; deliveryZoneId: string | null; deliveryDate: string | null },
): Promise<string | null> {
  try {
    return await matchNeighborInviteForOrder(db, input);
  } catch {
    // Davetin kendi yolu iz bırakıyor; ikinci log satırı aynı olayı iki kez anlatırdı.
    return null;
  }
}

/**
 * Gel-al deposu: aktif, tesis ve gel-al noktası — üçü de tutmuyorsa depo yok sayılır; istemcinin söylediği kimlik hiçbir zaman
 * olduğu gibi yazılmaz.
 */
async function pickupWarehouseOf(db: Db, warehouseId: string) {
  const warehouse = await new WarehouseService(db).getById(warehouseId);
  return warehouse && warehouse.isActive && warehouse.kind === 'facility' && warehouse.pickupEnabled ? warehouse : null;
}

/**
 * Sohbet kaynağı ile sipariş kaynağı aynı sözcükleri kullanır ki araya unutulacak bir eşleme sözlüğü girmesin. İz yoksa ya da
 * sohbet silinmişse `web`.
 */
async function chatSourceOf(db: Db, sourceConversationId: string | null): Promise<OrderSource> {
  if (!sourceConversationId) return 'web';
  const conversation = await new ConversationService(db).getById(sourceConversationId);
  return conversation?.source ?? 'web';
}
