import {
  BundleService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  ProductVariantService,
  WarehouseService,
} from '@lezzet/database';
import {
  bundleQtyOf,
  customerOrderStatus,
  derivePaymentStatusForOrder,
  fulfilledLineAmountCents,
  isActiveForCustomer,
  isFulfilmentKnown,
  orderTimeline,
} from '@lezzet/domain-core';
import type { OrderTimelineStep } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type {
  CustomerOrderStatus,
  DeliveryType,
  KeysetCursor,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  PreferredLanguage,
} from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { brand } from '@lezzet/brand';
import { EMPTY_IMAGE, imageOf, variantNameIn } from '../catalog/map';
import { warehouseAddressLine } from '../warehouse/pickup';
import { parcelOrdinal, readOrderTracking } from '../shipping/tracking';
import type { StorefrontImage } from '../catalog/storefront-types';

/*
  Müşteri sipariş okuması: "Siparişlerim" listesi ve detay, iki yüzeyin ortak kapısı. Para alanları cent'tir ve adı `…Cents` ile
  biter; DB istemcisini çağıran verir, çünkü paket taşımadan bağımsızdır.
*/

/** Özette adı/görseli taşınan kalem sayısı — v3 kartı dört ürün + bir paket halkası çiziyor. */
const SUMMARY_THUMB_LIMIT = 5;

/** Liste satırının küçük resmi — ad ekran okuyucunun ve baş harf yedeğinin kaynağı. */
export interface CustomerOrderThumb {
  name: string;
  image: StorefrontImage;
}

export interface CustomerOrderSummary {
  id: string;
  /** Referans numarası onayla doğar; `awaiting_payment` satırında `null`dır ve satır sipariş kimliğiyle açılır. */
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  /** Listenin başında ayrışan satır: müşterinin hâlâ beklediği bir hareket var. */
  active: boolean;
  totalCents: number;
  /** Sipariş KALEM sayısı (satır sayısı) — adet toplamı değil. */
  itemCount: number;
  /** Kısa içerik özeti — tekilleştirilmiş ve SINIRLI; müşteri "hangi siparişim neydi"yi ayırt etsin. */
  thumbs: readonly CustomerOrderThumb[];
  /** Özete sığmayan kalem sayısı ("+N"); sığdıysa `0`. */
  moreCount: number;
}

export interface CustomerOrderPage {
  orders: readonly CustomerOrderSummary[];
  nextCursor: KeysetCursor | null;
}

export interface CustomerOrderListInput {
  customerId: string;
  locale: PreferredLanguage;
  cursor?: KeysetCursor;
  limit?: number;
}

/**
 * "Siparişlerim" listesi; keyset sayfalı, imleç URL'e yazılmaz. Ödemesi açılmamış taslak listede yok ve süzme durum kararının
 * kendisinden gelir; bu yüzden bir sayfa istenenden az satır dönebilir, `nextCursor` yine doğrudur.
 */
export async function listCustomerOrders(
  db: SupabaseClient,
  input: CustomerOrderListInput,
): Promise<CustomerOrderPage> {
  const page = await new OrderService(db).listByCustomer(input.customerId, {
    cursor: input.cursor,
    limit: input.limit,
  });

  // Kalemler TEK turda: sipariş başına sorgu N+1 olurdu (`listByOrders` öbekliyor).
  const items = await new OrderItemService(db).listByOrders(page.rows.map((o) => o.id));
  const lines = await resolveOrderLines(db, items, input.locale);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const orders: CustomerOrderSummary[] = [];
  for (const order of page.rows) {
    const status = customerOrderStatus(order.status, order.deliveryType, cardPaymentOpen(order));
    if (!status) continue;
    /* Hiç kesinleşmemiş iptal listede yok: numarası doğmadı, para hareket etmedi. Parası çekilip iade edilmiş olan kalır. */
    if (order.status === 'cancelled' && !order.referenceNo && !order.providerRefundedAt) continue;

    const own = itemsByOrder.get(order.id) ?? [];
    /*
      Küçük resimler ÜRÜNE göre tekilleştirilir: aynı ürünün iki boyu yığında iki halka olmaz
      ("Baklava, Baklava"). Anahtar varyant değil ürün adı+görseli — iki boy aynı ürünün aynı
      fotoğrafını taşır ve müşteri için tek bir şeydir.
    */
    const seen = new Set<string>();
    const thumbs: CustomerOrderThumb[] = [];
    for (const item of own) {
      const line = lines.get(item.variantId);
      if (!line || seen.has(line.productId)) continue;
      seen.add(line.productId);
      thumbs.push({ name: line.name, image: line.image });
    }

    orders.push({
      id: order.id,
      referenceNo: order.referenceNo,
      createdAt: order.createdAt,
      status,
      active: isActiveForCustomer(status),
      totalCents: order.orderedTotalCents,
      itemCount: own.length,
      thumbs: thumbs.slice(0, SUMMARY_THUMB_LIMIT),
      // "+N" TEKİLLEŞTİRİLMİŞ kümeden sayılır: yığında görünmeyen ürün sayısıdır, gizlenen kalem
      // sayısı değil. Ham kalem sayısını kullanmak, iki boyu olan bir üründe "+1" yazıp o "+1"in
      // karşılığı olan halkayı zaten göstermek olurdu.
      moreCount: Math.max(0, thumbs.length - SUMMARY_THUMB_LIMIT),
    });
  }

  return { orders, nextCursor: page.nextCursor };
}

