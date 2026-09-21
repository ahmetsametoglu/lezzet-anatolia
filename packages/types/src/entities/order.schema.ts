import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
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
} from '../primitives/enums.schema';
import { LocalizedTextDraftSchema } from '../primitives/localized-text.schema';

// İki eksen ayrıdır: `status` siparişin yolculuğu, `paymentStatus` paranın durumu (motor türetir, elle yazılmaz).
// `channel` sipariş anında sabitlenir; `orderSource` ondan bağımsız bir eksendir.

export const OrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  channel: ChannelEnum,
  orderSource: OrderSourceEnum,
  /** Patron ikramı — yalnız muhasebe export'una girmez; gerisi tam normal (DOMAIN §9). */
  isGiftOrder: z.boolean(),

  status: OrderStatusEnum,
  /** İptalin sebebi — `null` = iptal edilmedi; `paymentStatus` "para çekilip iade edildi" dalını ayırmaz. */
  cancelReason: OrderCancelReasonEnum.nullable(),
  /**
   * Sağlayıcıya iade damgası: sebepten ayrı bir soru ("para çekilip geri verildi mi"). Ekranın "iade edildi mi"
   * sorusu buradan cevaplanır, çünkü iki iade dalı da bu alanı doldurur.
   */
  providerRefundedAt: z.string().datetime({ offset: true }).nullable(),
  /**
   * Sağlayıcıdaki ödeme kimliği (Stripe PaymentIntent); `null` = ödeme açılmadı ya da açılamadı. Webhook gelmezse
   * ödeme sayfası ve zamanlayıcı "ödendi mi" sorusunu bununla sorar.
   */
  paymentRef: z.string().nullable(),
  paymentStatus: PaymentStatusEnum,
  paymentMethod: PaymentMethodEnum.nullable(),
  /** Vadeli mi — vade bir ödeme YÖNTEMİ değil, siparişin bayrağıdır (DOMAIN §7). */
  onAccount: z.boolean(),

  /**
   * Sipariş tek depodan çıkar ve varsayılan depo yoktur: kaynak adresin posta kodu ya da personelin deposudur.
   * Partilerin bu depodan olduğunu veritabanı kısıtı tutar.
   */
  warehouseId: z.string().uuid(),

  deliveryType: DeliveryTypeEnum,
  /** Rota-içiyse hangi bölge. Bölge düzenlenebilir olduğu için bu alan aynı zamanda snapshot'tır. */
  deliveryZoneId: z.string().uuid().nullable(),
  deliveryDate: z.string().nullable(),
  /** Komşu davetinden mi geldi; davetin kullanımı bu kolondan sayılır, azalan sayaç iptalde geri alınmayı unuturdu. */
  neighborInviteId: z.string().uuid().nullable(),
  addressId: z.string().uuid().nullable(),
  /** Adresin sipariş anındaki kopyası — adres sonradan düzeltilse sipariş bozulmaz. */
  addressSnapshot: z.record(z.unknown()).nullable(),
  /** Kurye: sabah ataması yazar, sefer başlangıcı seferin kuryesine senkronlar; sahiplik kapıları bu kolona bakar. */
  courierId: z.string().uuid().nullable(),
  /**
   * Hangi gerçekleşen seferle gitti; yalnız `start_delivery_run` yazar, teslimle donar. `null` = henüz sefere
   * bağlanmadı ya da kargo/kapı önü.
   */
  deliveryRunId: z.string().uuid().nullable(),
  deliveryCountry: CountryEnum,

  vatNumberSnapshot: z.string().nullable(),
  vatTreatment: VatTreatmentEnum,

  /** Siparişin dili: sipariş mailleri buradan okunur, profil sonradan değişse de değişmez; `null` → profilin dili. */
  locale: PreferredLanguageEnum.nullable(),

  /** Sistemin ürettiği referans (LA-26-7K4M2P) — resmî fatura no DEĞİL; ilk kalıcı durumda üretilir. */
  referenceNo: z.string().nullable(),
  /** Çift sipariş kalkanı — aynı istek ikinci kez ulaşırsa var olan sipariş döner (0015). */
  idempotencyKey: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  deliveryProof: z.record(z.unknown()).nullable(),
  /** Kargo künyesi — yalnız kargo siparişinde dolu; rota siparişine yazılamaz ve kural veritabanında da durur. */
  carrier: CarrierEnum.nullable(),
  trackingNumber: z.string().nullable(),

  // Para **cent** (02.9 · STACK §8); DB kolonları euro `numeric`, dönüşüm `OrderService.moneyFields`.
  shippingFeeCents: z.number().int(),
  /**
   * Sipariş anında anlaşılan tutar (Σ kalem − indirim + kargo), donuktur: ödeme niyeti, vade limiti ve onay maili
   * bunu okur. "Ne tahsil edilecek" sorusunun cevabı bu değil, `derivePaymentStatus`tır.
   */
  orderedTotalCents: z.number().int(),
  /**
   * Gerçekleşen ciro: `fulfilled_qty`den tetikleyiciyle türeyen bir cache, taslakta 0. Saklanır, çünkü rapor
   * tarafı SQL'den okur.
   */
  revenueTotalCents: z.number().int(),
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
  /** Komşu davetinin künyesi — checkout, çerezden gelen daveti burada yazar. */
  neighborInviteId: z.string().uuid().nullish(),
  addressId: z.string().uuid().nullish(),
  addressSnapshot: z.record(z.unknown()).nullish(),
  courierId: z.string().uuid().nullish(),
  deliveryRunId: z.string().uuid().nullish(),
  deliveryCountry: CountryEnum.optional(),
  vatNumberSnapshot: z.string().nullish(),
  vatTreatment: VatTreatmentEnum.optional(),
  shippingFeeCents: z.number().int().nonnegative().optional(),
  orderedTotalCents: z.number().int().nonnegative().optional(),
  /* `revenueTotalCents` INSERT ŞEMASINDA YOK ve bu bilinçli: kalemlerden türeyen bir cache'i elle
     yazmak, kaynağıyla çelişen bir sayı bırakmanın en kolay yoludur. Tetikleyici (0012) onu
     kalemler yazılınca kendisi kuruyor; taslakta 0 kalması doğru cevaptır. */
  discountId: z.string().uuid().nullish(),
  discountAmountCents: z.number().int().nonnegative().optional(),
  discountLabel: LocalizedTextDraftSchema.nullish(),
  locale: PreferredLanguageEnum.nullish(),
  /** Çift sipariş kalkanı (0015) — checkout denemesinin anahtarı; yalnız web akışı yazar. */
  idempotencyKey: z.string().nullish(),
});
export type OrderInsert = z.infer<typeof OrderInsertSchema>;

