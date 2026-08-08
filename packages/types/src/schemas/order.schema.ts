import { z } from 'zod';
import { dbNumeric } from './db-numeric';
import {
  CarrierEnum,
  ChannelEnum,
  CountryEnum,
  DeliveryTypeEnum,
  OrderSourceEnum,
  OrderCancelReasonEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  PreferredLanguageEnum,
  ReturnDispositionEnum,
  VatTreatmentEnum,
} from './enums.schema';
import { LocalizedTextDraftSchema } from './localized-text.schema';

// Order — sipariş omurgası (ORDER_LIFECYCLE, DOMAIN §5–§8).
//
// İki eksen ayrıdır: `status` siparişin YOLCULUĞU, `paymentStatus` PARANIN durumu. İkincisi
// TÜRETİLİR (net tahsilat vs karşılanan tutar) — elle set edilmez, motor hesaplar
// (`domain-core/payment.derivePaymentStatus`).
//
// `channel` müşteri tipinden türetilip sipariş anında SABİTLENİR; `orderSource` ondan bağımsız
// bir eksendir (*nereden kapandı*). Fiyatlar checkout başlangıcında sabitlenir (DOMAIN §5).

export const OrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  channel: ChannelEnum,
  orderSource: OrderSourceEnum,
  /** Patron ikramı — yalnız muhasebe export'una girmez; gerisi tam normal (DOMAIN §9). */
  isGiftOrder: z.boolean(),

  status: OrderStatusEnum,
  /**
   * İptalin sebebi — `null` = iptal edilmedi (07.14).
   *
   * Onay ekranı iptal edilmiş her siparişte "tahsilat yapılmadı" diyordu ve `out_of_stock`
   * dalında bu YANLIŞTI: para çekilmiş ve iade edilmişti. `paymentStatus` da ayırmıyor, çünkü o
   * dalda tahsilat hiç yazılmıyor ve durum `pending` kalıyor.
   */
  cancelReason: OrderCancelReasonEnum.nullable(),
  /**
   * Sağlayıcıya iade damgası — `null` = sağlayıcı ödemesi iade edilmedi (07.14).
   *
   * **`cancelReason`dan AYRI, çünkü ayrı sorular:** sebep "neden iptal oldu", bu "para çekilip geri
   * verildi mi". `out_of_stock` dalında çakışırlar; webhook'un birinci iade dalında ayrışırlar
   * (sipariş `superseded` iptal edilmiş, sonradan gelen ödeme iade ediliyor) — sebebi
   * `out_of_stock`a çevirmek yalan olurdu, boş bırakmak ekrana "tahsilat yapılmadı" dedirtiyordu.
   *
   * Ekranın "iade edildi mi" sorusu **buradan** cevaplanır, sebepten değil: iki dal da aynı alanı
   * dolduruyor, yani kural tek.
   */
  providerRefundedAt: z.string().datetime({ offset: true }).nullable(),
  paymentStatus: PaymentStatusEnum,
  paymentMethod: PaymentMethodEnum.nullable(),
  /** Vadeli mi — vade bir ödeme YÖNTEMİ değil, siparişin bayrağıdır (DOMAIN §7). */
  onAccount: z.boolean(),

  /**
   * **Bir sipariş tek depodan çıkar** (DOMAIN §17, istisnasız): bölünmüş sipariş yoktur; kendi
   * deposunda olmayan kargolanabilir ürün AYRI bir kargo siparişi olur. Kaynağı ya adresin posta
   * kodudur (uzaktan sipariş) ya işlemi yapan personelin sabit deposudur (kapı önü) — VARSAYILAN
   * DEPO KAVRAMI YOKTUR. Siparişe yazılan partilerin de bu depodan olduğunu DB kısıtı tutar.
   */
  warehouseId: z.string().uuid(),

  deliveryType: DeliveryTypeEnum,
  /** Rota-içiyse hangi bölge. Bölge düzenlenebilir olduğu için bu alan aynı zamanda snapshot'tır. */
  deliveryZoneId: z.string().uuid().nullable(),
  deliveryDate: z.string().nullable(),
  addressId: z.string().uuid().nullable(),
  /** Adresin sipariş anındaki kopyası — adres sonradan düzeltilse sipariş bozulmaz. */
  addressSnapshot: z.record(z.unknown()).nullable(),
  courierId: z.string().uuid().nullable(),
  deliveryCountry: CountryEnum,

  vatNumberSnapshot: z.string().nullable(),
  vatTreatment: VatTreatmentEnum,

  /**
   * Siparişin dili — müşterinin bu siparişi verirken okuduğu dil. Sipariş maillerinin dili buradan
   * gelir; profil sonradan değişse de bu siparişin metni değişmez (0015). `null` = bilinmiyor →
   * okuyan taraf profilin `preferredLanguage`'ına düşer.
   */
  locale: PreferredLanguageEnum.nullable(),

  /** Sistemin ürettiği referans (LA-26-7K4M2P) — resmî fatura no DEĞİL; ilk kalıcı durumda üretilir. */
  referenceNo: z.string().nullable(),
  /** Çift sipariş kalkanı — aynı istek ikinci kez ulaşırsa var olan sipariş döner (0015). */
  idempotencyKey: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  deliveryProof: z.record(z.unknown()).nullable(),
  /**
   * Kargo künyesi (07.12) — yalnız `deliveryType === 'shipping'` siparişlerde dolu. Rota
   * siparişinde yazılamaz: kendi aracımızla giden malın taşıyıcısı ve takip numarası yoktur
   * (kural veritabanında da duruyor — ekran unutsa bile yazılamaz).
   */
  carrier: CarrierEnum.nullable(),
  trackingNumber: z.string().nullable(),

  // Para **cent** (02.9 · STACK §8); DB kolonları euro `numeric`, dönüşüm `OrderService.moneyFields`.
  shippingFeeCents: z.number().int(),
  totalCents: z.number().int(),
  discountId: z.string().uuid().nullable(),
  discountAmountCents: z.number().int(),
  /**
   * İnen indirimin müşteriye görünen adı, sipariş anındaki hâliyle (`Discount.publicLabel` kopyası).
   * Kampanya yeniden adlandırılır ya da silinirse geçmiş siparişin maili/fişi değişmesin diye
   * KOPYA tutulur — `addressSnapshot` ile aynı gerekçe (0015).
   */
  discountLabel: LocalizedTextDraftSchema.nullable(),
  /** CACHE — kaynak `MoneyMovement` (modül 12); ödeme durumu bunlardan türetilir. */
  amountCollectedCents: z.number().int(),
  amountRefundedCents: z.number().int(),
  cogsAmountCents: z.number().int().nullable(),
  deliveryCostCents: z.number().int().nullable(),
  paymentFeeCents: z.number().int().nullable(),
  packagingCostCents: z.number().int().nullable(),

  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderInsertSchema = z.object({
  customerId: z.string().uuid(),
  /** Zorunlu ve varsayılansız (DOMAIN §17): deposuz sipariş açılamaz, sonra da doldurulamaz. */
  warehouseId: z.string().uuid(),
  channel: ChannelEnum,
  orderSource: OrderSourceEnum.optional(),
  isGiftOrder: z.boolean().optional(),
  status: OrderStatusEnum.optional(),
  paymentMethod: PaymentMethodEnum.nullish(),
  onAccount: z.boolean().optional(),
  deliveryType: DeliveryTypeEnum.optional(),
  deliveryZoneId: z.string().uuid().nullish(),
  deliveryDate: z.string().nullish(),
  addressId: z.string().uuid().nullish(),
  addressSnapshot: z.record(z.unknown()).nullish(),
  courierId: z.string().uuid().nullish(),
  deliveryCountry: CountryEnum.optional(),
  vatNumberSnapshot: z.string().nullish(),
  vatTreatment: VatTreatmentEnum.optional(),
  shippingFeeCents: z.number().int().nonnegative().optional(),
  totalCents: z.number().int().nonnegative().optional(),
  discountId: z.string().uuid().nullish(),
  discountAmountCents: z.number().int().nonnegative().optional(),
  discountLabel: LocalizedTextDraftSchema.nullish(),
  locale: PreferredLanguageEnum.nullish(),
  /** Çift sipariş kalkanı (0015) — checkout denemesinin anahtarı; yalnız web akışı yazar. */
  idempotencyKey: z.string().nullish(),
});
export type OrderInsert = z.infer<typeof OrderInsertSchema>;

