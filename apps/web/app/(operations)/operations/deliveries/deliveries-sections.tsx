'use client';

import Link from 'next/link';
import { navigationLink } from '@lezzet/domain-core';
import type { CourierStop } from '@/lib/courier/day';
import { Badge } from '@/components/operation/ui/badge';
import { money, num } from '@/components/operation/ui/format';
import { isSettled, METHOD_LABEL, NOTES, OUTCOME_VIEW } from './deliveries-labels';

// Kurye gününün blokları — iki cihaz görünümü de buradan besleniyor.

/**
 * **Gün ilerlemesi** — kaç durak bitti, ne kadar para birikti.
 *
 * Tahsilat toplamı güne EŞLİK ediyor (tasarım §2: "kapanışta sürpriz olmaz"): kurye akşam kasayı
 * sayarken beklenen tutarı ilk kez görmemeli. Yalnız **kapıda ödenecek** duraklar toplanıyor —
 * önceden ödenmiş sipariş kuryenin eline hiç girmiyor, toplama katılsaydı kasa fazla görünürdü.
 */
export function DayProgress({ stops }: { stops: CourierStop[] }) {
  const done = stops.filter((stop) => isSettled(stop.outcome)).length;
  const collected = stops
    .filter((stop) => stop.outcome === 'delivered')
    .reduce((sum, stop) => sum + (stop.payment.dueAmountCents ?? 0), 0);
  const expected = stops.reduce((sum, stop) => sum + (stop.payment.dueAmountCents ?? 0), 0);

  return (
    <div className="flex items-stretch gap-4 border-b border-ops-line-soft bg-ops-surface-sunken px-4 py-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Durak
        </span>
        <span className="font-ops-mono text-ops-title tracking-tight text-ops-ink">
          {num(done)}/{num(stops.length)}
        </span>
      </div>
      {expected > 0 ? (
        <div className="flex flex-1 flex-col gap-0.5 border-l border-ops-line-soft pl-4">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
            Toplanan
          </span>
          <span className="whitespace-nowrap font-ops-mono text-ops-title tracking-tight text-ops-ink">
            {money(collected)}
          </span>
          <span className="font-ops-mono text-ops-micro text-ops-faint">{money(expected)} beklenen</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Durak kartı — kuryenin kapıdaki tek bakışı.
 *
 * Sıra tasarımın kendi önceliği: önce NEREYE (adres), sonra KİME (müşteri + kanal), sonra PARA,
 * en sonda araçtan alınacak koli. Para yukarıda olsaydı "ödendi" kapılarında da göz oraya kayardı;
 * oysa orada konuşulacak para yok.
 */
export function StopCard({ stop }: { stop: CourierStop }) {
  const view = OUTCOME_VIEW[stop.outcome];
  const due = stop.payment.dueAmountCents;
  const settled = isSettled(stop.outcome);

  return (
    <li
      className={`flex flex-col gap-2 border-b border-ops-line-soft px-4 py-3 ${settled ? 'bg-ops-surface-sunken/40' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Sıra numarası SUNUCUDAN gelir (11.9) — dizi indeksinden DEĞİL. Eskiden `index + 1`
            yazılıyordu ve o sayı rota sırası değil siparişin verilme sırasıydı; ekran olmayan bir
            yeteneği ima ediyordu. `null` = sıra bilinmiyor → nokta, çünkü numara uydurulmaz. */}
        <span className="mt-0.5 shrink-0 font-ops-mono text-ops-sm text-ops-faint">
          {stop.stopSeq ?? '·'}
        </span>
        {/* Durağın KENDİSİ kapıdaki ekrana açılır (11.2). Bağlantı yalnız künyeyi sarıyor; "Ara" ve
            "Yol tarifi" ayrı hedefler, onları da içine alsaydık iç içe bağlantı olurdu. */}
        <Link href={`/operations/deliveries/${stop.orderId}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-ops-body text-ops-base text-ops-ink hover:text-ops-olive">
            {stop.address ?? 'Adres yok'}
          </span>
          <span className="font-ops-body text-ops-sm text-ops-muted">
            {stop.customerName}
            {stop.channel === 'b2b' ? ' · B2B' : ''}
          </span>
        </Link>
        <Badge tone={view.tone}>{view.label}</Badge>
      </div>

      {/* Para: kapıda ödenecekse tutar + beklenen yöntem, değilse tek cümle. "Ödendi" kapısında
          rakam göstermek, kuryeyi olmayan bir tahsilata hazırlardı. */}
      <div className="flex flex-wrap items-center gap-2 pl-7 font-ops-body text-ops-sm">
        {due === null ? (
          <span className="text-ops-faint">{NOTES.prepaid}</span>
        ) : (
          <span className="font-ops-mono text-ops-ink">
            {money(due)}
            {stop.payment.expectedMethod ? (
              <span className="ml-1.5 font-ops-body text-ops-xs text-ops-muted">
                kapıda · {METHOD_LABEL[stop.payment.expectedMethod] ?? stop.payment.expectedMethod}
              </span>
            ) : null}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-7 font-ops-body text-ops-xs text-ops-faint">
        <span>
          {num(stop.itemCount)} kalem
          {stop.contentSummary ? ` · ${stop.contentSummary}` : ''}
        </span>
        {/* Kaçıncı deneme — ulaşılamayan durak listede kalıyor ve kurye kaç kez gittiğini bilmeli. */}
        {stop.attempts > 1 ? <span className="text-ops-amber-dark">{num(stop.attempts)}. deneme</span> : null}
      </div>

      {!settled ? <StopContactActions stop={stop} className="pl-7" /> : null}
    </li>
  );
}

const LINK_CLASS =
  'cursor-pointer rounded-ops-btn border border-ops-line px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken';

/**
 * **Kapı bulunamadı senaryosu:** ara, yaz, yolu aç.
 *
 * Gün listesindeki kart ile kapıdaki durak ekranı aynı üç düğmeyi taşıyor — ikinci kez yazılmadı.
 * Bağlantı yoksa düğme HİÇ çizilmiyor: sahada çalışmayan bir düğme en kötü şeydir.
 */
export function StopContactActions({ stop, className }: { stop: CourierStop; className?: string }) {
  // Hedef motordan geliyor (`domain-core/delivery/navigation`) — iki yüzey aynı adresi elle yazarsa
  // biri bir gün ötekinden ayrışır; nitekim ayrışmıştı: ikisi de rota yerine yer kartı açıyordu.
  const navigateUrl = navigationLink({ address: stop.address });

  if (!stop.phone && !stop.whatsAppLink && !navigateUrl) return null;

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      {stop.phone ? (
        <a href={`tel:${stop.phone}`} className={LINK_CLASS}>
          Ara
        </a>
      ) : null}
      {stop.whatsAppLink ? (
        <a href={stop.whatsAppLink} target="_blank" rel="noreferrer" className={LINK_CLASS}>
          Yoldayım
        </a>
      ) : null}
      {navigateUrl ? (
        <a
          href={navigateUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto cursor-pointer rounded-ops-btn bg-ops-ink px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-card transition-colors hover:bg-ops-ink-hover"
        >
          Yol tarifi →
        </a>
      ) : null}
    </div>
  );
}
