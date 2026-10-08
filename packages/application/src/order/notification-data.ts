import {
  BundleService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import { brand } from '@lezzet/brand';
import {
  derivePaymentStatusForOrder,
  fulfilledLineAmountCents,
  grossTotalCents,
  isFulfillmentSettled,
  isZeroRated,
  orderAddedVat,
} from '@lezzet/domain-core';
import { formatPrice, formatShortDate, vatSummaryOf } from '@lezzet/helper';
import { localizedUrl } from '@lezzet/i18n';
import type { NotifyEventName, NotifyRecipient } from '@lezzet/notify';
import { resolveLocalizedText } from '@lezzet/types';
import type { Order, OrderItem, OrderNotification, NotificationStep, PreferredLanguage, Warehouse, WrittenReturn } from '@lezzet/types';
import { notificationPreferencesUrl } from '../customer/notification-preferences';
import { parcelOrdinal, readOrderTracking } from '../shipping/tracking';
import { warehouseAddressLine } from '../warehouse/pickup';
import type { OrderExceptionDetail } from './effects';

/**
 * Sipariş bildiriminin verisini kurar: sipariş, kalemler ve müşteri okunur, para kararı motora sorulur ve şablonun
 * doğrudan basacağı görünüm modeli çıkar. Biçimleme (para, tarih) burada, müşterinin dilinde yapılır; şablon `Intl` bilmez.
 */

const STEP_ORDER: NotificationStep['key'][] = ['received', 'prepared', 'on_the_way', 'delivered'];

/**
 * Olayın zaman çizgisinde nereye denk geldiği — çizginin dolu kısmı buradan çıkar. İstisna bildirimlerinde (iptal/iade/
 * eksik) zaman çizgisi yoktur, tasarım tek anı gösterir.
 */
const EVENT_STEP: Partial<Record<NotifyEventName, NotificationStep['key']>> = {
  order_confirmed: 'received',
  order_out_for_delivery: 'on_the_way',
  // Gel-al: "hazır" mailinde çizgi hazırlık adımında durur; "yolda" adımı bu türde hiç çizilmez (`buildSteps`).
  order_ready_for_pickup: 'prepared',
  order_delivered: 'delivered',
};

/** Zaman çizgisi taşımayan olaylar — bunlarda tek durum bloğu ve para çözümü vardır. */
const EXCEPTION_EVENTS: readonly NotifyEventName[] = ['order_cancelled', 'order_shortfall', 'order_refunded', 'order_payment_incomplete'];

export interface NotificationBundle {
  data: OrderNotification;
  recipient: NotifyRecipient;
  /** Bildirim satırının öznesi — gönderim kapısı ikinci bir sipariş okuması yapmasın. */
  customerId: string;
}

/**
 * Siparişten bildirim verisini kurar. Bulunamazsa `null` — çağıran bunu sessiz atlar; bildirim
 * yokluğu bir iş hatası değildir.
 */
export async function buildOrderNotification(
  db: Db,
  orderId: string,
  event: NotifyEventName,
  opts: OrderExceptionDetail = {},
): Promise<NotificationBundle | null> {
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return null;

  const { order, items } = found;
  const customer = await new UserProfileService(db).getById(order.customerId);
  // Dil önce siparişten: müşteri siparişi hangi dilde verdiyse maili o dilde okur, profil sonradan değişebilir.
  // Web dışı kayıtta (hızlı satış, operasyon girişi) sipariş dilsizdir; orada profil doğru cevaptır.
  const locale: PreferredLanguage = order.locale ?? customer?.preferredLanguage ?? 'fr';

  // Aynı ayrım hem kalem satırlarını hem para türetimini yönetir — iki yerde farklı okunursa
  // mailin listesi ile toplamı çelişir.
  const settled = isFulfillmentSettled(order.status);
  /* Takip yalnız kargo siparişinde sorulur, rota teslimatında gönderi satırı hiç doğmaz. Ayrım `delivery_type`tan gelir,
     olayın adından değil: `order_out_for_delivery` iki kulvarda da kullanılıyor (DOMAIN §6). */
  const [names, steps, tracking, pickupWarehouse] = await Promise.all([
    lineNames(db, items, locale),
    buildSteps(db, orderId, event, order.deliveryType),
    order.deliveryType === 'shipping'
      ? readOrderTracking(db, orderId, { carrier: order.carrier, trackingNumber: order.trackingNumber })
      : Promise.resolve(null),
    // Gel-al'da mailin teslimat bloğu müşterinin GİDECEĞİ yeri yazar: deponun adı ve adresi.
    order.deliveryType === 'pickup' ? new WarehouseService(db).getById(order.warehouseId) : Promise.resolve(null),
  ]);

  const lines =
    event === 'order_refunded'
      ? buildRefundLines(items, names, opts.returns ?? [], locale)
      : buildLines(items, names, locale, settled);

  const derivation = derivePaymentStatusForOrder(order, items, {
    collectedCents: order.amountCollectedCents,
    refundedCents: order.amountRefundedCents,
  });

  const data: OrderNotification = {
    referenceNo: order.referenceNo ?? '—',
    orderedOn: formatShortDate(order.createdAt, locale),
    customerName: customer?.name ?? null,
    locale,
    steps,
    lines,
    totals: buildTotals(order, items, locale, event),
    grandTotal: {
      label:
        event === 'order_confirmed'
          ? (vatSummaryOf(vatInputOf(order, items), locale).totalLabel ?? TOTAL_LABEL[locale].grand)
          : TOTAL_LABEL[locale].current,
      // Onayda sipariş tutarı yazar, çünkü mal henüz hazırlanmadı ve karşılanan 0'dır; sonraki maillerde karşılanan tutar
      // yazar ve eksik çıkan kalemde toplam kendiliğinden iner.
      value: formatPrice(event === 'order_confirmed' ? order.orderedTotalCents : derivation.fulfilledAmountCents, locale),
    },
    statusAt: EXCEPTION_EVENTS.includes(event) ? formatShortDate(new Date().toISOString(), locale) : null,
    // Para çözümü istisna bildirimlerinin ilk kartıdır. İki sayı da TÜRETİLİR: iade borcu motordan
    // (`refundDueCents`), iptalde ise net tahsilatın tamamı — karşılanan 0 sayıldığı için aynı
    // hesap kendiliğinden tamamını verir (ORDER_LIFECYCLE).
    refund: buildRefund(order, refundAmountCents(order, items, event, opts.refundedAmountCents, derivation.refundDueCents), event, locale),
    paidOnline: order.amountCollectedCents > 0,
    paymentNote: paymentNote(order, derivation.amountToCollectCents, locale),
    delivery: buildDelivery(order, locale, pickupWarehouse),
    /* Numarası olmayan gönderi mailde takip kutusu açmaz: boş bir kutu teslimat bilgisinin yerini alıp müşteriyi bilgisiz
       bırakırdı. Boş dizi `null`a indirilir, sözleşme bu ayrımı yazıyor. */
    tracking:
      tracking && tracking.parcels.length > 0
        ? tracking.parcels.map((parcel) => ({ ordinal: parcelOrdinal(parcel), number: parcel.trackingNumber, url: parcel.trackingUrl }))
        : null,
    /**
     * Bağda kimlik taşınır, referans numarası değil: sayfa siparişi `getWithItems(orderId)` ile çözüyor. Numara mailin
     * metninde zaten görünüyor.
     */
    orderUrl: localizedUrl('/orders/[reference]', locale, { reference: order.id }),
    deliverySummaryUrl: null, // Teslimat özeti belgesi henüz üretilmiyor.
    supportUrl: localizedUrl('/support', locale),
    /* Jetonlu: sayfa oturum istiyor, mailin alıcısı ise o an çoğu zaman girişli değil. Bağ tek kapıdan üretilir ki bütün
       gönderim yolları jetonu aynı biçimde eklesin. */
    notificationPreferencesUrl: await notificationPreferencesUrl(db, locale, { customerId: order.customerId }),
  };

  return {
    data,
    recipient: { name: customer?.name ?? null, email: customer?.email ?? null, phone: customer?.phone ?? null, locale },
    // Bildirim satırının öznesi — gönderim kapısı kimliği buradan alır, ikinci bir sipariş okuması yapmaz.
    customerId: order.customerId,
  };
}

/** Kalemin mailde görünen adı: ürünün, paket kaleminde paketin adı. */
async function lineNames(db: Db, items: readonly OrderItem[], locale: PreferredLanguage): Promise<Map<string, string>> {
  const variants = await new ProductVariantService(db).listByIds(items.map((item) => item.variantId));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const bundleIds = [...new Set(items.map((item) => item.bundleId).filter((id): id is string => Boolean(id)))];
  const bundles = bundleIds.length > 0 ? await new BundleService(db).listByIds(bundleIds) : [];

  const productOf = new Map(products.map((product) => [product.id, product]));
  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));
  const bundleOf = new Map(bundles.map((bundle) => [bundle.id, bundle]));

  return new Map(
    items.map((item) => {
      const variant = variantOf.get(item.variantId);
      const bundle = item.bundleId ? bundleOf.get(item.bundleId) : null;
      return [item.id, bundle?.name?.[locale] ?? (variant ? productOf.get(variant.productId)?.name?.[locale] : null) ?? '—'];
    }),
  );
}

