import {
  BundleService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { derivePaymentStatusForOrder, isFulfillmentSettled } from '@lezzet/domain-core';
import type { NotifyEventName, NotifyRecipient } from '@lezzet/notify';
import { resolveLocalizedText } from '@lezzet/types';
import type { Order, OrderItem, OrderNotification, NotificationStep, PreferredLanguage } from '@lezzet/types';
import { localizedUrl } from '../notify';
import { formatPrice, formatShortDate } from '../storefront/format';

/**
 * Sipariş bildiriminin VERİSİNİ kurar (14.5) — **uygulama katmanı orkestrasyonu**.
 *
 * Şablon karar vermez, veri de kendi kendini kurmaz: burada sipariş + kalemler + müşteri okunur,
 * para kararı motora sorulur (`derivePaymentStatus` — eksik karşılanmada iade borcu) ve ortaya
 * şablonun doğrudan basacağı bir görünüm modeli çıkar.
 *
 * Biçimleme (para, tarih) BURADA yapılır: şablon `Intl` bilmez. Sebep pratiktir — mail müşterinin
 * dilinde biçimlenir, şablon ise yalnız yerleştirir; ikisi karışırsa aynı tutar iki yerde iki türlü
 * yuvarlanır.
 */

const STEP_ORDER: NotificationStep['key'][] = ['received', 'prepared', 'on_the_way', 'delivered'];

/**
 * Olayın zaman çizgisinde nereye denk geldiği — çizginin dolu kısmı buradan çıkar.
 *
 * **İSTİSNA bildirimlerinde (iptal/iade/eksik) zaman çizgisi YOKTUR** (tasarım kuralı): akış
 * bildirimi yolculuğu gösterir, istisna bildirimi tek anı. O yüzden burada yer almazlar.
 */
const EVENT_STEP: Partial<Record<NotifyEventName, NotificationStep['key']>> = {
  order_confirmed: 'received',
  order_out_for_delivery: 'on_the_way',
  order_delivered: 'delivered',
};

/** Zaman çizgisi taşımayan olaylar — bunlarda tek durum bloğu ve para çözümü vardır. */
const EXCEPTION_EVENTS: readonly NotifyEventName[] = ['order_cancelled', 'order_shortfall', 'order_refunded'];

interface NotificationBundle {
  data: OrderNotification;
  recipient: NotifyRecipient;
}

/**
 * Siparişten bildirim verisini kurar. Bulunamazsa `null` — çağıran bunu sessiz atlar; bildirim
 * yokluğu bir iş hatası değildir.
 */
export async function buildOrderNotification(
  orderId: string,
  event: NotifyEventName,
  opts: { refundedAmount?: number | null } = {},
): Promise<NotificationBundle | null> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return null;

  const { order, items } = found;
  const customer = await new UserProfileService(db).getById(order.customerId);
  // **Dil ÖNCE siparişten** (0015 `locale`): müşteri bu siparişi hangi dilde verdiyse maili o dilde
  // okumalı. Profil ikinci sıradadır çünkü sonradan değişebilir — hesap dilini değiştiren ya da aynı
  // şirket hesabından başka biri sipariş veren müşteride, eski siparişin maili dil değiştirirdi.
  // Web dışı kayıtta (hızlı satış, operasyon girişi) sipariş dilsizdir; orada profil doğru cevaptır.
  const locale: PreferredLanguage = order.locale ?? customer?.preferredLanguage ?? 'fr';

  // Aynı ayrım hem kalem satırlarını hem para türetimini yönetir — iki yerde farklı okunursa
  // mailin listesi ile toplamı çelişir.
  const settled = isFulfillmentSettled(order.status, items);
  const [lines, steps] = await Promise.all([buildLines(db, items, locale, settled), buildSteps(db, orderId, event)]);

  const derivation = derivePaymentStatusForOrder(order, items, {
    collected: order.amountCollected,
    refunded: order.amountRefunded,
  });

  const data: OrderNotification = {
    referenceNo: order.referenceNo ?? '—',
    orderedOn: formatShortDate(order.createdAt, locale),
    customerName: customer?.name ?? null,
    locale,
    steps,
    lines,
    totals: buildTotals(order, locale, event),
    grandTotal: {
      label: event === 'order_confirmed' ? TOTAL_LABEL[locale].grand : TOTAL_LABEL[locale].current,
      // İki ayrı soru, iki ayrı sayı: ONAYDA müşterinin ödeyeceği SİPARİŞ tutarı yazar (mal henüz
      // hazırlanmadı, karşılanan 0'dır — onu yazsaydık mail "0,00 €" derdi). Sonraki maillerde
      // **karşılanan** tutar yazar; eksik çıkan kalem varsa toplam kendiliğinden iner ve müşteri
      // ödeyeceği/iade alacağı gerçek rakamı görür.
      value: formatPrice(
        Math.round((event === 'order_confirmed' ? order.total : derivation.fulfilledAmountCents / 100) * 100),
        locale,
      ),
    },
    statusAt: EXCEPTION_EVENTS.includes(event) ? formatShortDate(new Date().toISOString(), locale) : null,
    // Para çözümü istisna bildirimlerinin ilk kartıdır. İki sayı da TÜRETİLİR: iade borcu motordan
    // (`refundDueCents`), iptalde ise net tahsilatın tamamı — karşılanan 0 sayıldığı için aynı
    // hesap kendiliğinden tamamını verir (ORDER_LIFECYCLE).
    refund: buildRefund(order, refundAmountCents(items, event, opts.refundedAmount, derivation.refundDueCents), event, locale),
    paidOnline: order.amountCollected > 0,
    paymentNote: paymentNote(order, derivation.amountToCollectCents, locale),
    delivery: buildDelivery(order, locale),
    tracking: null, // Kargo takibi 07.4/07.5 ile gelir; alan hazır, kaynak yok.
    /**
     * **Bağda KİMLİK taşınır, referans numarası değil** (03.08 düzeltmesi).
     *
     * Segment adı `[reference]` ama sayfa siparişi `getWithItems(orderId)` ile çözüyor — yüzeydeki
     * bütün bağlar (siparişler listesi, talep formu, onay ekranı) kimlik geçiriyor. Burada bir ara
     * `referenceNo ?? id` yazıyordu: referans numarası olan HER siparişte, yani onaylanmış olan
     * hepsinde, mailin ana düğmesi 404'e düşüyordu. Numara mailin metninde zaten görünüyor;
     * müşteriye gösterilen ile adreste taşınan aynı şey olmak zorunda değil.
     */
    orderUrl: localizedUrl('/orders/[reference]', locale, { reference: order.id }),
    deliverySummaryUrl: null, // Teslimat özeti belgesi 14.6'da doğar.
    supportUrl: localizedUrl('/support', locale),
    notificationPreferencesUrl: localizedUrl('/account/notifications', locale),
  };

  return {
    data,
    recipient: { name: customer?.name ?? null, email: customer?.email ?? null, phone: customer?.phone ?? null, locale },
  };
}

