import { z } from 'zod';
import { FulfillmentAdjustmentSchema, PreparationPickSchema } from '../entities/order.schema';
import { AdjustBatchResultSchema, StockAdjustmentReasonEnum } from '../entities/stock-adjustment.schema';
import { ReceiveIntakeResultSchema } from '../entities/supply.schema';
import { DispatchLineSchema, ReceiveLineSchema } from '../entities/warehouse.schema';
import { ChannelEnum, OrderStatusEnum, PaymentStatusEnum, TransferStatusEnum } from '../primitives/enums.schema';

/**
 * Depo SÖZLEŞME şemaları (21.11) — mobil `/api/v1/warehouse/*` uçlarının ve onları tüketen "Depo"
 * bölümünün (D1 · D2 · D4 · D5 · D6) ORTAK dili.
 *
 * Gerekçe `courier-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema uçta
 * yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz.
 *
 * ── ALANLAR `@lezzet/application`IN DEPO KAPILARININ AYNASIDIR ────────────────
 * Kaynak `packages/application/src/warehouse/{preparation,intake,adjustment,transfer}.ts` ve D6
 * için `order/refund.ts`. Uç, orkestrasyonun döndürdüğü şekli **indirgemez, yeniden adlandırmaz,
 * alan eklemez**. Buradaki her alanın bugün gerçekten taşınan bir davranışı vardır; ileride
 * gerekebilecek hiçbir alan şimdiden açılmadı — hub sayaçları ve D3 (yakın-SKT) listesi burada
 * YOK, çünkü karşılıkları henüz bir kapıda değil.
 *
 * ── `warehouseId` HİÇBİR İSTEK GÖVDESİNDE YOK, VE BU BİR KARAR ───────────────
 * Kapıların hepsi depo kimliğini ZORUNLU parametre alır (CLAUDE.md §1: varsayılan depo YOKTUR) ama
 * o kimlik **jetondan/personelin sabit deposundan** gelir, gövdeden değil. Gövdeye konsaydı depocu
 * başka deponun kimliğini yazıp onun malını düşebilirdi — yetkilendirme, doğrulanmamış bir girdiye
 * dayanamaz. (Sevkin HEDEF deposu istisnadır: o bir iş verisi, kimlik değil.)
 *
 * ── PARA BU DOSYADAN GEÇMEZ (D6 hariç, ve gerekçesiyle) ─────────────────────
 * Depo şemalarında tutar, maliyet, kâr alanı YOKTUR — tasarımın altın kuralı burada veri şeklinde
 * duruyor (v2: *"Depo ekranları fiyat/tutar görmez"*). Tek istisna D6'nın yanıtıdır: kurye dönüşü
 * bir SİPARİŞ düzeltmesidir ve iade tutarını çağıran (yönetim akışı) okur.
 *
 * ── OLUMSUZ SONUÇLAR DA SÖZLEŞMENİN İÇİNDE ──────────────────────────────────
 * `forbidden` / `stale` / `incomplete` / `pinned_violation` birer HATA DEĞİL, cevabın kendisidir ve
 * ekranın göstermesi gerekir. Bu yüzden yanıtlar ayrımlı birleşim (`discriminatedUnion`): taşıdıkları
 * bilgi (hangi parti, hangi satır, hangi durum) bir HTTP koduna indirgenirse kaybolur.
 */

// ── D1 · Hazırlık (toplama) ─────────────────────────────────────────────────

/** Motorun önerdiği tek parti — depocunun rafta arayacağı şey. Fiyat YOK. */
export const PreparationSuggestionSchema = z.object({
  stockId: z.string().uuid(),
  qty: z.number().int(),
  expiryDate: z.string(),
  location: z.string().nullable(),
});
export type PreparationSuggestionContract = z.infer<typeof PreparationSuggestionSchema>;

