import { z } from 'zod';
import { ChannelEnum, CustomerTypeEnum, PaymentMethodEnum } from '../primitives/enums.schema';
import { B2bCompanyLookupSchema } from './b2b-api.schema';
import { CheckoutPaymentSchema } from './checkout-api.schema';
import { PlaceUnresolvedReasonEnum } from './place-api.schema';

/**
 * Personelin müşteri adına sipariş girişinin şekli: web masası ve mobil uç aynı okumaları ve aynı yazımı paylaşır. Fiyat, gün, depo
 * ve ödeme kararı sunucudadır; istemci yalnız seçimi taşır.
 */

/** Vade özeti; vade izni yoksa `null`. Kalan limit açık bakiyeden türer, saklanmaz. */
export const CustomerCreditSummarySchema = z.object({
  termDays: z.number().int().positive(),
  limitCents: z.number().int().nonnegative(),
  remainingCents: z.number().int().nonnegative(),
  /** Vadesi geçmiş ödenmemiş sipariş var; yeni vadeli sipariş açılmaz. */
  overdue: z.boolean(),
});
export type CustomerCreditSummary = z.infer<typeof CustomerCreditSummarySchema>;

export const StaffCustomerOptionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  type: CustomerTypeEnum,
  /** Fiyatın okunduğu geçerli kanal; onaysız şirket B2C'dir (DOMAIN §10). Ekran gösterir, karar sunucuda verilir. */
  channel: ChannelEnum,
  /** Doğrulanmamış kayıt (WhatsApp'tan ya da personelin açtığı). */
  isDraft: z.boolean(),
  siret: z.string().nullable(),
  /** B2B başvurusu yönetici onayı bekliyor; o zamana kadar perakende fiyat ve kapıda ödeme. */
  b2bPending: z.boolean(),
  credit: CustomerCreditSummarySchema.nullable(),
});
export type StaffCustomerOption = z.infer<typeof StaffCustomerOptionSchema>;

export const StaffCustomerPageSchema = z.object({
  customers: z.array(StaffCustomerOptionSchema),
  nextCursor: z.string().nullable(),
});
export type StaffCustomerPage = z.infer<typeof StaffCustomerPageSchema>;

export const StaffCustomerFieldEnum = z.enum(['name', 'phone', 'email', 'siret']);
export type StaffCustomerField = z.infer<typeof StaffCustomerFieldEnum>;

/** Personelin açtığı müşteri; şirket kaydında SIRET resmî kayıttan unvan ve fatura adresi getirir. */
export const StaffCustomerInputSchema = z.object({
  name: z.string().max(200),
  /** Kurye kapıda arayacağı için zorunlu; benzersiz değil, aile ve iş yeri numarası meşrudur. */
  phone: z.string().max(40),
  email: z.string().max(254).nullable(),
  type: CustomerTypeEnum,
  /** Yalnız şirket kaydında okunur; boş bırakılırsa kayıt künyesiz açılır. */
  siret: z.string().max(20).nullable(),
});
export type StaffCustomerInput = z.infer<typeof StaffCustomerInputSchema>;

export const StaffCustomerCreateResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), customer: StaffCustomerOptionSchema }),
  z.object({ status: z.literal('invalid'), field: StaffCustomerFieldEnum }),
  /** Aynı e-posta ya da SIRET'le kayıt var: o seçilir, yenisi açılmaz. */
  z.object({ status: z.literal('taken'), key: z.enum(['email', 'siret']), existing: StaffCustomerOptionSchema }),
  z.object({ status: z.literal('siret_not_found') }),
]);
export type StaffCustomerCreateResponse = z.infer<typeof StaffCustomerCreateResponseSchema>;

/** SIRET yazılınca resmî kayıt satırı ve aynı SIRET'i taşıyan kayıtlar; doluysa yeni kayıt açılmaz, var olan seçilir. */
export const StaffCompanyLookupSchema = z.object({
  registry: B2bCompanyLookupSchema,
  existing: z.array(StaffCustomerOptionSchema),
});
export type StaffCompanyLookup = z.infer<typeof StaffCompanyLookupSchema>;

