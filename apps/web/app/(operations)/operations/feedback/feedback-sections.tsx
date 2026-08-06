'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { ratingTone, signedCount, STACK_HINTS, trustLabel } from './feedback-labels';
import type { ScoreRowView } from '@/lib/feedback/moderation-read';
import type { CandidateCardView, ModerationCardView, PointsRowView } from './feedback-types';
import type { ReviewStack } from './feedback-url';

// Geri Bildirim ekranının paylaşılan parçaları — sekme panelleri bunları çizer; kararın kendisi
// burada tek yerde durur.

interface ModerationCardProps {
  card: ModerationCardView;
  stack: ReviewStack;
  pending: boolean;
  onModerate: (reviewId: string, to: 'approved' | 'rejected') => void;
}

/**
 * Bir yorumun moderasyon kartı.
 *
 * **Metin en görünür yerde ve KIRPILMIYOR.** Karar metne bakılarak veriliyor; üç satırda kesilmiş
 * bir yorumu onaylamak, okumadan onaylamaktır. Uzun yorum kartı uzatır — kuyruk zaten kaydırmalı.
 *
 * **Dil rozeti künyede** (`TR · FR · DE`): yorumlar üç dilden geliyor (§7) ve moderatör Almanca bir
 * metinle karşılaştığında bunu şaşırarak değil, bekleyerek görmeli.
 */
export function ModerationCard({ card, stack, pending, onModerate }: ModerationCardProps) {
  const { review } = card;
  // Yayındaki bir yorumun tek kararı GERİ ÇEKMEK, reddedilenin tek kararı YAYINLAMAK. Üç yığında da
  // iki düğme çizilseydi biri daima anlamsız olurdu ("onaylanmışı onayla").
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
        {/* Yıldızsız yorum da moderasyona girer (yalnız metin yazılmış olabilir) — o zaman hiç
            yıldız çizilmez; sıfır yıldız göstermek "bir puan verdi" diye okunurdu. */}
        {/* Yıldızın RENGİ puana bağlı (çizim: ≥4 olive · 3 amber · altı kırmızı). Sabit bir renk
            kuyruğu tararken en önemli sinyali yutuyordu: kötü puanlı yorum göze çarpmalı, çünkü
            moderatörün önce okuması gereken o. */}
        {card.stars ? (
          <span className={`flex-none font-ops-mono text-ops-base font-semibold ${ratingTone(review.rating)}`}>{card.stars}</span>
        ) : null}
      </div>

      {review.comment ? (
        <span className="whitespace-pre-wrap font-ops-body text-ops-sm leading-[1.6] text-ops-strong">{review.comment}</span>
      ) : null}

      <div className="flex items-center gap-2 border-t border-ops-line-soft pt-2">
        <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-muted">{STACK_HINTS[stack]}</span>
        {/* `danger` (çerçeveli kırmızı), `destructive` (dolu) DEĞİL: ret geri alınabilir bir karar —
            reddedilen yorum duruyor ve yeniden yayınlanabilir. Dolu kırmızı, geri alınamayan işler
            için ayrıldı. */}
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

/** Moderasyon kuyruğunun boş hâli — yığına göre ayrı cümle. */
export function ModerationEmpty({ stack }: { stack: ReviewStack }) {
  const text: Record<ReviewStack, { title: string; description: string }> = {
    // Boş kuyruk bir başarıdır, bir eksiklik değil — cümle de öyle kurulur (`§4`).
    pending: { title: 'Bekleyen yorum yok', description: 'Gelen her yorum yayınlandı ya da karara bağlandı.' },
    approved: { title: 'Yayında yorum yok', description: 'Onaylanan yorumlar burada listelenir.' },
    rejected: { title: 'Reddedilen yorum yok', description: 'Reddedilen yorumlar burada durur; kararı geri almak için buradan yayınlanır.' },
  };
  return <EmptyState title={text[stack].title} description={text[stack].description} />;
}

/**
 * Aday panosunun bir satırı — sıra · ad · beğeni · güvenilirlik · çubuk.
 *
 * **Ham beğeni ile güvenilirlik YAN YANA duruyor** ve ayrı okunuyor (DOMAIN §14). Yalnız ham sayı
 * gösterilseydi 40 savurma beğenisi 8 gerçek beğeniden büyük görünürdü; yalnız ağırlık gösterilseydi
 * operatör kaç kişinin ilgilendiğini hiç bilemezdi. Karar ikisinin arasında.
 */
export function CandidateRow({ card, onActivate }: { card: CandidateCardView; onActivate: (id: string) => void }) {
  const trust = trustLabel(card.signal.trust);

  // Bir tur boyunca burada bir `Badge` daha vardı ve alt satırın söylediğini ("güvenilirlik yüksek")
  // ikinci kez söylüyordu. Çizimde rozet YOK — çizimin rozeti *Ürün skorları* tablosunun `Sinyal`
  // kolonuydu, aday satırının değil. Uydurulmuş bir öğe, üstelik tekrar eden bir bilgi.
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
      {/* Panonun TEK eylemi (çizim + `admin-geri-bildirim.md §3`): yüksek talepli adayı ürün
          yönetiminde etkinleştirmeye gitmek. Bir tur boyunca `onActivate` opsiyoneldi ve
          hiçbir yerden geçilmiyordu — yani düğme hiç çizilmedi, pano da okunacak ama üzerine
          hiçbir şey yapılamayacak bir listeye dönüştü. Artık zorunlu. */}
      <Button variant="primary" size="sm" onClick={() => onActivate(card.productId)}>
        Satışa aç →
      </Button>
    </div>
  );
}

