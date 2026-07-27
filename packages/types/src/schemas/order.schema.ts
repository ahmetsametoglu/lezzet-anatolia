import { z } from 'zod';
import {
  ChannelEnum,
  CountryEnum,
  DeliveryTypeEnum,
  OrderSourceEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  ReturnDispositionEnum,
  VatTreatmentEnum,
} from './enums.schema';

// Order — sipariş omurgası (ORDER_LIFECYCLE, DOMAIN §5–§8).
//
// İki eksen ayrıdır: `status` siparişin YOLCULUĞU, `paymentStatus` PARANIN durumu. İkincisi
// TÜRETİLİR (net tahsilat vs karşılanan tutar) — elle set edilmez, motor hesaplar
// (`domain-core/payment.derivePaymentStatus`).
//
// `channel` müşteri tipinden türetilip sipariş anında SABİTLENİR; `orderSource` ondan bağımsız
// bir eksendir (*nereden kapandı*). Fiyatlar checkout başlangıcında sabitlenir (DOMAIN §5).

const dbNumeric = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const OrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  channel: ChannelEnum,
  orderSource: OrderSourceEnum,
  /** Patron ikramı — yalnız muhasebe export'una girmez; gerisi tam normal (DOMAIN §9). */
  isGiftOrder: z.boolean(),

  status: OrderStatusEnum,
  paymentStatus: PaymentStatusEnum,
  paymentMethod: PaymentMethodEnum.nullable(),
  /** Vadeli mi — vade bir ödeme YÖNTEMİ değil, siparişin bayrağıdır (DOMAIN §7). */
  onAccount: z.boolean(),

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

  /** Sistemin ürettiği referans (LA-26-7K4M2P) — resmî fatura no DEĞİL; ilk kalıcı durumda üretilir. */
  referenceNo: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  deliveryProof: z.record(z.unknown()).nullable(),

  shippingFee: dbNumeric,
  total: dbNumeric,
  discountId: z.string().uuid().nullable(),
  discountAmount: dbNumeric,
  /** CACHE — kaynak `MoneyMovement` (modül 12); ödeme durumu bunlardan türetilir. */
  amountCollected: dbNumeric,
  amountRefunded: dbNumeric,
  cogsAmount: dbNumeric.nullable(),
  deliveryCost: dbNumeric.nullable(),
  paymentFee: dbNumeric.nullable(),
  packagingCost: dbNumeric.nullable(),

  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderInsertSchema = z.object({
  customerId: z.string().uuid(),
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
  shippingFee: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(),
  discountId: z.string().uuid().nullish(),
  discountAmount: z.number().nonnegative().optional(),
});
export type OrderInsert = z.infer<typeof OrderInsertSchema>;

export const OrderUpdateSchema = OrderSchema.partial().required({ id: true });
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

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
  unitPrice: dbNumeric,
  /** Sepet indiriminin bu kaleme ORANSAL payı — kısmi iade ve KDV indirimli birimden hesaplanır. */
  lineDiscountAmount: dbNumeric,
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
  unitPrice: z.number().nonnegative(),
  lineDiscountAmount: z.number().nonnegative().optional(),
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
  createdAt: z.string(),
});
export type OrderStatusLog = z.infer<typeof OrderStatusLogSchema>;

export const OrderStatusLogInsertSchema = OrderStatusLogSchema.omit({ id: true, createdAt: true }).extend({
  fromStatus: OrderStatusEnum.nullish(),
  actorId: z.string().uuid().nullish(),
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
  cogsAmount: dbNumeric.optional(),
  deliveryCost: dbNumeric.optional(),
  packagingCost: dbNumeric.optional(),
});
export type CloseResult = z.infer<typeof CloseResultSchema>;

/** `transition_order_status` RPC'sinin dönüşü — `ok:false` + `stale` = araya biri girdi (07.6). */
export const TransitionResultSchema = z.object({
  ok: z.boolean(),
  reason: z.literal('stale').optional(),
  currentStatus: OrderStatusEnum,
});
export type TransitionResult = z.infer<typeof TransitionResultSchema>;
