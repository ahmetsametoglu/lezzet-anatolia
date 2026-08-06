import type { KeysetCursor, PointsBalance } from '@lezzet/types';
import type { CandidateDemandRow } from '@/lib/feedback/product-feedback';
import type { ModerationRowView, ScoreRowView } from '@/lib/feedback/moderation-read';
import type { FeedbackTab, FeedbackUrlState, ReviewStack, ScoreDirection } from './feedback-url';

// Geri Bildirim ekranının görünüm tipleri (17.1 · 17.3 · 17.4). Şema tek kaynak (CLAUDE.md §1):
// hepsi `packages/types` ve okuma kapılarının tiplerinden TÜRER, elle yeniden yazılmaz.

/**
 * Moderasyon kartının hazır hâli — okuma kapısının satırı + ekranın hesapladığı iki gösterim.
 *
 * `View = Entity & { extra }` (CLAUDE.md §1): `ModerationRowView` olduğu gibi taşınır, üstüne
 * yalnız SUNUM için türetilenler eklenir. Yıldızın metnini ve yaşı sunucuda hesaplamak zorunlu:
 * ikisi de `now`'a ve sabit bir biçime bağlı, istemcide hesaplanırsa ilk boyama ile ikinci boyama
 * arasında oynar (hidrasyon uyuşmazlığı).
 */
export interface ModerationCardView extends ModerationRowView {
  /** "★★★★☆" — yıldızsız kayıt (yalnız metin) boş dize. */
  stars: string;
  /** Yorumun yaşı — "2 saat", "dün". */
  agoLabel: string;
}

/** Aday panosu satırı — kapının satırı + ürün adı ve çubuk oranı. */
export interface CandidateCardView extends CandidateDemandRow {
  productName: string;
  /** Sıra numarası (1'den) — çizimin kare rozeti. */
  rank: number;
  /** İlerleme çubuğunun doluluğu (0–100); en yüksek talep %100. */
  barPct: number;
}

/** Puan tablosu satırı — bakiye + müşterinin adı (kapı yalnız kimlik veriyor). */
export interface PointsRowView extends PointsBalance {
  customerName: string;
  /** Son hareketin yaşı — "2 gün", "dün". */
  lastAgoLabel: string;
}

/**
 * Sunucudan istemciye geçen tek paket.
 *
 * **Yalnız AÇIK sekmenin verisi dolu.** Dördünü birden okumak, moderasyon yapan operatöre hiç
 * bakmayacağı üç sorgu maliyeti çıkarırdı; sekme adreste durduğu için (`feedback-url`) hangisinin
 * okunacağını sunucu zaten biliyor.
 */
export interface FeedbackData {
  moderation: { rows: ModerationCardView[]; nextCursor: KeysetCursor | null } | null;
  scores: ScoreRowView[] | null;
  candidates: CandidateCardView[] | null;
  points: PointsRowView[] | null;
  /** Sekme rozeti — bekleyen yorum sayısı. Hangi sekmede olursak olalım okunur. */
  pendingCount: number;
  /**
   * Başlık alt satırındaki ikinci sayı — güvenilirliği YÜKSEK aday sayısı.
   *
   * Hangi sekmede olursak olalım okunur, çünkü çizim onu başlığa koymuş: operatör aday panosuna
   * girmeden "bugün bakılacak bir şey var mı" sorusunu cevaplayabilmeli. Ham aday sayısı değil,
   * GÜVENİLİR olanların sayısı — 40 savurma beğenisi toplamış bir aday burada bir iş vaat etmemeli.
   */
  highDemandCount: number;
}

/**
 * İki cihaz görünümünün ortak sözleşmesi — ikisi de AYNI durumu alır, yalnız dizilim değişir.
 *
 * **Bir tur `feedback-client`'ta duruyordu ve künyesi "callback'ler istemci kökünün sözleşmesidir"
 * diyordu; gerekçe yanlıştı ve bedeli ölçüldü:** cihaz dosyaları tipi client'tan geri import edince
 * `client → desktop → client` halkası doğdu ve `pnpm boundaries` iki hatayla düştü (denetim
 * bildirimi 04.08). Callback'lerin İMZASI bir tiptir, çağrının kendisi değil — ve `CLAUDE §2` zaten
 * sayfaya-özel tipin `-types.ts`'te durmasını söylüyordu. Öteki ekranların hepsi de burada tutuyor.
 */
export interface FeedbackViewProps {
  data: FeedbackData;
  urlState: FeedbackUrlState;
  busy: boolean;
  error: string | null;
  /** Kuyruğun devamı var mı (imleç null değil) — nöbetçi buna göre çizilir. */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onTab: (tab: FeedbackTab) => void;
  onStack: (rs: ReviewStack) => void;
  /** Skor tablosunun yönünü değiştirir (en sevilen ↔ en sevilmeyen). */
  onScoreDirection: (sd: ScoreDirection) => void;
  onModerate: (reviewId: string, to: 'approved' | 'rejected') => void;
  /** Elle puan düzeltmesini açar. */
  onAdjustPoints: (customerId: string, customerName: string) => void;
  /** Adayı ürün yönetiminde açar (aday panosunun tek eylemi). */
  onActivate: (productId: string) => void;
}