export const OrderUpdateSchema = OrderSchema.partial().required({ id: true });
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

/**
 * `order_sale` görünümünün satırı (12.7) — **gerçekleşmiş satış**: teslim edilmiş ya da kapanmış
 * sipariş + satışın olduğu gün. Sipariş kayıt anında değil, gerçekleştiği anda gelirdir.
 *
 * `saleDate` SAKLANMAZ: `OrderStatusLog`'un ilk `delivered`/`completed` kaydından türetilir (0015
 * bunu bilerek böyle kurdu — ayrı `delivered_at` kolonu yok). Muhasebe export'u da (12.7) dönemsel
 * kârlılık da (12.6) bu tarihi okur; iki rapor iki ayrı "satış günü" hesaplamaz.
 */
export const OrderSaleSchema = OrderSchema.extend({
  /** Siparişin İLK gerçekleşme günü — tam yolda teslim, hızlı satışta kapanış. */
  saleDate: z.string(),
});
export type OrderSale = z.infer<typeof OrderSaleSchema>;

// OrderItem — kalem. `fulfilledQty` FİZİKSEL olarak giden miktardır (DOMAIN §8).

export const OrderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int(),
  /** Fiziksel olarak giden miktar; `goodwill` iadesinde DÜŞMEZ — mal müşteride kalmıştır. */
  fulfilledQty: z.number().int(),
  stockId: z.string().uuid().nullable(),
  bundleId: z.string().uuid().nullable(),
  unitPriceCents: z.number().int(),
  /** Sepet indiriminin bu kaleme ORANSAL payı (**cent**) — kısmi iade ve KDV indirimli birimden. */
  lineDiscountAmountCents: z.number().int(),
  /** ORAN, para değil (5.5 = %5,5) — bu yüzden `…Cents` almaz ve `dbNumeric` kalır. */
  vatRate: dbNumeric,
  returnDisposition: ReturnDispositionEnum.nullable(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderItemInsertSchema = z.object({
  orderId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  fulfilledQty: z.number().int().nonnegative().optional(),
  stockId: z.string().uuid().nullish(),
  bundleId: z.string().uuid().nullish(),
  unitPriceCents: z.number().int().nonnegative(),
  lineDiscountAmountCents: z.number().int().nonnegative().optional(),
  vatRate: z.number().nonnegative(),
  returnDisposition: ReturnDispositionEnum.nullish(),
});
export type OrderItemInsert = z.infer<typeof OrderItemInsertSchema>;

export const OrderItemUpdateSchema = OrderItemSchema.partial().required({ id: true });
export type OrderItemUpdate = z.infer<typeof OrderItemUpdateSchema>;

/** Hazırlıkta fiilen çıkan parti — geri çağırma ve gerçek COGS bunun üstünde durur (DOMAIN §4). */
export const OrderItemBatchSchema = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  stockId: z.string().uuid(),
  qty: z.number().int(),
});
export type OrderItemBatch = z.infer<typeof OrderItemBatchSchema>;

