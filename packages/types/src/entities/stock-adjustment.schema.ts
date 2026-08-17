import { z } from 'zod';
import { dbNumeric } from '../primitives/db-numeric';
import { ProductSchema } from './product.schema';
import { ProductVariantSchema } from './product-variant.schema';

// StockAdjustment — stok azalışının SATIŞ DIŞI her sebebi (DOMAIN §4, §12). Kayıp görünmezse
// yönetilemez: "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı bu tablodur.

export const StockAdjustmentReasonEnum = z.enum([
  'expired', // DLC geçti → imha
  'damaged', // hasar / soğuk zincir kırıldı
  'count_diff', // sayım farkı (iki yönlü)
  'lost', // kayıp
  'return_restock', // teslim-sonrası iade stoğa döndü — istisnadır, sebep notu zorunlu
]);
export type StockAdjustmentReason = z.infer<typeof StockAdjustmentReasonEnum>;

export const StockAdjustmentSchema = z.object({
  id: z.string().uuid(),
  stockId: z.string().uuid(),
  /** İŞARETLİ: + stoktan düşüm, − stoğa geri ekleme. Net kayıp tek toplamla çıksın diye tek alan. */
  qty: z.number().int(),
  reason: StockAdjustmentReasonEnum,
  /**
   * Partinin alış fiyatı (**cent**; DB kolonu `unit_cost`, euro), işlem anında kopyalanır — parti
   * sonradan düzeltilse fire maliyeti kaymaz.
   */
  unitCostCents: z.number().int().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  /**
   * OLAY belgesi (10.5) — `IMH-26-0012`. Aynı imhanın/sayımın bütün satırları AYNI numarayı
   * paylaşır: kâğıt tutanakla eşleşen şey satır değil, olaydır. Geçmiş kayıtlarda `null` — sonradan
   * numara uydurmak, hiç yazılmamış bir tutanağa atıf yapmak olurdu.
   */
  referenceNo: z.string().nullable(),
  createdAt: z.string(),
});
export type StockAdjustment = z.infer<typeof StockAdjustmentSchema>;

export const StockAdjustmentInsertSchema = z.object({
  stockId: z.string().uuid(),
  qty: z.number().int(),
  reason: StockAdjustmentReasonEnum,
  unitCostCents: z.number().int().nullish(),
  note: z.string().nullish(),
  createdBy: z.string().uuid().nullish(),
});
export type StockAdjustmentInsert = z.infer<typeof StockAdjustmentInsertSchema>;

export const StockAdjustmentUpdateSchema = StockAdjustmentSchema.partial().required({ id: true });
export type StockAdjustmentUpdate = z.infer<typeof StockAdjustmentUpdateSchema>;

/** `adjust_stock` RPC'sinin dönüşü — kayıt + fiili düşüm tek transaction'da (06.6). */
export const AdjustResultSchema = z.object({
  ok: z.boolean(),
  adjustmentId: z.string().uuid(),
  remainingQty: z.number().int(),
});
export type AdjustResult = z.infer<typeof AdjustResultSchema>;

/**
 * `adjust_stock_batch` dönüşü (10.5) — N parti, TEK belge. Ekranın kuryeye/depocuya göstereceği ve
 * kâğıda yazacağı numara budur.
 */
export const AdjustBatchResultSchema = z.object({
  ok: z.boolean(),
  referenceNo: z.string(),
  lines: z.number().int(),
  totalQty: z.number().int(),
  /** Olayın net maliyeti (**cent** — RPC sınırda çeviriyor); geri eklemeler toplamdan DÜŞER. */
  costTotalCents: z.number().int(),
});
export type AdjustBatchResult = z.infer<typeof AdjustBatchResultSchema>;

/**
 * İmha/fire geçmişi SATIRI (09.13) — kayıt + hangi partinin, hangi ürünün (gömülü `select`, N+1 yok).
 *
 * Kaydın kendisi yalnız `stockId` taşır; ekranda "hangi üründen ne kadar çöpe gitti" okunacaksa parti
 * ve ürün adı gerekir. Maliyet `unitCostCents`'ten gelir — o alan işlem anında KOPYALANMIŞTIR, yani parti
 * sonradan düzeltilse bile fire maliyeti kaymaz.
 */
export const StockAdjustmentDetailSchema = StockAdjustmentSchema.extend({
  stock: z.object({
    id: z.string().uuid(),
    lotNumber: z.string().nullable(),
    expiryDate: z.string(),
    variant: z.object({
      id: z.string().uuid(),
      // Etiket ENTİTE ŞEMASINDAN türer, elle yazılmaz (`CLAUDE.md §1`). Elle yazıldığı sürece
      // `LocalizedTextSchema` (en az bir dil) diyordu; oysa varyant etiketi TASLAK şemadır —
      // tek boylu üründe etiket YOKTUR ve `{}` meşrudur. Yani bu liste, varsayılan varyantlı bir
      // ürünün fire kaydına rastladığı an doğrulamada patlıyordu. Ekranda hiç görülmedi çünkü
      // okumanın testi yoktu; 09.18'in testi bulup çıkardı.
      label: ProductVariantSchema.shape.label,
      product: z.object({ id: z.string().uuid(), name: ProductSchema.shape.name }),
    }),
  }),
});
export type StockAdjustmentDetail = z.infer<typeof StockAdjustmentDetailSchema>;