/**
 * Puan tablosunun bir satırı.
 *
 * **"Çevrilen" kolonu kupon SAYISI değil, çevrilen PUAN.** Çizim "2 kupon" diyor ama defter kaç
 * kupon çıktığını taşımıyor; bugünkü veri harcanan puanın toplamı (`spent`). Sayıyı uydurmaktansa
 * elde olanı doğru adıyla göstermek yeğdir — kupon sayısı arka uçtan istendi.
 */
export function PointsRow({ row, onAdjust }: { row: PointsRowView; onAdjust?: (customerId: string, customerName: string) => void }) {
  return (
    <div className={`grid ${POINTS_GRID(Boolean(onAdjust))} items-center gap-x-2.5 border-b border-ops-line-soft px-6 py-3 last:border-b-0`}>
      <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{row.customerName}</span>
      <span className="text-right font-ops-mono text-ops-sm font-medium text-ops-ink">{row.balance}</span>
      {/* Çizimin istediği "2 kupon" — SAYI, harcanan puan değil (04.08, `redemptionCount` geldi).
          Sayım sebebe bakıyor (`reason='redemption'`), işarete değil: elle yapılan bir düşüm de
          negatiftir ve işaretle sayılsaydı operatörün düzeltmesi müşterinin ödülü gibi görünürdü.
          Harcanan puan ikinci satırda kalıyor — ikisi ayrı sorular ("kaç kez çevirdi" · "ne kadar
          harcadı") ve çizimin kolon başlığı birinciyi soruyor. */}
      <span className="flex flex-col items-center">
        <span className={`font-ops-mono text-ops-xs ${row.redemptionCount > 0 ? 'text-ops-olive-dark' : 'text-ops-faint'}`}>
          {row.redemptionCount > 0 ? `${row.redemptionCount} kupon` : '—'}
        </span>
        {row.spent < 0 ? <span className="font-ops-mono text-ops-micro text-ops-muted">{row.spent} puan</span> : null}
      </span>
      <span className="text-right font-ops-mono text-ops-xs text-ops-muted">{row.lastAgoLabel}</span>
      {/* Etiket "Geçmiş" — pencere önce defteri gösteriyor, düzeltme onun altında. "Düzelt"
          yazsaydı operatör yalnız değiştirmek istediğinde tıklardı ve GÖRMEK için bir yol kalmazdı;
          oysa asıl eksik olan görmekti. */}
      {onAdjust ? (
        <Button variant="secondary" size="sm" onClick={() => onAdjust(row.customerId, row.customerName)}>
          Geçmiş
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Puan tablosunun ızgarası — başlık ve satır AYNI dizeyi kullanır.
 *
 * İki yerde elle yazılsaydı biri değiştiğinde kolonlar kayardı ve bu kayma sessiz olurdu: tablo
 * "çalışıyor" görünür, yalnız başlıklar yanlış sütunun üstünde durur.
 */
const POINTS_GRID = (withAction: boolean) =>
  withAction ? 'grid-cols-[minmax(120px,1fr)_88px_116px_88px_84px]' : 'grid-cols-[minmax(120px,1fr)_88px_116px_88px]';

/** Puan tablosunun başlığı. Son kolonun başlığı YOK — düğme sütununa ad vermek gürültü olurdu. */
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

/**
 * SKOR TABLOSU — çizimin dört kolonu: Ürün · Skor · Beğeni · Sinyal.
 *
 * **Not satırı çizimin en önemli parçası** ("128 yorum" · "3 yorum · örneklem küçük" · "beğeni
 * yüksek, güven düşük"): tasarımın kuralı *"3 yorumla en kötü ürün damgası vurulmaz"* ve motor bunu
 * `confident` ile zaten söylüyor. Örneklem küçükse not amber yazılır — sayı aynı sayıdır ama okuyan
 * ona farklı güvenmelidir.
 */
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

  /**
   * SİNYAL, SKORUN KENDİSİ DEĞİL — "bu sayıya ne kadar güvenebilirim" sorusunun cevabı.
   *
   * Üç hâl, üç ayrı sebep ve sırası ÖNEMLİ:
   *  1. **Az veri** — örneklem küçük (`confident:false`). Hiçbir şey söylenemez, önce bu.
   *  2. **Düşük güven** — veri var ama kaydırmalar güvenilmez (`trust` düşük): hep aynı yöne
   *     savuran, kartta hiç durmayan hareketler (DOMAIN §14). Çizimin notu bunu birebir söylüyor:
   *     *"beğeni yüksek, güven düşük"*.
   *  3. **Güçlü** — ikisi de değil.
   *
   * Bir tur boyunca 2. hâlin yerinde `likeRatio < 0.5` vardı ve bu bir MANTIK hatasıydı: düşük
   * beğeni oranı ürünün sevilmediğidir, ölçümün güvenilmezliği değil — ve o bilgi zaten `Skor`
   * kolonunda duruyordu. Kolon komşusunu yanlış bir adla tekrar ediyordu. Gerçek ölçü arka uçtan
   * geldi (`getProductSignals`, 04.08) ve eksen artık gerçekten üçüncü bir eksen.
   */
  const trust = signal?.trust ?? null;
  const signalView = !score.confident
    ? { label: 'Az veri', tone: 'neutral' as const }
    : trust !== null && trustLabel(trust).label === 'düşük'
      ? { label: 'Düşük güven', tone: 'amber' as const }
      : { label: 'Güçlü', tone: 'olive' as const };

  /**
   * Not satırı — beyanın bileşimi, üstüne varsa ŞİKÂYET.
   *
   * Şikâyet en sona ve amber yazılıyor çünkü tablonun en ağır bilgisi o: "az beğenilmiş" ile
   * "sürekli bozuk geliyor" farklı iki durumdur ve skor tek başına ikisini ayıramaz. Çizimin
   * *"şikâyet + düşük skor birleşiyor"* satırı tam olarak bu birleşimi görünür kılmak içindi.
   */
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
      {/* Skoru olmayan satır buraya düşmez (`product_rating` yalnız beyanı olan ürün için satır
          üretir), ama tip `null` diyor ve ekran ona uymak zorunda: "—" yazmak, uydurma bir 0'dan iyi. */}
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