/**
 * Kalem satırları. Ad üründen gelir (varyantın kendi adı yoktur), paket kaleminde paket adından.
 * Eksik karşılanan kalemde tasarımın kuralı uygulanır: **sebep yazılmaz**, yalnız miktar + para.
 *
 * **Ölçü, hazırlık kesinleşmişse karşılanan adet; kesinleşmemişse SİPARİŞ EDİLEN adettir**
 * (`isFulfillmentSettled` — motorun zaten bildiği ayrım). Bu ayrım olmadan onaylanmış bir sipariş
 * maili her kalemi "0 gönderildi, tamamı iade edilecek" diye anlatıyordu: `fulfilled_qty` o anda
 * 0'dır ama bu "eksik gitti" değil, "daha hazırlanmadı" demektir. Müşteri, siparişini verir vermez
 * hepsinin iptal edildiğini sanıyordu.
 */
async function buildLines(
  db: ReturnType<typeof serviceDb>,
  items: readonly OrderItem[],
  locale: PreferredLanguage,
  fulfillmentSettled: boolean,
) {
  const variants = await new ProductVariantService(db).listByIds(items.map((item) => item.variantId));
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const bundleIds = [...new Set(items.map((item) => item.bundleId).filter((id): id is string => Boolean(id)))];
  const bundles = bundleIds.length > 0 ? await new BundleService(db).listByIds(bundleIds) : [];

  const productOf = new Map(products.map((product) => [product.id, product]));
  const variantOf = new Map(variants.map((variant) => [variant.id, variant]));
  const bundleOf = new Map(bundles.map((bundle) => [bundle.id, bundle]));

  return items.map((item) => {
    const variant = variantOf.get(item.variantId);
    const bundle = item.bundleId ? bundleOf.get(item.bundleId) : null;
    const name = bundle?.name?.[locale] ?? (variant ? productOf.get(variant.productId)?.name?.[locale] : null) ?? '—';
    const unit = formatPrice(Math.round(item.unitPrice * 100), locale);
    const shown = fulfillmentSettled ? item.fulfilledQty : item.qty;
    // Eksiklik ancak hazırlık kesinleştiyse BİLİNİR; öncesinde ortada bir fark yoktur.
    const missing = fulfillmentSettled ? item.qty - item.fulfilledQty : 0;

    return {
      name,
      meta: `${item.qty} × ${unit}`,
      qty: shown,
      amount: formatPrice(Math.round(item.unitPrice * shown * 100), locale),
      shortfall:
        missing > 0
          ? SHORTFALL[locale](item.qty, item.fulfilledQty, formatPrice(Math.round(item.unitPrice * missing * 100), locale))
          : null,
    };
  });
}