/**
 * Kalem satırları; eksik kalemde sebep yazılmaz, yalnız miktar + para. Hazırlık kesinleşmemişse sipariş edilen adet
 * gösterilir, yoksa onaylanmış sipariş maili her kalemi "0 gönderildi" derdi.
 */
function buildLines(items: readonly OrderItem[], names: Map<string, string>, locale: PreferredLanguage, fulfillmentSettled: boolean) {
  return items.map((item) => {
    const unit = formatPrice(item.unitPriceCents, locale);
    const shown = fulfillmentSettled ? item.fulfilledQty : item.qty;
    // Eksiklik ancak hazırlık kesinleştiyse BİLİNİR; öncesinde ortada bir fark yoktur.
    const missing = fulfillmentSettled ? item.qty - item.fulfilledQty : 0;

    return {
      name: names.get(item.id) ?? '—',
      meta: `${item.qty} × ${unit}`,
      qty: shown,
      amount: formatPrice(item.unitPriceCents * shown, locale),
      shortfall:
        missing > 0
          ? SHORTFALL[locale](item.qty, item.fulfilledQty, formatPrice(item.unitPriceCents * missing, locale))
          : null,
    };
  });
}

/**
 * İade mailinin dökümü: yalnız bu iadenin kalemleri, parası dönen adet ve o adedin değeriyle; müşteride kalanın değeri
 * yazılsaydı tam iade edilen kalem "0,00 €" görünürdü. Müşteride kalan adet de parası dönen adettir.
 */
