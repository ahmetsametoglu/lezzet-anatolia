'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { CustomerChatButton } from '@/components/operation/ui/customer-chat-button';
import { chatContext } from '@/components/operation/ui/customer-channel-model';
import { ratingTone, signedCount, STACK_HINTS, trustLabel } from './feedback-labels';
import type { ScoreRowView } from '@/lib/feedback/moderation-read';
import type { CandidateCardView, ModerationCardView, PointsRowView } from './feedback-types';
import type { ReviewStack } from './feedback-url';

interface ModerationCardProps {
  card: ModerationCardView;
  stack: ReviewStack;
  pending: boolean;
  onModerate: (reviewId: string, to: 'approved' | 'rejected') => void;
}

/**
 * Metin kırpılmaz: karar metne bakılarak verilir, kesilmiş yorumu onaylamak okumadan onaylamaktır. Dil rozeti künyede, çünkü
 * yorumlar üç dilden gelir ve moderatör Almanca metni beklemeli.
 */
export function ModerationCard({ card, stack, pending, onModerate }: ModerationCardProps) {
  const { review } = card;
  // Yayındaki yorumun tek kararı geri çekmek, reddedilenin tek kararı yayınlamak: üç yığında iki düğme olsaydı biri daima anlamsız olurdu.
  const canApprove = stack !== 'approved';
  const canReject = stack !== 'rejected';

  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{card.productName}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {card.customerName ?? 'kimliksiz'}
            {review.orderId ? ' · doğrulanmış alışveriş' : ''} · {card.agoLabel}
            {review.language ? ` · ${review.language.toUpperCase()}` : ''}
          </span>
        </div>
        {/* Yıldızsız yorumda yıldız çizilmez: sıfır yıldız "bir puan verdi" diye okunurdu. */}
        {/* Yıldızın rengi puana bağlı: kötü puanlı yorum göze çarpmalı, moderatörün önce okuması gereken o. */}
        {card.stars ? (
          <span className={`flex-none font-ops-mono text-ops-base font-semibold ${ratingTone(review.rating)}`}>{card.stars}</span>
        ) : null}
      </div>

      {review.comment ? (
        <span className="whitespace-pre-wrap font-ops-body text-ops-sm leading-[1.6] text-ops-strong">{review.comment}</span>
      ) : null}

      <div className="flex items-center gap-2 border-t border-ops-line-soft pt-2">
        <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-muted">{STACK_HINTS[stack]}</span>
        {/* Kötü puan çoğu zaman şikâyettir ve cevabı yorumun altına değil müşterinin kendisine gider. Kimliksiz yorumda düğme yok. */}
        {review.customerId ? (
          <CustomerChatButton
            customerId={review.customerId}
            variant="button"
            context={chatContext('Yorumdan', [card.productName, review.rating ? `${review.rating}/5 puan` : null])}
          />
        ) : null}
        {/* `danger` (çerçeveli), `destructive` (dolu) değil: ret geri alınabilir, dolu kırmızı geri alınamayan işler için. */}
        {canReject ? (
          <Button variant="danger" size="sm" disabled={pending} onClick={() => onModerate(review.id, 'rejected')}>
            Reddet
          </Button>
        ) : null}
        {canApprove ? (
          <Button variant="primary" size="sm" disabled={pending} onClick={() => onModerate(review.id, 'approved')}>
            {stack === 'rejected' ? 'Yayınla' : 'Onayla'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ModerationEmpty({ stack }: { stack: ReviewStack }) {
  const text: Record<ReviewStack, { title: string; description: string }> = {
    // Boş kuyruk bir başarıdır, cümle de öyle kurulur.
    pending: { title: 'Bekleyen yorum yok', description: 'Gelen her yorum yayınlandı ya da karara bağlandı.' },
    approved: { title: 'Yayında yorum yok', description: 'Onaylanan yorumlar burada listelenir.' },
    rejected: { title: 'Reddedilen yorum yok', description: 'Reddedilen yorumlar burada durur; kararı geri almak için buradan yayınlanır.' },
  };
  return <EmptyState title={text[stack].title} description={text[stack].description} />;
}

/**
 * Ham beğeni ile güvenilirlik yan yana: yalnız ham sayı 40 savurma beğenisini 8 gerçek beğeniden büyük gösterir, yalnız ağırlık
 * kaç kişinin ilgilendiğini gizlerdi.
 */
export function CandidateRow({ card, onActivate }: { card: CandidateCardView; onActivate: (id: string) => void }) {
  const trust = trustLabel(card.signal.trust);

  return (
    <div className="flex items-center gap-3 rounded-ops-card border border-ops-line bg-ops-white px-4 py-3">
      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-ops-chip bg-ops-olive-bg font-ops-mono text-ops-sm font-semibold text-ops-olive-dark">
        {card.rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{card.productName}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {signedCount(card.identifiedLikeCount)} beğeni · güvenilirlik {trust.label}
        </span>
      </div>
      <span className="h-[7px] w-[120px] flex-none overflow-hidden rounded-ops-chip bg-ops-gray-100">
        <span className="block h-full bg-ops-olive" style={{ width: `${card.barPct}%` }} />
      </span>
      {/* Panonun tek eylemi: yüksek talepli adayı ürün yönetiminde etkinleştirmeye gitmek. */}
      <Button variant="primary" size="sm" onClick={() => onActivate(card.productId)}>
        Satışa aç →
      </Button>
    </div>
  );
}

export function PointsRow({ row, onAdjust }: { row: PointsRowView; onAdjust?: (customer: { id: string; name: string }) => void }) {
  return (
    <div className={`grid ${POINTS_GRID(Boolean(onAdjust))} items-center gap-x-2.5 border-b border-ops-line-soft px-6 py-3 last:border-b-0`}>
      <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{row.customerName}</span>
      <span className="text-right font-ops-mono text-ops-sm font-medium text-ops-ink">{row.balance}</span>
      {/* Sayım sebebe bakar (`reason='redemption'`), işarete değil: elle düşüm de negatiftir ve düzeltme ödül gibi görünürdü.
          Harcanan puan ikinci satırda, çünkü "kaç kez çevirdi" ile "ne kadar harcadı" ayrı sorular. */}
      <span className="flex flex-col items-center">
        <span className={`font-ops-mono text-ops-xs ${row.redemptionCount > 0 ? 'text-ops-olive-dark' : 'text-ops-faint'}`}>
          {row.redemptionCount > 0 ? `${row.redemptionCount} kupon` : '—'}
        </span>
        {row.spent < 0 ? <span className="font-ops-mono text-ops-micro text-ops-muted">{row.spent} puan</span> : null}
      </span>
      <span className="text-right font-ops-mono text-ops-xs text-ops-muted">{row.lastAgoLabel}</span>
      {/* Etiket "Geçmiş": pencere önce defteri gösterir; "Düzelt" yazsaydı yalnız görmek için bir yol kalmazdı. */}
      {onAdjust ? (
        <Button variant="secondary" size="sm" onClick={() => onAdjust({ id: row.customerId, name: row.customerName })}>
          Geçmiş
        </Button>
      ) : null}
    </div>
  );
}

/** Başlık ve satır aynı dizeyi kullanır: iki yerde yazılsaydı biri değişince başlıklar sessizce yanlış sütunun üstünde kalırdı. */
const POINTS_GRID = (withAction: boolean) =>
  withAction ? 'grid-cols-[minmax(120px,1fr)_88px_116px_88px_84px]' : 'grid-cols-[minmax(120px,1fr)_88px_116px_88px]';

/** Son kolonun başlığı yok: düğme sütununa ad vermek gürültü olurdu. */
export function PointsHeader({ withAction = false }: { withAction?: boolean }) {
  return (
    <div
      className={`grid ${POINTS_GRID(withAction)} gap-x-2.5 border-b border-ops-line bg-ops-subtle px-6 py-2.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.03em] text-ops-muted`}
    >
      <span>Müşteri</span>
      <span className="text-right">Bakiye</span>
      <span className="text-center">Kupona çevrim</span>
      <span className="text-right">Son</span>
      {withAction ? <span /> : null}
    </div>
  );
}

/** Not satırı tablonun en önemli parçası: 3 yorumla en kötü ürün damgası vurulmaz, örneklem küçükse not amber yazılır. */
const SCORE_GRID = 'grid-cols-[minmax(130px,1fr)_80px_96px_110px]';

export function ScoreHeader() {
  return (
    <div
      className={`grid ${SCORE_GRID} gap-x-2.5 border-b border-ops-line bg-ops-subtle px-6 py-2.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.04em] text-ops-muted`}
    >
      <span>Ürün</span>
      <span className="text-center">Skor</span>
      <span className="text-center">Beğeni</span>
      <span className="text-right">Sinyal</span>
    </div>
  );
}

export function ScoreRow({ row }: { row: ScoreRowView }) {
  const { score, signal, complaints } = row;

  // Sinyal skorun kendisi değil, "bu sayıya ne kadar güvenebilirim"in cevabıdır. Sıra önemli: önce az veri, sonra düşük güven
  // (hep aynı yöne savuran kaydırmalar), sonra güçlü.
  const trust = signal?.trust ?? null;
  const signalView = !score.confident
    ? { label: 'Az veri', tone: 'neutral' as const }
    : trust !== null && trustLabel(trust).label === 'düşük'
      ? { label: 'Düşük güven', tone: 'amber' as const }
      : { label: 'Güçlü', tone: 'olive' as const };

  // Şikâyet en sona ve amber yazılır: "az beğenilmiş" ile "sürekli bozuk geliyor" ayrı durumlardır ve skor tek başına ayıramaz.
  const voteCount = score.likeCount + score.dislikeCount;
  const parts = [score.ratingCount > 0 ? `${score.ratingCount} yorum` : null, voteCount > 0 ? `${voteCount} kaydırma` : null].filter(Boolean);
  const base = score.confident ? parts.join(' · ') : `${parts.join(' · ') || 'beyan yok'} · örneklem küçük`;
  const note = complaints ? `${base} · ${complaints.complaintCount} şikâyet` : base;
  const noteBad = !score.confident || Boolean(complaints);

  return (
    <div className={`grid ${SCORE_GRID} items-center gap-x-2.5 border-b border-ops-line-soft px-6 py-3 last:border-b-0`}>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{row.productName}</span>
        <span className={`truncate font-ops-body text-ops-xs ${noteBad ? 'text-ops-amber-dark' : 'text-ops-muted'}`}>{note}</span>
      </div>
      {/* Tip `null` diyor: "—" yazmak uydurma bir 0'dan iyi. */}
      <span className={`justify-self-center font-ops-mono text-ops-sm font-semibold ${ratingTone(score.average)}`}>
        {score.average === null ? '—' : score.average.toFixed(1).replace('.', ',')}
      </span>
      <span className="justify-self-center font-ops-mono text-ops-xs text-ops-body">{signedCount(score.likeCount - score.dislikeCount)}</span>
      <span className="justify-self-end">
        <Badge tone={signalView.tone}>{signalView.label}</Badge>
      </span>
    </div>
  );
}
