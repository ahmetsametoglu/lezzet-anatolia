import { z } from 'zod';
import { DeliveryRunCloseSchema } from '../entities/delivery-run.schema';
import { FulfillmentAdjustmentSchema } from '../entities/order.schema';
import { ChannelEnum, OrderStatusEnum, PaymentMethodEnum, PaymentStatusEnum } from '../primitives/enums.schema';

/**
 * Kurye SÖZLEŞME şemaları (21.10) — mobil `/api/v1/courier/*` uçlarının ve onları tüketen "Yol"
 * bölümünün (K1 · K3–K5 · K7) ORTAK dili.
 *
 * Gerekçe `catalog-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema uçta
 * yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz.
 *
 * ── ALANLAR `@lezzet/application`IN KURYE KAPILARININ AYNASIDIR ───────────────
 * Kaynak `packages/application/src/courier/{day,delivery,day-close,proof}.ts`. Uç, orkestrasyonun
 * döndürdüğü şekli **indirgemez, yeniden adlandırmaz, alan eklemez**. Buradaki her alanın bugün
 * gerçekten taşınan bir davranışı vardır; ileride gerekebilecek hiçbir alan şimdiden açılmadı.
 *
 * ── `courierId` HİÇBİR İSTEK GÖVDESİNDE YOK, VE BU BİR KARAR ─────────────────
 * Orkestrasyonların hepsi `courierId`yi ZORUNLU parametre alır ("yalnız kendi teslimatları" imzada
 * durur) ama o kimlik **jetondan** gelir, gövdeden değil. Gövdeye konsaydı kurye başkasının
 * kimliğini yazıp onun durağını kapatabilirdi — yetkilendirme, doğrulanmamış bir girdiye dayanamaz.
 *
 * ── OLUMSUZ SONUÇLAR DA SÖZLEŞMENİN İÇİNDE ──────────────────────────────────
 * `stale` / `proof_required` / `forbidden` birer HATA DEĞİL, cevabın kendisidir ve ekranın
 * göstermesi gerekir (doc 04: *"bayat geçiş reddi GÖRÜNÜR olmalı — app bu reddi YUTMAZ"*). Bu
 * yüzden yanıtlar ayrımlı birleşim (`discriminatedUnion`) olarak duruyor: `currentStatus` gibi
 * taşıdıkları bilgi bir HTTP koduna indirgenirse kaybolur.
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
   * **Kapıda sorulacak kişi** — adresin alıcısı; `null` = hesap sahibiyle aynı.
   *
   * `address.recipient` bir süre YAZILIYOR ama hiç OKUNMUYORDU (ölçüldü 21.08): şema künyesi
   * *"kurye kapıda kimi soracağını buradan bilir"* diyor, oysa durak yalnız hesabın adını
   * taşıyordu. Hediye adresinde, iş adresinde ve aile büyüğünün adresinde kapıyı açan kişi
   * hesabın sahibi değildir — kurye yanlış adı sorar.
   *
   * `customerName`i EZMEZ, yanında durur: ödemenin muhatabı hesabın sahibidir, kapıyı açan
   * alıcıdır. Tek alana sıkıştırmak, kuryenin kime "borcunuz var" diyeceğini belirsizleştirirdi.
   */
  recipient: z.string().nullable(),
  channel: ChannelEnum,
  /** Sipariş anındaki adres kopyası; adres kaydı sonradan düzelse de kuryenin gideceği yer budur. */
  address: z.string().nullable(),
  phone: z.string().nullable(),
  /** Numara yoksa `null` — düğme hiç çizilmez. */
  whatsAppLink: z.string().nullable(),
  payment: z.object({
    /** `null` = önceden ödenmiş; kapıda para konuşulmaz. **Cent**. */
    dueAmountCents: z.number().int().nullable(),
    expectedMethod: PaymentMethodEnum.nullable(),
  }),
  itemCount: z.number().int(),
  contentSummary: z.string(),
  /**
   * Kapıdaki KALEM SATIRLARI (21.10d). `orderItemId` olmadan kısmi iade GÖNDERİLEMEZ:
   * `ConfirmDoorDeliveryRequest.adjustments[].orderItemId` tam olarak bu kimliği ister ve istemcinin
   * onu öğrenebileceği başka bir yol yoktu — ekran içerik ÖZETİNİ ayrıştırıp satır uyduruyordu
   * (`courier-format.parseContentSummary`), yani işaretleyebiliyor ama gönderemiyordu.
   *
   * `itemCount` ve `contentSummary` yerinde KALIYOR ve bu bilinçli: gün listesi satırı ve kapanış
   * ekranı özet metni okuyor, ikisini bu turda sökmek sözleşmeyi kırardı. Bağlanma tamamlandığında
   * ikisi de bu diziden türetilebilir — ekran şeridinin ayıklama işi (rapor 21.10d).
   */
  items: z.array(
    z.object({
      orderItemId: z.string().uuid(),
      /** Kalemin kuryeye görünen adı — "Ürün (boy)", operasyon dilinde (Türkçe). */
      name: z.string(),
      /** SİPARİŞ EDİLEN adet. Kapıda eksik çıkan miktar bu sayıdan İNDİRİLEREK gönderilir. */
      qty: z.number().int(),
    }),
  ),
  outcome: StopOutcomeEnum,
  /** Kaç kez yola çıkılıp dönüldü — ulaşılamayan durak listede kaybolmaz. */
  attempts: z.number().int(),
  /**
   * Siparişin KUTULARI (23.8) — boş dizi = kutusuz akış (eski yol). İki tüketicisi var: yükleme
   * sayacı ("5/8 kutu bindi" `loadedAt` damgalarından türer — ayrı tablo yok, karar §1.11) ve
   * kapıda okutma eşleşmesi (ekran okutulan kodu bu listeyle yerelde eşler; son doğrulama yine
   * sunucuda — `scannedBoxCodes`). `code` kurye kanalında taşınır ve müşteriye HİÇ gösterilmez.
   */
  boxes: z.array(
    z.object({
      boxNo: z.number().int().positive(),
      code: z.string(),
      loadedAt: z.string().nullable(),
    }),
  ),
});
export type CourierStopContract = z.infer<typeof CourierStopSchema>;

