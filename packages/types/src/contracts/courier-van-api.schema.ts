import { z } from 'zod';

/** Kuryenin aracı ve araçtaki serbest stok: araç seçimi ile araca ürün koyma ve okutma uçlarının şemaları. */

/**
 * Kuryenin seçebileceği araçlar: yalnız kendi deposuna künyeli olanlar.
 * Ad kimliğin yanındadır; `label` boşsa plaka adın kendisidir.
 */
export const CourierVehicleSchema = z.object({
  vehicleId: z.string().uuid(),
  plate: z.string(),
  /** Okunur ad ("Frigo kamyonet"); `null` = adı yok, ekran plakayı yazar. */
  label: z.string().nullable(),
});
export type CourierVehicle = z.infer<typeof CourierVehicleSchema>;

export const CourierVehiclesResponseSchema = z.object({ vehicles: z.array(CourierVehicleSchema) });
export type CourierVehiclesResponse = z.infer<typeof CourierVehiclesResponseSchema>;

/**
 * Araca serbest ürün: sipariş dışı, kapıda satılabilecek mal; kutudan farklı olarak gerçek stok hareketidir (depodan aracın stoğuna).
 * Kalem varyant düzeyindedir, parti seçimi (FEFO) kapının işidir.
 */
export const CourierVanStockLineSchema = z.object({
  variantId: z.string().uuid(),
  name: z.string(),
  /** Boy etiketi ("450 g") — addan AYRI, çünkü ekran ikisini farklı ağırlıkta yazıyor. */
  variantLabel: z.string(),
  /**
   * Ürün kapağının public URL'i; `null` = kapaksız ürün, satır monogram çizer.
   * Rampada kurye ürünü adından çok görünüşünden tanır.
   */
  imageUrl: z.string().nullable(),
  qty: z.number().int(),
  /** Çıkış deposunda kalan kullanılabilir adet — "Alındıktan sonra depoda N kalır." cümlesi. */
  available: z.number().int(),
});
export type CourierVanStockLine = z.infer<typeof CourierVanStockLineSchema>;

/** Depoda alınabilir kalem ("sık koyulanlar" bölümü); `available` = stok eksi rezerve. */
export const CourierVanCandidateSchema = z.object({
  variantId: z.string().uuid(),
  name: z.string(),
  /** Boy etiketi ("450 g") — kartın ince yarısı. */
  variantLabel: z.string(),
  /** Ürün kapağı; `null` = monogram (aynı gerekçe: rampada ürün görünüşünden tanınır). */
  imageUrl: z.string().nullable(),
  available: z.number().int(),
  /** Bu varyanttan ARAÇTA kaç tane var — kart "araçta 3" diyebilsin diye. */
  onVan: z.number().int(),
});
export type CourierVanCandidate = z.infer<typeof CourierVanCandidateSchema>;

export const CourierVanStockResponseSchema = z.object({
  /** `null` = kuryenin araç deposu yok → ekran sebebini söyler, boş liste göstermez. */
  vehicleWarehouseId: z.string().uuid().nullable(),
  onVan: z.array(CourierVanStockLineSchema),
  candidates: z.array(CourierVanCandidateSchema),
});
export type CourierVanStockResponse = z.infer<typeof CourierVanStockResponseSchema>;

/**
 * Araçtaki adedi yaz: fark değil hedef gider ("şu kadar olsun"), çünkü tekrar eden istek hedefte zararsızdır, farkta malı ikinci kez araca bindirir.
 * `observedQty` kuryenin ekranda gördüğü sayıdır; sunucu kendi ölçtüğüyle tutmazsa hiçbir şey yazmaz ve `stale` döner.
 */
export const CourierVanStockSetRequestSchema = z.object({
  variantId: z.string().uuid(),
  /** Araçta OLMASI istenen adet. Fark değil hedef; yönü sunucu ölçerek bulur. */
  targetQty: z.number().int().min(0),
  /** İstemcinin O ANDA gördüğü araç adedi — künyesi yukarıda. */
  observedQty: z.number().int().min(0),
  /**
   * Yazımın kimliği: hedef ve taban ardışık tekrarı çözer, aynı anda gelen iki eş isteği ise ancak veritabanının tekil anahtarı durdurur.
   * `nullish`: anahtarsız istek yalnız hedef ve tabanla korunur; üretimi istemcinin işidir (`lib/request-key.ts`).
   */
  idempotencyKey: z.string().min(1).max(64).nullish(),
});
export type CourierVanStockSetRequest = z.infer<typeof CourierVanStockSetRequestSchema>;

/** Okutma ayrı bir kapı: okutan istemci kodun hangi varyant olduğunu bilmez, bu yüzden hedef ve taban veremez; adet daima 1'dir. */
export const CourierVanStockScanRequestSchema = z.object({
  /** Okutulan barkod / SKU / tedarikçi kodu — uç `variant_barcode` üzerinden çözer. */
  code: z.string().trim().min(1).max(64),
});
export type CourierVanStockScanRequest = z.infer<typeof CourierVanStockScanRequestSchema>;

export const CourierVanStockMoveResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    variantId: z.string().uuid(),
    /**
     * İşaretli: `+` araca alındı, `−` depoya devredildi, `0` hiçbir hareket yazılmadı.
     * Sonuncusu tekrar eden isteğin cevabıdır; ekran "zaten yazılmıştı" diyebilsin.
     */
    delta: z.number().int(),
    /** Hareketten SONRA araçta kalan — ÖLÇÜLMÜŞ değerdir, hedefin kopyası değil. */
    vanQty: z.number().int(),
  }),
  /**
   * Taban tutmadı: istemcinin gördüğü adet ile aracın gerçeği ayrışmış ve hiçbir şey yazılmadı; `failed`ten farkı bu garantidir.
   * `vanQty` gerçeği taşır ki ekran satırı yerinde düzeltebilsin.
   */
  z.object({ status: z.literal('stale'), variantId: z.string().uuid(), vanQty: z.number().int() }),
  /** Depoda o kadar KULLANILABİLİR yok; sayı dönüyor ki ekran "şu kadar var" diyebilsin. */
  z.object({ status: z.literal('not_enough'), available: z.number().int() }),
  /**
   * Okutulan kod HİÇBİR varyanta bağlı değil. Sessiz bir "olmadı" burada
   * en kötü cevaptır: kurye kodu okuttuğunu sanır, mal araca hiç binmez ve akşam sayım tutmaz.
   */
  z.object({ status: z.literal('unknown_code') }),
  z.object({ status: z.literal('no_vehicle') }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('out_of_scope') }),
  /** Sevk yazıldı, kabul düştü — mal transferde asılı. Kimlik dönüyor ki depodan çözülebilsin. */
  z.object({ status: z.literal('stuck'), transferId: z.string().uuid() }),
  z.object({ status: z.literal('failed'), message: z.string() }),
]);
export type CourierVanStockMoveResponse = z.infer<typeof CourierVanStockMoveResponseSchema>;
