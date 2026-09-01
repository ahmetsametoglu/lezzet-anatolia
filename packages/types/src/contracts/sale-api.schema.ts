import { z } from 'zod';
import { PaymentMethodEnum } from '../primitives/enums.schema';
import { CatalogProductSchema, CatalogVariantSchema } from './catalog-api.schema';

/**
 * **YERİNDE SATIŞ SÖZLEŞMESİ** (21.119 · `DOMAIN §17`) — depo kapısı ve kuryenin aracı.
 *
 * Kapı `packages/application`ın `sellOnSite`ı; bu dosya yalnız telin şeklidir. Kararların hiçbiri
 * burada değil ve olmamalı: fiyat sepet okumasında çözülüyor, tüketim geçiş makinesinde.
 *
 * ── DEPO GÖVDEDE YOK, KÜNYEDE ───────────────────────────────────────────────
 * Satış hangi depodan yapılıyorsa personelin O ANKİ deposudur ve `warehouseGuard` onu istekten
 * çözüyor (kapsam kontrolüyle birlikte). Gövdeye konsaydı kurye başka bir deponun malını satmayı
 * DENEYEBİLİRDİ — reddedilirdi ama denenebilir olması bile yanlış bir kapı şeklidir.
 *
 * ── MÜŞTERİ DE GÖVDEDE YOK ──────────────────────────────────────────────────
 * Kimlik SORULMUYOR (kullanıcı kararı 26.08) ve sipariş anonim alıcıya yazılıyor
 * (`ANONYMOUS_BUYER_ID`, `roles = {system}`). İstemciden müşteri kimliği kabul etmek, kimliği
 * istemcinin belirlemesi demekti — `placeOrder`ın "müşteri kimliği istemciden ASLA alınmaz"
 * kuralının aynısı.
 */
/**
 * **SATIŞ YERİ** — isteğin `?place=` beyanı (01.09 · kullanıcı kararı).
 *
 * Depo künyeden çözülmeye devam ediyor; beyan edilen şey depo DEĞİL, **yüzey**: personel kapıda mı
 * duruyor yoksa aracından mı satıyor. İkisi aynı kişide birleşebiliyor (kurye rolü tesisleri de
 * kapsar — rota seçimi onlara bakar) ve sunucunun bunu istekten anlamasının başka yolu yok.
 *
 * `van` = kuryenin aracı; depo kimliğini yine SUNUCU çözer (kapsamdaki `kind='vehicle'` depo).
 * Beyansız istek eski davranışı korur: `?warehouseId=` ya da kapsamın tek deposu.
 *
 * **Beyan yetki değildir:** `van` diyen bir depocuya `403`, aracı olmayan kuryeye `400 no_vehicle`
 * döner. İstemci hangi aracı istediğini SEÇEMEZ, yalnız "aracımdan" diyebilir.
 */
export const SalePlaceEnum = z.enum(['facility', 'van']);
export type SalePlace = z.infer<typeof SalePlaceEnum>;

export const OnSiteSaleLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  /**
   * Pazarlıklı birim fiyat (**cent**) — YALNIZ üstüne yazıldıysa gönderilir.
   *
   * Dokunulmamış kalemde alan hiç gelmez ve sunucu fiyatı kendisi çözer. Her kaleme sayı
   * göndermek, siparişin parasını istemciye yazdırmak olurdu (09.8'in aynı kararı).
   */
  negotiatedUnitPriceCents: z.number().int().nonnegative().optional(),
});

export const OnSiteSaleRequestSchema = z.object({
  lines: z.array(OnSiteSaleLineSchema).min(1),
  paymentMethod: PaymentMethodEnum,
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents: z.number().int().nonnegative().optional(),
});
export type OnSiteSaleRequest = z.infer<typeof OnSiteSaleRequestSchema>;

/**
 * Cevap — **kapının kararı ne olursa olsun HTTP 200** (mobil uçların ortak çizgisi).
 *
 * Durum kodu *"istek kapıya ulaştı mı"* sorusunundur; *"satış oldu mu"* gövdede durur. Yetersiz
 * stok bir hata değil bir CEVAPTIR: ekran kalan adedi yazar, personel müşteriye "üçü var" der.
 */
