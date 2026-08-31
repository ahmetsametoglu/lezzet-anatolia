import { z } from 'zod';
import {
  OrderStatusEnum,
  StopOrderMetricEnum,
  StopOrderPrecisionEnum,
  StopOrderSourceEnum,
} from '../primitives/enums.schema';

// SEFER — gerçekleşen teslimat rotası (11.7 · kullanıcı kararları 18.08 · `docs/feature/sefer.md`).
//
// İki "sefer" var; bu şema yalnız GERÇEKLEŞENİ taşır. Planlanan sefer `(deliveryZoneId,
// deliveryDate)` ikilisidir ve türetilmiş kalır (0044 kararı) — davet, checkout ve kesim penceresi
// (`deliveryRunWindow`, adı planlanan pencereyi ölçer) ona bakmaya devam eder.
//
// Durum makinesi YOK: hâl üç damgadan türetilir (`departedAt` dolu = yolda, `returnedAt` dolu =
// döndü). Projenin yerleşik deseni — teslim anı loglardan, `reconciled` generated.

export const DeliveryRunSchema = z.object({
  id: z.string().uuid(),
  /** Okunabilir sefer kodu — `SF-26-XXXXXX` (`deliveryRunReferenceNo`, domain-core). */
  referenceNo: z.string(),
  deliveryZoneId: z.string().uuid(),
  deliveryDate: z.string(),
  /** SNAPSHOT: bölge sonradan başka depoya taşınsa da seferin yüklendiği tesis değişmez. */
  warehouseId: z.string().uuid(),
  /** Seferi süren kurye — siparişin `courierId`si start anında BURADAN senkronlanır. */
  courierId: z.string().uuid(),
  /** Nullable: araç kaydı girilmemiş kurulumda kurye kilitlenmez; zorunluluk parametrik (Setting). */
  vehicleId: z.string().uuid().nullable(),
  createdAt: z.string(),
  departedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  note: z.string().nullable(),

  /**
   * Durak sırası (11.9) — **turun özelliği, siparişin değil.** `order.stopSeq` bir kolon olsaydı
   * paydasız bir sayı olurdu ve sipariş başka güne taşındığı an sessizce yalana dönerdi.
   *
   * **Dizi SIRALAMADIR, ÜYELİK DEĞİL:** üyelik `order.deliveryRunId`de kalır. Okuma dizideki yere
   * göre dizer ve dizide olmayan durak DÜŞMEZ, sırasız olarak sona gider — bayat bir dizi hiçbir
   * durağı gizleyemez.
   */
  stopOrder: z.array(z.string().uuid()),
  /** Sırayı kim koydu; `manual` motor yazımını kilitler. `null` = hiç hesaplanmadı. */
  stopOrderSource: StopOrderSourceEnum.nullable(),
  /** Hangi ölçüyle — kuş uçuşu mu gerçek yol süresi mi. Ekran bunu söyleyebilmeli. */
  stopOrderMetric: StopOrderMetricEnum.nullable(),
  /** Hangi incelikte — `postal_centroid` ise aynı koddaki duraklar arasında sıra keyfidir. */
  stopOrderPrecision: StopOrderPrecisionEnum.nullable(),
  /**
   * Kararın anı. Sonuç BOŞ olsa da damgalanır ("hesaplandı, sıralanamadı") — yoksa düşmüş bir
   * sağlayıcı her gün ekranı yoklamasında yeniden dövülürdü.
   */
  stopOrderGeneratedAt: z.string().nullable(),
  stopOrderBy: z.string().uuid().nullable(),
});
export type DeliveryRun = z.infer<typeof DeliveryRunSchema>;

/**
 * `set_run_stop_order` dönüşü. `manual_order_kept` bir hata değil bir KORUMA: elle dizilmiş sıra,
 * uçuşta olan bir yeniden hesapla ezilmez. `run_closed` de öyle — kapanmış seferin sırası donar,
 * "o gün hangi sırayla gidildi" geçmişe dönük değişmemeli.
 */
export const SetStopOrderResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['run_not_found', 'run_closed', 'manual_order_kept']).optional(),
  runId: z.string().uuid().optional(),
  stops: z.number().int().optional(),
});
export type SetStopOrderResult = z.infer<typeof SetStopOrderResultSchema>;

/**
 * Sefer kapanışı — mutabakat kaydı (0025'teki `CourierDayClose`un halefi; eksen kurye×gün → SEFER,
 * kullanıcı kararı 18.08: "fark hangi seferde doğdu" cevaplanabilmeli).
 *
 * `expected_*` türetilebilirken SAKLANIR — kapanış anının fotoğrafı: sonradan bir hareket
 * düzeltilse de "o gün ne konuşuldu" değişmez. `reconciled` saklanmaz, veritabanında TÜRETİLİR
 * (generated). Para alanları CENT (02.9); DB kolonları euro `numeric`, dönüşüm servis sınırında.
 */