/** Ödemesi açılmış kart taslağı müşterinin verdiği siparişin kendisidir; açılmamış taslak yarıda kalmış checkout'tur. */
function cardPaymentOpen(order: { paymentMethod: PaymentMethod | null; paymentRef: string | null }): boolean {
  return order.paymentMethod === 'online' && order.paymentRef !== null;
}

/** Detayın satırı; paket tek satırdır, çünkü müşteri onu bütün olarak aldı ve kalem fiyat kırılımını hiç görmedi. */
export interface CustomerOrderDetailLine {
  id: string;
  /** Satırın arkasındaki gerçek kalemler; paket satırında birden çok, talep formu "hangi ürünler" sorusunu bununla cevaplar. */
  orderItemIds: readonly string[];
  /** `bundle` satırında paket adı, `variant` satırında ürün adı. */
  name: string;
  unit: string;
  image: StorefrontImage;
  /** Paket satırıysa içerik künyesi; varyant satırında `null`. */
  bundle: { itemCount: number; contents: readonly string[] } | null;
  /** Sipariş edilen miktar (pakette: kaç paket). */
  qty: number;
  /**
   * Paranın hesaplandığı miktar. Hazırlık onaylanmadan önce **`qty`nin kendisidir** — o aşamada
   * `fulfilled_qty` henüz yazılmamış bir varsayılandır, ölçüm değil (`isFulfilmentKnown`).
   */
  billedQty: number;
  /**
   * Eksik karşılama GERÇEKTEN var mı — yalnız ölçüm bilindiğinde ve gerçekten az olduğunda `true`.
   * Ekran bunu yeniden hesaplamaz: "azsa" kuralını iki yerde tutmak, bir gün ayrışan iki cevap
   * demekti (ve web'in ilk sürümünde ekran kendi hesabını yapıp her siparişte uyarı bastı).
   */
  shortfall: boolean;
  /** Eksik gelen miktarın para karşılığı — uyarıda tutar da yazılıyor ("5,90 € fark"). */
  shortfallCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CustomerOrderDetail {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  active: boolean;
  /** Geniş küme: gel-al da görülür, yerinde satış "Siparişlerim"e düşer ve rota teslimatı gibi yazılmamalı. */
  deliveryType: DeliveryType;
  deliveryDate: string | null;
  address: { line1?: string; line2?: string; postalCode?: string; city?: string } | null;
  lines: readonly CustomerOrderDetailLine[];
  /**
   * Dört adımlı zaman çizgisi; iptal/iade/taslakta `null` — tasarım orada "çizgi yerine tek durum
   * bloğu" istiyor ve kararı motor veriyor (`orderTimeline`).
   */
  timeline: readonly OrderTimelineStep[] | null;
  /**
   * Gel-al'da müşterinin GİDECEĞİ yer: depo adı, adresi ve randevu için arayacağı numara (marka hattı — randevu sistem
   * dışı, DOMAIN §6). Öteki türlerde `null`; adres bloğu o zaman müşterinin adresidir.
   */
  pickup: { warehouseName: string; addressLine: string; phoneDisplay: string } | null;
  subtotalCents: number;
  discountCents: number;
  discountLabel: string;
  shippingFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  /** Vadeli (B2B) — ödeme hapının ayrı bir hâli. */
  onAccount: boolean;
  /**
   * Kargo künyesi; `null` rota siparişi ya da takibi olmayan kargo. `parcels` dizidir, çünkü çok kolili gönderide her kolinin
   * ayrı takip numarası var.
   */
  shipment: {
    carrierName: string | null;
    parcels: ReadonlyArray<{ ordinal: string | null; trackingNumber: string; trackingUrl: string | null }>;
  } | null;
}

/**
 * Siparişe hangi anahtarla ulaşıldığı: web segmentte sipariş kimliğini, mobil referans numarasını taşır. Ayrık birlik tek gövdeyle
 * ikisini de karşılar.
 */
export type CustomerOrderLookup = { orderId: string } | { reference: string };

export interface CustomerOrderDetailInput {
  customerId: string;
  locale: PreferredLanguage;
  lookup: CustomerOrderLookup;
}

/**
 * Tek siparişin detayı; bulunamayan ile başkasına ait olan aynı cevabı alır, ayrım kimlik doğrulatırdı. Taslak burada da görünmez,
 * para sipariş anındaki kayıttan ve ürün adı canlı okunur.
 */
export async function getCustomerOrderDetail(
  db: SupabaseClient,
  input: CustomerOrderDetailInput,
): Promise<CustomerOrderDetail | null> {
  const service = new OrderService(db);

  /*
    Referansla gelen istekte SAHİPLİK SORGUYA GÖMÜLÜ: `reference_no` benzersiz olsa da müşteri
    süzgeci olmadan okumak, "var mı yok mu" sorusunu numara deneyen birine cevaplamak olurdu.
    Kimlikle gelen istekte süzgeç aşağıdaki eşitlik kontrolüdür (web'in kararı, birebir).
  */
  const order =
    'orderId' in input.lookup
      ? await service.getById(input.lookup.orderId)
      : await service.findByReference(input.lookup.reference, input.customerId);
  if (!order || order.customerId !== input.customerId) return null;

  const status = customerOrderStatus(order.status, order.deliveryType);
  if (!status) return null;

  const items = await new OrderItemService(db).listByOrder(order.id);
  const bundleIds = [...new Set(items.map((i) => i.bundleId).filter((id): id is string => Boolean(id)))];

  const [history, bundles] = await Promise.all([
    new OrderStatusLogService(db).listByOrder(order.id),
    /* Paket künyesi satılabilirlik süzgecinden geçmez: burası kayıt, satışı biten paket geçmiş siparişin görünümünü değiştirmemeli.
       Paket kataloğu doğal tavanlı, tek sorguda gelir. */
    bundleIds.length === 0
      ? Promise.resolve([])
      : new BundleService(db).listWithItems().then((all) => all.filter((b) => bundleIds.includes(b.id))),
  ]);

  // Künye çözümü TEK turda: sipariş kalemlerinin varyantları + paket içeriğinin varyantları birlikte
  // — paket başına ikinci bir tur açmak N+1'in küçük hâli olurdu.
  const lookup = await resolveOrderLines(
    db,
    [...items, ...bundles.flatMap((b) => b.items)],
    input.locale,
  );

  /** Hazırlık onaylanana kadar `fulfilled_qty` yazılmamış bir `0`dır; gönderilen miktar sayılırsa kalemler boş görünür. */
  const measured = isFulfilmentKnown(order.status);
  // Müşteride kalan adedin bedeli siparişten düşer; müşteri tutarı iade edilen öteki adetlerle aynı dilden okur.
  const billedOf = (item: OrderItem) => (measured ? item.fulfilledQty - item.goodwillQty : item.qty);

  /* Satır parası ödeme motorundan, burada ikinci kez çarpılmaz; kendi çarpması indirimi karşılanan orana bölmediği için ekranla
     kapıdaki tahsilatı ayrıştırıyordu. */
  const moneyLine = (item: OrderItem) => ({
    fulfilledQty: item.fulfilledQty,
    goodwillQty: item.goodwillQty,
    orderedQty: item.qty,
    unitPriceCents: item.unitPriceCents,
    lineDiscountCents: item.lineDiscountAmountCents,
  });
  const moneyCentsOf = (item: OrderItem) => fulfilledLineAmountCents(moneyLine(item), measured);
  /** Sipariş edilenin tutarı — eksik hiç yokmuş gibi; ekranda ÜSTÜ ÇİZİLİ gösterilen sayı. */
  const orderedCentsOf = (item: OrderItem) => fulfilledLineAmountCents(moneyLine(item), false);
  /** Satırın indirim payı — ara toplam ile indirim satırının ayrıştırılması için. */
  const discountShareOf = (item: OrderItem) => item.unitPriceCents * billedOf(item) - moneyCentsOf(item);

  const lines: CustomerOrderDetailLine[] = [];

  /**
   * PAKET satırları tek satıra katlanır. Adet paket içeriğinin oranından geri gelir (paket 2 adet A
   * içeriyorsa ve siparişte 6 A varsa 3 paket alınmıştır) — `reorder` ile aynı hesap (`bundleQtyOf`).
   */
  const grouped = new Set<string>();
  for (const bundle of bundles) {
    const own = items.filter((i) => i.bundleId === bundle.id);
    if (own.length === 0) continue;
    own.forEach((i) => grouped.add(i.id));

    const qty = bundleQtyOf(bundle.items, own);
    const totalCents = own.reduce((sum, i) => sum + moneyCentsOf(i), 0);
    lines.push({
      id: `bundle:${bundle.id}`,
      orderItemIds: own.map((i) => i.id),
      name: resolveLocalizedText(bundle.name, input.locale),
      unit: '',
      image: imageOf(bundle),
      bundle: {
        itemCount: bundle.items.length,
        // Adı çözülemeyen içerik satırı LİSTEDEN DÜŞER, boş dize olarak yazılmaz: "· · Baklava"
        // gibi bir künye müşteriye bir şey söylemez (web `toDetail`in tersi karar ve bilinçli —
        // orada satırın kendisi bir bağdır ve yerini tutmak zorundadır, burada yalnız bir özet).
        contents: bundle.items
          .map((c) => lookup.get(c.variantId)?.name ?? '')
          .filter((name) => name.length > 0),
      },
      qty,
      billedQty: qty,
      // Paket bütün olarak satılır; eksik karşılama kalem düzeyinde bir olaydır ve paket satırında
      // gösterilecek yeri yok. Kalemlerinden biri eksik geldiyse fark tutar satırında görünür.
      shortfall: false,
      shortfallCents: 0,
      unitPriceCents: qty > 0 ? Math.round(totalCents / qty) : totalCents,
      lineTotalCents: totalCents,
    });
  }

  for (const item of items) {
    if (grouped.has(item.id)) continue;
    const line = lookup.get(item.variantId);
    lines.push({
      id: item.id,
      orderItemIds: [item.id],
      name: line?.name ?? '',
      unit: line?.unit ?? '',
      image: line?.image ?? EMPTY_IMAGE,
      bundle: null,
      qty: item.qty,
      billedQty: billedOf(item),
      shortfall: measured && billedOf(item) < item.qty,
      /* Fark, İKİ TUTARIN farkıdır — "eksik adet × birim fiyat" DEĞİL. İndirim payı da eksik adetle
         birlikte düştüğü için ham çarpım gerçek kaybı olduğundan büyük gösteriyordu; ekran bu sayıyı
         üstü çizili tutarı geri hesaplamakta kullanıyor (`lineTotal + shortfall = sipariş edilen`),
         dolayısıyla yanlışı orada da görünürdü. */
      shortfallCents: measured ? orderedCentsOf(item) - moneyCentsOf(item) : 0,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: moneyCentsOf(item),
    });
  }

  /* İndirim TÜM kalemlerden toplanır — paketlenmiş olanlar dahil: onların payı da satırlarının
     tutarından düşülmüş durumda, özet panelinde geri eklenmezse ara toplam eksik kalır. */
  const discountCents = items.reduce((sum, item) => sum + discountShareOf(item), 0);

  /*
    Takip künyesi EN SONDA okunuyor ve yalnız kargo siparişinde: rota siparişinde gönderi satırı
    hiç doğmaz, sorgu baştan cevabı belli bir soru olurdu. Kalem/paket çözümünün turlarına
    katılmadı çünkü onlar sipariş kalemlerine bağlı; bu okuma bağımsız ve tek kutulu siparişte
    iki küçük sorgu.
  */
  const tracking =
    order.deliveryType === 'shipping'
      ? await readOrderTracking(db, order.id, { carrier: order.carrier, trackingNumber: order.trackingNumber })
      : null;
  // Gel-al'da deponun kartı: müşteri nereye gideceğini ve kimi arayacağını bu ekrandan okur.
  const pickupWarehouse = order.deliveryType === 'pickup' ? await new WarehouseService(db).getById(order.warehouseId) : null;
  const pickup = pickupWarehouse
    ? { warehouseName: pickupWarehouse.name, addressLine: warehouseAddressLine(pickupWarehouse), phoneDisplay: brand.contact.phoneDisplay }
    : null;

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    status,
    active: isActiveForCustomer(status),
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    address: order.addressSnapshot as CustomerOrderDetail['address'],
    lines,
    timeline: orderTimeline(order.status, history, order.deliveryType),
    pickup,
    /* Ara toplam ve indirim türetilir; indirim de karşılananın payıdır, ham `discount_amount` eksik gönderimden habersizdir. */
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0) + discountCents,
    discountCents,
    discountLabel: order.discountLabel ? resolveLocalizedText(order.discountLabel, input.locale) : '',
    shippingFeeCents: order.shippingFeeCents,
    /* Toplam ödeme motorundan türetilir, `order.total` ham okunmaz: eksik karşılamada kuryenin tahsil ettiği tutarla aynı olmalı. */
    totalCents: derivePaymentStatusForOrder(order, items, {
      collectedCents: order.amountCollectedCents,
      refundedCents: order.amountRefundedCents,
    }).fulfilledAmountCents,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    onAccount: order.onAccount,
    /* Künye tek kapıdan: duyurulan gönderi, yoksa elle girilen numara. Numarası olmayan gönderi künye açmaz. */
    shipment:
      tracking && tracking.parcels.length > 0
        ? {
            carrierName: tracking.carrierName,
            parcels: tracking.parcels.map((parcel) => ({
              ordinal: parcelOrdinal(parcel),
              trackingNumber: parcel.trackingNumber,
              trackingUrl: parcel.trackingUrl,
            })),
          }
        : null,
  };
}