/**
 * Seferin istemciye görünen künyesi (18.08 · `docs/feature/sefer.md`). Gün ekranının "başladı"
 * bayrağı artık YEREL bir tahmin değil bu kaydın kendisidir: uygulama yeniden başlasa da açık
 * sefer sunucudan gelir. `closed` = kapanış kaydı var (mutabakat yapıldı), `returnedAt` = araç
 * döndü — ikisi ayrı sorular.
 */
export const CourierRunBriefSchema = z.object({
  runId: z.string().uuid(),
  referenceNo: z.string(),
  zoneId: z.string().uuid(),
  /** Rota adı — ekran "Kuzey rotası · SF-26-…" diye sefer kimliğini kurar. */
  zoneName: z.string().nullable(),
  vehicleId: z.string().uuid().nullable(),
  departedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  closed: z.boolean(),
});
export type CourierRunBrief = z.infer<typeof CourierRunBriefSchema>;

/**
 * `GET /courier/routes` yanıtı (K1 rota seçimi · 18.08). O gün koşan aktif rotalar + varsa açık
 * seferin künyesi. Kurye rotayı BURADAN seçer ("arayüzden atama saçma — kurye rotayı alır ve
 * sürer"); rota bugün başka kuryedeyse `run.courierId` onu söyler, ekran "bu rota bugün X'te" der.
 */
