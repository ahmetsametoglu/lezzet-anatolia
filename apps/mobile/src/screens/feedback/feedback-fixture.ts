import { CROP_CENTER, type FeedbackVote, type ImageCrop } from '@lezzet/types';

import { ordersFixture } from '@/screens/orders/orders-fixture';

/*
  GERİ BİLDİRİM TEST/DEMO VERİSİ — UI-only etap: geri bildirim uçları mobile BAĞLANMADI, ağ
  çağrısı yok. Ekranın sözleşmesi YAZILI ve tektir: `packages/types/src/contracts/
  feedback-api.schema.ts` (`GET/POST /api/v1/feedback/:token` uçlarının ve vFb ekranının ortak
  dili). Buradaki tipler o şemanın ALAN ALAN AYNASIDIR — şema henüz paketin barrel'ına
  (`contracts/index.ts`) bağlanmadığı ve `@lezzet/types`ın exports haritası derin import'a kapalı
  olduğu için `z.infer` ile TÜRETİLEMEDİ (iki dosya da bu şeride kapalı; ihraç açıldığı gün bu
  tipler silinir ve ekran şemadan okur — raporlandı).

  KARTLAR SİPARİŞ FIXTURE'INDAN TÜRER (support'un gerekçesiyle: iki ayrı yer tutucudan biri
  mutlaka eskir) — teslim edilmiş sipariş LA-2411'in üç ürünü. Gerçek uçta kartlar kalemden değil
  ÜRÜNDEN kurulur (aynı ürünün iki boyu tek karttır; sözleşmenin kendi hükmü) — o ayrım backend'in
  işi, demo siparişte örtüşme yok.

  OY TÜRÜ ŞEMADAN (`FeedbackVote` — like/dislike): kapalı küme, burada uydurulmadı.

  ── BAĞLANTI NOKTALARI (backend şeridi; uçlar sözleşmede tanımlı) ───────────
  · OKUMA  — `GET /feedback/:token` → `FeedbackInviteSchema`; geçersiz token 404 (davetin varlığı
    doğrulanmaz), ekran "bulunamadı" durumuna düşer.
  · YAZMA  — `POST /feedback/:token/vote` → ürün başına oy, HER DOKUNUŞTA anında (yarıda bırakılan
    akış kaldığı yerden sürsün diye).
  · YAZMA  — `POST /feedback/:token/review` → akış sonu TEK yorum kutusu; sözleşme yorumu ÜRÜNE
    bağlar (`productId` zorunlu — "çok ürünlüde hedefi ekran belirler").
  · YAZMA  — `POST /feedback/:token/complete` → sonuç (`outcome`), puan ve dış değerlendirme
    bağlantısı CEVAPTAN gelir; ekran hesaplamaz.
*/

/** Akıştaki tek kart — `FeedbackCardSchema` aynası. */
export interface FeedbackCardView {
  productId: string;
  /** Seçili dilde çözülmüş ad (dil yedek zinciri SUNUCUDA). */
  name: string;
  /** Katalog kartlarının görsel şekli (`CatalogImageSchema`): public URL + kırpma künyesi. */
  image: { url: string | null; crop: ImageCrop };
  /** Önceki cevap — yarıda bırakılan akış kaldığı yerden sürer; ölçüt `existing.vote` (şemanın hükmü). */
  existing: { vote: FeedbackVote | null; rating: number | null; comment: string | null } | null;
}

/** `GET /feedback/:token` cevabı — `FeedbackInviteSchema` aynası. */
export interface FeedbackInviteView {
  customerName: string | null;
  /** Fotoğraf üstündeki eğik rozet ("LA-2411"); kargosuz senaryoda null olabilir. */
  orderReferenceNo: string | null;
  /** Ham ISO; biçimleme ekranın işi. */
  orderedOn: string | null;
  cards: FeedbackCardView[];
  /** "2 / 5" — türetilir, saklanmaz; `total` kart kümesiyle aynı kaynaktan gelir. */
  progress: { rated: number; total: number };
  /** Tamamlamanın kazandıracağı puan — AYARDAN (`points_feedback_purchase`), ekrana gömülmez. */
  completionPoints: number;
  /** Dolu ise davet zaten tamamlanmış: puan İKİNCİ KEZ verilmez (bkz. ekranın tamamlama notu). */
  completedAt: string | null;
  pointsAwarded: number | null;
}

