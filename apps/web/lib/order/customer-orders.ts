import 'server-only';
import { OrderItemService, OrderService, OrderStatusLogService, serviceDb } from '@lezzet/database';
import { customerOrderStatus, isActiveForCustomer, isFulfilmentKnown, orderTimeline } from '@lezzet/domain-core';
import type { OrderTimelineStep } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { CustomerOrderStatus, KeysetCursor, OrderItem, PaymentMethod, PaymentStatus } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { resolveOrderLines } from './customer-lines';
import { getPackagesByIds } from '@/lib/storefront/packages';

/**
 * **PARA SÖZLEŞMESİ — bu dosya bir sınırdır.**
 *
 * `packages/helper/money`: motor ve ekran **cent** ile çalışır, DB `numeric` (euro) tutar, dönüşüm
 * **sınırda** yapılır. Burası o sınır: `toCents` ortak helper'dan gelir, elle `* 100` yazılmaz.
 * Alan adları da sözleşmenin parçası — `…Cents` ile bitmeyen bir para alanı yoktur.
 *
 * Bu blok bir hatanın ardından yazıldı (30.07, kullanıcı ekran görüntüsüyle yakaladı): euro
 * değerleri cent sanılıp `formatPrice`'a verildi, 74,17 € ekranda **"0,74 €"** göründü. İki ders:
 * **(1)** dönüşüm zaten yazılmış, aramak yerine kendi kopyamı yazdım; **(2)** alan `total` diye
 * adlandırıldığı sürece hata satıra bakınca GÖRÜNMÜYOR — `totalCents` olunca görünüyor.
 * Adlandırma kuralı süs değil, tam olarak bu tuzağı yakalamak için konmuş.
 *
 * ---
 *
 * "Siparişlerim" listesinin okuma kapısı (08.5).
 *
 * **Sayfalama keyset ve imleç URL'e YAZILMAZ** (CLAUDE.md §1): sipariş sayısı veriyle sınırsız
 * büyür, ama süzgeç yok — paylaşılabilecek bir seçim de yok. Liste kaydırdıkça uzar
 * (tasarım: *"sayfalama düğmesi yok"*).
 *
 * **Taslaklar listede YOKTUR.** Yarıda kalmış bir checkout müşterinin verdiği bir sipariş değildir;
 * göstermek "bir siparişim daha varmış" dedirtirdi. Süzme durum kararının kendisinden geliyor
 * (`customerOrderStatus` → `null`), ayrı bir liste tutulmuyor: iki yerde yaşayan bir kural, bir gün
 * ayrışan bir kuraldır.
 *
 * Taslak süzmesi sayfa DOLDURULDUKTAN sonra olduğu için bir sayfa istenenden az satır dönebilir —
 * bu kabul edilir; `nextCursor` yine doğrudur ve kaydırma devam eder. Alternatifi, sorguya durum
 * süzgeci koyup keyset'i bozmaktı.
 */
export interface CustomerOrderSummary {
  id: string;
  /** Referans numarası — sipariş onaylanınca doğar; taslakta yok ama taslak zaten listede yok. */
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  /** Listenin en üstünde yeşil çerçeveyle ayrışan satır (tasarım). */
  active: boolean;
  totalCents: number;
  itemCount: number;
  /** Kısa içerik özeti — ilk birkaç ürünün adı; müşteri "hangi siparişim neydi"yi ayırt etsin. */
  productNames: readonly string[];
}

export interface CustomerOrderPage {
  orders: readonly CustomerOrderSummary[];
  nextCursor: KeysetCursor | null;
}

/** Özette adı yazılan ürün sayısı — tasarımda üç ad + "…" var. */
const SUMMARY_NAME_LIMIT = 3;

