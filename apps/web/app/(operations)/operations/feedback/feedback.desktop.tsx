'use client';

import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { CandidateRow, ModerationCard, ModerationEmpty, PointsHeader, PointsRow, ScoreHeader, ScoreRow } from './feedback-sections';
import { FEEDBACK_TABS, FEEDBACK_TAB_LABELS, REVIEW_STACK_LABELS, REVIEW_STACKS, SCORE_DIRECTION_LABELS, SCORE_DIRECTIONS } from './feedback-url';
import type { FeedbackViewProps } from './feedback-client';

/**
 * Geri Bildirim — web (17.1 · 17.3 · 17.4).
 *
 * TEK SÜTUN, SEKMELİ (çizim): dört iş aynı ekranda ama aynı anda değil. İki sütuna bölmek yanlış
 * olurdu — moderasyon ile puan yönetimi arasında bağlam paylaşımı yok, yan yana durmaları yalnız
 * ikisini de daraltırdı.
 *
 * Başlık alt satırı ÇİZİMİN kendi cümlesi: bekleyen yorum + yüksek talepli aday. İkisi de "bugün
 * seni bekleyen iş" ölçüsü, ve ikisi de sekme değiştirmeden görünür.
 */
export function FeedbackDesktop({
  data,
  urlState,
  busy,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  onTab,
  onStack,
  onModerate,
  onAdjustPoints,
  onActivate,
  onScoreDirection,
}: FeedbackViewProps) {
  const { moderation, scores, candidates, points, pendingCount } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Geri Bildirim"
        // Çizimin alt satırı İKİ SAYI taşıyor ("5 yorum onay bekliyor · 3 yüksek talepli aday").
        // Bir tur boyunca ikinci sayının yerinde sabit bir cümle duruyordu — `PageHeader`'ın kendi
        // künyesi "alt satır bir slogan değil SAYI" diyor ve o satır slogana dönmüştü.
        subtitle={`${pendingCount} yorum onay bekliyor · ${data.highDemandCount} yüksek talepli aday`}
      />

      <Tabs
        items={FEEDBACK_TABS.map((key) => ({
          key,
          label: FEEDBACK_TAB_LABELS[key],
          // Rozet YALNIZ moderasyonda: "senden bir şey bekleniyor" demek (Tabs künyesi). Aday
          // panosuna sayı koymak onu da bir borç gibi gösterirdi, oysa orası bir fırsat listesi.
          badge: key === 'moderation' ? pendingCount : null,
        }))}
        active={urlState.tab}
        onSelect={onTab}
      />

      {error ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-6 py-2.5 font-ops-body text-ops-sm text-ops-red-dark">{error}</div>
      ) : null}

      {urlState.tab === 'moderation' && moderation ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-ops-line px-6 py-2.5">
            <MultiToggle
              label="Moderasyon yığını"
              value={urlState.rs}
              options={REVIEW_STACKS.map((key) => ({ key, label: REVIEW_STACK_LABELS[key] }))}
              onChange={onStack}
              size="sm"
            />
            {/* Buradaki ipucu cümlesi KALDIRILDI: her kartın altında `STACK_HINTS` zaten "metin
                düzenlenmez" diyordu, yani aynı cümle ekranda satır sayısı kadar tekrar ediyordu.
                Çizimde de yalnız kart içindeki var. */}
          </div>

          {moderation.rows.length === 0 ? (
            <ModerationEmpty stack={urlState.rs} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
              {moderation.rows.map((card) => (
                <ModerationCard key={card.review.id} card={card} stack={urlState.rs} pending={busy} onModerate={onModerate} />
              ))}
              {/* Kuyruk veriyle büyür → keyset + nöbetçi (CLAUDE.md §1). `nextCursor` üretip
                  tüketmemek, listenin kuyruğunu sessizce yutmak olurdu. */}
              <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            </div>
          )}
        </div>
      ) : null}

      {urlState.tab === 'scores' && scores ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-ops-line px-6 py-2.5">
            <MultiToggle
              label="Sıralama yönü"
              value={urlState.sd}
              options={SCORE_DIRECTIONS.map((key) => ({ key, label: SCORE_DIRECTION_LABELS[key] }))}
              onChange={onScoreDirection}
              size="sm"
            />
          </div>
          {scores.length === 0 ? (
            <EmptyState
              title="Skorlanacak ürün yok"
              description="Skor yalnız onaylı yorumu ya da beğenisi olan üründe oluşur; ilk yorumlar yayınlandıkça tablo dolar."
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <ScoreHeader />
              {scores.map((row) => (
                <ScoreRow key={row.productId} row={row} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {urlState.tab === 'candidates' && candidates ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Stokta olmayan aday ürünler, keşif beğenilerine göre sıralı. Güvenilirlik kaydırmanın niteliğini söyler — çok beğeni her zaman
            güçlü sinyal değildir.
          </span>
          {candidates.length === 0 ? (
            <EmptyState
              title="Aday ürün talebi yok"
              description="Keşif bölümünde henüz yeterli kaydırma birikmedi; pano ilk beğenilerle dolmaya başlar."
            />
          ) : (
            candidates.map((card) => <CandidateRow key={card.productId} card={card} onActivate={onActivate} />)
          )}
        </div>
      ) : null}

      {urlState.tab === 'points' && points ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Çizimin üst barı: açıklama + SAĞDA tek koyu düğme. Bir tur boyunca düğme satır içine
              taşınmıştı ("Düzelt", 5. kolon) ve tablo çizimde olmayan bir kolon kazanmıştı; karar
              savunulabilirdi ama çizim başka söylüyordu ve kayda da geçmemişti. */}
          <div className="flex items-center gap-3 border-b border-ops-line-soft px-6 py-2.5">
            <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-muted">
              Puan yalnız son tüketici içindir (B2C). Kurallar Ayarlar'da; burası bakiye ve hareket.
            </span>
            {/* BEKLEYEN(17.1): çizimdeki "Elle puan düzelt" düğmesi buraya gelecek (design/BACKLOG,
                "Geri Bildirim — sapmalar", madde 4).
                Üst bardan açılan pencere müşteriyi KENDİ sormalı (çizimde bir seçici var) ve o
                seçici `searchCustomerOptions` üzerinden ayrı bir tur işi; düğmeyi müşterisiz
                bağlamak, basıldığında kime puan yazacağını bilmeyen bir pencere açardı. Bugün
                düzeltme satırdan açılıyor — kayıtlı sapma. */}
          </div>
          {points.length === 0 ? (
            <EmptyState title="Puan bakiyesi olan müşteri yok" description="Yorum, kaydırma ve siparişlerden puan biriktikçe liste dolar." />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <PointsHeader withAction />
              {points.map((row) => (
                <PointsRow key={row.customerId} row={row} onAdjust={onAdjustPoints} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