export const StaffAddressOptionSchema = z.object({
  id: z.string().uuid(),
  /** Tek satır künye: "1 rue du Marché, 67000 Strasbourg". */
  label: z.string(),
  line1: z.string(),
  /** "67000 Strasbourg". */
  cityLine: z.string(),
  recipient: z.string(),
  isBilling: z.boolean(),
});
export type StaffAddressOption = z.infer<typeof StaffAddressOptionSchema>;

export const StaffAddressListSchema = z.object({ addresses: z.array(StaffAddressOptionSchema) });

/** Personelin açtığı adres; alıcı ve telefon zorunlu, çünkü kurye kapıda kimi soracağını ve arayacağını bilmek zorunda. */
export const StaffAddressInputSchema = z.object({
  recipient: z.string().max(200),
  phone: z.string().max(40),
  line1: z.string().max(200),
  line2: z.string().max(200).nullish(),
  postalCode: z.string().max(12),
  city: z.string().max(120),
});
export type StaffAddressInput = z.infer<typeof StaffAddressInputSchema>;

export const StaffAddressFieldEnum = z.enum(['recipient', 'phone', 'line1', 'postalCode', 'city']);
export type StaffAddressField = z.infer<typeof StaffAddressFieldEnum>;

export const StaffAddressCreateResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), address: StaffAddressOptionSchema }),
  z.object({ status: z.literal('invalid'), field: StaffAddressFieldEnum }),
]);
export type StaffAddressCreateResponse = z.infer<typeof StaffAddressCreateResponseSchema>;

/** Adresin teslim bağlamı: tür, günler ve siparişin deposu sunucuda adresten çözülür. */
export const StaffDeliverySchema = z.object({
  deliveryType: z.enum(['route', 'shipping']),
  /** Rota içi teslimin yaklaşan günleri; kargoda boş, gün taşıyıcıya bağlıdır ve söz verilmez. */
  availableDates: z.array(z.string()),
  /** Siparişin çıkacağı depo; ürün seçicisinin stoğu buna bağlı. `null` = adres çözülemedi, sebebi yanında. */
  warehouseId: z.string().uuid().nullable(),
  warehouseName: z.string().nullable(),
  unresolvedReason: PlaceUnresolvedReasonEnum.nullable(),
});
export type StaffDelivery = z.infer<typeof StaffDeliverySchema>;

/**
 * Sepet tutarına göre ödeme seçenekleri; kapalı yöntemin sebebi ekranda o yöntemin yerinde yazar. Çevrimiçi ödeme yoktur, çünkü
 * personel ekranı ödeme sağlayıcısını açmaz.
 */
export const StaffPaymentOptionsSchema = CheckoutPaymentSchema.pick({
  methods: true,
  codBlockedReason: true,
  creditAvailable: true,
}).extend({
  /** Kapıda ödeme tavanı (ayar, müşterinin kanalı ve yeri için çözülmüş). */
  codMaxCents: z.number().int().nonnegative(),
  creditBlockedReason: z.enum(['not_enabled', 'overdue', 'limit_exceeded']).nullable(),
});
export type StaffPaymentOptions = z.infer<typeof StaffPaymentOptionsSchema>;

export const StaffDeliveryContextSchema = z.object({
  delivery: StaffDeliverySchema,
  payment: StaffPaymentOptionsSchema,
});
export type StaffDeliveryContext = z.infer<typeof StaffDeliveryContextSchema>;

/** Kalemler ön izlemedir (adet × birim fiyat, KDV oranı); kesin tavan ve limit kararı sipariş yazılırken verilir. */
export const StaffDeliveryContextRequestSchema = z.object({
  customerId: z.string().uuid(),
  addressId: z.string().uuid(),
  lines: z.array(z.object({ totalCents: z.number().int().nonnegative(), vatRate: z.number().nonnegative() })).max(200),
});

/**
 * Kalem seçicisinin satırı; fiyat müşteriye göre çözülmüş gelir. Maliyet ve hedef marj yalnız pazarlık yazabilene gider, marj-altı
 * uyarısı fiyat yazılırken anında çıksın diye; öteki personele `null`dur.
 */
