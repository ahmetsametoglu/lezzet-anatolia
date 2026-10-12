import { z } from 'zod';
import { PaymentMethodEnum } from '../primitives/enums.schema';
import { CatalogProductSchema, CatalogVariantSchema } from './catalog-api.schema';

/**
 * Yerinde satışın tel şekli (DOMAIN §17); kararlar `sellOnSite`tadır ve depo gövdede yoktur, personelin künyesinden gelir. Alıcı
 * satışın bağlamıdır (`?customerId=`, katalog ve okutma da aynı müşteriyle fiyatlanır); verilmezse satış anonim alıcıya yazılır.
 */
/**
 * Satışın yüzeyi (`?place=`): personel tesiste mi, aracından mı satıyor; depoyu yine sunucu çözer. Beyan yetki değildir: aracı
 * olmayan kuryeye `400 no_vehicle`, `van` diyen depocuya `403` döner.
 */
export const SalePlaceEnum = z.enum(['facility', 'van']);
export type SalePlace = z.infer<typeof SalePlaceEnum>;

export const OnSiteSaleLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  /**
   * Pazarlıklı birim fiyat (**cent**), yalnız üstüne yazılan kalemde gelir; öteki kalemin fiyatını sunucu çözer ki siparişin parası
   * istemciden yazılmasın.
   */
  negotiatedUnitPriceCents: z.number().int().nonnegative().optional(),
});

export const OnSiteSaleRequestSchema = z.object({
  lines: z.array(OnSiteSaleLineSchema).min(1),
  paymentMethod: PaymentMethodEnum,
  /**
   * Tahsil edilen tutar (**cent**): personelin aldığını onayladığı para, ki kesin tutar ile yazım arasında fiyat değişse de defter alınanı
   * yazsın. Verilmezse siparişin toplamı tahsil edilmiş sayılır.
   */
  collectedAmountCents: z.number().int().nonnegative().optional(),
  /** Cevabı kaybolan satış aynı sepetle yeniden gönderilince aynı kimlikle gelir; sunucu ikinci satış açmaz. */
  idempotencyKey: z.string().min(1).max(64).nullish(),
  /**
   * Vadeli satış: kapıda para alınmaz, tutar müşterinin açık bakiyesine eklenir. Yalnız seçilmiş müşteride ve havale yöntemiyle
   * gelir; vade izni ve limiti sunucu denetler.
   */
  onAccount: z.boolean().optional(),
});
export type OnSiteSaleRequest = z.infer<typeof OnSiteSaleRequestSchema>;

/** Vadeli satış açılamadı — sipariş HİÇ yazılmadı; sebep vade freninin kendisidir. */
const CreditNotAllowedSchema = z.object({
  status: z.literal('credit_not_allowed'),
  reason: z.enum(['not_enabled', 'overdue', 'limit_exceeded']),
});
/** Seçilen yöntemin kapı hesabı ayarlı değil — sipariş HİÇ yazılmadı; personel başka yöntemle satabilir. */
const NoPaymentAccountSchema = z.object({ status: z.literal('no_payment_account') });
/** Bu depoda o kadar yok — sipariş HİÇ yazılmadı, kalan sayı söylenir. */
const InsufficientHereSchema = z.object({
  status: z.literal('insufficient_here'),
  lines: z.array(z.object({ name: z.string(), available: z.number().int() })),
});
/** Satışa kapalı satır — elle fiyat yazmak kapanmış ürünü diriltmez. */
const BlockedLinesSchema = z.object({ status: z.literal('blocked_lines'), lines: z.array(z.string()) });
/** Kapı reddetti (yarış, kural). Ayrıntı sunucuda loglanır; ekran tek cümle söyler. */
const SaleFailedSchema = z.object({ status: z.literal('failed') });
/** Deponun ülkesi satıcının ülkesi değil; oradan satış desteklenmiyor, sipariş HİÇ yazılmadı. */
const SaleOriginUnsupportedSchema = z.object({ status: z.literal('sale_origin_unsupported') });

/**
 * Cevap, kapının kararı ne olursa olsun HTTP 200'dür: durum kodu isteğin kapıya ulaşıp ulaşmadığını, gövde satışın olup olmadığını
 * söyler. Yetersiz stok hata değil cevaptır; ekran kalan adedi yazar.
 */
export const OnSiteSaleResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    orderId: z.string().uuid(),
    totalCents: z.number().int(),
    referenceNo: z.string().nullable(),
    /**
     * Tahsilat defterine yazıldı mı; hesap satıştan önce denetlenir, `false` yazımın kendisi reddedildiğinde ya da satış vadeliyse
     * (vadelide tahsilat yoktur).
     */
    paymentRecorded: z.boolean(),
  }),
  CreditNotAllowedSchema,
  NoPaymentAccountSchema,
  InsufficientHereSchema,
  BlockedLinesSchema,
  SaleFailedSchema,
  SaleOriginUnsupportedSchema,
]);
export type OnSiteSaleResponse = z.infer<typeof OnSiteSaleResponseSchema>;