function buildRefundLines(items: readonly OrderItem[], names: Map<string, string>, returns: readonly WrittenReturn[], locale: PreferredLanguage) {
  return items.flatMap((item) => {
    const qty = returns.filter((entry) => entry.orderItemId === item.id).reduce((sum, entry) => sum + entry.qty, 0);
    if (qty === 0) return [];
    const value = fulfilledLineAmountCents({
      unitPriceCents: item.unitPriceCents,
      orderedQty: item.qty,
      fulfilledQty: qty,
      lineDiscountCents: item.lineDiscountAmountCents,
    });
    return [
      {
        name: names.get(item.id) ?? '—',
        meta: `${item.qty} × ${formatPrice(item.unitPriceCents, locale)}`,
        qty,
        amount: formatPrice(value, locale),
        shortfall: null,
      },
    ];
  });
}

/**
 * Zaman çizgisi durum logundan türetilir — siparişte "hazırlandı" damgası tutulmaz, geçiş kaydı zaten vardır.
 * Gerçekleşmiş adım zamanını gösterir, gerçekleşmemiş adım soluk kalır.
 */
async function buildSteps(db: Db, orderId: string, event: NotifyEventName, deliveryType: Order['deliveryType']): Promise<NotificationStep[]> {
  const log = await new OrderStatusLogService(db).listByOrder(orderId);
  // Gel-al'ın "yolda"sı yoktur: çizgi üç adımdır, mal depodan elden gider.
  const order = deliveryType === 'pickup' ? STEP_ORDER.filter((key) => key !== 'on_the_way') : STEP_ORDER;
  const firstAt = (status: string) => log.find((entry) => entry.toStatus === status)?.createdAt ?? null;

  const stampOf: Record<NotificationStep['key'], string | null> = {
    received: firstAt('confirmed') ?? log[0]?.createdAt ?? null,
    prepared: firstAt('ready') ?? firstAt('preparing'),
    on_the_way: firstAt('out_for_delivery'),
    delivered: firstAt('delivered') ?? firstAt('completed'),
  };

  const step = EVENT_STEP[event];
  if (!step) return []; // İstisna bildirimi — çizgi yok.

  const currentIndex = order.indexOf(step);
  return order.map((key, index) => {
    const stamp = stampOf[key];
    return {
      key,
      // Son adım "o an" değil "oldu"dur: teslim edildiyse çizgi tamamlanmış görünür.
      state: index < currentIndex ? 'done' : index === currentIndex ? (key === 'delivered' ? 'done' : 'current') : 'pending',
      detail: stamp ? formatShortDate(stamp, 'tr') : null,
    };
  });
}

