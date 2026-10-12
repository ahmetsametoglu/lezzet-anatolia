import { z } from 'zod';
import { DeliveryRunCloseSchema } from '../entities/delivery-run.schema';
import {
  ChannelEnum,
  DoorCheckEnum,
  OrderStatusEnum,
  PaymentMethodEnum,
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
 * Kapıdaki durak. **Kurye para GÖRÜR ama yalnız bir tanesini:** tahsil edeceği tutarı —
 * maliyet, kâr, marj, müşterinin borcu bu şemada YOKTUR ve olmayacak.
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
    /** Kalem fiyatları KDV dahil mi; değilse geri verilen malın düşülecek tutarı KDV'siyle hesaplanır. */
    pricesIncludeVat: z.boolean(),
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
      vatRate: z.number(),
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

/** Kapıda elden alınan iki yöntem; online ve havale kuryenin eline hiç girmez. */
export const DoorMethodEnum = PaymentMethodEnum.extract(['cash', 'card']);
export type DoorMethod = z.infer<typeof DoorMethodEnum>;

/** Kapıda hangi yöntemle tahsilat yazılabilir: hesabı ayarlı olmayan yöntemde ekran tahsilat kapısını kapatır. */
export const DoorCollectionMethodsSchema: z.ZodType<Record<DoorMethod, boolean>> = z.object({ cash: z.boolean(), card: z.boolean() });
export type DoorCollectionMethods = z.infer<typeof DoorCollectionMethodsSchema>;

/** Yöntemin hesabı ayarlı değil; hesap yazımdan önce çözüldüğü için hiçbir kayıt yazılmadı. */
export const DoorCollectionUnavailableSchema = z.object({ status: z.literal('collection_unavailable'), method: DoorMethodEnum });

/**
 * Kapıda tahsilat. Paranın hesabını istemci göndermez, sunucu yöntemin ayarından çözer: nakit çekmeceye, kart kart hesabına yazılır.
 */
export const DoorCollectionInputSchema = z.object({
  method: DoorMethodEnum,
  /** **Cent**. */
  amountCents: z.number().int().positive(),
  /** İsteğin kimliği, durağın değil: anahtar istemcide üretilir ki yeniden deneme parayı iki kez yazmasın (sınırı `order/payment.ts`te). */
  idempotencyKey: z.string().min(1).nullish(),
});
export type DoorCollectionInputContract = z.infer<typeof DoorCollectionInputSchema>;

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
  /** Kapıda hangi yöntemle tahsilat yazılabilir; kapı hesapları küresel ayar olduğu için gün başınadır. */
  doorCollection: DoorCollectionMethodsSchema,
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
  note: z.string().nullish(),
});
export type CloseDeliveryRunRequest = z.infer<typeof CloseDeliveryRunRequestSchema>;