export const PreparationLineSchema = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid(),
  /** Operasyon dilinde (Türkçe) — müşterinin dilinde değil. */
  productName: z.string(),
  /** "500 g" gibi boy etiketi; tek boylu üründe boş dize. */
  variantLabel: z.string(),
  orderedQty: z.number().int(),
  /** Daha önce toplanmış adet — **yarım iş sürer**, ekran kaldığı yerden devam eder. */
  pickedQty: z.number().int(),
  /** Doluysa öneri değil ZORUNLULUK: indirimli teklif kalemi yalnız bu partiden verilebilir. */
  pinnedStockId: z.string().uuid().nullable(),
  suggestion: z.array(PreparationSuggestionSchema),
  /** Önerilen partiler istenen adedi karşılayamıyorsa kalan — fiziksel eksik sinyali. */
  shortfallQty: z.number().int(),
});
export type PreparationLineContract = z.infer<typeof PreparationLineSchema>;

/** Kuyruk satırı — sipariş künyesi + kalemleri. Tutar, adres, iletişim YOK (tasarım §6). */
export const PreparationOrderSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /** Koli etiketi için AD; iletişim ve adres okunmaz. */
  customerName: z.string(),
  channel: ChannelEnum,
  status: OrderStatusEnum,
  deliveryDate: z.string().nullable(),
  lineCount: z.number().int(),
  pickedLineCount: z.number().int(),
  lines: z.array(PreparationLineSchema),
});
export type PreparationOrderContract = z.infer<typeof PreparationOrderSchema>;

/** `GET /warehouse/preparation` yanıtı. Gün ZORUNLU döner: istemci "hangi günü gösteriyorum" demez. */
export const PreparationQueueResponseSchema = z.object({
  /** Süzgeç uygulanan gün; verilmemişse `null` — o zaman bekleyen HER sipariş listededir. */
  date: z.string().nullable(),
  orders: z.array(PreparationOrderSchema),
});
export type PreparationQueueResponse = z.infer<typeof PreparationQueueResponseSchema>;

/**
 * Hazırlık onayı isteği (D1). `picks` VARLIK şemasından gelir (`PreparationPickSchema`) — RPC'nin
 * girdisiyle aynı şekil; ikinci bir tanım, aynı kalemi iki dilde konuşmak olurdu.
 */
export const ConfirmPreparationRequestSchema = z.object({
  picks: z.array(PreparationPickSchema),
});
export type ConfirmPreparationRequest = z.infer<typeof ConfirmPreparationRequestSchema>;

/**
 * Eksik kalan kalemin motor tavsiyesi — **tutar taşımaz** (depocu parayı görmez; motor tutarı yalnız
 * KARAR girdisi olarak alır).
 *
 * Değerler `domain-core/stock/shortfall`ın aynası. Zod karşılığı burada yeniden yazılıyor çünkü
 * `@lezzet/types` motoru BİLMEZ (bağımlılık tek yönlü: domain-core → types). Ayrışma riski
 * ölçülebilir: iki liste de küçük ve ikisi de tek yerde duruyor.
 */
export const ShortfallSuggestionSchema = z.object({
  action: z.enum(['ask_customer', 'send_rest']),
  /** Öneriyi doğuran sebep — ekran bunu sade bir cümleye çevirir, TUTAR yazmadan. */
  reason: z.enum(['complete', 'line_fully_missing', 'large_share', 'high_value', 'minor']),
  missingQty: z.number().int(),
});
export type ShortfallSuggestionContract = z.infer<typeof ShortfallSuggestionSchema>;

export const ConfirmPreparationResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    items: z.number().int(),
    /** Tamamı toplandı ve sipariş `ready`'e geçti mi. `false` HATA DEĞİL: yarım iş `preparing`te sürer. */
    ready: z.boolean(),
    /** Eksik kalan kalemler — karar YÖNETİM ekranında (D1 → Y2), depocuya sorulmaz. */
    shortfalls: z.array(z.object({ itemId: z.string().uuid(), suggestion: ShortfallSuggestionSchema })),
  }),
  /** Kilitli kalem başka partiden verilmek istendi — HİÇBİR yazım yapılmadı. */
  z.object({ status: z.literal('pinned_violation'), itemId: z.string().uuid(), requiredStockId: z.string().uuid() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('not_found') }),
]);
export type ConfirmPreparationResponse = z.infer<typeof ConfirmPreparationResponseSchema>;

// ── D2 · Mal kabul ──────────────────────────────────────────────────────────

/** PO'dan dolu gelen form satırı — beklenen adet + ad. **Fiyat alanı YOK ve olamaz.** */
export const IntakeFormRowSchema = z.object({
  variantId: z.string().uuid(),
  productName: z.string(),
  variantLabel: z.string(),
  expectedQty: z.number().int(),
});
export type IntakeFormRowContract = z.infer<typeof IntakeFormRowSchema>;

