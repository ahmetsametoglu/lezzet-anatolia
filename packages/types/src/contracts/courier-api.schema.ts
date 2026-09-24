import { z } from 'zod';
import { DeliveryRunCloseSchema } from '../entities/delivery-run.schema';
import { FulfillmentAdjustmentSchema } from '../entities/order.schema';
import {
  ChannelEnum,
  DoorCheckEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
  PaymentStatusEnum,
  StopOrderMetricEnum,
  StopOrderPrecisionEnum,
  StopOrderSourceEnum,
} from '../primitives/enums.schema';

/**
 * Kurye sözleşme şemaları: mobil `/api/v1/courier/*` uçlarının ve kurye ekranlarının ortak dili; alanlar `@lezzet/application` kurye kapılarının döndürdüğü şeklin aynasıdır.
 * `courierId` hiçbir istek gövdesinde yoktur, çünkü kimlik jetondan gelir; olumsuz sonuçlar (`stale`, `proof_required`) hata değil cevabın kendisi olduğu için ayrımlı birleşimdir.
 */

/**
 * Durağın kuryeye görünen sonucu. Sistemin `status`'ü DEĞİL: "ulaşılamadı" ile "henüz sıra gelmedi"
 * ikisi de `ready`'dir, ayrım geçiş geçmişinden türer.
 */
export const StopOutcomeEnum = z.enum(['pending', 'delivered', 'unreachable', 'refused']);
export type StopOutcomeContract = z.infer<typeof StopOutcomeEnum>;

/**
 * Kapıdaki durak (K1). **Kurye para GÖRÜR ama yalnız bir tanesini:** tahsil edeceği tutarı —
 * maliyet, kâr, marj, müşterinin borcu bu şemada YOKTUR ve olmayacak (tasarım §6).
 */
