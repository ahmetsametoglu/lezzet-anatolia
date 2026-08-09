import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { FeedbackRequestSchema } from '../entities/feedback-request.schema';
import { ProductFeedbackSchema } from '../entities/product-feedback.schema';
import { FeedbackVoteEnum } from '../primitives/enums.schema';

/**
 * GERİ BİLDİRİM AKIŞI SÖZLEŞMESİ — mobil `GET/POST /api/v1/feedback/:token` uçlarının ve onları
 * tüketen vFb ekranının (v3 tasarım 17) ORTAK dili. Terfi gerekçesi `me-api.schema.ts` ile aynı
 * (02-mimari §3.2 "sözleşme tek kaynak"): üreten ve tüketen aynı şemayı çağırır, alan adı
 * değişirse iki taraf birden DERLEME anında kırılır.
 *
 * ── TOKEN OTURUM YERİNE GEÇER; KİMLİK ZARFA GİRMEZ ───────────────────────────
 * `requestId` ve `customerId` BİLEREK YOK: uygulama katmanının görünümü (`FeedbackInviteView`)
 * ikisini taşır ama telefonun onlarla yapabileceği hiçbir şey yoktur — her eylem token'la yapılır
 * ve kimlik sunucuda ondan çözülür. Müşteri kimliğini zarfa koymak, hiçbir ekran okumadan bir
 * kişisel veriyi telde dolaştırmak olurdu. Uç `parse` ile döndürür: pick'te olmayan alan SIZAMAZ.
 *
 * ── EKRANIN ÜÇ AŞAMASI TEK OKUMADAN KURULUR (v3 `fv.` kurucusu) ──────────────
 * stage0 (ürün başına 👍/👎) → `cards` + `progress`; stage1 (akış sonu yorum) → yazım gövdeleri;
 * stage2 (teşekkür + puan + yol ayrımı) → `FeedbackCompletionSchema`. Aşama durumu İSTEMCİDE
 * yaşar; sunucu yalnız gerçekleri verir (hangi kart cevaplı, akış tamam mı).
 */

/**
 * Akıştaki tek kart — siparişteki bir ürün (kalem varyanta bağlıdır, kart ürüne: aynı ürünün iki
 * boyu TEK karttır — sayı `progress.total` ile aynı kümeden gelir, ikisi birbirini yalanlayamaz).
 */
export const FeedbackCardSchema = z.object({
  /** Oy/yorum yazımının hedefi — gövdelerdeki `productId` bu listeden seçilir. */
  productId: ProductFeedbackSchema.shape.productId,
  /** Seçili dilde çözülmüş (dil yedek zinciri SUNUCUDA — istemci dil bilmez). */
  name: z.string(),
  /** vFb kartın tam boy fotoğrafı — katalog kartlarının aynı görsel şekli (ikinci tanım açılmaz). */
  image: CatalogImageSchema,
  /**
   * Müşterinin BU davetten önceki cevabı — **yarıda bırakılan akış kaldığı yerden devam eder**:
   * ekran ilk oysuz karttan sürer. Ölçüt `existing` değil `existing.vote` — yalnız yorum taşıyan
   * kart hâlâ cevapsızdır (web akışının ölçülmüş kuralı).
   */
  existing: z
    .object({
      vote: ProductFeedbackSchema.shape.vote,
      rating: ProductFeedbackSchema.shape.rating,
      comment: ProductFeedbackSchema.shape.comment,
    })
    .nullable(),
});
export type FeedbackCard = z.infer<typeof FeedbackCardSchema>;