/** `GET /warehouse/intake/:purchaseOrderId` yanıtı. Boş dizi = plansız alım (form elle doldurulur). */
export const IntakeFormResponseSchema = z.object({ rows: z.array(IntakeFormRowSchema) });
export type IntakeFormResponse = z.infer<typeof IntakeFormResponseSchema>;

/**
 * Depocunun gönderdiği kabul satırı. **Maliyet alanı YOKTUR** — bu bir ekran kuralı değil, tip
 * sınırı: depo yolu fiyat gönderemez (09.14). Fiyatlı giriş admin'in ayrı kapısıdır ve mobil depo
 * ucunda karşılığı yok.
 *
 * `expiryDate` zorunlu ve bu v2'nin cümlesi: *"SKT her satırda zorunlu — girilmeden kabul kapanmaz."*
 */
export const IntakeFormLineSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  expiryDate: z.string(),
  /** Geri çağırma anahtarı; boş bırakmak BİLİNÇLİ bir karar olmalı (v2 notu). */
  lotNumber: z.string().nullish(),
  location: z.string().nullish(),
});
export type IntakeFormLineContract = z.infer<typeof IntakeFormLineSchema>;

export const ReceiveGoodsRequestSchema = z.object({
  lines: z.array(IntakeFormLineSchema),
  /** PO'lu kabul; yoksa plansız alım — fark raporu da o zaman üretilmez. */
  purchaseOrderId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  date: z.string().optional(),
  note: z.string().nullish(),
});
export type ReceiveGoodsRequest = z.infer<typeof ReceiveGoodsRequestSchema>;

/** Raf ömrü uyarısı — **engel DEĞİL, bilgi**; kabul yine yazılır (DOMAIN §4). */
export const IntakeWarningSchema = z.object({
  variantId: z.string().uuid(),
  /** Kalan raf ömrü yüzdesi. `null` = ürünün toplam ömrü bilinmiyor — ölçülemeyen değer sıfır değildir. */
  remainingPercent: z.number().nullable(),
});
export type IntakeWarningContract = z.infer<typeof IntakeWarningSchema>;

/** Beklenen–gelen farkı — yalnız SAPAN satırlar (v2: "FARK ÖZETİ — YALNIZ SAPAN SATIRLAR"). */
export const IntakeDifferenceSchema = z.object({
  variantId: z.string().uuid(),
  expectedQty: z.number().int(),
  receivedQty: z.number().int(),
});
export type IntakeDifferenceContract = z.infer<typeof IntakeDifferenceSchema>;

export const ReceiveGoodsResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    result: ReceiveIntakeResultSchema,
    warnings: z.array(IntakeWarningSchema),
    differences: z.array(IntakeDifferenceSchema),
    /**
     * Hedefe çekilen otomatik fiyat sayısı. **`null` = ÖLÇÜLEMEDİ** (fiyat portu kayıtlı değil),
     * sıfır değil — bozuk bir ölçümü sağlıklı gibi okutmamak için (CLAUDE.md §1). Depocuya
     * gösterilmez; kabul kaydında görünür kalması içindir.
     */
    repricedCount: z.number().int().nullable(),
  }),
  /** Satırsız istek — hiçbir şey yazılmadı. */
  z.object({ status: z.literal('empty') }),
]);
export type ReceiveGoodsResponse = z.infer<typeof ReceiveGoodsResponseSchema>;

// ── D4 · Sayım / düzeltme ───────────────────────────────────────────────────

/**
 * Depocunun seçebileceği sebepler — **`return_restock` YOK** (v2: *"'İade stoğa döndü' depocuya
 * açılmaz — yönetim istisnasıdır"*). Kural tipte duruyor, ekranda değil.
 *
 * Liste varlık enum'undan TÜRETİLİR (`.exclude`), elle yazılmaz: yarın yeni bir sebep eklenirse
 * depo kapısı onu kendiliğinden görür ve iki liste ayrışmaz.
 */
export const WarehouseAdjustmentReasonEnum = StockAdjustmentReasonEnum.exclude(['return_restock']);
export type WarehouseAdjustmentReason = z.infer<typeof WarehouseAdjustmentReasonEnum>;