/**
 * Zaman çizgisi durum LOGUNDAN türetilir — siparişte "hazırlandı" damgası tutulmaz, geçiş kaydı
 * zaten vardır (07.6). Gerçekleşmiş adım zamanını gösterir, gerçekleşmemiş adım soluk kalır.
 */
async function buildSteps(db: ReturnType<typeof serviceDb>, orderId: string, event: NotifyEventName): Promise<NotificationStep[]> {
  const log = await new OrderStatusLogService(db).listByOrder(orderId);
  const firstAt = (status: string) => log.find((entry) => entry.toStatus === status)?.createdAt ?? null;

  const stampOf: Record<NotificationStep['key'], string | null> = {
    received: firstAt('confirmed') ?? log[0]?.createdAt ?? null,
    prepared: firstAt('ready') ?? firstAt('preparing'),
    on_the_way: firstAt('out_for_delivery'),
    delivered: firstAt('delivered') ?? firstAt('completed'),
  };

  const step = EVENT_STEP[event];
  if (!step) return []; // İstisna bildirimi — çizgi yok.

  const currentIndex = STEP_ORDER.indexOf(step);
  return STEP_ORDER.map((key, index) => {
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
function buildTotals(order: Order, locale: PreferredLanguage, event: NotifyEventName) {
  if (event !== 'order_confirmed') return [];
  const t = TOTAL_LABEL[locale];
  const lineTotal = order.total + order.discountAmount - order.shippingFee;

  return [
    { label: t.subtotal, value: formatPrice(Math.round(lineTotal * 100), locale) },
    ...(order.discountAmount > 0
      ? [{ label: discountRowLabel(order, t.discount, locale), value: `−${formatPrice(Math.round(order.discountAmount * 100), locale)}`, positive: true }]
      : []),
    {
      label: t.delivery,
      value: order.shippingFee > 0 ? formatPrice(Math.round(order.shippingFee * 100), locale) : t.free,
      positive: order.shippingFee === 0,
    },
  ];
}

/**
 * İndirim satırının adı: "İndirim — Hoş geldin indirimi". Kampanyanın müşteriye görünen adı sipariş
 * anında KOPYALANMIŞTIR (`discountLabel`); bugünkü tanıma bakılmaz, çünkü kampanya o günden beri
 * yeniden adlandırılmış ya da silinmiş olabilir ve aynı mailin yeniden basımı başka şey derdi.
 *
 * Ad yoksa satır genel adında kalır — sepetteki tür-temelli açıklama ("kampanya %15") burada
 * TEKRARLANMAZ: sipariş kaydında o türü söyleyecek bir bilgi yok, uydurmak yerine susulur.
 */
function discountRowLabel(order: Order, generic: string, locale: PreferredLanguage): string {
  const named = order.discountLabel ? resolveLocalizedText(order.discountLabel, locale) : '';
  return named ? `${generic} — ${named}` : generic;
}

/**
 * Paranın çözümü — istisna bildirimlerinin ilk kartı.
 *
 * Tutar tek yerden gelir: **iade borcu** (net tahsilat − karşılanan). İptalde karşılanan 0 sayıldığı
 * için aynı hesap tahsilatın tamamını verir; ayrı bir "iptal iadesi" formülü yazmaya gerek yoktur.
 * Borç yoksa `null` döner ve kart hiç çıkmaz — "0,00 € iade edildi" diyen bir mail gürültüdür.
 */
function buildRefund(order: Order, amountCents: number, event: NotifyEventName, locale: PreferredLanguage) {
  if (!EXCEPTION_EVENTS.includes(event) || amountCents <= 0) return null;

  const previousCents = Math.round(order.total * 100);
  return {
    amount: formatPrice(amountCents, locale),
    previousTotal: formatPrice(previousCents, locale),
    // İptalde güncellenecek bir toplam yoktur: sipariş kalmadı.
    currentTotal: event === 'order_cancelled' ? null : formatPrice(Math.max(0, previousCents - amountCents), locale),
  };
}

/**
 * İstisna bildiriminde gösterilecek tutar. Üç olayın üçünde de farklı bir soruya cevap verir:
 *
 * - **Eksik karşılanma** → GİTMEYEN MALIN değeri. Peşin ödendiyse iade edilecek tutar budur, kapıda
 *   ödenecekse tahsilattan düşecek tutar. Tek sayı, iki durum — ödeme yöntemine bakan dal yok.
 * - **İptal / iade** → FİİLEN İADE EDİLEN tutar; kapı onu yazdığı için oradan gelir. Türetilen
 *   "iade borcu" bu noktada ZATEN SIFIRDIR (para geri gönderildi) — onu okusaydık mail "iade yok"
 *   derdi. Mail olanı bildirir, kalanı değil.
 */
function refundAmountCents(
  items: readonly OrderItem[],
  event: NotifyEventName,
  refundedAmount: number | null | undefined,
  refundDueCents: number,
): number {
  if (event === 'order_shortfall') {
    return items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * Math.max(0, item.qty - item.fulfilledQty), 0);
  }
  return refundedAmount != null ? Math.round(refundedAmount * 100) : refundDueCents;
}

/** Ödeme hapı: peşin ödenmişse "ödendi", kalan varsa tahsil edilecek tutar (türetimden). */
function paymentNote(order: Order, toCollectCents: number, locale: PreferredLanguage): string | null {
  if (toCollectCents > 0) return PAYMENT_NOTE[locale].onDelivery(formatPrice(toCollectCents, locale));
  return order.amountCollected > 0 ? PAYMENT_NOTE[locale].paid : null;
}

const DELIVERY_COPY: Record<PreferredLanguage, { route: string; shipping: string }> = {
  tr: { route: 'Kapıya teslim', shipping: 'Kargoyla gönderim' },
  fr: { route: 'Livraison à domicile', shipping: 'Expédition' },
  de: { route: 'Lieferung an die Tür', shipping: 'Versand' },
};

function buildDelivery(order: Order, locale: PreferredLanguage) {
  const copy = DELIVERY_COPY[locale];
  const kind = order.deliveryType === 'shipping' ? copy.shipping : copy.route;
  const address = order.addressSnapshot as { line1?: string; postalCode?: string; city?: string } | null;

  return {
    icon: order.deliveryType === 'shipping' ? '📦' : '❄',
    headline: order.deliveryDate ? `${formatShortDate(order.deliveryDate, locale)} · ${kind}` : kind,
    detail: [address?.line1, [address?.postalCode, address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  };
}
