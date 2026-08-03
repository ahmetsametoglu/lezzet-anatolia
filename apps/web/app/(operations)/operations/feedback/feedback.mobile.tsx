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
 * Geri Bildirim — mobil (17.1 · 17.3 · 17.4).
 *
 * **Telefon önceliği moderasyondadır** (`admin-geri-bildirim.md §7`): yorum onayı tipik "boş anda
 * iki dakika" işidir. O yüzden kartlar burada daha sık (`compact`), düğmeler tam genişlikte ve
 * kuyruk tek sütun akıyor.
 *
 * Aday panosu telefonda **okunur ama satışa açılmaz**: "Satışa aç" ürün yönetimine giden bir karar
 * ve o ekran telefonda yok — düğmeyi çizmek, basıldığında hiçbir yere götürmeyen bir vaat olurdu
 * (çizim de mobil panoda o düğmeyi göstermiyor).
 *
 * Puan tablosu da okunur; elle düzeltme masaüstünde kalır (dört alanlı bir form, telefonda kararı
 * zorlaştırır ve bu iş acele edilecek bir iş değil).
 */
export function FeedbackMobile({ data, urlState, busy, error, hasMore, loadingMore, onLoadMore, onTab, onStack, onModerate, onActivate, onScoreDirection }: FeedbackViewProps) {
  const { moderation, scores, candidates, points, pendingCount } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Geri Bildirim" subtitle={`${pendingCount} onay bekliyor · ${data.highDemandCount} güçlü aday`} />

      <Tabs
        items={FEEDBACK_TABS.map((key) => ({
          key,
          label: FEEDBACK_TAB_LABELS[key],
          badge: key === 'moderation' ? pendingCount : null,
        }))}
        active={urlState.tab}
        onSelect={onTab}
        className="overflow-x-auto"
      />

      {error ? (
        <div className="border-b border-ops-red-line bg-ops-red-bg px-4 py-2 font-ops-body text-ops-sm text-ops-red-dark">{error}</div>
      ) : null}

      {urlState.tab === 'moderation' && moderation ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-ops-line px-4 py-2.5">
            <MultiToggle
              label="Moderasyon yığını"
              value={urlState.rs}
              options={REVIEW_STACKS.map((key) => ({ key, label: REVIEW_STACK_LABELS[key] }))}
              onChange={onStack}
              size="sm"
              className="w-full"
            />
          </div>

          {moderation.rows.length === 0 ? (
            <ModerationEmpty stack={urlState.rs} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
              {moderation.rows.map((card) => (
                <ModerationCard key={card.review.id} card={card} stack={urlState.rs} pending={busy} onModerate={onModerate} compact />
              ))}
              <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            </div>
          )}
        </div>
      ) : null}

      {urlState.tab === 'scores' && scores ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-ops-line px-4 py-2.5">
            <MultiToggle
              label="Sıralama yönü"
              value={urlState.sd}
              options={SCORE_DIRECTIONS.map((key) => ({ key, label: SCORE_DIRECTION_LABELS[key] }))}
              onChange={onScoreDirection}
              size="sm"
              className="w-full"
            />
          </div>
          {scores.length === 0 ? (
            <EmptyState title="Skorlanacak ürün yok" description="Skor yalnız onaylı yorumu ya da beğenisi olan üründe oluşur." />
          ) : (
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
              <div className="min-w-[420px]">
                <ScoreHeader />
                {scores.map((row) => (
                  <ScoreRow key={row.productId} row={row} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {urlState.tab === 'candidates' && candidates ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          {candidates.length === 0 ? (
            <EmptyState title="Aday ürün talebi yok" description="Keşif bölümünde henüz yeterli kaydırma birikmedi." />
          ) : (
            candidates.map((card) => <CandidateRow key={card.productId} card={card} onActivate={onActivate} compact />)
          )}
        </div>
      ) : null}

      {urlState.tab === 'points' && points ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-auto">
          {points.length === 0 ? (
            <EmptyState title="Puan bakiyesi olan müşteri yok" description="Yorum, kaydırma ve siparişlerden puan biriktikçe liste dolar." />
          ) : (
            // Tablo dar ekranda KENDİ İÇİNDE kayar (`min-w`): satırı sıkıştırmak bakiyeyi okunmaz
            // yapardı ve bu ekranın tek sayısal karşılaştırması o.
            <div className="min-w-[420px]">
              <PointsHeader />
              {points.map((row) => (
                <PointsRow key={row.customerId} row={row} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
