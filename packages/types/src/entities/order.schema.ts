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
  /**
   * Bu sipariş bir komşu davetinden mi geldi (17.10). Künye alanı: davetin ödülü buradan doğar
   * (`order/payment.ts` → `finalize`) ve davetin kaç kez kullanıldığı bu kolondan SAYILIR —
   * davet satırında azalan bir sayaç yok, çünkü sipariş iptal olunca sayacın da geri alınması
   * gerekirdi ve biri mutlaka unuturdu.
   */
  neighborInviteId: z.string().uuid().nullable(),
  addressId: z.string().uuid().nullable(),
  /** Adresin sipariş anındaki kopyası — adres sonradan düzeltilse sipariş bozulmaz. */
  addressSnapshot: z.record(z.unknown()).nullable(),
  /**
   * Kurye — sipariş yolculuğunda İKİ el yazar: sabah ataması (plan) ve sefer başlangıcı
   * (`start_delivery_run` seferi süren kuryeyi buraya SENKRONLAR — 18.08, "siparişin kuryesi
   * seferin kuryesinden gelir"). Sahiplik kapıları bu kolona bakmaya devam eder.
   */
  courierId: z.string().uuid().nullable(),
  /**
   * Hangi GERÇEKLEŞEN seferle gitti (0046 · `docs/feature/sefer.md`). Yalnız `start_delivery_run`
   * yazar, teslimle donar — `courierId` sonradan oynasa da "kim götürdü" sorusunun kanıtlı cevabı
   * `delivery_run.courier_id`dir. `null` = henüz sefere bağlanmadı (ya da kargo/kapı önü).
   */
  deliveryRunId: z.string().uuid().nullable(),
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
  /**
   * **SİPARİŞ ANINDA ANLAŞILAN tutar** (Σ kalem − indirim + kargo). Bir kez yazılır, DONUKTUR.
   *
   * Adı 01.09'da `totalCents`ten değişti ve sebebi ölçülmüştü: genel bir ad, her okuyanı kendi
   * sorusunu ona sormaya davet ediyordu. Yedi ayrı yer onu "bu siparişin borcu" diye okumuş ve
   * eksik giden malın parasını da istemişti — aynı siparişe iki ekran iki farklı borç yazıyordu.
   *
   * Sahibi olduğu sorular: Stripe ödeme niyeti hangi tutarla açılır · vade limitinden ne düşer ·
   * müşterinin onay mailinde hangi rakam var · anlaşmazlıkta neye bakılır. Motor da hazırlık
   * kesinleşmeden BUNU okur (`payment-status.ts`: kalemlerden yeniden toplamak, indirim payı
   * dağıtılmamışsa yanlış cevap veriyordu).
   *
   * "Ne tahsil edilecek" sorusunun cevabı BU DEĞİL — o `derivePaymentStatus`tan çıkar.
   */
  orderedTotalCents: z.number().int(),
  /**
   * **GERÇEKLEŞEN CİRO** — giden malın tutarı. Kalemlerden TÜRETİLİR (`resync_order_revenue`
   * tetikleyicisi, 0012); taslakta 0'dır ve bu doğrudur, henüz hiçbir şey gitmemiştir.
   *
   * Bir CACHE'tir ve kaynağı `order_item.fulfilled_qty`dir — `amount_collected` ile aynı desen
   * (0018): artırılmaz, her yazımda kaynaktan yeniden hesaplanır.
   *
   * **Neden saklanıyor, türetilmiyor:** rapor tarafı SQL'den okuyor
   * (`analytics_order_revenue`) ve SQL TypeScript motorunu çağıramaz.
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
  /** Komşu davetinin künyesi (17.10) — checkout, çerezden gelen daveti burada yazar. */
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
 * `channel` YAZILAMAZ — sipariş açılırken bir kez türetilir (`deriveChannel`) ve DONAR.
 *
 * Kural motorda yazılıydı (`canChangeChannel`, hep `false`) ama 27.08'e kadar onu SORAN da,
 * zorlayan da yoktu: şema tam `partial()` olduğu için kanal sonradan yazılabilir bir alandı.
 * Bugün ihlal eden bir yol yok — yani düzeltilen aktif bir arıza değil, **korumasız bir kural**
 * (`03.12`). Bedeli ihlal edildiği gün ödenirdi: kanal KDV işlemesini (`vat_treatment`) ve fiyat
 * kademesini belirliyor, dolayısıyla kapanmış bir siparişin kanalını değiştirmek parası çoktan
 * alınmış bir belgenin vergisini geriye dönük oynatırdı — sessizce, çünkü hiçbir yer itiraz etmezdi.
 *
 * Şemadan çıkarmak reddi ÇAĞRI YERİNE taşır; ikinci savunma veritabanındadır (`0012_order.sql`,
 * `order_channel_frozen`). İkisi birden var çünkü şema yalnız bu kapıdan geçeni korur, doğrudan
 * SQL yazan bir betiği korumaz.
 */
export const OrderUpdateSchema = OrderSchema.omit({ channel: true }).partial().required({ id: true });
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
  /**
   * PAZARLIK İZİ — üstüne yazılmadan önce liste ne diyordu (**cent**). `null` = pazarlık olmadı,
   * liste fiyatı `unitPriceCents`in kendisidir (0012 künyesi).
   *
   * Taviz **imzalı** türetilir: `(listUnitPriceCents ?? unitPriceCents) − unitPriceCents`. Eksi
   * çıkabilir ve hata değildir — acele ya da az miktar listenin üstüne satılabilir.
   */
  listUnitPriceCents: z.number().int().nullable(),
  /** Pazarlığı yapan personel. `listUnitPriceCents` ile birlikte yaşar — yarım iz yoktur (kısıt VERİDE). */
  priceSetBy: z.string().uuid().nullable(),
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