export const CourierStopSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  customerName: z.string(),
  /**
   * Kapıda sorulacak kişi (adresin alıcısı); `null` = hesap sahibiyle aynı, çünkü hediye ya da iş adresinde kapıyı açan hesabın sahibi değildir.
   * `customerName`in yanında durur: ödemenin muhatabı hesabın sahibi, kapıyı açan alıcıdır.
   */
  recipient: z.string().nullable(),
  channel: ChannelEnum,
  /** Sipariş anındaki adres kopyası; adres kaydı sonradan düzelse de kuryenin gideceği yer budur. */
  address: z.string().nullable(),
  phone: z.string().nullable(),
  /** Numara yoksa `null` — düğme hiç çizilmez. */
  whatsAppLink: z.string().nullable(),
  /**
   * Kapı doğrulandı mı: `elsewhere` kuryeye tutarsızlığın bilindiğini ve kasıtlı olduğunu söyler, yoksa kapıda veri hatası sanıp ofisi arar.
   * `unknown` uyarı üretmez, çünkü ölçülemeyen şeyi kusur gibi göstermek (Almanya'da sağlayıcı yok) her durağa yanlış işaret koyardı.
   */
  doorCheck: DoorCheckEnum,
  payment: z.object({
    /** `null` = önceden ödenmiş; kapıda para konuşulmaz. **Cent**. */
    dueAmountCents: z.number().int().nullable(),
    expectedMethod: PaymentMethodEnum.nullable(),
    /**
     * Kapıda fiilen alınan para (cent); `null` = kurye bu durakta para almadı (önceden ödenmiş, vadeli ya da henüz tahsil edilmemiş).
     * Türetimi `delivery_run_collection` görünümüyle aynıdır ki kapanış ekranıyla gün listesi aynı sayıyı göstersin; online ve havale kuryenin eline girmez.
     */
    collectedAtDoorCents: z.number().int().nullable(),
  }),
  itemCount: z.number().int(),
  contentSummary: z.string(),
  /**
   * Kapıdaki kalem satırları; kısmi iade `adjustments[].orderItemId` ister ve istemci bu kimliği başka yoldan öğrenemez.
   * `itemCount` ve `contentSummary` gün listesi ile kapanış ekranı okuduğu için yanında durur.
   */
  items: z.array(
    z.object({
      orderItemId: z.string().uuid(),
      /** Kalemin kuryeye görünen adı — "Ürün (boy)", operasyon dilinde (Türkçe). */
      name: z.string(),
      /** SİPARİŞ EDİLEN adet. Kapıda eksik çıkan miktar bu sayıdan İNDİRİLEREK gönderilir. */
      qty: z.number().int(),
      /**
       * Fiilen teslim edilen adet: kapıda eksik çıkan kalem `qty`den indirilerek yazılır; teslim edilmemiş durakta 0'dır.
       * Kısmi teslim ayrı bir `outcome` değil bu alandan okunur, çünkü sipariş teslim edilmiştir ve enum `MarkUndeliveredRequest.outcome`un da dilidir.
       */
      fulfilledQty: z.number().int(),
      /**
       * Kalemin birim fiyatı ve indirim payı (cent): kapıda geri verilen malın tahsilattan ne kadar düşeceğini ekran teslimden önce hesaplayabilsin.
       * Maliyet ya da marj değildir; indirim payı tüm miktar için yazılıdır ve eksik karşılanan kalemde oransal düşer (`lineAmountCents`).
       */
      unitPriceCents: z.number().int(),
      lineDiscountAmountCents: z.number().int(),
    }),
  ),
  outcome: StopOutcomeEnum,
  /**
   * Depoda henüz hazırlanmadı: sipariş sefere damgalı ama toplanmamış; sonuç değil ön koşul eksikliği olduğu için `outcome`a değer açılmadı.
   * Bayrak olmadan yükleme ekranı "kutulu sipariş yok" der ve kurye kutuların başka araca yüklendiğini sanır.
   */
  awaitingPreparation: z.boolean().default(false),
  /**
   * Sipariş iptal edildi ama kutusu araçta: durak teslimat değil geri getirme işidir ve üstü çizilir; kutusu binmemiş iptal listede hiç görünmez.
   * Bayrak, çünkü `outcome` kuryenin kapıda ürettiği sonuçtur; iptal bekleyen sayılsaydı "sıradaki durak" ve tahsilat sayacı onu da sayardı.
   */
  cancelled: z.boolean().default(false),
  /**
   * Durağın sonuçlandığı an (ISO); `null` = henüz sonuçlanmadı.
   * Kaynak `order_status_log` geçiş damgasıdır, siparişin `created_at`i değil.
   */
  settledAt: z.string().nullable(),
  /**
   * Kuryenin sonuç için yazdığı sebep ("zil bozuk"); `null` = not yok.
   * Serbest metin kalır, çünkü sebebi standartlaştırmak sahada "yanlış ama düzgün" veri üretir.
   */
  outcomeNote: z.string().nullable(),
  /**
   * Kapıda görselli kanıt (imza ya da fotoğraf) alındı mı; kutu okutması sayılmaz, çünkü o kaydı sunucu kendisi kurar ve ihtilafta dayanılacak kanıt değildir.
   * Görselin kendisi taşınmaz: liste satırının sorusu "kanıt var mı".
   */
  hasProof: z.boolean(),
  /** Kaç kez yola çıkılıp dönüldü — ulaşılamayan durak listede kaybolmaz. */
  attempts: z.number().int(),
  /**
   * Siparişin kutuları: yükleme sayacı ve kapıda okutma eşleşmesi buradan okur; `code` müşteriye hiç gösterilmez.
   * Boş dizi veri hatasıdır (kutusuz sipariş operasyonda yok) ve ekran onu "bu durağın kutusu yok" diye söyler.
   */
  boxes: z.array(
    z.object({
      boxNo: z.number().int().positive(),
      code: z.string(),
      loadedAt: z.string().nullable(),
    }),
  ),
  /**
   * Rota sırası, 1'den başlar; `null` = sıra bilinmiyor.
   * Sıralamayı sunucu yapar, çünkü iki yüzey kendi sıralasaydı aynı gün için iki rota gösterirdi.
   */
  stopSeq: z.number().int().positive().nullable(),
  /** Durağın seferi: araçta birden çok seferin durağı durabilir ve liste sefere göre gruplanır. */
  runId: z.string().uuid(),
  /** Grubun okunur başlığı — rota adı ("Kuzey rotası"). `null` = bölge kaydı okunamadı. */
  runLabel: z.string().nullable(),
});
export type CourierStopContract = z.infer<typeof CourierStopSchema>;

/**
 * Seferin istemciye görünen künyesi; açık sefer sunucudan gelir, uygulama yeniden başlasa da kaybolmaz.
 * `closed` kapanış kaydının, `returnedAt` aracın dönüşünün cevabıdır; ikisi ayrı sorulardır.
 */