/**
 * Kesin tutar (`POST /sale/on-site/quote`): satışla aynı sepet, yazım yok. Personel parayı (nakit ya da kart) bu tutarla alır ve satış
 * ancak para alındıktan sonra yazılır, çünkü kasa fişi yazıldığı anda kapanır; retler satışınkilerle aynıdır.
 */
export const OnSiteSaleQuoteRequestSchema = OnSiteSaleRequestSchema.pick({ lines: true, paymentMethod: true, onAccount: true });
export type OnSiteSaleQuoteRequest = z.infer<typeof OnSiteSaleQuoteRequestSchema>;

export const OnSiteSaleQuoteResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), totalCents: z.number().int() }),
  CreditNotAllowedSchema,
  NoPaymentAccountSchema,
  InsufficientHereSchema,
  BlockedLinesSchema,
  SaleFailedSchema,
  SaleOriginUnsupportedSchema,
]);

/* ────────────────────────────────────────────────────────────────────────────
   SATIŞ KATALOĞU — vitrinin okuması, satışın ihtiyacıyla
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Satış kartı = katalog kartı + bu depoda kalan adet. Adet vitrine sızdırılmaz, ama kapıdaki personel "kaç tane var" sorusunu
 * satmayı denemeden cevaplamalı; kartın geri kalanı vitrinle aynı kaynaktan gelir.
 */
export const SaleCatalogProductSchema = CatalogProductSchema.extend({
  /**
   * Bu depoda satılabilir adet (rezervasyonlar düşülmüş); `null` aktif boy yok, `0` var ama bitti demektir. İkisi ayrı tutulur, çünkü
   * biri katalog sorunu öteki stoktur.
   */
  availableHere: z.number().int().nullable(),
});
export type SaleCatalogProduct = z.infer<typeof SaleCatalogProductSchema>;

/**
 * Sayfa zarfı — `CatalogPageSchema`nın satışa inen kesiti. `activeCollection`/`campaign` yuvası BİLEREK yok: onlar vitrinin kesit
 * başlığıdır, satış ekranının başlığı depodur.
 */
export const SaleCatalogPageSchema = z.object({
  products: z.array(SaleCatalogProductSchema),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type SaleCatalogPage = z.infer<typeof SaleCatalogPageSchema>;

/** Boy satırı = detayın boy kartı + kalan adet (kartla aynı gerekçe). */
export const SaleVariantSchema = CatalogVariantSchema.extend({
  availableHere: z.number().int(),
});
export type SaleVariant = z.infer<typeof SaleVariantSchema>;

/**
 * Çok boylu ürünün çekmecesi (`GET /sale/catalog/:slug/variants`): boy seçimi detayın işidir ve satışta detay bir çekmecedir. Kaynak
 * `getProductDetail`tir (yer = personelin deposu), böylece fiyat, indirim ve stok vitrinle aynı motordan çıkar.
 */
export const SaleVariantsResponseSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  variants: z.array(SaleVariantSchema),
});
export type SaleVariantsResponse = z.infer<typeof SaleVariantsResponseSchema>;

/** Son kapı satışları (`GET /sale/recent`); satıcı adı ayrı kolondan değil `order_status_log`un `completed` aktöründen gelir. */
export const SaleRecordSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  totalCents: z.number().int(),
  paymentMethod: PaymentMethodEnum.nullable(),
  createdAt: z.string(),
  lineCount: z.number().int().nonnegative(),
  /** `null` = iz yok (aktörsüz kayıt) — ekran "bilinmiyor" der, uydurmaz. */
  sellerName: z.string().nullable(),
});
export type SaleRecord = z.infer<typeof SaleRecordSchema>;

/**
 * Barkod okutma (`GET /sale/scan?code=…`): cevap kartın kendisi ve okutulan boydur, ekran kartla açılan çekmeceyi açar ve ikinci bir
 * ürün görünümü yazılmaz. Kod barkod, SKU ya da tedarikçi kodudur (`findByCode`); `qtyPerCode` koli barkodunun çarpanıdır.
 */
export const SaleScanResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    product: SaleCatalogProductSchema,
    variant: SaleVariantSchema,
    qtyPerCode: z.number().int().positive(),
  }),
  /** Kod hiçbir kayda bağlı değil. */
  z.object({ status: z.literal('unknown_code') }),
  /** Ürün var ama bu kanalda satılmıyor ya da boyu pasif. */
  z.object({ status: z.literal('not_sellable') }),
  /** Ürün var, bu depoda ya da araçta yok. */
  z.object({ status: z.literal('not_here'), name: z.string() }),
]);
export type SaleScanResponse = z.infer<typeof SaleScanResponseSchema>;

export const RecentSalesResponseSchema = z.object({ sales: z.array(SaleRecordSchema) });
export type RecentSalesResponse = z.infer<typeof RecentSalesResponseSchema>;