export const OrderItemBatchInsertSchema = OrderItemBatchSchema.omit({ id: true });
export type OrderItemBatchInsert = z.infer<typeof OrderItemBatchInsertSchema>;

export const OrderItemBatchUpdateSchema = OrderItemBatchSchema.partial().required({ id: true });
export type OrderItemBatchUpdate = z.infer<typeof OrderItemBatchUpdateSchema>;

/** Durum geçiş kaydı — teslim/kapanış anı ve geri bildirim zamanlaması buradan TÜRETİLİR. */
export const OrderStatusLogSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  fromStatus: OrderStatusEnum.nullable(),
  toStatus: OrderStatusEnum,
  actorId: z.string().uuid().nullable(),
  /** Geçişe bağlı serbest bağlam — kuryenin "teslim edilemedi" notu gibi; notsuz geçişte null. */
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderStatusLog = z.infer<typeof OrderStatusLogSchema>;

export const OrderStatusLogInsertSchema = OrderStatusLogSchema.omit({ id: true, createdAt: true }).extend({
  fromStatus: OrderStatusEnum.nullish(),
  actorId: z.string().uuid().nullish(),
  note: z.string().nullish(),
});
export type OrderStatusLogInsert = z.infer<typeof OrderStatusLogInsertSchema>;

export const OrderStatusLogUpdateSchema = OrderStatusLogSchema.partial().required({ id: true });
export type OrderStatusLogUpdate = z.infer<typeof OrderStatusLogUpdateSchema>;

/** Hazırlıkta bir kalemin hangi partilerden çıktığı — `record_preparation` girdisi (06.5). */
export const PreparationPickSchema = z.object({
  orderItemId: z.string().uuid(),
  /** Boş dizi = kalem hiç hazırlanamadı (kısmi karşılama, `fulfilled_qty` 0 olur). */
  batches: z.array(z.object({ stockId: z.string().uuid(), qty: z.number().int().positive() })),
});
export type PreparationPick = z.infer<typeof PreparationPickSchema>;

export const PreparationResultSchema = z.object({ ok: z.boolean(), items: z.number().int() });
export type PreparationResult = z.infer<typeof PreparationResultSchema>;

/** `deliver_order` dönüşü (07.7) — `ok:false` + `stale` = sipariş artık yolda değil. */
export const DeliverResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
  /** Fiiliden düşülen toplam adet (kayıtlı partilerden). */
  consumedQty: z.number().int().optional(),
});
export type DeliverResult = z.infer<typeof DeliverResultSchema>;