export const AdjustmentLineSchema = z.object({
  stockId: z.string().uuid(),
  /** İŞARETLİ: + stoktan düşüm, − stoğa geri ekleme (yalnız sayım FAZLASI). */
  qty: z.number().int(),
});
export type AdjustmentLineContract = z.infer<typeof AdjustmentLineSchema>;

export const RecordAdjustmentRequestSchema = z.object({
  lines: z.array(AdjustmentLineSchema),
  reason: WarehouseAdjustmentReasonEnum,
  /** Geri eklemede ZORUNLU — kuralı veritabanı zorlar, sözleşme yalnız yolu açar. */
  note: z.string().nullish(),
});
export type RecordAdjustmentRequest = z.infer<typeof RecordAdjustmentRequestSchema>;

export const RecordAdjustmentResponseSchema = z.discriminatedUnion('status', [
  /** `result.referenceNo` OLAY belgesidir — ekranda gösterilir, kâğıt tutanakla eşleşir. */
  z.object({ status: z.literal('ok'), result: AdjustBatchResultSchema }),
  /** Fiziksel gerçek ihlali ("partide 3 var, 5 düşülemez") — mesaj operatöre AYNEN gösterilir. */
  z.object({ status: z.literal('failed'), message: z.string() }),
  /** Başka deponun partisi — hangileri olduğu döner ki operatör satırı bulabilsin. */
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope'), stockIds: z.array(z.string().uuid()) }),
  z.object({ status: z.literal('not_found'), stockIds: z.array(z.string().uuid()) }),
  z.object({ status: z.literal('empty') }),
]);
export type RecordAdjustmentResponse = z.infer<typeof RecordAdjustmentResponseSchema>;

// ── D5 · Transfer ───────────────────────────────────────────────────────────

export const InboundTransferLineSchema = z.object({
  lineId: z.string().uuid(),
  sourceStockId: z.string().uuid(),
  /** "Ürün (boy)" — operasyon dilinde. */
  name: z.string(),
  dispatchedQty: z.number().int(),
  /** **`null` = henüz sayılmadı, `0` = geldi ama kayıp.** İkisi ayrı şeydir (0042). */
  receivedQty: z.number().int().nullable(),
});
export type InboundTransferLineContract = z.infer<typeof InboundTransferLineSchema>;

export const InboundTransferSchema = z.object({
  transferId: z.string().uuid(),
  /** TRF-COL-26-0007 — KAYNAK deponun kodu; kâğıt klasör orada durur. */
  referenceNo: z.string(),
  fromWarehouseId: z.string().uuid(),
  dispatchedAt: z.string(),
  note: z.string().nullable(),
  lines: z.array(InboundTransferLineSchema),
});
export type InboundTransferContract = z.infer<typeof InboundTransferSchema>;

/** `GET /warehouse/transfers` yanıtı — "bana ne geliyor". Sayfalanmaz: küme fiziksel gerçekle sınırlı. */
export const InboundTransfersResponseSchema = z.object({ transfers: z.array(InboundTransferSchema) });
export type InboundTransfersResponse = z.infer<typeof InboundTransfersResponseSchema>;

/**
 * Transfer kabulü isteği (D5). Satır tipi VARLIK şemasından (`ReceiveLineSchema`) — `receivedQty`
 * sıfır olabilir ve bu bir BEYANDIR ("sevk edildi ama gelmedi"); satırı hiç göndermemek ise kabulü
 * bloklar (v2: *"boş satır kabulü bloklar, ikisi ayrı şeydir"*).
 */
export const ReceiveTransferRequestSchema = z.object({ lines: z.array(ReceiveLineSchema) });
export type ReceiveTransferRequest = z.infer<typeof ReceiveTransferRequestSchema>;

