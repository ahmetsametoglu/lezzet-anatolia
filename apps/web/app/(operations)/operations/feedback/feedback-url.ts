import { oneOf, type RawParams } from '@/lib/url-params';

// Geri Bildirim ekranının URL SÖZLEŞMESİ (17.1 · 17.3 · 17.4) — iki soru taşır: **hangi sekmedeyim**
// ve **moderasyonda hangi yığına bakıyorum**.
//
// Sekme adreste durur çünkü dördü ayrı iştir ve ayrı ayrı paylaşılır ("aday panosuna bak", "şu
// yorumu onayla"). İstemcide tutulsaydı bağlantı daima moderasyonda açılırdı.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): yorum kuyruğu ve puan listesi veriyle büyür, ama paylaşılan
// bağlantı listenin ortasından başlamamalı.

export const FEEDBACK_PATH = '/operations/feedback';

/**
 * Dört sekme — çizimin kendi şeridi (`Operasyon - Geri Bildirim.dc.html`).
 *
 * Sayfa dokümanı yedi blok sayıyor (§2) ama çizim onları dörde topluyor: skor tablosu "swipe
 * analizi"ni ve "şikâyet sinyali"ni kendi satırına gömüyor (`Sinyal` kolonu + not satırı). Bu bir
 * eksiltme değil birleştirme — ayrı sekmeler açmak aynı ürünü dört yerde gösterirdi.
 */
export const FEEDBACK_TABS = ['moderation', 'scores', 'candidates', 'points'] as const;
export type FeedbackTab = (typeof FEEDBACK_TABS)[number];

export const FEEDBACK_TAB_LABELS: Record<FeedbackTab, string> = {
  moderation: 'Moderasyon',
  scores: 'Ürün skorları',
  candidates: 'Aday panosu',
  points: 'Puan',
};

/**
 * Skor tablosunun yönü — "en sevilen" ile "en sevilmeyen" AYNI tablonun iki ucu.
 *
 * İki ayrı liste çizmek yerine tek tablo + yön: sayfa dokümanı ikisini de istiyor (§2 *"sevilen ve
 * sevilmeyen ürünler sıralanır"*) ve ikisi aynı satır biçimini paylaşıyor. Ayrı listeler aynı
 * kolonları iki kez tanımlardı.
 */
export const SCORE_DIRECTIONS = ['desc', 'asc'] as const;
export type ScoreDirection = (typeof SCORE_DIRECTIONS)[number];

export const SCORE_DIRECTION_LABELS: Record<ScoreDirection, string> = {
  desc: 'En sevilen',
  asc: 'En sevilmeyen',
};

/**
 * Moderasyon yığını. **Çizimde yok, sayfa dokümanı İSTİYOR** (`admin-geri-bildirim.md §2, §3`:
 * *"Yayınlanmış yorumlar — geriye dönük görme ve gerekirse geri çekme"*).
 *
 * Çizim yalnız bekleyen kuyruğu gösteriyor; onunla yetinseydim `moderateReview`'ın üç hâlinden
 * ikisine (geri çekme, reddedilmişi görme) ekrandan hiç ulaşılamazdı — arka uç hazırken. Seçici
 * uydurma değil, kapının kendi imzasının karşılığı: `listReviewsForModeration(status)` üç durumu da
 * okuyor. Sapma `design/BACKLOG`'a yazıldı.
 */
export const REVIEW_STACKS = ['pending', 'approved', 'rejected'] as const;
export type ReviewStack = (typeof REVIEW_STACKS)[number];

export const REVIEW_STACK_LABELS: Record<ReviewStack, string> = {
  pending: 'Bekleyen',
  approved: 'Yayında',
  rejected: 'Reddedilen',
};

export interface FeedbackUrlState {
  tab: FeedbackTab;
  /** Moderasyon yığını — yalnız `moderation` sekmesinde anlamlı. */
  rs: ReviewStack;
  /** Skor tablosunun yönü — yalnız `scores` sekmesinde anlamlı. */
  sd: ScoreDirection;
}

const DEFAULTS: FeedbackUrlState = { tab: 'moderation', rs: 'pending', sd: 'desc' };

/**
 * URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer: bozuk bir bağlantı ekranı
 * kırmamalı, operatörü moderasyon kuyruğuna indirmeli.
 */
export function parseFeedbackUrl(params: RawParams): FeedbackUrlState {
  return {
    tab: oneOf(params.tab, FEEDBACK_TABS, DEFAULTS.tab),
    rs: oneOf(params.rs, REVIEW_STACKS, DEFAULTS.rs),
    sd: oneOf(params.sd, SCORE_DIRECTIONS, DEFAULTS.sd),
  };
}

/**
 * Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres).
 *
 * `rs` yalnız moderasyondayken yazılır — başka sekmede taşınsaydı adres, o sekmede hiçbir şey
 * anlatmayan bir parametre taşırdı ve geri dönüşte "hangi yığındaydım" sorusu yanlış cevaplanırdı.
 */
export function feedbackUrl(state: FeedbackUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.tab === 'moderation' && state.rs !== DEFAULTS.rs) p.set('rs', state.rs);
  if (state.tab === 'scores' && state.sd !== DEFAULTS.sd) p.set('sd', state.sd);
  const qs = p.toString();
  return qs ? `${FEEDBACK_PATH}?${qs}` : FEEDBACK_PATH;
}

// BAŞKA ekranlardan buraya köprü (`admin-geri-bildirim.md §5`: Panel'in "N yorum onay bekliyor"
// uyarısı, Analitik'in ürün-ilgi sinyali) HENÜZ YOK. O ekranlar bağlantıyı kurduğunda `ticketsLink`
// gibi bir yardımcı burada doğar; bugün yazılsaydı çağıranı olmayan bir dışa verim olurdu (`knip`).
