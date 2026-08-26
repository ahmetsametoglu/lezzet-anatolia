import { z } from 'zod';
import { PaymentMethodEnum } from '../primitives/enums.schema';

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