export const StaffVariantRowSchema = z.object({
  variantId: z.string().uuid(),
  title: z.string(),
  /** Ürünün kare küçük resmi (CDN 200 px); `null` = görsel yok, istemci monogram çizer. */
  imageUrl: z.string().nullable(),
  /** Müşteriye çözülmüş liste fiyatı (kanal tabanında); `null` = bu müşteriye satışa kapalı. */
  listPriceCents: z.number().int().nullable(),
  /** Yenileme maliyeti (HT); `null` = ölçülemedi ya da gösterilmiyor, marj uyarısı susar. */
  costCents: z.number().int().nullable(),
  targetMarginPercent: z.number().nullable(),
  vatRate: z.number(),
  /** Siparişin deposunda kullanılabilir adet; `null` = depo henüz belli değil. */
  availableQty: z.number().int().nullable(),
  /** Soğuk zincir ürünü kargoya çıkmaz; kargo adresinde eklenemez. */
  shippable: z.boolean(),
});
export type StaffVariantRow = z.infer<typeof StaffVariantRowSchema>;

export const StaffVariantPageSchema = z.object({
  rows: z.array(StaffVariantRowSchema),
  nextCursor: z.string().nullable(),
});
export type StaffVariantPage = z.infer<typeof StaffVariantPageSchema>;

/** Barkod okutmanın cevabı; koli barkodu birden çok adet sayar. Bilinmeyen ya da satışta olmayan kod hata değil cevaptır. */
export const StaffVariantScanSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('found'), row: StaffVariantRowSchema, qtyPerCode: z.number().int().positive() }),
  z.object({ status: z.literal('unknown_code') }),
  z.object({ status: z.literal('not_sellable') }),
]);
export type StaffVariantScan = z.infer<typeof StaffVariantScanSchema>;

/** Duraktan açılan siparişin müşterisi ve adresi; adres defterde artık yoksa `null`, personel seçer. */
export const StaffOrderOriginSchema = z.object({
  customer: StaffCustomerOptionSchema,
  addressId: z.string().uuid().nullable(),
});
export type StaffOrderOrigin = z.infer<typeof StaffOrderOriginSchema>;

/** Sepetteki boyların siparişin deposundaki güncel kalanı; stok reddinden sonra ekran tükenen kalemi kendi satırında işaretler. */
export const StaffStockRequestSchema = z.object({
  warehouseId: z.string().uuid(),
  variantIds: z.array(z.string().uuid()).min(1).max(100),
});

export const StaffStockResponseSchema = z.object({
  stock: z.array(z.object({ variantId: z.string().uuid(), availableQty: z.number().int() })),
});
export type StaffStockResponse = z.infer<typeof StaffStockResponseSchema>;

export const StaffOrderLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  /** Pazarlıklı birim fiyat (cent), yalnız üstüne yazılan kalemde gelir ve yalnız yöneticiden kabul edilir. */
  unitPriceCents: z.number().int().nonnegative().optional(),
});

export const StaffOrderRequestSchema = z.object({
  customerId: z.string().uuid(),
  addressId: z.string().uuid(),
  /** Kargoda `null`: gün taşıyıcıya bağlıdır. */
  deliveryDate: z.string().nullable(),
  paymentMethod: PaymentMethodEnum,
  onAccount: z.boolean(),
  lines: z.array(StaffOrderLineSchema).min(1),
  /** Cevabı kaybolan gönderim aynı anahtarla yeniden gelir; sunucu ikinci sipariş açmaz. */
  idempotencyKey: z.string().min(1).max(64).nullish(),
});
export type StaffOrderRequest = z.infer<typeof StaffOrderRequestSchema>;

/** Ret hata değil cevaptır: sebep kodu ve personelin dilindeki cümle birlikte gelir, ekran cümleyi gösterir. */
export const StaffOrderResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('placed'),
    orderId: z.string().uuid(),
    referenceNo: z.string().nullable(),
    /** Siparişin kesin toplamı (kargo ve indirim dahil, cent); ekrandaki "~" tutar yalnız göstergedir. */
    totalCents: z.number().int(),
  }),
  z.object({ status: z.literal('rejected'), reason: z.string(), message: z.string() }),
]);
export type StaffOrderResponse = z.infer<typeof StaffOrderResponseSchema>;