export const ReceiveTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), createdBatches: z.number().int() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** Araya biri girdi: transfer artık yolda değil. Ekran bunu GÖSTERİR, yutmaz. */
  z.object({ status: z.literal('stale'), currentStatus: TransferStatusEnum }),
  /** Sayılmamış (ya da tanınmayan) satır var — kabul YAPILMADI, hangileri olduğu döner. */
  z.object({
    status: z.literal('incomplete'),
    missingLineIds: z.array(z.string().uuid()),
    unknownLineIds: z.array(z.string().uuid()),
  }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type ReceiveTransferResponse = z.infer<typeof ReceiveTransferResponseSchema>;

/**
 * Sevk isteği (D5'in "ver" yarısı). **Kaynak depo gövdede YOK** — partiler zaten bir depoda duruyor
 * ve ayrıca sorulan bir kaynak onlarla çelişebilirdi; kimlik jetondan gelir. Hedef ise iş verisidir.
 */
export const DispatchTransferRequestSchema = z.object({
  toWarehouseId: z.string().uuid(),
  lines: z.array(DispatchLineSchema),
  note: z.string().nullish(),
});
export type DispatchTransferRequest = z.infer<typeof DispatchTransferRequestSchema>;

export const DispatchTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), referenceNo: z.string() }),
  z.object({
    status: z.literal('forbidden'),
    reason: z.enum(['out_of_scope', 'same_warehouse']),
    stockIds: z.array(z.string().uuid()).optional(),
  }),
  z.object({ status: z.literal('not_found'), stockIds: z.array(z.string().uuid()) }),
  /** RPC reddi — en sık sebebi "kullanılabilir stok yetmiyor" (söz verilmiş mal yola çıkmaz). */
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('empty') }),
]);
export type DispatchTransferResponse = z.infer<typeof DispatchTransferResponseSchema>;

/** Sevk kaydını geri al (19.6) — "mal hiç çıkmadı". Gerekçe serbest metin, zorunlu değil. */
export const CancelTransferRequestSchema = z.object({ reason: z.string().nullish() });
export type CancelTransferRequest = z.infer<typeof CancelTransferRequestSchema>;

export const CancelTransferResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), transferId: z.string().uuid(), restoredLines: z.number().int() }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: TransferStatusEnum }),
  z.object({ status: z.literal('failed'), message: z.string() }),
  z.object({ status: z.literal('not_found') }),
]);
export type CancelTransferResponse = z.infer<typeof CancelTransferResponseSchema>;

// ── D6 · Kurye dönüşü kabulü ────────────────────────────────────────────────
// Kapı YENİ DEĞİL: `application/order/refund.adjustFulfillment` zaten var ve `warehouseScope`
// parametresini taşıyor. Burada yalnız o kapının uç ZARFI tanımlanıyor — ikinci bir davranış değil.

/**
 * Dönen malın akıbeti (D6). Satır tipi VARLIK şemasından (`FulfillmentAdjustmentSchema`):
 * `fulfilledQty` **hedef** değerdir (kalan adet), fark değil — v2'nin cümlesi birebir: *"Miktar hedef
 * değer olarak girilir; fark sistemde hesaplanır."*
 *
 * `returnDisposition` üç akıbeti taşır: `restock` (stoğa dön — **sebep notu zorunlu**, soğuk zincir
 * beyanı), `discard` (imha), `goodwill` (jest — mal ve stok DEĞİŞMEZ, yalnız kayıt düşer).
 */
export const WarehouseReturnRequestSchema = z.object({
  adjustments: z.array(FulfillmentAdjustmentSchema),
});
export type WarehouseReturnRequest = z.infer<typeof WarehouseReturnRequestSchema>;

export const WarehouseReturnResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    restockedQty: z.number().int(),
    discardedQty: z.number().int(),
    /** Ayrılmıştan geri bırakılan adet — başkasına satılabilir hâle gelen mal. */
    releasedQty: z.number().int(),
    /** **Cent.** Depocuya gösterilmez; çağıranın (yönetim akışı, defter) okuduğu sayı. */
    refundedAmountCents: z.number().int(),
    paymentStatus: PaymentStatusEnum,
    amountToCollectCents: z.number().int(),
    /**
     * Borç vardı ama iade YAZILAMADI — sebebiyle. Yokluğu "iade tamam" demektir; sessizce sıfır
     * dönmek operatöre iadeyi yapılmış gibi gösterirdi.
     */
    refundBlocked: z.enum(['no_account', 'provider_ref_missing', 'provider_unavailable', 'provider_failed']).optional(),
  }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('not_found') }),
]);
export type WarehouseReturnResponse = z.infer<typeof WarehouseReturnResponseSchema>;