export async function listCustomerOrders(
  locale: Locale,
  customerId: string,
  cursor?: KeysetCursor,
): Promise<CustomerOrderPage> {
  const db = serviceDb();
  const page = await new OrderService(db).listByCustomer(customerId, { cursor });

  // Kalemler TEK turda: sipariş başına sorgu N+1 olurdu (`listByOrders` öbekliyor).
  const items = await new OrderItemService(db).listByOrders(page.rows.map((o) => o.id));
  const lines = await resolveOrderLines(db, items, locale);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const orders: CustomerOrderSummary[] = [];
  for (const order of page.rows) {
    const status = customerOrderStatus(order.status);
    if (!status) continue; // Taslak — müşterinin siparişi değil.

    const own = itemsByOrder.get(order.id) ?? [];
    // Ad tekilleştirilir: aynı ürünün iki boyu özette iki kez yazılmamalı ("Baklava, Baklava").
    const names = [...new Set(own.map((i) => lines.get(i.variantId)?.name).filter((n): n is string => Boolean(n)))];

    orders.push({
      id: order.id,
      referenceNo: order.referenceNo,
      createdAt: order.createdAt,
      status,
      active: isActiveForCustomer(status),
      totalCents: toCents(order.total),
      itemCount: own.length,
      productNames: names.slice(0, SUMMARY_NAME_LIMIT),
    });
  }

  return { orders, nextCursor: page.nextCursor };
}

/**
 * Detay sayfasının SATIRI — künye + sipariş anındaki para (cent).
 *
 * **Paket TEK satırdır** (tasarım: `Bayram Sofrası · Paket · 8 ürün` + altında içerik listesi).
 * Sipariş anında paket kalemlerine açılıyor ama müşteri onu bir bütün olarak satın aldı; kalemleri
 * ayrı ayrı fiyatlarıyla dizmek, hiç görmediği bir fiyat kırılımını ona göstermek olurdu (DOMAIN
 * §13: "müşteri yalnız paket toplamını görür"). Bu yüzden gruplama KAPIDA yapılır, ekranda değil.
 */