export const CourierRunBriefSchema = z.object({
  runId: z.string().uuid(),
  referenceNo: z.string(),
  zoneId: z.string().uuid(),
  /** Rota adı — ekran "Kuzey rotası · SF-26-…" diye sefer kimliğini kurar. */
  zoneName: z.string().nullable(),
  vehicleId: z.string().uuid().nullable(),
  /**
   * Aracın okunur adı (etiketi, yoksa plakası); `null` = araçsız sefer.
   * Kimliğin yanında ad durur, çünkü kurye rampada uuid'den aracı tanıyamaz.
   */
  vehicleLabel: z.string().nullable(),
  /** Seferin günü (`YYYY-MM-DD`): araç birden çok günün seferini taşıyabildiği için kurye hangisinin bugünün olduğunu buradan görür. */
  deliveryDate: z.string(),
  departedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  closed: z.boolean(),
});
export type CourierRunBrief = z.infer<typeof CourierRunBriefSchema>;

/**
 * Sıranın künyesi: nasıl hesaplandığı sonucun yanında durur, çünkü kuş uçuşu ya da posta kodu merkezinden dizilen sıra sokak düzeyinde değildir ve kurye onu kesin sanmamalı.
 * Durak başına değil sefer başınadır; `null` = sıra hiç hesaplanmadı.
 */
export const StopOrderInfoSchema = z.object({
  source: StopOrderSourceEnum,
  metric: StopOrderMetricEnum,
  precision: StopOrderPrecisionEnum,
  generatedAt: z.string(),
  /** Numarası olan durak sayısı. */
  sequenced: z.number().int(),
  /** Sırasız kalan durak sayısı — koordinatı çözülemeyenler. Sıfır değilse ekran onu söylemeli. */
  unsequenced: z.number().int(),
});
export type StopOrderInfo = z.infer<typeof StopOrderInfoSchema>;

/**
 * Seferin künyesi ve çıkış deposunun adı; `null` = ad okunamadı, çünkü uydurma bir depo adı kuryeyi yanlış rampaya gönderirdi.
 * Gün ve sefer başlatma cevapları aynı şekli kullanır ki sefer başlar başlamaz depo adı boş kalmasın.
 */
export const CourierRunDetailSchema = CourierRunBriefSchema.extend({
  warehouseName: z.string().nullable(),
  stopOrder: StopOrderInfoSchema.nullable(),
});
export type CourierRunDetail = z.infer<typeof CourierRunDetailSchema>;

/**
 * `GET /courier/routes` yanıtı: o gün koşan aktif rotalar ve varsa açık seferin künyesi; kurye rotayı buradan seçer.
 * Rota başka kuryedeyse `run.courierId` onu söyler.
 */
export const CourierRouteSchema = z.object({
  /** Rotanın günü (`YYYY-MM-DD`): çok günlük yolculukta yarının seferleri de bugünden yüklenir. */
  day: z.string(),
  zoneId: z.string().uuid(),
  zoneName: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().nullable(),
  /** O güne yazılmış rota siparişi sayısı — kurye seçerken yükü görsün. */
  stopCount: z.number().int(),
  /**
   * Kaç kutu: durak sayısı yükü söylemez, kurye aracı doldurmadan önce hacmi bilmeli.
   * Mühürlenmemiş kutu da sayılır, çünkü soru "rampada beni ne bekliyor".
   */
  boxCount: z.number().int(),
  /**
   * Geri getirilecek kutu: iptal edilmiş siparişin araca binmiş kutuları; `boxCount`a karışsaydı kurye onu teslim edilecek kutu sanardı.
   * Binmemiş kutu burada da yoktur, çünkü rampada kalan kutu deponun işidir.
   */
  returningBoxCount: z.number().int().default(0),
  /**
   * Kapıda tahsilat olan durak sayısı: kurye rotayı seçerken günün nakit yükünü görür.
   * Ödenmiş sipariş sayılmaz (`amountDueCents` kuralı).
   */
  collectionCount: z.number().int(),
  run: CourierRunBriefSchema.extend({
    courierId: z.string().uuid(),
    /** Seferi süren kuryenin adı — "bu rota bugün Musa'da" cümlesinin kaynağı. */
    courierName: z.string().nullable(),
  }).nullable(),
});
export type CourierRoute = z.infer<typeof CourierRouteSchema>;

