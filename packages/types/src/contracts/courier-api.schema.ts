import { z } from 'zod';
import { CourierDayCloseSchema, DeliveryProofRecordSchema } from '../entities/courier.schema';
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
});
export type CourierStopContract = z.infer<typeof CourierStopSchema>;

/** `GET /courier/day` yanıtı. Gün ZORUNLU döner: istemci "hangi günü gösteriyorum" sorusunu sormaz. */
export const CourierDayResponseSchema = z.object({
  date: z.string(),
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
 * **"Yola çıktım" isteği** (K1 · 21.10d). Gün verilmezse bugün — cevabın `date`i hangi günün
 * başlatıldığını SÖYLER, istemci ikinci bir hesap yapmaz.
 */
export const StartCourierDayRequestSchema = z.object({ date: z.string().optional() });
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
export const StartCourierDayResponseSchema = z.object({
  date: z.string(),
  /** Bu çağrıda `ready → out_for_delivery` yazılan siparişler. */
  started: z.array(z.string().uuid()),
  /** Zaten yoldaydı — ikinci çağrı bir HATA değil, "yapılacak yeni bir şey yok" cevabıdır. */
  alreadyOut: z.array(z.string().uuid()),
  /** Araya biri girdi: `ready` okundu, yazarken durum değişmişti. Ekran bunu GÖSTERİR, yutmaz. */
  stale: z.array(CourierDayStopStateSchema),
  /** Yola çıkarılmadı — durumu `ready` değil (henüz hazırlanmadı ya da gün içinde kapandı). */
  skipped: z.array(CourierDayStopStateSchema),
});
export type StartCourierDayResponse = z.infer<typeof StartCourierDayResponseSchema>;

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

/** Teslim kanıtı (K3) — imza çizimi de fotoğraf da görsel olarak saklanır. */
export const DeliveryProofInputSchema = DeliveryProofRecordSchema.pick({ kind: true, imageKey: true }).extend({
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

/** Gün kapanışı taslağı (K7) — kapanış öncesi ekranın gördüğü: günün resmi + beklenen tahsilat. */
export const DayCloseDraftSchema = z.object({
  date: z.string(),
  /** Zaten kapatılmışsa kayıt döner ve ekran SALT-OKUNUR gösterir. */
  closed: CourierDayCloseSchema.nullable(),
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
 * Günü kapat isteği (K7). Sayılan tutarlar **cent**. Fark gizlenmez, açıklanır — not fark
 * çıktığında anlamlıdır ama zorunlu değildir (kurye açıklayamıyorsa da gün kapanmalı).
 *
 * Yanıt şeması yeni DEĞİL: `CourierDayCloseResultSchema` (entities) zaten RPC dönüşünün aynasıdır
 * ve uç onu OLDUĞU GİBİ döndürür — ikinci bir sözleşme yazmak aynı sayıyı iki yerde tanımlamaktı.
 */
export const CloseCourierDayRequestSchema = z.object({
  date: z.string(),
  countedCashCents: z.number().int().nonnegative().optional(),
  countedCardCents: z.number().int().nonnegative().optional(),
  countedChequeCents: z.number().int().nonnegative().optional(),
  note: z.string().nullish(),
});
export type CloseCourierDayRequest = z.infer<typeof CloseCourierDayRequestSchema>;