/** `POST /feedback/:token/vote` gövdesi — `FeedbackVoteBodySchema` aynası. */
export interface FeedbackVoteBody {
  productId: string;
  vote: FeedbackVote;
}

/**
 * Akış sonu birliği — `FeedbackOutcomeEnum` aynası (asıl kaynak `@lezzet/domain-core`, sözleşme
 * enum'u onunla derlemede kilitli; ikisi de bu paketten okunamadığı için burada yinelendi).
 */
export type FeedbackOutcome = 'review_invite' | 'report_issue' | 'thanks';

/** `POST /feedback/:token/complete` cevabı — `FeedbackCompletionSchema` aynası. */
export interface FeedbackCompletionView {
  outcome: FeedbackOutcome;
  /** Bu turda kazanılan; ikinci tamamlamada ve B2B'de 0 → puan kartı çizilmez. */
  pointsAwarded: number;
  /** Güncel bakiye — "Toplam ✦ N puan" rozeti. */
  balance: number;
  /** Yalnız `review_invite` sonucunda dolu — dış değerlendirme adresi ve düğmede yazacak ad (ayar). */
  reviewUrl: string | null;
  reviewPlatform: string | null;
}

/** Demo davetin token'ı — derin bağlantı: `lezzet://feedback/demo-la-2411`. */
export const DEMO_FEEDBACK_TOKEN = 'demo-la-2411';

/** Şablonun demo bakiyesi (v3 `points:240`) — tamamlama +15 ile 255'e çıkar. */
const DEMO_BALANCE_BEFORE = 240;

/** Şablonun "+15 puan" değeri — gerçek uçta ayardan gelir, bkz. `completionPoints` künyesi. */
const DEMO_COMPLETION_POINTS = 15;

/**
 * Token'la davet; bulunamazsa `null` — "yok" ile "boş" aynı şey değildir (CLAUDE §1).
 * Geçersiz/eskimiş bağlantı ekranda "bulunamadı" durumuna düşer, sessizce boş akış açılmaz.
 */
export function feedbackInviteByToken(token: string): FeedbackInviteView | null {
  if (token !== DEMO_FEEDBACK_TOKEN) return null;

  // Teslim edilmiş sipariş LA-2411 — kartlar onun kalemlerinden (kalem kimliği demo veride ürün
  // kimliğiyle aynı; gerçek uçta ürün varyant üzerinden çözülür, üstteki künyeye bakın).
  const order = ordersFixture().find((row) => row.status === 'delivered');
  if (order === undefined) return null;

  return {
    customerName: 'Elif Kaya',
    orderReferenceNo: order.reference,
    orderedOn: '2026-07-28T10:05:00Z',
    cards: order.lines.map((line) => ({
      productId: line.id,
      name: line.name,
      image: { url: line.photoUri, crop: CROP_CENTER },
      existing: null,
    })),
    progress: { rated: 0, total: order.lines.length },
    completionPoints: DEMO_COMPLETION_POINTS,
    completedAt: null,
    pointsAwarded: null,
  };
}

/**
 * Tamamlama — BAĞLANTI NOKTASI: gerçek karar backend'de (`POST complete` cevabı) ve MOTORDA
 * (`feedbackOutcomeOf`, domain-core — ölçüt beğeni ORANI, %80 eşiği) verilir; "memnun mu"
 * istemcide sayılsaydı iki yerde iki farklı memnuniyet tanımı olurdu (sözleşmenin kendi notu).
 *
 * Buradaki kural v3 DEMOSUNUN kuralıdır (hepsi beğenildiyse dış değerlendirme, değilse sorun
 * bildirme) — uç bağlandığında ekran sonucu cevaptan okuyacak, bu fonksiyon silinecek.
 */
export function completeFeedbackFixture(votes: FeedbackVoteBody[]): FeedbackCompletionView {
  const allLiked = votes.length > 0 && votes.every((entry) => entry.vote === 'like');

  return {
    outcome: allLiked ? 'review_invite' : 'report_issue',
    pointsAwarded: DEMO_COMPLETION_POINTS,
    balance: DEMO_BALANCE_BEFORE + DEMO_COMPLETION_POINTS,
    // Adres gerçek uçta `review_platform_url` ayarından gelir; demo değeri yalnız kapıyı açar.
    reviewUrl: allLiked ? 'https://g.page/lezzet-anatolia/review' : null,
    reviewPlatform: allLiked ? 'Google' : null,
  };
}