export const DeliveryRunCloseSchema = z.object({
  id: z.string().uuid(),
  deliveryRunId: z.string().uuid(),
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
  countedCashCents: z.number().int(),
  countedCardCents: z.number().int(),
  countedChequeCents: z.number().int(),
  /**
   * Seferin üç akıbeti — sayı değil KİMLİK: kapanıştan sonra "hangi sipariş" sorusu cevaplanabilsin.
   * Fotoğraf ÇÖZÜMDEN ÖNCE çekilir: kapanışın `ready`ye düşürdüğü duraklar burada `pending` görünür.
   */
  deliveredOrders: z.array(z.string().uuid()),
  returnedOrders: z.array(z.string().uuid()),
  pendingOrders: z.array(z.string().uuid()),
  note: z.string().nullable(),
  closedBy: z.string().uuid().nullable(),
  closedAt: z.string(),
  reconciled: z.boolean(),
});
export type DeliveryRunClose = z.infer<typeof DeliveryRunCloseSchema>;

/**
 * `delivery_run_collection` görünümü — kapanış ÖNCESİ beklenen tahsilat, SEFER bazında.
 * Toplama SQL'i tek yerde (görünümde); TypeScript'te ikinci kez yazılmaz.
 */
export const DeliveryRunCollectionSchema = z.object({
  deliveryRunId: z.string().uuid(),
  expectedCashCents: z.number().int(),
  expectedCardCents: z.number().int(),
  expectedChequeCents: z.number().int(),
});
export type DeliveryRunCollection = z.infer<typeof DeliveryRunCollectionSchema>;

/**
 * `open_delivery_run` dönüşü — **sefer KURULUR, başlamaz** (31.08). `departedAt` bu dalda NULL'dur
 * ve bu bir eksiklik değil tanımdır: kurulmuş sefer "araçta bekleyen" seferdir, kutuları
 * okutulabilir ama durakları açılmamıştır. Yola çıkaran `depart_delivery_run`.
 *
 * `already_started` bir hata değil bir GERÇEKTİR: rota+gün başına tek sefer (18.08) — ikinci çağrı
 * ezmez, mevcut künyeyi bildirir. `reference_collision` yalnız üretilen kodun çakışması: çağıran
 * yeni kodla dener (sipariş referansının deseni).
 *
 * `claimed` durum GEÇİŞİ değil damgalamadır: hangi siparişler bu sefere bağlandı, o anki
 * durumlarıyla. `ready → out_for_delivery` geçişini motor izniyle uygulama katmanı yazar.
 */
export const OpenDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['already_started', 'zone_not_found', 'reference_collision']).optional(),
  runId: z.string().uuid().optional(),
  referenceNo: z.string().optional(),
  /** `already_started` dalında: seferi kim sürüyor — ekran "rota bugün X'te" diyebilsin. */
  courierId: z.string().uuid().optional(),
  /* NULL = sefer KURULDU ama başlamadı (31.08) — `optional` yetmiyor, RPC alanı her dalda döndürüyor
     ve değeri null olabiliyor. "Alan yok" ile "damga yok" ayrı iki gerçek. */
  departedAt: z.string().nullable().optional(),
  claimed: z.array(z.object({ orderId: z.string().uuid(), status: OrderStatusEnum })).optional(),
});
export type OpenDeliveryRunResult = z.infer<typeof OpenDeliveryRunResultSchema>;

/**
 * `depart_delivery_run` dönüşü — kurulmuş seferin yola çıkma damgası (31.08).
 *
 * İkinci basış HATA DEĞİL: damga zaten varsa `already_departed` ile aynı künye döner. Kurye
 * "yola çık"a iki kez basabilir ve bunun cevabı "olmadı" değil "zaten olmuştu"dur.
 */
export const DepartDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['not_found', 'not_mine', 'already_departed']).optional(),
  departedAt: z.string().optional(),
});
export type DepartDeliveryRunResult = z.infer<typeof DepartDeliveryRunResultSchema>;

/**
 * `close_delivery_run` dönüşü — 0025'teki `CourierDayCloseResult`ın halefi. Alanlar `optional`:
 * `ok:false` dalında RPC hiçbirini döndürmez, sıfır yazmak "hesaplandı, sıfır çıktı" olurdu.
 */
export const CloseDeliveryRunResultSchema = z.object({
  ok: z.boolean(),
  /* `not_departed` (31.08): sefer kurulmuş ama yola çıkmamış — araçta bekliyor, kapatılamaz. */
  reason: z.enum(['already_closed', 'not_found', 'not_departed']).optional(),
  id: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  closedAt: z.string().optional(),
  expectedCashCents: z.number().int().optional(),
  expectedCardCents: z.number().int().optional(),
  expectedChequeCents: z.number().int().optional(),
  countedCashCents: z.number().int().optional(),
  countedCardCents: z.number().int().optional(),
  countedChequeCents: z.number().int().optional(),
  /** Sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para. */
  differenceCashCents: z.number().int().optional(),
  differenceCardCents: z.number().int().optional(),
  differenceChequeCents: z.number().int().optional(),
  reconciled: z.boolean().optional(),
  deliveredCount: z.number().int().optional(),
  returnedCount: z.number().int().optional(),
  pendingCount: z.number().int().optional(),
  /** Kapanışın `ready`ye düşürdüğü takılı durak sayısı (K4, 18.08) — ekran "N durak yeniden planlanacak" der. */
  releasedCount: z.number().int().optional(),
  returnedAt: z.string().optional(),
});
export type CloseDeliveryRunResult = z.infer<typeof CloseDeliveryRunResultSchema>;