const TOTAL_LABEL: Record<PreferredLanguage, { subtotal: string; discount: string; delivery: string; free: string; grand: string; current: string }> = {
  tr: { subtotal: 'Ara toplam', discount: 'İndirim', delivery: 'Teslimat', free: 'Ücretsiz', grand: 'Genel toplam', current: 'Güncel toplam' },
  fr: { subtotal: 'Sous-total', discount: 'Remise', delivery: 'Livraison', free: 'Offerte', grand: 'Total', current: 'Total actualisé' },
  de: { subtotal: 'Zwischensumme', discount: 'Rabatt', delivery: 'Lieferung', free: 'Kostenlos', grand: 'Gesamt', current: 'Aktueller Gesamtbetrag' },
};

const SHORTFALL: Record<PreferredLanguage, (ordered: number, sent: number, amount: string) => string> = {
  tr: (ordered, sent, amount) => `${ordered} sipariş edildi, ${sent} gönderildi — ${amount} iade edilecek.`,
  fr: (ordered, sent, amount) => `${ordered} commandés, ${sent} expédiés — ${amount} seront remboursés.`,
  de: (ordered, sent, amount) => `${ordered} bestellt, ${sent} versandt — ${amount} werden erstattet.`,
};

const PAYMENT_NOTE: Record<PreferredLanguage, { paid: string; onDelivery: (amount: string) => string }> = {
  tr: { paid: '💳 Online ödendi', onDelivery: (amount) => `💶 Kapıda ödenecek: ${amount}` },
  fr: { paid: '💳 Payée en ligne', onDelivery: (amount) => `💶 À régler à la livraison : ${amount}` },
  de: { paid: '💳 Online bezahlt', onDelivery: (amount) => `💶 Bei Lieferung zu zahlen: ${amount}` },
};

/** Onay mailinde tutar dökümü tam, sonraki maillerde yalnız güncel toplam (tasarım kuralı). */
function buildTotals(order: Order, items: readonly OrderItem[], locale: PreferredLanguage, event: NotifyEventName) {
  if (event !== 'order_confirmed') return [];
  const t = TOTAL_LABEL[locale];
  // KDV hariç fiyatta (onaylı işletme) ara toplam KDV hariç, KDV oran başına ve teslimat en altta; toplam KDV dahildir.
  const vat = vatSummaryOf(vatInputOf(order, items), locale);
  const lineTotalCents = order.pricesIncludeVat
    ? order.orderedTotalCents + order.discountAmountCents - order.shippingFeeCents
    : items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);

  return [
    { label: vat.subtotalLabel ?? t.subtotal, value: formatPrice(lineTotalCents, locale) },
    ...(order.discountAmountCents > 0
      ? [{ label: discountRowLabel(order, t.discount, locale), value: `−${formatPrice(order.discountAmountCents, locale)}`, positive: true }]
      : []),
    ...vat.vatRows.map((row) => ({ label: row.label, value: row.value })),
    {
      label: t.delivery,
      value: order.shippingFeeCents > 0 ? formatPrice(order.shippingFeeCents, locale) : t.free,
      positive: order.shippingFeeCents === 0,
    },
  ];
}

/** Özetin KDV girdisi; onay mailinde mal henüz hazırlanmadığı için sipariş edilen adetle. */
function vatInputOf(order: Order, items: readonly OrderItem[]) {
  return {
    pricesIncludeVat: order.pricesIncludeVat,
    zeroRated: isZeroRated(order.vatTreatment),
    vat: orderAddedVat(order, items, isFulfillmentSettled(order.status)),
  };
}

/**
 * İndirim satırının adı: kampanyanın sipariş anında kopyalanan adı (`discountLabel`), çünkü kampanya sonradan değişmiş
 * olabilir. Ad yoksa satır genel adında kalır; türü söyleyecek bilgi siparişte yok, uydurulmaz.
 */
function discountRowLabel(order: Order, generic: string, locale: PreferredLanguage): string {
  const named = order.discountLabel ? resolveLocalizedText(order.discountLabel, locale) : '';
  return named ? `${generic} — ${named}` : generic;
}