/**
 * `channel` yazılamaz: KDV işlemesini ve fiyat kademesini belirlediği için sonradan değişmesi alınmış paranın vergisini
 * geriye dönük oynatırdı. İkinci savunma veritabanında (`order_channel_frozen`), doğrudan SQL yazan betiğe karşı.
 */
export const OrderUpdateSchema = OrderSchema.omit({ channel: true }).partial().required({ id: true });
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

/**
 * `order_sale` görünümünün satırı: gerçekleşmiş satış ve satış günü. `saleDate` saklanmaz, durum logunun ilk
 * `delivered`/`completed` kaydından türer; muhasebe ve kârlılık aynı günü okur.
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
  /**
   * Pazarlık izi: üstüne yazılmadan önce liste fiyatı (cent); `null` = pazarlık olmadı. Taviz imzalı türetilir,
   * eksi çıkabilir.
   */
  listUnitPriceCents: z.number().int().nullable(),
  /** Pazarlığı yapan personel. `listUnitPriceCents` ile birlikte yaşar — yarım iz yoktur (kısıt VERİDE). */
  priceSetBy: z.string().uuid().nullable(),
  /** Sepet indiriminin bu kaleme ORANSAL payı (**cent**) — kısmi iade ve KDV indirimli birimden. */
  lineDiscountAmountCents: z.number().int(),
  /** ORAN, para değil (5.5 = %5,5) — bu yüzden `…Cents` almaz ve `dbNumeric` kalır. */
  vatRate: dbNumeric,
  returnDisposition: ReturnDispositionEnum.nullable(),
  /** Akıbetin gerekçesi — "stoğa dön"ün zorunlu soğuk zincir beyanı; malın kendisi hakkında olduğu için kalemin alanı. */
  returnNote: z.string().nullable(),
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
  /** Pazarlık izi — ikisi BİRLİKTE verilir ya da hiç verilmez (kısıt veritabanında). */
  listUnitPriceCents: z.number().int().nonnegative().nullish(),
  priceSetBy: z.string().uuid().nullish(),
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

/** `quick_sale` dönüşü; `stale` sipariş taslak değil, `insufficient_stock` mal yok demektir. */
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

/**
 * `adjust_fulfillment` dönüşü. `stale` düzeltilemez durum, `already_marked` kalemin akıbeti zaten yazılmış ve istek
 * bayat bir ekrandan geliyor demektir; ikisini birleştirmek depocuyu yanlış yere bakmaya gönderirdi.
 */
export const FulfillmentResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['stale', 'already_marked']).optional(),
  currentStatus: OrderStatusEnum,
  /** `already_marked`ta hangi kalem — ekran o satırı tazeleyip yazılı hâlini gösterebilsin diye. */
  orderItemId: z.string().uuid().optional(),
  /** `already_marked`ta kalemde ZATEN yazılı olan akıbet. */
  currentDisposition: ReturnDispositionEnum.optional(),
  lines: z.number().int().optional(),
  /** Teslim sonrası iadede depoya geri giren adet. */
  restockedQty: z.number().int().optional(),
  /** Hiç çıkmadan hasarlanıp fiiliden düşülen adet. */
  discardedQty: z.number().int().optional(),
  /** Ayrılmıştan geri bırakılan adet — başkasına satılabilir hâle gelen mal. */
  releasedQty: z.number().int().optional(),
});
export type FulfillmentResult = z.infer<typeof FulfillmentResultSchema>;

/**
 * `deliver_order_with_adjustments` dönüşü: kapıdaki tek yazımın sonucu. Şema düzeltme sonucundan türetilir,
 * elle yazılsaydı bir gün geride kalırdı.
 */
export const DeliverWithAdjustmentsResultSchema = FulfillmentResultSchema.extend({
  /** Fiiliden düşülen toplam adet — `deliver_order`ın kendi sayısı. */
  consumedQty: z.number().int().optional(),
});
export type DeliverWithAdjustmentsResult = z.infer<typeof DeliverWithAdjustmentsResultSchema>;

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
 * `order_counts` satırı: sekme sayaçları ve alt toplam. Tutarlar ham kolon toplamıdır, "açık tutar" formülü
 * motorda kalır; cent'e çevrim servis sınırında.
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
  /** İptal hariç sayılan iş: "bugün kaç sipariş, ne kadar ciro" bir iş ölçüsüdür, iptal iş değildir. */
  activeCount: z.number().int(),
  activeTotalCents: z.number().int(),
});
export type OrderCountsRow = z.infer<typeof OrderCountsRowSchema>;
