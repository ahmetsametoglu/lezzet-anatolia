import {
  MoneyMovementService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  UserProfileService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import type { CreateOrderItemInput } from '@lezzet/database';
import type { Order, PaymentMethod, PreferredLanguage } from '@lezzet/types';
import { getCartView } from '../cart/read';
import { discountAmountOf, discountIdOf, discountLabelOf, discountSharesOf } from '../cart/cart-types';
import { readDoorAccountId } from './door-account';
import { quickSale, type QuickSaleOutcome } from './quick-sale';

/**
 * Yerinde satış (DOMAIN §17): depo kapısında ya da kuryenin aracında tek adımda kapanır; satan malın yanındaki personeldir, bu yüzden
 * depo onun o anki deposudur ve araç da bir depodur. Fiyat, KDV ve indirim müşterinin gördüğü sayıyı üreten sepet okumasından
 * (`getCartView`) gelir; bu dosya yalnız sırayı kurar.
 */

/**
 * Yerinde satışın anonim alıcısı (`0001`, `roles = {system}`): sipariş sahipsiz olamaz ama alıcıya kimlik sorulmaz. `system` rolü
 * hiçbir kapı açmaz ve müşteri listeleri `roles @> {customer}` ile süzüldüğü için bu kayda geçmiş birikmez.
 */
export const ANONYMOUS_BUYER_ID = '00000000-0000-4000-8000-00000000d001';

export interface OnSiteSaleLine {
  variantId: string;
  qty: number;
  /**
   * Pazarlıklı birim fiyat (**cent**). Dokunulmamış kalemde gelmez ve fiyatı sunucu çözer, çünkü her kaleme sayı göndermek siparişin
   * parasını istemciye yazdırırdı.
   */
  negotiatedUnitPriceCents?: number;
}

export interface OnSiteSaleInput {
  /** Personelin O ANKİ deposu — tesis ya da ARAÇ. Varsayılanı YOKTUR (DOMAIN §17 / C2). */
  warehouseId: string;
  /** Satışı yapan personel — pazarlık izinin "kim" tarafı ve geçiş logunun aktörü. */
  staffId: string;
  /**
   * Siparişin yazılacağı müşteri: kimlik sorulmadığı için normalde anonim kayıt, kendi hesabıyla alan için gerçek kimlik. Kararı
   * çağıran verir; bu kapı politika uygulamaz, yalnız yazar.
   */
  customerId: string;
  lines: readonly OnSiteSaleLine[];
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents?: number;
  /** Paranın girdiği hesap. Verilmezse yöntemin kapı hesabı ayarına düşülür; o da yoksa satış başlamaz. */
  paymentAccountId?: string;
  /** Satır adlarının dili — ret mesajları müşterinin değil PERSONELİN dilinde okunur. */
  locale?: PreferredLanguage;
  /** Cevabı kaybolan satış aynı kimlikle yeniden gelir; kimlik siparişe yazılır ki ikinci istek ikinci satış açmasın. */
  idempotencyKey?: string | null;
}

export type OnSiteSaleOutcome =
  | { status: 'ok'; orderId: string; totalCents: number; referenceNo: string | null; paymentRecorded: boolean }
  /** Kalemsiz satış yazılamaz — RPC de reddediyor, kontrol gidiş-dönüşü harcamamak için. */
  | { status: 'empty' }
  | { status: 'warehouse_not_found' }
  /** Satılamaz satır (tükendi / satışa kapalı). Elle fiyat yazmak kapanmış ürünü DİRİLTMEZ. */
  | { status: 'blocked_lines'; lines: string[] }
  /**
   * Bu depoda o kadar yok — **sipariş HİÇ yazılmaz** ve kalan sayı söylenir.
   *
   * `createCheckoutDraft`in aynı reddi (aynı ad, aynı biçim): adet sessizce düşürülmez, çünkü
   * müşterinin/personelin yazdığı sayıyı haber vermeden değiştirmek sepette yasakladığımız sessiz
   * daralmanın ta kendisidir.
   */
  | { status: 'insufficient_here'; lines: { name: string; available: number }[] }
  /** Yöntemin kapı hesabı ayarlı değil — sipariş HİÇ yazılmaz, çünkü mal giderken para kayıtsız kalırdı. */
  | { status: 'no_payment_account' }
  /** Kapanış adımının reddi olduğu gibi taşınır — mal yok, yarış, kural reddi. */
  | { status: 'sale_failed'; outcome: Exclude<QuickSaleOutcome, { status: 'ok' }> };

export async function sellOnSite(db: Db, input: OnSiteSaleInput): Promise<OnSiteSaleOutcome> {
  if (input.lines.length === 0) return { status: 'empty' };

  if (input.idempotencyKey) {
    const already = await new OrderService(db).findByIdempotencyKey(input.idempotencyKey, input.customerId);
    if (already && already.status !== 'cancelled') return repeatedSale(db, already, input);
  }

  const warehouse = await new WarehouseService(db).getById(input.warehouseId);
  if (!warehouse) return { status: 'warehouse_not_found' };

  // Hesap taslaktan önce denetlenir: reddedilen satış kapanmayacak bir taslak sipariş bırakmasın.
  const paymentAccountId = input.paymentAccountId ?? (await readDoorAccountId(db, input.paymentMethod));
  if (!paymentAccountId) return { status: 'no_payment_account' };

  const locale: PreferredLanguage = input.locale ?? 'tr';
  const overrides = new Map(
    input.lines
      .filter((line) => line.negotiatedUnitPriceCents !== undefined)
      .map((line) => [line.variantId, line.negotiatedUnitPriceCents!] as const),
  );

  /*
    Sepet okuması yerin DEPOSUNU alıyor ve bu tam da istediğimiz süzgeç: depo bazlı
    `available_stock` aracı AYNEN gösteriyor (depo-üstü toplam göstermiyor — `available_stock_total`
    araçları dışlıyor). Yani kuryenin arabasındaki mal burada görünür, ayrılmış mal görünmez.
  */
  const view = await getCartView(
    db,
    locale,
    input.lines.map((line) => ({ kind: 'variant' as const, variantId: line.variantId, qty: line.qty, stockId: null })),
    { customerId: input.customerId, priceOverrides: overrides, warehouseId: input.warehouseId, business: warehouse.business },
  );

  const blocked = view.lines.filter((line) => line.unitPriceCents === null).map((line) => line.name);
  if (blocked.length > 0) return { status: 'blocked_lines', lines: blocked };

  /*
    Depo bazlı stok kontrolü yazımdan önce: yalnız `quickSale`de kalsaydı reddedilen satış geriye hiç kapanmayacak bir taslak sipariş
    bırakırdı; son söz yine RPC'nindir, çünkü kontrol ile yazım arasında raf değişebilir. Ret `createCheckoutDraft`inkiyle aynı biçimdedir:
    adet sessizce düşürülmez, personel müşteriye kalanı söyleyebilsin diye kalan sayı döner.
  */
  const overCap = view.lines.filter((line) => line.availableHere !== null && line.availableHere < line.qty);
  if (overCap.length > 0) {
    return {
      status: 'insufficient_here',
      lines: overCap.map((line) => ({ name: line.name, available: line.availableHere ?? 0 })),
    };
  }

  /*
    Süzgeç bugün yalnız tipi daraltır, çünkü bu kapı yalnız varyant kalemi alır; paket satırı kabul edilirse pazarlığın pakete
    uygulanmadığı hesaba katılmalı (DOMAIN §13). İndirim payları satırla birlikte süzülür, çünkü `discountSharesOf` konum dizisi döner ve
    yalnız satırı süzmek kalan kaleme başkasının indirimini yazardı.
  */
  const shares = discountSharesOf(view.discount);
  const kept = view.lines
    .map((line, index) => ({ line, share: shares[index] ?? 0 }))
    .filter((row): row is { line: typeof row.line & { variantId: string }; share: number } => row.line.variantId !== undefined);

  const items: CreateOrderItemInput[] = kept.map(({ line, share }) => ({
    variantId: line.variantId,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents ?? 0,
    // Pazarlık izi İKİSİ BİRLİKTE yazılır (kısıt veride: `order_item_negotiation_complete`).
    ...(line.listUnitPriceCents != null
      ? { listUnitPriceCents: line.listUnitPriceCents, priceSetBy: input.staffId }
      : {}),
    vatRate: line.vatRate,
    // İndirim kaleme yazılır, yoksa ciro onu görmez: `revenue_total` tetikleyicisi (`resync_order_revenue`) yalnız bu alanı okur.
    lineDiscountAmountCents: share,
  }));

  // Adresten çözülen `createCheckoutDraft` kullanılmaz, çünkü yerinde satışta adres, bölge, gün ve kargo yoktur. `pickup` anında tüketim
  // demek değildir: stok etkisini teslim türü değil `quickSale`in seçtiği `draft → completed` geçişi belirler.
  const { order } = await new OrderService(db).create(
    {
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      channel: 'b2c',
      // Son kapı satışları görünümü (`listDoorSales`) siparişi bu kaynaktan bulur.
      orderSource: 'door',
      deliveryType: 'pickup',
      status: 'draft',
      paymentMethod: input.paymentMethod,
      // Kargo ücreti SORULMUYOR: `resolveShippingFee` `pickup` almıyor, sipariş doğrudan 0 yazar.
      shippingFeeCents: 0,
      orderedTotalCents: view.totalCents,
      /*
        Siparişin indirim alanları da yazılır, çünkü kampanya kotası `create_order` RPC'sinde `discount_id`den tükenir ve veritabanı
        `discount_amount = Σ line_discount_amount` eşitliğini commit anında denetler (`order_discount_balance`); alanlar checkout'un
        okuduğu fonksiyonlardan gelir ki iki kapı aynı sepete farklı kayıt yazmasın. Kupon kodu bu kapıda yoktur, yalnız otomatik
        kampanya uygulanır; uydurulmuş bir kod kaydı kampanya raporunu yanlış okuturdu.
      */
      discountAmountCents: discountAmountOf(view.discount),
      discountId: discountIdOf(view.discount),
      discountLabel: discountLabelOf(view.discount),
      locale,
      idempotencyKey: input.idempotencyKey ?? null,
    },
    items,
  );

  const outcome = await quickSale(db, {
    orderId: order.id,
    actorId: input.staffId,
    paymentMethod: input.paymentMethod,
    collectedAmountCents: input.collectedAmountCents,
    paymentAccountId,
  });

  if (outcome.status !== 'ok') return { status: 'sale_failed', outcome };

  return {
    status: 'ok',
    orderId: order.id,
    totalCents: view.totalCents,
    referenceNo: outcome.referenceNo,
    paymentRecorded: outcome.paymentRecorded,
  };
}

/**
 * Aynı kimlikle gelen tekrar: yazılmış satış olduğu gibi döner, ilk istek kapanıştan önce düştüyse aynı taslak kapatılır. Eşzamanlı
 * iki tekrarda geçişi biri kazanır; öteki ret alır ve sonraki deneme yazılmış satışı görür.
 */
async function repeatedSale(db: Db, order: Order, input: OnSiteSaleInput): Promise<OnSiteSaleOutcome> {
  if (order.status === 'draft') {
    const outcome = await quickSale(db, {
      orderId: order.id,
      actorId: input.staffId,
      paymentMethod: input.paymentMethod,
      collectedAmountCents: input.collectedAmountCents,
      paymentAccountId: input.paymentAccountId,
    });
    if (outcome.status !== 'ok') return { status: 'sale_failed', outcome };
    return {
      status: 'ok',
      orderId: order.id,
      totalCents: order.orderedTotalCents,
      referenceNo: outcome.referenceNo,
      paymentRecorded: outcome.paymentRecorded,
    };
  }
  const movements = await new MoneyMovementService(db).listByOrder(order.id);
  return {
    status: 'ok',
    orderId: order.id,
    totalCents: order.orderedTotalCents,
    referenceNo: order.referenceNo,
    paymentRecorded: movements.some((movement) => movement.type === 'order_payment'),
  };
}

/** Son satışlar görünümünün satırı — telin şekli `SaleRecordSchema`da aynalanır. */
export interface DoorSaleRecord {
  orderId: string;
  referenceNo: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  /** Kalem sayısı — ekran "N kalem" yazar; kalem adları bu görünümün sorusu değil. */
  lineCount: number;
  /**
   * Satışı yazan personelin adı: `order_status_log`un `completed` geçişindeki `actorId`den gelir (`quick_sale` RPC yazar). `null` = iz
   * yok; ekran "bilinmiyor" der, uydurmaz.
   */
  sellerName: string | null;
}

/**
 * Son kapı satışları: personelin o anki deposunun `door` siparişleri, en yeni önce. Okumalar toplu (siparişler, kalemler, geçiş izleri
 * ve tek `listByIds` ile satıcılar); tavan `listDoorSales`ın sınırıdır.
 */
export async function listRecentDoorSales(db: Db, warehouseId: string): Promise<DoorSaleRecord[]> {
  const orders = await new OrderService(db).listDoorSales(warehouseId);
  if (orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);

  const [items, logs] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    new OrderStatusLogService(db).listByOrders(orderIds),
  ]);

  const lineCounts = new Map<string, number>();
  for (const item of items) lineCounts.set(item.orderId, (lineCounts.get(item.orderId) ?? 0) + 1);

  // Satan kişi = `completed`a GEÇİREN aktör. Aynı sipariş iki kez completed olamaz (durum makinesi);
  // yine de son yazılan kazanır — log kronolojik geliyor.
  const sellerIds = new Map<string, string>();
  for (const log of logs) {
    if (log.toStatus === 'completed' && log.actorId !== null) sellerIds.set(log.orderId, log.actorId);
  }
  const sellers = await new UserProfileService(db).listByIds([...new Set(sellerIds.values())]);
  const nameOf = new Map(sellers.map((s) => [s.id, s.name]));

  return orders.map((order) => ({
    orderId: order.id,
    referenceNo: order.referenceNo,
    totalCents: order.orderedTotalCents,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    lineCount: lineCounts.get(order.id) ?? 0,
    sellerName: nameOf.get(sellerIds.get(order.id) ?? '') ?? null,
  }));
}