export const CourierRoutesResponseSchema = z.object({
  date: z.string(),
  routes: z.array(CourierRouteSchema),
});
export type CourierRoutesResponse = z.infer<typeof CourierRoutesResponseSchema>;

/** `GET /courier/day` yanıtı. Gün ZORUNLU döner: istemci "hangi günü gösteriyorum" sorusunu sormaz. */
export const CourierDayResponseSchema = z.object({
  date: z.string(),
  /**
   * Sürülen sefer: yola çıkmış ve kapanmamış olan; `null` = sürülen sefer yok.
   * Gün ekranının özet kartı yalnız bu seferi sayar.
   */
  run: CourierRunDetailSchema.nullable(),
  /**
   * Araçtaki seferler: kurulmuş ve kapanmamış olanların hepsi, gün sırasıyla; kurulmuş sefer `departedAt: null` taşır.
   * Küme güne değil araca bakar, çünkü çok günlük yolculukta yarının kutuları da bugünden yüklenir; `run` bu listenin içindedir.
   */
  runs: z.array(CourierRunDetailSchema),
  stops: z.array(CourierStopSchema),
  /**
   * Kapıda tahsil edilen paranın gireceği hesap (`door_cash_account_id` ayarı); ayar tekil olduğu için gün başınadır.
   * `null` = ayar boş, tahsilat kapısı kapalıdır ve ekran sebebini söyler; uydurma bir kimlik parayı olmayan bir hesaba yazardı.
   */
  doorAccountId: z.string().uuid().nullable(),
  /**
   * Askıda kalan duraklar: kuryenin geçmiş seferlerinden sonuçlanmamış siparişler; kutusu araçta kalmış olabilir.
   * Kurye buradan bir şey yapmaz (yeni günü sevkiyat masası seçer); alan "araçtaki kutu neden duraksız" sorusunu cevaplar.
   */
  stranded: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        referenceNo: z.string().nullable(),
        customerName: z.string(),
        /** Söz verilen (geçmiş) teslim günü — "3 Eylül'ün durağı". */
        deliveryDate: z.string(),
        /** Kutusu araçta mı — kurye rampada hangi kutuyu taşımaya devam ettiğini bilsin. */
        boxOnVan: z.boolean(),
      }),
    )
    .default([]),
});
export type CourierDayResponse = z.infer<typeof CourierDayResponseSchema>;

/**
 * "Seferi başlat" isteği; gün verilmezse bugündür ve cevabın `date`i hangi günün başladığını söyler.
 * `zoneId` verilmezse o gün tek rota varsa o seçilir, birden çoksa `route_required` döner; `vehicleId` araç kaydı olmayan kurulumda kurye kilitlenmesin diye opsiyoneldir.
 */
