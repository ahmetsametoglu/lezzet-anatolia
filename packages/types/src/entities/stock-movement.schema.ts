import { z } from 'zod';
import { ProductSchema } from './product.schema';
import { ProductVariantSchema } from './product-variant.schema';

/**
 * **STOK HAREKET DEFTERİ** (06.14) — miktar değiştiren her olayın tek kaydı.
 *
 * Bu şema `StockAdjustment`ın yerini aldı ve sebebi ölçülmüş bir arızaydı: eski tablo yalnız
 * "satış dışı" azalışları tutuyordu (imha · sayım · iade), oysa ekran onu çıkışların TAMAMI sanan
 * bir sekmeye kaynak yapmıştı. Satış, kapı satışı ve sevk hiçbir yere olay kaydı yazmıyordu; o
 * hareketler durum tablolarından türetilmeye çalışılıyor ve türetme her seferinde başka bir sayı
 * veriyordu (`order_item_batch` silinip yeniden yazılan bir tablo — geçmişi yok).
 *
 * Emsal evin kendisinde: para tarafında `money_movement` TEK defterdir, "ayrıca cash_adjustment"
 * diye ikinci bir tablo yoktur. Stok da öyle — imha artık defterin bir `kind`'ı.
 */

/** Yön AYRI alandır, işaret miktara gömülmez (`money_movement` kuralı, `0018`). */
export const StockDirectionEnum = z.enum(['in', 'out']);
export type StockDirection = z.infer<typeof StockDirectionEnum>;

/**
 * HAREKET TİPİ — kapalı liste. Her hareket hangi olaydan doğduğunu kendi taşır; okuyanın
 * yorumuna bırakılmaz (SAP'nin `BWART`ı, Odoo'nun konum çifti ile aynı iş).
 *
 * `transfer_loss` YOK ve bu bilinçli: kaybın bir partisi olmadığı için deftere yazılamıyor
 * (gerekçe `0006` künyesinde). Kayıp, `transfer_out` ile `transfer_in` arasındaki farktır.
 */
export const StockMovementKindEnum = z.enum([
  'intake', // tedarikten kabul                     (in)
  'transfer_in', // sevkiyat kabulü — hedefte yeni parti (in)
  'transfer_out', // sevk                                 (out)
  'transfer_cancel', // sevk geri alındı — mal kaynağa döndü (in)
  'sale', // siparişe çıkan mal (teslim)          (out)
  'counter_sale', // kapı satışı                          (out)
  'return_restock', // iade → rafa döndü                    (in)
  'write_off', // imha / hasar / kayıp                 (out)
  'count_diff', // sayım farkı                          (iki yönlü)
]);
export type StockMovementKind = z.infer<typeof StockMovementKindEnum>;

/**
 * İMHANIN SEBEBİ — hareket tipinden ayrı bir seviye (SAP: hareket tipi + ayrıca reason code).
 * "Çöpe attım" bir harekettir; "neden" onun içindeki kırılımdır ve ekranın "Neden dağılımı"
 * şeridi tam bunu gösterir. Tek enuma çökertseydik ya kırılım kaybolur ya tip listesi şişerdi.
 *
 * Eski `StockAdjustmentReason`dan iki değer buraya GELMEDİ — `count_diff` ve `return_restock`
 * birer sebep değil, birer hareketti; ikisi de artık `kind`.
 */
export const StockWriteOffReasonEnum = z.enum([
  'expired', // DLC geçti → imha
  'damaged', // hasar / soğuk zincir kırıldı
  'lost', // kayıp (sayımda bulunamadı)
]);
export type StockWriteOffReason = z.infer<typeof StockWriteOffReasonEnum>;

