import { SwipeCard } from './components/swipe-card';
import { CloseLink, PointsChip, VoteButton } from './components/deck-chrome';
import type { DiscoverViewProps } from './discover-types';

/**
 * Keşif — masaüstü (`Musteri - Kesif.dc.html`, "Kesif Web": *"aynı mekanik, ortalanmış; klavye ←/→"*).
 *
 * **Yapı farkı gerçek, sapma değil:** mobilde başlık üç satırlık bir sütun ve düğmeler kartın
 * ALTINDA; web'de başlık tek satır ve düğmeler kartın İKİ YANINDA. Aynı mekanik, farklı diziliş —
 * cihaz çatalının tam olarak var olma sebebi (ADR Sapma 3).
 *
 * Klavye dinleyicisi burada DEĞİL, istemcide: kartı değiştiren fonksiyonun yanında durması gerekiyor
 * ve iki görünüm arasında kopyalanacak bir şey değil.
 */
export function DiscoverDesktop({ t, card, position, earned, signedIn, onVote, busy }: DiscoverViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center bg-olive-bg px-10 py-10">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between">
          <CloseLink t={t} />
          <span className="font-serif text-h2-sm text-ink">
            {t.title} · {t.counter.replace('{index}', String(position.index)).replace('{total}', String(position.total))}
          </span>
          <PointsChip t={t} earned={earned} signedIn={signedIn} />
        </div>

        <p className="max-w-[520px] text-center font-sans text-body-sm leading-relaxed text-body">{t.framing}</p>

        {/* Düğmeler kartın İKİ YANINDA (tasarım) — mobilde kartın altında yan yana. Aralarında
            "Atla" etiketi yok: burada aralarında kartın kendisi var. */}
        <div className="flex items-center gap-7">
          <VoteButton t={t} kind="dislike" onVote={onVote} busy={busy} compact={false} />
          <div className="w-[400px]">
            <SwipeCard card={card} onVote={onVote} busy={busy} compact={false} />
          </div>
          <VoteButton t={t} kind="like" onVote={onVote} busy={busy} compact={false} />
        </div>

        <p className="font-sans text-note text-muted">{t.hintDesktop}</p>
      </div>
    </div>
  );
}
