import { DEFAULT_PAGE_SIZE, resolveLocalizedText } from '@lezzet/types';
import { ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { guarded, requireAdmin } from '@/lib/guard';
import { detectDevice } from '@/lib/device';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { agoShort } from '@/components/operation/ui/format';
import { listModerationQueue, listRankedScores } from '@/lib/feedback/moderation-read';
import { countPendingReviews, listCandidateDemand } from '@/lib/feedback/product-feedback';
import { listTopPointsBalances } from '@/lib/feedback/points';
import { FeedbackClient } from './feedback-client';
import { toCandidateCards, toModerationCards, toPointsRows } from './feedback-read';
import { trustLabel } from './feedback-labels';
import { parseFeedbackUrl } from './feedback-url';
import type { FeedbackData } from './feedback-types';

// Geri Bildirim (17.1 · 17.3 · 17.4) — yorum moderasyonu, aday ürün talebi, sadakat puanı.
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// `admin-geri-bildirim.md §1`. Yayına çıkacak müşteri metnine karar vermek ve bir müşterinin
// puanını elle oynatmak yönetim işidir; depo ve kurye görmez.
//
// ── YALNIZ AÇIK SEKME OKUNUR ─────────────────────────────────────────────────
// Dördü ayrı sorgu kümesi. Hepsini birden okumak, moderasyon yapan operatöre hiç bakmayacağı iki
// okuma maliyeti çıkarırdı. Sekme adreste durduğu için (`feedback-url`) sunucu hangisini okuyacağını
// zaten biliyor. Bekleyen sayacı bunun DIŞINDA: sekme rozeti her hâlde görünür, tek `count` sorgusu.
//
// ── SKOR SIRALAMASI DB'DE, YENİDEN SIRALAMA MOTORDA ──────────────────────────
// `ProductRatingService.listRanked` görünümü YILDIZ ORTALAMASINA göre sıralıyor; ekranda gösterilen
// birleşik skor ise motorda hesaplanıyor (yıldız + beğeni oranı, sayı-ağırlıklı). İkisi aynı şey
// olmadığı için liste alındıktan sonra motorun skoruyla yeniden sıralanıyor (`listRankedScores`).
//
// Bu sekme bir tur boyunca "kapı yok" gerekçesiyle ÇIKARILMIŞTI. Kapı vardı — `listRanked`, üstelik
// künyesinde bu ekranı ("operasyon skor tablosu") adıyla anarak. Envantere bakmadan "yok" demenin
// bu turdaki ikinci örneğiydi (ilki `violet` token'ıydı) ve bedeli daha ağır oldu: eksik bir
// yetenek değil, VAR OLAN bir yetenek silindi ve üstüne gereksiz bir arka uç talebi açıldı.

interface FeedbackPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Geri Bildirim"
        reason="Müşteri yorumlarının yayın kararı ve puan düzeltmeleri yönetime açıktır. Bir yorumun yayınlanması gerekiyorsa yöneticiye ürün adıyla bildirin."
      />
    );
  }

  const urlState = parseFeedbackUrl(await searchParams);
  const device = await detectDevice();

  // Tek an, tüm yaşlar: kartların ve puan satırlarının yaşı aynı `now`'a göre hesaplanır — ayrı
  // okunsaydı aynı damga iki blokta farklı yaş gösterirdi.
  const now = Date.now();
  const data: FeedbackData = { moderation: null, scores: null, candidates: null, points: null, pendingCount: 0, highDemandCount: 0 };

  /**
   * Başlığın iki sayısı HER sekmede okunur (çizim: "5 yorum onay bekliyor · 3 yüksek talepli aday").
   *
   * Aday sayısı için pano zaten okunuyor ama yalnız o sekmede; başlık her sekmede gerektiği için
   * ayrıca sayılıyor. İki okuma değil bir okuma: `listCandidateDemand` her hâlde çağrılıyor ve
   * sekme aday panosuysa aynı sonuç yeniden kullanılıyor.
   */
  const candidateRows = await listCandidateDemand();

  /**
   * **SATIŞA AÇILAN ADAY PANODAN DÜŞER** (kullanıcı bildirimi, 03.08).
   *
   * Kapı kaydırmaları `context='candidate'` diye süzüyor — yani kaydırmanın hangi ekranda
   * yapıldığını. Ürünün BUGÜNKÜ durumunu sormuyor ve soramaz da: kaydırma kaydı kalıcıdır, ürün
   * satışa açılınca silinmez. Süzgeç konmazsa açılan ürün panoda kalır, üstelik en çok beğeni alan
   * olduğu için TEPEDE kalır — operatör "Satışa aç" der, döner, aynı ürünü yine ilk sırada görür ve
   * panonun tek sorusu ("sırada hangi ürünü getirmeliyim") kendi cevabıyla tıkanır.
   *
   * Ürünü SİLMİYORUZ, yalnız panodan düşürüyoruz: kaydırmalar ürün skoruna beslenmeye devam eder
   * (`product_rating`), çünkü o beğeniler gerçekten yapıldı ve ürün artık satıştaysa da geçerli.
   */
  const candidateProducts = await new ProductService(serviceDb()).listByIds(candidateRows.map((r) => r.productId));
  const stillCandidate = new Set(candidateProducts.filter((p) => p.status === 'candidate').map((p) => p.id));
  // Eşik `trustLabel`'dan okunuyor, burada YENİDEN yazılmıyor: "yüksek"in sınırı bir sunum kararı ve
  // tek yerde durmalı — iki kopya bir gün ayrışır, başlık "3 yüksek" derken pano iki tane gösterir.
  data.highDemandCount = candidateRows.filter((r) => stillCandidate.has(r.productId) && trustLabel(r.signal.trust).label === 'yüksek').length;

  if (urlState.tab === 'moderation') {
    const [page, pending] = await Promise.all([
      listModerationQueue(urlState.rs, undefined, DEFAULT_PAGE_SIZE),
      countPendingReviews(),
    ]);
    data.moderation = { rows: toModerationCards(page.rows, now, agoShort), nextCursor: page.nextCursor };
    data.pendingCount = pending;
  } else {
    data.pendingCount = await countPendingReviews();

    if (urlState.tab === 'scores') {
      data.scores = await listRankedScores(urlState.sd);
    }

    if (urlState.tab === 'candidates') {
      // Ürünler YUKARIDA bir kez çekildi (durum süzgeci için) — adlar da oradan. İkinci bir
      // `listByIds` aynı satırları ikinci kez okurdu.
      const names = new Map(candidateProducts.map((p) => [p.id, resolveLocalizedText(p.name)]));
      data.candidates = toCandidateCards(candidateRows.filter((r) => stillCandidate.has(r.productId)), names);
    }

    if (urlState.tab === 'points') {
      const balances = await listTopPointsBalances();
      const profiles = await new UserProfileService(serviceDb()).listByIds(balances.map((b) => b.customerId));
      const names = new Map(profiles.map((p) => [p.id, p.name || p.phone || p.email || '']));
      data.points = toPointsRows(balances, names, now, agoShort);
    }
  }

  return <FeedbackClient data={data} device={device} urlState={urlState} />;
}