/** `GET /feedback/:token` cevabı — davet açıldığında ekranın gördüğü her şey, tek turda. */
export const FeedbackInviteSchema = z.object({
  /** Teşekkür ekranı adla hitap ediyor; yoksa genel cümle. */
  customerName: z.string().nullable(),
  /** Başlık rozeti ("LZA-2417", v3 `fv.ordRef`). */
  orderReferenceNo: z.string().nullable(),
  /** Ham ISO; biçimleme ekranın işi (dil orada belli). */
  orderedOn: z.string().nullable(),
  /**
   * En az BİR kart: kalemsiz davet uçtan hiç çıkmaz (404 — web sayfasının aynı kuralı: boş bir
   * akış müşteriye "bozuk" der). `min(1)` bu sözü şemada kilitler.
   */
  cards: z.array(FeedbackCardSchema).min(1),
  /** "2 / 5" — türetilir, saklanmaz; sayaç tutulsaydı bir gün gerçekle ayrışırdı. */
  progress: z.object({
    rated: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /**
   * Tamamlamanın kazandıracağı puan — **AYARDAN** gelir, ekrana gömülmez. Tasarımdaki `+15` bir
   * maket sayısı; kodlanmış olsaydı ayar değiştiği gün ekran müşteriye sistemin vermeyeceği bir
   * sayı söylerdi (29.07 denetiminin 300/500 dersi).
   */
  completionPoints: z.number().int().nonnegative(),
  /** Dolu ise davet zaten tamamlanmış: akış kurulmaz, teşekkür durumu çizilir; puan İKİNCİ KEZ verilmez. */
  completedAt: FeedbackRequestSchema.shape.completedAt,
  pointsAwarded: FeedbackRequestSchema.shape.pointsAwarded,
});
export type FeedbackInvite = z.infer<typeof FeedbackInviteSchema>;

/** `POST /feedback/:token/vote` gövdesi — kart oyu. Oy İSTEĞE BAĞLI DEĞİL: bu ucun tek işi o. */
export const FeedbackVoteBodySchema = z.object({
  productId: ProductFeedbackSchema.shape.productId,
  vote: FeedbackVoteEnum,
});

/**
 * `POST /feedback/:token/review` gövdesi — akış sonunun isteğe bağlı yorumu (v3 stage1).
 *
 * `productId` ZORUNLU: yorum ürün beyanıdır (`product_feedback`) ve ürün sayfasında yayınlanır —
 * sipariş-düzeyi bir yorum kolonu yok ve açılmadı. Tek ürünlü siparişte seçim kendiliğinden;
 * çok ürünlüde hedefi ekran belirler (tasarımın tek kutusu bir sadeleştirme, veri modeli değil).
 *
 * `rating` mobil tasarımda bugün YOK ama sözleşmede var: kapı (web ile TEK kural) yıldızı zaten
 * taşıyor ve alanı sonradan eklemek sözleşme kırılması olurdu; göndermeyen ekran için alan yok
 * hükmünde. İkisi birden boşsa uç `review_empty` döner — kural şemada değil kapıda, TEK yerde.
 *
 * Gönderilmeyen alana DOKUNULMAZ (kısmi güncelleme): yalnız yıldız gönderen bir istek, daha önce
 * yazılmış (ve onaylanmış) yorumu silmez.
 */
export const FeedbackReviewBodySchema = z.object({
  productId: ProductFeedbackSchema.shape.productId,
  rating: ProductFeedbackSchema.shape.rating.optional(),
  comment: z.string().nullish(),
});

/** Yazım uçlarının başarı cevabı — kayıt düştü; ilerlemeyi ekran zaten iyimser tutuyor (web emsali). */
export const FeedbackAckSchema = z.object({ recorded: z.literal(true) });

/**
 * Akış sonu — hangi kutunun çizileceğini MOTOR söyler (`feedbackOutcomeOf`), ekran değil:
 * "memnun mu" beğeni ORANINA bakan bir eşiktir ve istemcide sayılsaydı iki yerde iki farklı
 * memnuniyet tanımı olurdu.
 *
 * Değerler `@lezzet/domain-core.FeedbackOutcome` birliğinin AYNISI; paket buraya bağlanamaz
 * (`types-is-pure`), bu yüzden bağ derlemede kilitlenir: uç gövdeyi `z.input<…>` ile tipliyor ve
 * motorun birliği bu enum'dan saparsa uç DERLENMEZ (katalog `TextSegment` kilidinin aynı deseni).
 */
export const FeedbackOutcomeEnum = z.enum(['review_invite', 'report_issue', 'thanks']);

/** `POST /feedback/:token/complete` cevabı — v3 stage2'nin tüm malzemesi. */
export const FeedbackCompletionSchema = z.object({
  outcome: FeedbackOutcomeEnum,
  /** Bu turda kazanılan; ikinci tamamlamada 0 — puan çipi (`fv.ptsF`) yalnız >0 iken çizilir (B2B'de de 0). */
  pointsAwarded: z.number().int().nonnegative(),
  /** Güncel bakiye — "Toplam ✦ N puan" rozeti (`fv.ptsTotal`). */
  balance: z.number().int(),
  /** Yalnız `review_invite` sonucunda dolu — dış değerlendirme adresi ve düğmede yazacak ad (ayar). */
  reviewUrl: z.string().nullable(),
  reviewPlatform: z.string().nullable(),
});
export type FeedbackCompletion = z.infer<typeof FeedbackCompletionSchema>;