export const StartCourierDayRequestSchema = z.object({
  date: z.string().optional(),
  zoneId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  /**
   * `false` = sefer kurulur (siparişler damgalanır, kutular okutulabilir) ama yola çıkmaz: durak açılmaz, müşteriye haber gitmez.
   * Varsayılan `true`.
   */
  depart: z.boolean().optional(),
});
export type StartCourierDayRequest = z.infer<typeof StartCourierDayRequestSchema>;

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
  /** Boy etiketi ("450 g") — addan AYRI, çünkü ekran ikisini farklı ağırlıkta yazıyor (v3:19). */
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
  /** Bu varyanttan ARAÇTA kaç tane var — kart "araçta 3" diyebilsin diye (v3:19 `h.rozet`). */
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
   * Okutulan kod HİÇBİR varyanta bağlı değil (v3:19'un okutma dalı). Sessiz bir "olmadı" burada
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


/**
 * Kutulu sipariş: bütün kutuları binene kadar "yolda" yazılmaz.
 * `skipped`ten ayrı liste, çünkü çare farklı: bunlar okutulmayı bekliyor.
 */
export const AwaitingBoxesStopSchema = z.object({
  orderId: z.string().uuid(),
  loadedBoxes: z.number().int(),
  boxCount: z.number().int(),
});
export type AwaitingBoxesStop = z.infer<typeof AwaitingBoxesStopSchema>;

/** Yola çıkarılamayan durak — kimliği ve O ANDAKİ durumu. Durum, sebebin kendisidir. */
export const CourierDayStopStateSchema = z.object({
  orderId: z.string().uuid(),
  currentStatus: OrderStatusEnum,
});
export type CourierDayStopState = z.infer<typeof CourierDayStopStateSchema>;

/**
 * "Yola çıktım" yanıtı: toplu yazımın en tehlikeli hâli "kısmen oldu" olduğu için cevap tek bir `ok` değil dört listedir.
 * Hangi siparişin geçmediği ve nedeni ekranda görünür; tek bir sayı kuryeyi eksik kalanı gözle aramaya bırakırdı.
 */
export const StartCourierDayResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    date: z.string(),
    /**
     * Açılan seferin künyesi; şekli gün yanıtıyla aynıdır (`CourierRunDetail`), çünkü ekran bu değeri doğrudan günün seferi olarak yazar.
     */
    run: CourierRunDetailSchema,
    /** Bu çağrıda `ready → out_for_delivery` yazılan siparişler. */
    started: z.array(z.string().uuid()),
    /** Zaten yoldaydı — bir HATA değil, "yapılacak yeni bir şey yok" cevabıdır. */
    alreadyOut: z.array(z.string().uuid()),
    /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. Ekran bunu GÖSTERİR, yutmaz. */
    stale: z.array(CourierDayStopStateSchema),
    /** Yola çıkarılmadı — durumu uygun değil (henüz hazırlanmadı ya da gün içinde kapandı). */
    skipped: z.array(CourierDayStopStateSchema),
    /** Kutuları binmemiş duraklar — künyesi `AwaitingBoxesStopSchema`da. */
    awaitingBoxes: z.array(AwaitingBoxesStopSchema),
  }),
  /**
   * Rota ve gün başına tek sefer: bu rota bugün zaten açılmış.
   * `mine` = başlatan bu kurye; başkasıysa ekran "bu rota bugün X'te" der.
   */
  z.object({
    status: z.literal('already_started'),
    runId: z.string().uuid(),
    referenceNo: z.string(),
    courierId: z.string().uuid(),
    mine: z.boolean(),
  }),
  /** `zoneId` verilmedi ve o gün birden çok rota koşuyor — ekran `/courier/routes`tan seçtirir. */
  z.object({ status: z.literal('route_required') }),
  /**
   * Başka sefer sürülüyor: araç birden çok seferi taşır ama kurye birini sürer; iki sefer aynı anda yoldayken durak sırası ve kapanış kasası belirsizleşir.
   * Sefer kurulu kalır, yalnız yola çıkmaz; künye sürülen seferi söyler.
   */
  z.object({ status: z.literal('another_running'), runId: z.string().uuid(), referenceNo: z.string() }),
  /**
   * Araç başka kuryede: araç aynı anda tek kuryenin yükünü taşır, yoksa iki kurye aynı araç stoğundan satardı.
   * Künye nullable: yarış dalında çakışan seferin künyesi okunamayabilir, ret yine geçerlidir.
   */
  z.object({
    status: z.literal('vehicle_taken'),
    runId: z.string().uuid().nullable(),
    referenceNo: z.string().nullable(),
  }),
  /**
   * Kuryenin açık seferi başka araçta: karışırsa "araçtaki seferler" iki aracın yükünü tek liste gibi gösterir ve yükleme sayacı ikisini toplar.
   */
  z.object({
    status: z.literal('vehicle_mismatch'),
    runId: z.string().uuid().nullable(),
    referenceNo: z.string().nullable(),
    vehicleId: z.string().uuid().nullable(),
  }),
  /** O gün koşan rota yok (ya da verilen `zoneId` bugün koşmuyor/yok). */
  z.object({ status: z.literal('no_route') }),
]);
export type StartCourierDayResponse = z.infer<typeof StartCourierDayResponseSchema>;

/** Seferi yola çıkar: araçta birden çok sefer durur ve kurye istediğini başlatır; hangisi olduğu URL'dedir. */
export const DepartCourierRunResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    date: z.string(),
    run: CourierRunDetailSchema,
    started: z.array(z.string().uuid()),
    alreadyOut: z.array(z.string().uuid()),
    stale: z.array(CourierDayStopStateSchema),
    skipped: z.array(CourierDayStopStateSchema),
    awaitingBoxes: z.array(AwaitingBoxesStopSchema),
  }),
  /** Başka sefer sürülüyor — künyesiyle (aynı ada üstteki `StartCourierDayResponse` künyesi). */
  z.object({ status: z.literal('another_running'), runId: z.string().uuid(), referenceNo: z.string() }),
  /** Sefer yok ya da senin değil — ikisi AYNI cevap: sefer kimlikleri haritalanamaz. */
  z.object({ status: z.literal('not_found') }),
]);
export type DepartCourierRunResponse = z.infer<typeof DepartCourierRunResponseSchema>;