export const StockMovementSchema = z.object({
  id: z.string().uuid(),
  stockId: z.string().uuid(),
  /** Partinin deposu — satırda DURUR (türetilmez): dönem okumasının süzgeci join'e bağlanmasın. */
  warehouseId: z.string().uuid(),
  direction: StockDirectionEnum,
  /** DAİMA pozitif; yön `direction`'dadır. */
  qty: z.number().int().positive(),
  kind: StockMovementKindEnum,
  /** Yalnız `write_off`ta dolu (veride kısıtla zorlanıyor). */
  reason: StockWriteOffReasonEnum.nullable(),
  /**
   * Partinin alış fiyatı (**cent**; DB kolonu `unit_cost`, euro), işlem anında kopyalanır — parti
   * sonradan düzeltilse dönem raporu kaymaz.
   */
  unitCostCents: z.number().int().nullable(),
  /** OLAYIN anı — dönem süzgeci buna bakar ("bu çeyrekte ne çıktı" fiziksel bir sorudur). */
  occurredAt: z.string(),
  /**
   * KAYDIN anı — defterin sırası budur. Ayrım `stock_intake`in `date`/`created_at` ayrımıyla aynı
   * (22.28): "az önce ne yazdım" sorusunu yalnız ikincisi cevaplar.
   */
  createdAt: z.string(),
  actorId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  /**
   * Operatörün okuyacağı belge — `IMH-STR-26-0012` · `TRF-STR-26-0007` · siparişin referansı.
   * Aynı olayın bütün satırları AYNI numarayı paylaşır: kâğıtla eşleşen şey satır değil, olaydır.
   */
  referenceNo: z.string().nullable(),
  orderId: z.string().uuid().nullable(),
  transferId: z.string().uuid().nullable(),
  intakeId: z.string().uuid().nullable(),
  /** İptal = TERS KAYIT (SAP 551↔552): bu satır hangi hareketi geri alıyor. */
  reversesId: z.string().uuid().nullable(),
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

/**
 * Insert şeması VAR ama yazma yolu YOK — `order_item_batch`in aynı kararı.
 *
 * Defter satırları yalnız RPC'lerden doğar (`adjust_stock` · `deliver_order` · `quick_sale` ·
 * `receive_intake` · transfer üçlüsü): hareket kaydı ile stoğun değişmesi bölünemez bir yazımdır
 * (`STACK §13`). Buradan tek satır yazma kapısı açmak, o bölünmezliği delen ikinci bir yol açardı.
 */
export const StockMovementInsertSchema = z.object({
  stockId: z.string().uuid(),
  direction: StockDirectionEnum,
  qty: z.number().int().positive(),
  kind: StockMovementKindEnum,
  reason: StockWriteOffReasonEnum.nullish(),
  unitCostCents: z.number().int().nullish(),
  note: z.string().nullish(),
  actorId: z.string().uuid().nullish(),
  referenceNo: z.string().nullish(),
  orderId: z.string().uuid().nullish(),
  transferId: z.string().uuid().nullish(),
  intakeId: z.string().uuid().nullish(),
  reversesId: z.string().uuid().nullish(),
});
export type StockMovementInsert = z.infer<typeof StockMovementInsertSchema>;

export const StockMovementUpdateSchema = StockMovementSchema.partial().required({ id: true });
export type StockMovementUpdate = z.infer<typeof StockMovementUpdateSchema>;

/** `adjust_stock` RPC'sinin dönüşü — defter satırı + fiili düşüm tek transaction'da (06.6). */
export const AdjustResultSchema = z.object({
  ok: z.boolean(),
  movementId: z.string().uuid(),
  remainingQty: z.number().int(),
});
export type AdjustResult = z.infer<typeof AdjustResultSchema>;

/**
 * `adjust_stock_batch` dönüşü (10.5) — N parti, TEK belge.
 *
 * **İKİ YÖN AYRI DÖNER, net tek sayı değil** (06.14). Eskiden tek `totalQty`/`costTotalCents`
 * vardı ve işaret onların içinde eriyordu; karışık bir sayım tutanağı (bir satır fazla, bir satır
 * eksik) *"1 adet · −35,56 €"* gibi hiçbir şeyin ölçüsü olmayan bir sonuç üretiyordu. Net isteyen
 * çağıran ikisini çıkarır — ama artık bunu BİLEREK yapar.
 */
export const AdjustBatchResultSchema = z.object({
  ok: z.boolean(),
  referenceNo: z.string(),
  lines: z.number().int(),
  outQty: z.number().int(),
  inQty: z.number().int(),
  /** **cent** — RPC euro döner, servis sınırda çevirir (`STACK §8`). */
  outCostCents: z.number().int(),
  inCostCents: z.number().int(),
});
export type AdjustBatchResult = z.infer<typeof AdjustBatchResultSchema>;

/**
 * Defter SATIRI + hangi partinin, hangi ürünün (gömülü şekil — ekranın gördüğü hâl).
 *
 * Kaydın kendisi yalnız `stockId` taşır; ekranda "hangi üründen ne kadar" okunacaksa parti ve ürün
 * adı gerekir.
 */
export const StockMovementDetailSchema = StockMovementSchema.extend({
  stock: z.object({
    id: z.string().uuid(),
    lotNumber: z.string().nullable(),
    expiryDate: z.string(),
    variant: z.object({
      id: z.string().uuid(),
      // Etiket ENTİTE ŞEMASINDAN türer, elle yazılmaz (`CLAUDE.md §1`). Elle yazıldığı sürece
      // `LocalizedTextSchema` (en az bir dil) diyordu; oysa varyant etiketi TASLAK şemadır —
      // tek boylu üründe etiket YOKTUR ve `{}` meşrudur. Yani bu liste, varsayılan varyantlı bir
      // ürünün kaydına rastladığı an doğrulamada patlıyordu (09.18'in testi bulup çıkardı).
      label: ProductVariantSchema.shape.label,
      product: z.object({ id: z.string().uuid(), name: ProductSchema.shape.name }),
    }),
  }),
});
export type StockMovementDetail = z.infer<typeof StockMovementDetailSchema>;

/**
 * `stock_movement_detail` GÖRÜNÜMÜNÜN düz satırı (06.14 · 09.18 devamı).
 *
 * Ayrı bir şema, çünkü görünüm düz kolon döndürür; yukarıdaki iç içe şekil ise **ekranın gördüğü**
 * şekildir ve değişmemeli. Servis düzü okuyup iç içeye eşler — iki şekli tek şemada tutmaya
 * çalışmak, okuyanın hangisinin nereden geldiğini bilememesi demekti.
 *
 * `searchText` burada YOK: arama görünümün içinde süzülüyor, uygulamaya taşınmasının sebebi yok
 * (ve taşınsaydı her satırda gereksiz bir metin bloğu gidip gelirdi).
 */
export const StockMovementDetailRowSchema = StockMovementSchema.extend({
  lotNumber: z.string().nullable(),
  expiryDate: z.string(),
  variantId: z.string().uuid(),
  variantLabel: ProductVariantSchema.shape.label,
  productId: z.string().uuid(),
  productName: ProductSchema.shape.name,
});
export type StockMovementDetailRow = z.infer<typeof StockMovementDetailRowSchema>;