/** `close_order` dönüşü (07.7) — kâr kalemleri kapanışta SABİTLENİR (DOMAIN §12). */
export const CloseResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
  // RPC dönüşü euro; cent'e çevrim servis sınırında (02.9 · STACK §8) — jsonb tablo satırı değildir.
  cogsAmountCents: z.number().int().optional(),
  deliveryCostCents: z.number().int().optional(),
  packagingCostCents: z.number().int().optional(),
});
export type CloseResult = z.infer<typeof CloseResultSchema>;

/**
 * `quick_sale` dönüşü (07.10) — kapı önü tek adım. İki "hayır" ayrıdır: `stale` (sipariş artık
 * taslak değil) ve `insufficient_stock` (mal yok — kasiyer ekranına kalan miktar yazılır).
 */
export const QuickSaleResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['stale', 'insufficient_stock']).optional(),
  currentStatus: OrderStatusEnum,
  /** Hızlı satışta referans BURADA üretilir — ilk kalıcı durum `completed`'dır. */
  referenceNo: z.string().nullish(),
  consumedQty: z.number().int().optional(),
  cogsAmountCents: z.number().int().optional(),
  /** `insufficient_stock`'ta: hangi varyant ve elde ne kadar var. */
  variantId: z.string().uuid().optional(),
  available: z.number().int().optional(),
});
export type QuickSaleResult = z.infer<typeof QuickSaleResultSchema>;

/**
 * Kalem düzeltmesi (07.8/07.9) — eksik çıkan ya da geri gelen adet. `fulfilledQty` **hedef**
 * değerdir (kalan miktar), fark değil: çağıran ekranda gördüğü sayıyı gönderir, aradaki değişimi
 * veritabanı hesaplar — iki ekran aynı anda düzeltirse farklar toplanıp mal buharlaşmaz.
 */
export const FulfillmentAdjustmentSchema = z.object({
  orderItemId: z.string().uuid(),
  fulfilledQty: z.number().int().nonnegative(),
  /** Mal geri geldiyse ne olduğu; `goodwill`'de miktar DEĞİŞMEZ (mal müşteride kaldı, DOMAIN §8). */
  returnDisposition: ReturnDispositionEnum.nullish(),
  /** Stoğa dönüş/imha kaydına düşen sebep notu — geri ekleme sebepsiz yazılmaz (06). */
  note: z.string().nullish(),
});
export type FulfillmentAdjustment = z.infer<typeof FulfillmentAdjustmentSchema>;

/** `adjust_fulfillment` dönüşü (07.8) — malın gerçeğinde ne değişti; para tarafı kapıda türetilir. */
export const FulfillmentResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
  lines: z.number().int().optional(),
  /** Teslim sonrası iadede depoya geri giren adet. */
  restockedQty: z.number().int().optional(),
  /** Hiç çıkmadan hasarlanıp fiiliden düşülen adet. */
  discardedQty: z.number().int().optional(),
  /** Ayrılmıştan geri bırakılan adet — başkasına satılabilir hâle gelen mal. */
  releasedQty: z.number().int().optional(),
});
export type FulfillmentResult = z.infer<typeof FulfillmentResultSchema>;

/** `cancel_order` dönüşü (07.9) — `stale` = sipariş artık o durumda değil. */
export const CancelResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
  releasedQty: z.number().int().optional(),
});
export type CancelResult = z.infer<typeof CancelResultSchema>;

/** `transition_order_status` RPC'sinin dönüşü — `ok:false` + `stale` = araya biri girdi (07.6). */
export const TransitionResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
});
export type TransitionResult = z.infer<typeof TransitionResultSchema>;

/**
 * `order_counts` RPC'sinin satırı (09.7) — sipariş ekranının sekme sayaçları ve alt şerit toplamı.
 *
 * Tutarlar HAM KOLON toplamıdır: "açık tutar" formülü burada değil, motorda uygulanır
 * (`openAmountCents`). Toplama doğrusal olduğu için sonuç birebir aynı, ama kural tek yerde kalır.
 * RPC euro toplar; cent'e çevrim servis sınırındadır (02.9 · STACK §8).
 */
export const OrderCountsRowSchema = z.object({
  /** Duruma göre adet — listede görünmeyen durum anahtarı hiç gelmez (sıfırları yazmaz). */
  byStatus: z.record(z.number().int()),
  total: z.number().int(),
  sumTotalCents: z.number().int(),
  sumCollectedCents: z.number().int(),
  sumRefundedCents: z.number().int(),
  /** Kapıda tahsilat bekleyen siparişler — peşin ödenmemiş, vadesiz, kapı yöntemli. */
  codCount: z.number().int(),
  codTotalCents: z.number().int(),
  codCollectedCents: z.number().int(),
  codRefundedCents: z.number().int(),
});
export type OrderCountsRow = z.infer<typeof OrderCountsRowSchema>;