/**
 * Paranın çözümü — istisna bildirimlerinin ilk kartı; iptalde karşılanan 0 sayıldığı için ayrı formül gerekmez. Borç
 * yoksa `null` döner ve kart çıkmaz: "0,00 € iade edildi" diyen mail gürültüdür.
 */
function buildRefund(order: Order, amountCents: number, event: NotifyEventName, locale: PreferredLanguage) {
  if (!EXCEPTION_EVENTS.includes(event) || amountCents <= 0) return null;

  // İadede toplam müşterinin net ödediğidir (tahsilat − iade): ikinci iadenin maili birincinin bıraktığından düşer.
  if (event === 'order_refunded') {
    const netAfterCents = Math.max(0, order.amountCollectedCents - order.amountRefundedCents);
    return {
      amount: formatPrice(amountCents, locale),
      previousTotal: formatPrice(netAfterCents + amountCents, locale),
      currentTotal: formatPrice(netAfterCents, locale),
    };
  }

  const previousCents = order.orderedTotalCents;
  return {
    amount: formatPrice(amountCents, locale),
    previousTotal: formatPrice(previousCents, locale),
    // İptalde güncellenecek bir toplam yoktur: sipariş kalmadı.
    currentTotal: event === 'order_cancelled' ? null : formatPrice(Math.max(0, previousCents - amountCents), locale),
  };
}

/**
 * İstisna bildiriminde gösterilecek tutar: eksik karşılanmada gitmeyen malın değeri, iptal ve iadede fiilen iade edilen
 * tutar. Türetilen iade borcu yazımdan sonra sıfırdır; onu okusaydık mail "iade yok" derdi.
 */
function refundAmountCents(
  order: Order,
  items: readonly OrderItem[],
  event: NotifyEventName,
  refundedAmountCents: number | null | undefined,
  refundDueCents: number,
): number {
  if (event === 'order_shortfall') {
    // Gitmeyen malın değeri borçla aynı tabanda: KDV hariç fiyatta KDV'siyle.
    const missing = items.map((item) => ({
      vatRate: item.vatRate,
      amountCents: item.unitPriceCents * Math.max(0, item.qty - item.fulfilledQty),
    }));
    return grossTotalCents(missing, [], order.pricesIncludeVat, isZeroRated(order.vatTreatment));
  }
  return refundedAmountCents ?? refundDueCents;
}

/** Ödeme hapı: peşin ödenmişse "ödendi", kalan varsa tahsil edilecek tutar (türetimden). */
function paymentNote(order: Order, toCollectCents: number, locale: PreferredLanguage): string | null {
  if (toCollectCents > 0) return PAYMENT_NOTE[locale].onDelivery(formatPrice(toCollectCents, locale));
  return order.amountCollectedCents > 0 ? PAYMENT_NOTE[locale].paid : null;
}

const DELIVERY_COPY: Record<PreferredLanguage, { route: string; shipping: string; pickup: string }> = {
  tr: { route: 'Kapıya teslim', shipping: 'Kargoyla gönderim', pickup: 'Depodan teslim' },
  fr: { route: 'Livraison à domicile', shipping: 'Expédition', pickup: 'Retrait à l’entrepôt' },
  de: { route: 'Lieferung an die Tür', shipping: 'Versand', pickup: 'Abholung im Lager' },
};

/**
 * Teslimat bloğu. Gel-al'da adres deponun adresidir ve yanına aranacak numara yazılır (randevu sistem dışı, DOMAIN §6);
 * depo kaydı okunamadıysa adres uydurulmaz.
 */
function buildDelivery(order: Order, locale: PreferredLanguage, pickupWarehouse: Warehouse | null) {
  const copy = DELIVERY_COPY[locale];
  if (order.deliveryType === 'pickup') {
    return {
      icon: '🏬',
      headline: pickupWarehouse ? `${copy.pickup} · ${pickupWarehouse.name}` : copy.pickup,
      detail: [pickupWarehouse ? warehouseAddressLine(pickupWarehouse) : null, brand.contact.phoneDisplay].filter(Boolean).join(' · '),
    };
  }
  const kind = order.deliveryType === 'shipping' ? copy.shipping : copy.route;
  const address = order.addressSnapshot as { line1?: string; postalCode?: string; city?: string } | null;

  return {
    icon: order.deliveryType === 'shipping' ? '📦' : '❄',
    headline: order.deliveryDate ? `${formatShortDate(order.deliveryDate, locale)} · ${kind}` : kind,
    detail: [address?.line1, [address?.postalCode, address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
}