/**
 * `stock_adjustment_detail` GÖRÜNÜMÜNÜN düz satırı (09.18).
 *
 * Ayrı bir şema, çünkü görünüm düz kolon döndürür; yukarıdaki iç içe şekil ise **ekranın gördüğü**
 * şekildir ve değişmemeli. Servis düzü okuyup iç içeye eşler — iki şekli tek şemada tutmaya
 * çalışmak, okuyanın hangisinin nereden geldiğini bilememesi demekti.
 *
 * `searchText` burada YOK: arama görünümün içinde süzülüyor, uygulamaya taşınmasının bir sebebi
 * yok (ve taşınsaydı her satırda gereksiz bir metin bloğu gidip gelirdi).
 */
export const StockAdjustmentDetailRowSchema = StockAdjustmentSchema.extend({
  /**
   * Partinin deposu (10.5) — düzeltme kaydının kendisi depo taşımaz, PARTİSİ taşır ve karar oradan
   * okunur. Ekranın "bugün ben ne düştüm" şeridi bununla süzülür: depo süzgeci olmadan depocu
   * başka deponun imhasını kendi şeridinde görür ve o sorunun cevabı bozulur.
   */
  warehouseId: z.string().uuid(),
  lotNumber: z.string().nullable(),
  expiryDate: z.string(),
  variantId: z.string().uuid(),
  variantLabel: ProductVariantSchema.shape.label,
  productId: z.string().uuid(),
  productName: ProductSchema.shape.name,
});
export type StockAdjustmentDetailRow = z.infer<typeof StockAdjustmentDetailRowSchema>;

// TemperatureLog — hijyen denetiminin ilk istediği veri. Sensör yok, elle giriş (DOMAIN §4).

export const TemperatureLogSchema = z.object({
  id: z.string().uuid(),
  /**
   * Hangi TESİS (DOMAIN §17) — hijyen denetimi tesis bazındadır, denetmen bir depoya gelir ve o
   * deponun kayıtlarını ister. Araç kaydı da bir depoya yazılır (aracın çıktığı depo): araçlar
   * depoya bağlanmaz (K8) ama soğuk zincir kaydı sahipsiz kalamaz.
   */
  warehouseId: z.string().uuid(),
  /**
   * ÖLÇÜM NOKTASI — ikisinden **tam biri** dolu (`temperature_log_one_point`, `0045`).
   *
   * Önce tek bir `location` serbest metniydi ve hem dolap adını hem araç plakasını taşıyordu.
   * Yazım farkı (`Dolap 1` ≠ `Dolap-1`) geçmişi bölüyor, sapma uyarısını sessizce işlevsizleştiriyor
   * ve en ağırı **ölçülmeyeni gizliyordu**: var olduğu bilinmeyen bir noktanın eksik ölçümü de
   * bilinemez. Tanımlı kayda geçince "bugün ölçülmedi" cümlesi kurulabilir oldu (19.28).
   */
  storageAreaId: z.string().uuid().nullable(),
  vehicleId: z.string().uuid().nullable(),
  temperatureC: dbNumeric,
  recordedBy: z.string().uuid().nullable(),
  recordedAt: z.string(),
});
export type TemperatureLog = z.infer<typeof TemperatureLogSchema>;

/**
 * Yazma sözleşmesi kısıtı ŞEMADA da taşıyor (`superRefine`): veritabanı zaten reddediyor ama
 * reddin okunur hâli burada doğuyor — çağıran "kısıt ihlali" değil "nokta seçilmedi" görsün.
 */
export const TemperatureLogInsertSchema = z
  .object({
    warehouseId: z.string().uuid(),
    storageAreaId: z.string().uuid().nullish(),
    vehicleId: z.string().uuid().nullish(),
    temperatureC: z.number(),
    recordedBy: z.string().uuid().nullish(),
    recordedAt: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const filled = [value.storageAreaId, value.vehicleId].filter((id) => id != null).length;
    if (filled === 1) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['storageAreaId'],
      message: filled === 0 ? 'Ölçüm noktası seçilmedi.' : 'Tek kayıt tek noktaya yazılır — alan ya araç, ikisi değil.',
    });
  });
export type TemperatureLogInsert = z.infer<typeof TemperatureLogInsertSchema>;

export const TemperatureLogUpdateSchema = TemperatureLogSchema.partial().required({ id: true });
export type TemperatureLogUpdate = z.infer<typeof TemperatureLogUpdateSchema>;