export interface CustomerOrderDetailLine {
  id: string;
  /**
   * Satırın ARKASINDAKİ gerçek sipariş kalemleri (08.6).
   *
   * Varyant satırında tek eleman (`id`nin kendisi); PAKET satırında **birden çok** — paket ekranda
   * tek satıra katlanıyor ama veride kendi kalemleridir ve `id` orada sentetik (`bundle:…`).
   * Talep formu "hangi ürünlerle ilgili" sorusunu bu kümeyle cevaplıyor: müşteri paketi işaretlerse
   * paketin bütün kalemleri işaretlenmiş olur, çünkü şikâyet ettiği şey paketin kendisidir.
   *
   * Ekranın kendi başına türetemeyeceği tek bilgi bu: katlama burada yapılıyor ve `bundle:` öneki
   * geri döndürülemez.
   */
  orderItemIds: readonly string[];
  /** `bundle` satırında paket adı, `variant` satırında ürün adı. */
  name: string;
  unit: string;
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
   * demekti (ve ilk sürümde ekran kendi hesabını yapıp her siparişte uyarı bastı).
   */
  shortfall: boolean;
  /** Eksik gelen miktarın para karşılığı — tasarım uyarıda tutarı da yazıyor ("5,90 € fark"). */
  shortfallCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CustomerOrderDetail {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  deliveryType: 'route' | 'shipping';
  deliveryDate: string | null;
  address: { line1?: string; line2?: string; postalCode?: string; city?: string } | null;
  lines: readonly CustomerOrderDetailLine[];
  /**
   * Dört adımlı zaman çizgisi; iptal/iade/taslakta `null` — tasarım orada "çizgi yerine tek durum
   * bloğu" istiyor ve kararı motor veriyor (`orderTimeline`).
   */
  timeline: readonly OrderTimelineStep[] | null;
  subtotalCents: number;
  discountCents: number;
  discountLabel: string;
  shippingFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  /** Vadeli (B2B) — ödeme hapı tasarımda ayrı bir hâl olarak çizili ("📋 Vadeli"). */
  onAccount: boolean;
}

/**
 * Tek siparişin detayı (08.5).
 *
 * **Sahiplik sunucuda doğrulanır** ve bulunamayan ile başkasına ait olan AYNI cevabı alır (`null`):
 * ayrım söylenirse, deneme yanılmayla başkasının sipariş kimliği doğrulatılabilirdi.
 *
 * **Taslak burada da görünmez** — listede olmayan bir siparişin detayına doğrudan adresle
 * girilebilmesi, listenin kuralını arkadan delerdi.
 *
 * **Satır toplamı sipariş anındaki paradan hesaplanır** (`unit_price` × giden miktar − indirim
 * payı), bugünkü fiyattan değil: burası bir kayıttır, vitrin değil. Ürün ADI ise canlı okunur
 * (`customer-lines` künyesi) — para donar, isim donmaz.
 */
export async function getCustomerOrderDetail(
  locale: Locale,
  customerId: string,
  orderId: string,
): Promise<CustomerOrderDetail | null> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found || found.order.customerId !== customerId) return null;

  const { order, items } = found;
  const status = customerOrderStatus(order.status);
  if (!status) return null;

  const [lookup, history, bundles] = await Promise.all([
    resolveOrderLines(db, items, locale),
    new OrderStatusLogService(db).listByOrder(order.id),
    getPackagesByIds([...new Set(items.map((i) => i.bundleId).filter((id): id is string => Boolean(id)))], locale),
  ]);

  /**
   * Ölçüm var mı? Hazırlık onaylanana kadar `fulfilled_qty` yazılmamış bir `0`dır — onu "gönderilen
   * miktar" saymak, yeni siparişte tüm kalemleri boş ve tutarları EKSİ gösterir (30.07 hatası).
   */
  const measured = isFulfilmentKnown(order.status);
  const billedOf = (item: OrderItem) => (measured ? item.fulfilledQty : item.qty);
  const moneyOf = (item: OrderItem) => item.unitPrice * billedOf(item) - item.lineDiscountAmount;

  const lines: CustomerOrderDetailLine[] = [];

  /**
   * PAKET satırları tek satıra katlanır. Adet paket içeriğinin oranından geri gelir (paket 2 adet A
   * içeriyorsa ve siparişte 6 A varsa 3 paket alınmıştır) — `reorder` ile aynı hesap.
   *
   * Paket artık satılmıyorsa künyesi yok; o zaman kalemler tek tek gösterilir. Alternatif, siparişin
   * bir bölümünü hiç göstermemekti — müşteri parasının karşılığını görmeli.
   */
  const grouped = new Set<string>();
  for (const bundle of bundles) {
    const own = items.filter((i) => i.bundleId === bundle.id);
    if (own.length === 0) continue;
    own.forEach((i) => grouped.add(i.id));

    const qty = bundleQtyOf(bundle.items, own);
    const totalCents = own.reduce((sum, i) => sum + toCents(moneyOf(i)), 0);
    lines.push({
      id: `bundle:${bundle.id}`,
      orderItemIds: own.map((i) => i.id),
      name: bundle.name,
      unit: '',
      bundle: { itemCount: bundle.items.length, contents: bundle.items.map((c) => c.name) },
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
    lines.push({
      id: item.id,
      orderItemIds: [item.id],
      name: lookup.get(item.variantId)?.name ?? '',
      unit: lookup.get(item.variantId)?.unit ?? '',
      bundle: null,
      qty: item.qty,
      billedQty: billedOf(item),
      shortfall: measured && item.fulfilledQty < item.qty,
      shortfallCents: measured ? toCents(item.unitPrice * (item.qty - item.fulfilledQty)) : 0,
      unitPriceCents: toCents(item.unitPrice),
      lineTotalCents: toCents(moneyOf(item)),
    });
  }

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    status,
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    address: order.addressSnapshot as CustomerOrderDetail['address'],
    lines,
    timeline: orderTimeline(order.status, history),
    // Ara toplam kalemlerden TÜRETİLİR: siparişte ayrı bir alan yok ve olmamalı — iki kaynak
    // bir gün ayrışır. İndirim ayrı satır olarak gösterildiği için burada payları geri ekliyoruz.
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0) + toCents(order.discountAmount),
    discountCents: toCents(order.discountAmount),
    discountLabel: order.discountLabel ? resolveLocalizedText(order.discountLabel, locale) : '',
    shippingFeeCents: toCents(order.shippingFee),
    totalCents: toCents(order.total),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    onAccount: order.onAccount,
  };
}

/**
 * Paket kaç adet alınmış — kalem adedinin paket içeriğindeki adede oranı (`reorder` ile aynı kural).
 * Oran bozuksa (paket içeriği o günden beri değişmiş) 1'e düşer: uydurma bir adet yazmaktansa
 * en muhafazakâr sayıyı göstermek, tutar satırıyla çelişmeyen tek seçenek.
 */
function bundleQtyOf(contents: readonly { variantId: string; qty: number }[], items: readonly OrderItem[]): number {
  for (const item of items) {
    const inBundle = contents.find((c) => c.variantId === item.variantId);
    if (inBundle && inBundle.qty > 0 && item.qty % inBundle.qty === 0) return item.qty / inBundle.qty;
  }
  return 1;
}