/**
 * Seferi araçtan çıkar: kurulmuş ama başlamamış seferin geri alınması; yoksa yanlış rotayı alan kuryenin tek çıkışı başlatıp kapatmak, yani müşteriye bildirim göndermek olurdu.
 * Sayılar döner, çünkü ekran kaç siparişin serbest kaldığını ve kaç kutunun rampaya indiğini söylemeli.
 */
export const DiscardCourierRunResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    releasedOrders: z.number().int(),
    unloadedBoxes: z.number().int(),
  }),
  /** Sefer yola çıkmış — geri alınacak niyet kalmadı; dürüst çıkış kapanıştır. */
  z.object({ status: z.literal('already_departed') }),
  z.object({ status: z.literal('not_found') }),
]);
export type DiscardCourierRunResponse = z.infer<typeof DiscardCourierRunResponseSchema>;

/** Araca yükleme okutması; kod gövdede gider, çünkü URL'deki kod erişim günlüklerinde dolaşırdı. */
export const LoadBoxRequestSchema = z.object({ code: z.string().min(1) });
export type LoadBoxRequest = z.infer<typeof LoadBoxRequestSchema>;

/**
 * Yüklemenin cevabı: rotaya ait olmayan kutu `wrong_route` ile görünür reddedilir; `allBoxesLoaded` = siparişin son kutusu da bindi.
 * Yükleme siparişi yola çıkarmaz, çünkü araç bir ara depodur; siparişi yola çıkaran ve müşteriye haber gönderen tek kapı sefer başlatmadır.
 */
export const LoadBoxResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    orderId: z.string().uuid(),
    referenceNo: z.string().nullable(),
    boxNo: z.number().int().positive(),
    /** Siparişin sayacı: kaç kutusu bindi / toplam. Sefer sayacını ekran duraklardan toplar. */
    loadedBoxes: z.number().int(),
    boxCount: z.number().int(),
    allBoxesLoaded: z.boolean(),
    /**
     * Bu okutma durağı da açtı: sefer yoldayken siparişin son kutusu okutulursa sipariş `out_for_delivery` olur ve müşteriye haber o an gider.
     */
    stopOpened: z.boolean(),
  }),
  /** Aynı kutu ikinci kez okutuldu — hata değil, "zaten araçta" cevabı; sayaç değişmedi. */
  z.object({
    status: z.literal('already_loaded'),
    orderId: z.string().uuid(),
    boxNo: z.number().int().positive(),
    loadedBoxes: z.number().int(),
    boxCount: z.number().int(),
  }),
  /**
   * Kutu bu kuryenin seferine ait değil, yüklenmez; ret kutunun nereye ait olduğunu da söyler ki kurye onu doğru yığına koysun.
   * Rota adı önce gelir, çünkü kurye rota adını bilir, sefer numarasını değil; ikisi de `null` olabilir.
   */
  z.object({
    status: z.literal('wrong_route'),
    referenceNo: z.string().nullable(),
    routeName: z.string().nullable(),
    runReferenceNo: z.string().nullable(),
  }),
  /** Açık (mühürlenmemiş) kutu araca binemez — içeriği kesinleşmedi (0048 kısıtı). */
  z.object({ status: z.literal('not_sealed'), boxNo: z.number().int().positive() }),
  /** Sipariş yüklenebilir durumda değil (iptal/teslim edilmiş) — durumuyla söylenir. */
  z.object({ status: z.literal('not_loadable'), currentStatus: OrderStatusEnum }),
  /** Kod hiçbir kutuya ait değil — yanlış etiket ya da bizim olmayan bir QR. */
  z.object({ status: z.literal('unknown_code') }),
]);
export type LoadBoxResponse = z.infer<typeof LoadBoxResponseSchema>;