export const CourierRouteSchema = z.object({
  zoneId: z.string().uuid(),
  zoneName: z.string(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string().nullable(),
  /** O güne yazılmış rota siparişi sayısı — kurye seçerken yükü görsün. */
  stopCount: z.number().int(),
  run: CourierRunBriefSchema.extend({
    courierId: z.string().uuid(),
    /** Seferi süren kuryenin adı — "bu rota bugün Musa'da" cümlesinin kaynağı. */
    courierName: z.string().nullable(),
    /** Aracın okunur adı ya da plakası — künye tamamlansın diye; `null` = araçsız sefer. */
    vehicleLabel: z.string().nullable(),
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
   * Kuryenin o günkü SEFERİ — `null` = henüz rota almadı (18.08). Eski `started` yerel bayrağının
   * halefi: kilit artık kendini onaran bir tahmin değil, sunucudaki kaydın kendisi.
   */
  run: CourierRunBriefSchema.nullable(),
  stops: z.array(CourierStopSchema),
  /**
   * **Kapıda tahsil edilen paranın gireceği hesap** (`door_cash_account_id` ayarı) — 21.10d.
   *
   * DURAK BAŞINA DEĞİL GÜN BAŞINA, çünkü ayarın kendisi tekil: operasyon web ekranı da aynı anahtarı
   * sipariş bağlamı olmadan okuyor (`deliveries/[orderId]/delivery-read.ts`) — durak başına
   * tekrarlansaydı aynı değer N kez taşınır ve "bu durakta başka hesap olabilir" diye YANLIŞ bir
   * beklenti kurardı.
   *
   * `null` = ayar boş ya da kullanılamaz hâlde → **tahsilat kapısı kapalıdır** ve ekran sebebini
   * söyler. Uydurma bir kimlik göndermek `DoorCollectionInput`un uuid kapısından 400 alırdı; sıfıra
   * ya da rastgele bir değere düşmek ise kapıda alınan parayı olmayan bir hesaba yazmak olurdu.
   */
  doorAccountId: z.string().uuid().nullable(),
});
export type CourierDayResponse = z.infer<typeof CourierDayResponseSchema>;

/**
 * **"Seferi başlat" isteği** (K1 · 18.08 — eski "yola çıktım"ın sefer bilinçli hâli). Gün
 * verilmezse bugün — cevabın `date`i hangi günün başlatıldığını SÖYLER, istemci hesap yapmaz.
 *
 * `zoneId` OPSİYONEL ve tek-rota otomatiği uçta: verilmezse ve o gün koşan TEK rota varsa o rota
 * seçilir; birden çoksa `route_required` döner ve ekran `/courier/routes`tan seçtirir. Tek rotalı
 * operasyon böylece hiç soru görmez ("tek adayda soru sorulmaz" — dispatch'in aynı ilkesi).
 * `vehicleId` de opsiyonel: araç kaydı girilmemiş kurulumda kurye kilitlenmez (zorunluluk Setting).
 */
export const StartCourierDayRequestSchema = z.object({
  date: z.string().optional(),
  zoneId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
});
export type StartCourierDayRequest = z.infer<typeof StartCourierDayRequestSchema>;

/** Yola çıkarılamayan durak — kimliği ve O ANDAKİ durumu. Durum, sebebin kendisidir. */
export const CourierDayStopStateSchema = z.object({
  orderId: z.string().uuid(),
  currentStatus: OrderStatusEnum,
});
export type CourierDayStopState = z.infer<typeof CourierDayStopStateSchema>;

/**
 * **"Yola çıktım" yanıtı** (K1). Gün başına başlatma TOPLU bir yazımdır ve toplu yazımın en tehlikeli
 * hâli "kısmen oldu"dur — bu yüzden cevap tek bir `ok` DEĞİL, dört listedir. Hangi siparişin
 * geçtiği, hangisinin geçmediği ve NEDEN geçmediği ekranda görünür; "3 durak yola çıktı, 1'i
 * hazırlanmayı bekliyor" cümlesi ancak böyle kurulabilir.
 *
 * Tek bir sayıya (ör. `startedCount`) indirilseydi kurye eksik kalanı ancak listeyi gözle sayarak
 * bulurdu — ve teslim yazamadığında sebebini bilmezdi (kapı sırası: teslim yalnız YOLDAKİ siparişten
 * olur).
 */
export const StartCourierDayResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    date: z.string(),
    /** Açılan seferin künyesi — kilit artık sunucu verisi, yerel bayrak değil (18.08). */
    run: CourierRunBriefSchema,
    /** Bu çağrıda `ready → out_for_delivery` yazılan siparişler. */
    started: z.array(z.string().uuid()),
    /** Zaten yoldaydı — bir HATA değil, "yapılacak yeni bir şey yok" cevabıdır. */
    alreadyOut: z.array(z.string().uuid()),
    /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. Ekran bunu GÖSTERİR, yutmaz. */
    stale: z.array(CourierDayStopStateSchema),
    /** Yola çıkarılmadı — durumu uygun değil (henüz hazırlanmadı ya da gün içinde kapandı). */
    skipped: z.array(CourierDayStopStateSchema),
    /**
     * KUTULU sipariş — tüm kutuları binene kadar "yolda" YAZILMAZ (23.8, etüt 2.4: *"araca
     * binmeyen kutu 'yolda' görünmez"*). Yola çıkışı `loadBox` tamamlar: son kutu okutulunca
     * geçiş oradan yazılır. `skipped`ten ayrı bir liste, çünkü çare farklı — bunlar hazırlanmayı
     * değil OKUTULMAYI bekliyor ve ekran sayacı buradan kurar.
     */
    awaitingBoxes: z.array(
      z.object({ orderId: z.string().uuid(), loadedBoxes: z.number().int(), boxCount: z.number().int() }),
    ),
  }),
  /**
   * Rota+gün başına TEK sefer (18.08): bu rota bugün zaten açılmış. `mine` = başlatan bu kurye —
   * ikinci basış "yeni bir şey yok"tur; başkasıysa ekran "bu rota bugün X'te" der.
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
  /** O gün koşan rota yok (ya da verilen `zoneId` bugün koşmuyor/yok). */
  z.object({ status: z.literal('no_route') }),
]);
export type StartCourierDayResponse = z.infer<typeof StartCourierDayResponseSchema>;

/**
 * **Araca yükleme okutması** (23.8 · karar §1.11). Kod gövdede gider (URL'de kod, erişim
 * loglarında dolaşırdı — `codes/resolve` ile aynı gerekçe).
 */
export const LoadBoxRequestSchema = z.object({ code: z.string().min(1) });
export type LoadBoxRequest = z.infer<typeof LoadBoxRequestSchema>;