export const OnSiteSaleResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    orderId: z.string().uuid(),
    totalCents: z.number().int(),
    referenceNo: z.string().nullable(),
    /** Tahsilat defterine yazıldı mı — kasa ayarsızsa satış kapanır, para kayıtsız görünür. */
    paymentRecorded: z.boolean(),
  }),
  /** Bu depoda o kadar yok — sipariş HİÇ yazılmadı, kalan sayı söylenir. */
  z.object({
    status: z.literal('insufficient_here'),
    lines: z.array(z.object({ name: z.string(), available: z.number().int() })),
  }),
  /** Satışa kapalı satır — elle fiyat yazmak kapanmış ürünü diriltmez. */
  z.object({ status: z.literal('blocked_lines'), lines: z.array(z.string()) }),
  /** Kapanış adımı reddetti (yarış, kural). Ayrıntı sunucuda loglanır; ekran tek cümle söyler. */
  z.object({ status: z.literal('failed') }),
]);
export type OnSiteSaleResponse = z.infer<typeof OnSiteSaleResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────────
   SATIŞ KATALOĞU — vitrinin okuması, satışın ihtiyacıyla (21.119)
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Satış kartı = katalog kartı + **bu depoda kalan adet**.
 *
 * Vitrin sözleşmesi adet TAŞIMAZ ve taşımamalı (stok sayısı müşteriye sızdırılmaz — `soldOut`
 * yeter). Satış ekranındaki kişi ise personeldir ve müşterinin yüzüne karşı "kaç tane var"
 * sorusuna cevap vermek zorundadır; adet olmadan bunu ancak satmayı DENEYEREK öğrenirdi
 * (`insufficient_here`). Alan bu yüzden vitrine değil, yalnız satış ucuna eklendi — türetme
 * `extend` ile: kartın geri kalanı vitrinle AYNI kaynaktan gelir, ikinci bir kart şekli yoktur.
 */
export const SaleCatalogProductSchema = CatalogProductSchema.extend({
  /**
   * Bu depoda satılabilir adet (rezervasyonlar düşülmüş) — `variantId`nin stoğu.
   * **`null` = satılacak birim yok** (aktif boy yok); `0` ise "var ama bitti" demektir. İkisi
   * aynı kefeye konmaz: biri katalog sorunudur, öteki stok.
   */
  availableHere: z.number().int().nullable(),
});
export type SaleCatalogProduct = z.infer<typeof SaleCatalogProductSchema>;

/**
 * Sayfa zarfı — `CatalogPageSchema`nın satışa inen kesiti. `activeCollection`/`campaign` yuvası
 * BİLEREK yok: onlar vitrinin kesit başlığıdır, satış ekranının başlığı depodur.
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
 * **Çok boylu ürünün çekmecesi** — `GET /sale/catalog/:slug/variants`.
 *
 * Liste kartı tek boy taşır (`variantId` = ilk aktif boy); boy SEÇİMİ detayın işidir ve satışta
 * o "detay" bir çekmecedir. Kaynak `getProductDetail`in ta kendisi (yer = personelin deposu) —
 * fiyat/indirim/stok kararları vitrinle aynı motordan çıkar, ekran ikinci bir fiyat yolu bilmez.
 */
export const SaleVariantsResponseSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  variants: z.array(SaleVariantSchema),
});
export type SaleVariantsResponse = z.infer<typeof SaleVariantsResponseSchema>;

/**
 * **Son kapı satışları** — `GET /sale/recent` (kullanıcı isteği 26.08: "kaydedilen satışı
 * görebileyim; kim yaptıysa görünsün"). Kaynak `listRecentDoorSales`; satıcı adı ayrı bir
 * kolondan değil, zaten tutulan izden gelir (`order_status_log`un `completed` aktörü).
 */
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

export const RecentSalesResponseSchema = z.object({ sales: z.array(SaleRecordSchema) });
export type RecentSalesResponse = z.infer<typeof RecentSalesResponseSchema>;