/**
 * **Ulaşılamadı / reddedildi** isteği (K5). İki ayrı işaret, iki ayrı akıbet — tek düğmeye
 * sıkıştırılmaz: `unreachable` malı araçta bırakır (`ready`), `refused` depoya döndürür (`returned`).
 */
export const MarkUndeliveredRequestSchema = z.object({
  outcome: z.enum(['unreachable', 'refused']),
  /** Kısa ve SERBEST ("zil bozuk"): sebebi standartlaştırmak sahada yanlış-ama-düzgün veri üretir. */
  note: z.string().nullish(),
});
export type MarkUndeliveredRequest = z.infer<typeof MarkUndeliveredRequestSchema>;

export const MarkUndeliveredResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), outcome: z.enum(['unreachable', 'refused']), currentStatus: OrderStatusEnum }),
  z.object({
    status: z.literal('forbidden'),
    reason: z.enum(['not_assigned', 'same_status', 'terminal', 'not_allowed']),
  }),
  /** Araya biri girdi: sipariş artık o durumda değil. Ekran bunu GÖSTERİR, yutmaz. */
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('not_found') }),
]);
export type MarkUndeliveredResponse = z.infer<typeof MarkUndeliveredResponseSchema>;

/**
 * Teslim kanıtı girdisi: imza ve fotoğraf görsel olarak saklanır.
 * `box_scan` istemciden gelmez, o kaydı sunucu okutulan kodlardan kurar; girdi bu yüzden kayıt şemasından dardır.
 */
export const DeliveryProofInputSchema = z.object({
  kind: z.enum(['signature', 'photo']),
  imageKey: z.string().min(1),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullish(),
});
export type DeliveryProofInputContract = z.infer<typeof DeliveryProofInputSchema>;

/**
 * Kapıda tahsilat (K4). Yöntem üçle sınırlı: online ve havale kuryenin eline hiç girmez.
 */
export const DoorCollectionInputSchema = z.object({
  method: z.enum(['cash', 'card', 'cheque']),
  /** **Cent**. */
  amountCents: z.number().int().positive(),
  /** Paranın gireceği hesap (kurye kasası / kapı tahsilatı). */
  accountId: z.string().uuid(),
  /**
   * **Kuyruk yeniden-denemesi parayı iki kez yazmasın.** Anahtar İSTEMCİDE üretilir ve isteğin
   * kimliğidir (durağın değil): çevrimdışı kuyruk aynı isteği tekrar gönderdiğinde aynı anahtarla
   * gelir. Sunucu tarafındaki sınırı `application/src/order/payment.ts` künyesinde yazılı.
   */
  idempotencyKey: z.string().min(1).nullish(),
});
export type DoorCollectionInputContract = z.infer<typeof DoorCollectionInputSchema>;

/**
 * Kapıda teslim isteği: sıra sunucuda sabittir (kanıt → mal → teslim → para), istemci tek istek gönderir ki yarısı yazılmış teslimat kalmasın.
 */
export const ConfirmDoorDeliveryRequestSchema = z.object({
  /**
   * `fulfilledQty` hedef değerdir (kalan adet), fark değil.
   * Akıbet (`returnDisposition`) kuryede yoktur, çünkü malın satılabilir olup olmadığını depoda bakan kişi beyan eder; `note` kalır.
   */
  adjustments: z.array(FulfillmentAdjustmentSchema.omit({ returnDisposition: true })).optional(),
  proof: DeliveryProofInputSchema.nullish(),
  collection: DoorCollectionInputSchema.nullish(),
  /**
   * Kapıda okutulan kutu kodları: kutulu siparişte teslimin ön koşuludur, eksik kutuda `boxes_missing` döner ve hiçbir yazım yapılmaz.
   */
  scannedBoxCodes: z.array(z.string()).optional(),
});
export type ConfirmDoorDeliveryRequest = z.infer<typeof ConfirmDoorDeliveryRequestSchema>;

export const ConfirmDoorDeliveryResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Fiilen yazılan tahsilat (**cent**); tahsilat yoksa 0. */
    collectedCents: z.number().int(),
    /** Teslim sonrası kalan borç (**cent**). */
    amountDueCents: z.number().int(),
    paymentStatus: PaymentStatusEnum,
    /** Nakit yasal sınırı aşıldı mı. **Engel DEĞİL, bilgi** — karar sahadadır (DOMAIN §7). */
    cashLimitExceeded: z.boolean(),
    adjustedLines: z.number().int(),
    /** Tahsilat bu istekte yazılmadı; aynı anahtarla zaten yazılmıştı (K4). */
    collectionDeduped: z.literal(true).optional(),
  }),
  /** Kanıt zorunlu ama gelmedi — HİÇBİR yazım yapılmadı, sipariş hâlâ yolda. */
  z.object({ status: z.literal('proof_required'), channel: ChannelEnum }),
  /**
   * Kutulu siparişte okutulmamış kutu var — teslim YAZILMADI (etüt 2.5: tüm kutular okutulmadan
   * tamamlanmaz). Kalan kutuların numarası döner: ekran "Kutu 2 ve 3 okutulmadı" der.
   */
  z.object({ status: z.literal('boxes_missing'), remainingBoxNos: z.array(z.number().int()) }),
  z.object({ status: z.literal('forbidden'), reason: z.literal('not_assigned') }),
  z.object({ status: z.literal('stale'), currentStatus: OrderStatusEnum }),
  z.object({ status: z.literal('not_found') }),
]);
export type ConfirmDoorDeliveryResponse = z.infer<typeof ConfirmDoorDeliveryResponseSchema>;

/**
 * Kanıt yükleme izni isteği: dosya sunucudan geçmez, cihaz doğrudan kovaya yükler.
 * Sunucu yetkiyi doğrular, anahtarı seçer ve kısa ömürlü izin yazar.
 */
export const DeliveryProofUploadRequestSchema = z.object({
  filename: z.string().min(1),
  /** Bu teslimat için daha önce kaç kanıt istendiği — tavan kontrolü (imza + birkaç fotoğraf). */
  alreadyRequested: z.number().int().nonnegative().optional(),
});
export type DeliveryProofUploadRequest = z.infer<typeof DeliveryProofUploadRequestSchema>;

export const DeliveryProofUploadResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), key: z.string(), uploadUrl: z.string() }),
  z.object({
    ok: z.literal(false),
    /**
     * `not_found` "yok" ile "senin değil"in ORTAK cevabıdır (bilerek): ayrı cevap verilseydi kimlik
     * deneyerek hangi siparişlerin var olduğu haritalanabilirdi.
     * `storage_unavailable` kova yapılandırılmamış — "yüklendi" demekle karıştırılmaz.
     */
    reason: z.enum(['unsupported_type', 'too_many', 'not_found', 'storage_unavailable']),
  }),
]);
export type DeliveryProofUploadResponse = z.infer<typeof DeliveryProofUploadResponseSchema>;

/**
 * Sefer kapanışı taslağı: seferin resmi ve beklenen tahsilat.
 * `run` null = sürülmüş sefer yok; ekran bunu hata değil bilgi olarak gösterir.
 */
export const DayCloseDraftSchema = z.object({
  date: z.string(),
  /** Kapanışın öznesi — hangi sefer sayılıyor. */
  run: CourierRunBriefSchema.nullable(),
  /** Zaten kapatılmışsa kayıt döner ve ekran SALT-OKUNUR gösterir. */
  closed: DeliveryRunCloseSchema.nullable(),
  delivered: z.array(CourierStopSchema),
  /** Ulaşılamayanlar — yarının işine devrolur, kapanışta kaybolmaz. */
  pending: z.array(CourierStopSchema),
  /** Reddedilenler — getirilen mal; depoya fiziksel teslim edilir. */
  returned: z.array(CourierStopSchema),
  expected: z.object({
    cashCents: z.number().int(),
    cardCents: z.number().int(),
    chequeCents: z.number().int(),
  }),
});
export type DayCloseDraftContract = z.infer<typeof DayCloseDraftSchema>;

/**
 * Seferi kapat isteği; sayılan tutarlar cent'tir ve not fark çıktığında anlamlıdır ama zorunlu değildir.
 * `runId` zorunludur, çünkü kapanışın öznesi gün değil seferdir.
 */
export const CloseDeliveryRunRequestSchema = z.object({
  runId: z.string().uuid(),
  countedCashCents: z.number().int().nonnegative().optional(),
  countedCardCents: z.number().int().nonnegative().optional(),
  countedChequeCents: z.number().int().nonnegative().optional(),
  note: z.string().nullish(),
});
export type CloseDeliveryRunRequest = z.infer<typeof CloseDeliveryRunRequestSchema>;