/**
 * Yüklemenin cevabı. Karar §1.11'in iki yarısı burada: onay NİYET doğrulamasıdır, garanti KUTU
 * kontrolüdür — rotaya ait olmayan kutu `wrong_route` ile GÖRÜNÜR reddedilir (hangi siparişin
 * kutusu olduğu söylenir ki kurye rampada doğru yığını bulsun). `orderStarted` = bu okutma
 * siparişin SON kutusuydu ve sipariş yola çıktı (`ready → out_for_delivery` buradan yazılır —
 * kutulu siparişte "yolda"nın tek kapısı).
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
    orderStarted: z.boolean(),
  }),
  /** Aynı kutu ikinci kez okutuldu — hata değil, "zaten araçta" cevabı; sayaç değişmedi. */
  z.object({
    status: z.literal('already_loaded'),
    orderId: z.string().uuid(),
    boxNo: z.number().int().positive(),
    loadedBoxes: z.number().int(),
    boxCount: z.number().int(),
  }),
  /** Kutu bu kuryenin seferine ait değil — YÜKLENMEZ (karar §1.11). */
  z.object({ status: z.literal('wrong_route'), referenceNo: z.string().nullable() }),
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
 * Teslim kanıtı GİRDİSİ (K3) — imza çizimi de fotoğraf da görsel olarak saklanır.
 *
 * Kayıt şemasından (`DeliveryProofRecordSchema`) BİLEREK dar: `box_scan` istemciden GELMEZ —
 * o kanıdı sunucu, okutulan kodlardan kendisi kurar (23.8). Girdi kümesi görselli iki türle
 * sınırlı ve `imageKey` zorunlu; kayıt tarafındaki nullable yalnız sunucunun `box_scan`ı için.
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
  /** **Cent** (02.9 · STACK §8). */
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
 * Kapıda teslim isteği (K3 + K4). Sıra sunucuda sabit: kanıt kapısı → mal → teslim → para.
 * İstemci sırayı kurmaz, tek istek gönderir — yarısı yazılmış teslimat bırakmamanın tek yolu bu.
 */
export const ConfirmDoorDeliveryRequestSchema = z.object({
  /** `fulfilledQty` **hedef** değerdir (kalan adet), fark değil — ekranda görülen sayı gönderilir. */
  adjustments: z.array(FulfillmentAdjustmentSchema).optional(),
  proof: DeliveryProofInputSchema.nullish(),
  collection: DoorCollectionInputSchema.nullish(),
  /**
   * Kapıda okutulan kutu kodları (23.8). KUTULU siparişte teslimin ön koşulu: kapı seti siparişin
   * kutularıyla karşılaştırır, eksikse `boxes_missing` döner ve HİÇBİR yazım yapılmaz — "tüm
   * kutular okutulmadan teslim tamamlanmaz" (etüt 2.5). Kodlar `delivery_proof`a yazılır.
   * Kutusuz siparişte alan gönderilmez.
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
 * Kanıt yükleme izni isteği (K3). **Dosya sunucudan geçmez:** cihaz doğrudan kovaya yükler,
 * sunucu yalnız yetkiyi doğrulayıp kısa ömürlü bir izin yazar. Anahtarı da SUNUCU seçer.
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
 * SEFER kapanışı taslağı (K7 · 18.08 — eksen kurye×gün'den sefere indi). Kapanış öncesi ekranın
 * gördüğü: seferin resmi + beklenen tahsilat. `run` null = o gün sürülmüş sefer yok, kapanacak bir
 * şey de yok — ekran bunu bir hata değil sakin bir bilgi olarak gösterir.
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
 * Seferi kapat isteği (K7 · 18.08). Sayılan tutarlar **cent**. Fark gizlenmez, açıklanır — not fark
 * çıktığında anlamlıdır ama zorunlu değildir (kurye açıklayamıyorsa da sefer kapanmalı).
 *
 * `runId` ZORUNLU: kapanışın öznesi artık gün değil sefer. İki sefer sürmüş kurye ikisini ayrı
 * kapatır — akış sıralıdır (kapat → yeni sefer), ekran "hangi seferi kapatıyorum" diye sormaz.
 *
 * Yanıt şeması yeni DEĞİL: `CloseDeliveryRunResultSchema` (entities) RPC dönüşünün aynasıdır ve
 * uç onu OLDUĞU GİBİ döndürür — ikinci bir sözleşme yazmak aynı sayıyı iki yerde tanımlamaktı.
 */
export const CloseDeliveryRunRequestSchema = z.object({
  runId: z.string().uuid(),
  countedCashCents: z.number().int().nonnegative().optional(),
  countedCardCents: z.number().int().nonnegative().optional(),
  countedChequeCents: z.number().int().nonnegative().optional(),
  note: z.string().nullish(),
});
export type CloseDeliveryRunRequest = z.infer<typeof CloseDeliveryRunRequestSchema>;
