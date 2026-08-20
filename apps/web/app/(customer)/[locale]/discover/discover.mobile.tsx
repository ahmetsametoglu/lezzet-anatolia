import { SwipeCard } from './components/swipe-card';
import { CloseLink, PointsChip, VoteRow } from './components/deck-chrome';
import type { DiscoverViewProps } from './discover-types';

/**
 * Keşif — **mobil, tasarımın BİRİNCİL biçimi** (`Musteri - Kesif.dc.html`, "Kesif Mobil").
 *
 * Sıra tasarımdan: başlık (kapat · ad+sayaç · puan) → çerçeve cümlesi → kart → düğmeler → ipucu.
 * Zemin `olive-bg`: keşif vitrinden ayrı bir alan, tasarım onu yeşil bir yüzeye oturtuyor.
 */
export function DiscoverMobile({ t, card, position, earned, signedIn, onVote, busy }: DiscoverViewProps) {
  return (
    <div className="flex flex-1 flex-col bg-olive-bg pb-5">
      <header className="flex items-center justify-between px-4 py-3">
        <CloseLink t={t} />
        <div className="flex flex-col items-center">
          <span className="font-serif text-card-title-sm text-ink">{t.title}</span>
          <span className="font-sans text-micro text-muted">
            {t.counter.replace('{index}', String(position.index)).replace('{total}', String(position.total))}
          </span>
        </div>
        {/* Ziyaretçi daveti başlık SATIRINA SIĞMAZ (ölçüldü 20.08: üç satırlık kutu "Découverte"
            başlığının üstüne biniyordu — FR/DE metin dar ekranda uzun). Girişlide kısa çip satırda
            kalır; ziyaretçide yer ayrılır, davet başlığın ALTINDA kendi satırını alır. */}
        {signedIn ? <PointsChip t={t} earned={earned} signedIn={signedIn} /> : <span className="w-10 flex-none" aria-hidden="true" />}
      </header>
      {!signedIn && (
        <div className="flex justify-center px-4 pb-2">
          <PointsChip t={t} earned={earned} signedIn={signedIn} />
        </div>
      )}

      {/* Çerçeve cümlesi kartın ÜSTÜNDE: "bunlar satılık değil" bilgisi karta bakılmadan önce
          verilmeli, sonra verilseydi müşteri fiyat aramış olurdu (tasarım §6). */}
      <p className="px-5 pb-1 text-center font-sans text-note leading-relaxed text-body">{t.framing}</p>

      <div className="px-5 py-3">
        <SwipeCard card={card} onVote={onVote} busy={busy} compact />
      </div>

      <VoteRow t={t} onVote={onVote} busy={busy} />

      <p className="px-6 pt-4 text-center font-sans text-micro text-muted">{t.hintMobile}</p>
    </div>
  );
}