/* ─────────────────────────── kalem künyesi (iç) ─────────────────────────── */


/**
 * Sipariş kaleminin müşteri künyesi: kalem yalnız varyant kimliği taşır, ad canlı okunur ki yeniden adlandırılan ürün bulunabilsin.
 * Sorgu sayısı benzersiz varyant sayısıyla artar, kalem başına sorgu yok.
 */
interface CustomerOrderLine {
  /** Ürün kimliği — liste küçük resimlerinin tekilleştirme anahtarı. */
  productId: string;
  /** Ürün adı — bulunamazsa boş; ürün silinmiş olabilir, kalem yine de gösterilir. */
  name: string;
  /** Boyun müşteriye görünen adı ("4 adet · 420 g", `variantNameIn`). */
  unit: string;
  image: StorefrontImage;
}

/** Varyant kimliğine göre künye haritası; haritada olmayan varyant kalemi adsız bırakır, sipariş yine gösterilir. */
async function resolveOrderLines(
  db: SupabaseClient,
  items: readonly { variantId: string }[],
  locale: PreferredLanguage,
): Promise<Map<string, CustomerOrderLine>> {
  const variantIds = [...new Set(items.map((i) => i.variantId))];
  if (variantIds.length === 0) return new Map();

  const variants = await new ProductVariantService(db).listByIds(variantIds);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));

  return new Map(
    variants.map((variant) => {
      const product = productById.get(variant.productId);
      return [
        variant.id,
        {
          productId: variant.productId,
          name: product ? resolveLocalizedText(product.name, locale) : '',
          unit: variantNameIn(variant, locale),
          image: product ? imageOf(product) : EMPTY_IMAGE,
        },
      ];
    }),
  );
}
