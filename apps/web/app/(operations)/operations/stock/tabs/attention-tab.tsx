'use client';

import { Badge } from '@/components/operation/ui/badge';
import { daysLabel, money, percent, shortDate } from '@/components/operation/ui/format';
import { batchAction, expiryBadge } from '../stock-labels';
import type { BatchView, StockViewProps } from '../stock-types';

// Yaklaşan tarihli — KARAR kuyruğu. Ekranın en çok bakılan yeri: "hangi partiye bugün ne yapacağım".
//
// Liste SAYFALANMAZ (bkz. page.tsx): karar bekleyen bir partiyi kuyruğun dibinde bırakmak, imha
// edilecek malı satmak ya da satılabilecek malı çöpe atmak demektir.
//
// SIRA aciliyete göre: önce satılamaz olanlar (yalnız imha yolu), sonra kalan raf ömrü en az olanlar.
// Ham son tarihe göre sıralamak yanıltıcı olurdu — 3 gün, taze börekte normal, uzun ömürlü üründe alarm.

export function AttentionTab({ data, search, onOpenOffer }: StockViewProps) {
  const term = search.trim().toLocaleLowerCase('tr');
  const rows = data.attention
    .filter((b) => !term || b.title.toLocaleLowerCase('tr').includes(term) || (b.lotNumber ?? '').toLocaleLowerCase('tr').includes(term))
    .slice()
    .sort(compareUrgency);

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">
          {term ? 'Eşleşen parti yok' : 'Karar bekleyen parti yok'}
        </span>
        <span className="font-ops-body text-ops-sm text-ops-muted">
          {term ? 'Arama terimini değiştirin.' : 'Eldeki partilerin hepsinin raf ömrü yeterli — temiz hâl.'}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {rows.map((b) => (
          <DecisionCard key={b.id} batch={b} onOpenOffer={onOpenOffer} />
        ))}
      </div>
    </div>
  );
}

/** Satılamaz olan her zaman önce; sonra kalan ömrü az olan. Ömrü bilinmeyen en sona düşer. */
function compareUrgency(a: BatchView, b: BatchView): number {
  const blocked = Number(b.decision === 'must_discard') - Number(a.decision === 'must_discard');
  if (blocked !== 0) return blocked;
  const pa = a.remainingPercent ?? Number.POSITIVE_INFINITY;
  const pb = b.remainingPercent ?? Number.POSITIVE_INFINITY;
  return pa - pb;
}

interface DecisionCardProps {
  batch: BatchView;
  onOpenOffer: (stockId: string) => void;
}

/**
 * Karar kartı — üç şeyi yan yana koyar: parti kim, ne kadar ömrü kaldı, ne yapılabilir.
 *
 * Sol kenar rengi kararı taşır (kırmızı = satılamaz, amber = karar bekliyor, olive = teklif açık).
 * Öneri metni SİSTEMİN sesidir ve öyle yazılır: "öneri" der, "indirim uygulandı" demez — karar
 * operatörün (design/pages/admin-stok §6).
 */
function DecisionCard({ batch, onOpenOffer }: DecisionCardProps) {
  const badge = expiryBadge(batch);
  const action = batchAction(batch);
  const edge =
    badge.tone === 'red' ? 'border-l-ops-red-dot' : badge.tone === 'amber' ? 'border-l-ops-amber-dot' : 'border-l-ops-olive';

  return (
    <div className={`flex flex-col gap-2.5 rounded-ops-card border border-ops-line border-l-[3px] bg-ops-white p-3.5 ${edge}`}>
      <div className="flex items-start gap-2">
        <div className="mr-auto flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{batch.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {batch.lotNumber ? `Lot ${batch.lotNumber} · ` : ''}
            {batch.physicalQty} ad. kaldı
          </span>
        </div>
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </div>

      {batch.remainingPercent !== null ? (
        <div className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ops-line-soft">
            <span
              className={`block h-full ${badge.tone === 'red' ? 'bg-ops-red-dot' : badge.tone === 'amber' ? 'bg-ops-amber-dot' : 'bg-ops-olive'}`}
              style={{ width: `${Math.max(2, Math.round(batch.remainingPercent))}%` }}
            />
          </span>
          <span className="font-ops-mono text-ops-micro text-ops-muted">kalan {percent(batch.remainingPercent)}</span>
        </div>
      ) : (
        <span className="font-ops-body text-ops-xs text-ops-muted">
          {shortDate(batch.expiryDate)} · {daysLabel(batch.daysLeft)}
        </span>
      )}

      <div className="flex items-center gap-2 border-t border-ops-line-soft pt-2.5">
        <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">{suggestionText(batch)}</span>
        {action.kind === 'discard' ? (
          <span className="font-ops-body text-ops-xs font-semibold text-ops-red">İmha — depo ekranından</span>
        ) : (
          <button
            type="button"
            onClick={() => onOpenOffer(batch.id)}
            className={`flex-none cursor-pointer rounded-ops-btn px-3 py-1.5 font-ops-display text-ops-xs font-semibold ${
              action.kind === 'offer'
                ? 'bg-ops-olive text-ops-white hover:bg-ops-olive-dark'
                : 'border border-ops-line bg-ops-white text-ops-body hover:border-ops-olive hover:text-ops-olive-dark'
            }`}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Kartın alt satırı: sistemin söyleyebildiği en yararlı cümle.
 *
 * Fiyatı girilmemiş varyantta öneri YOKTUR ve eksiklik söylenir — uydurma bir taban üzerinden
 * "%30 indirim" önermek, operatöre olmayan bir hesabı doğruymuş gibi gösterirdi.
 */
function suggestionText(batch: BatchView): string {
  if (batch.decision === 'must_discard') return 'DLC geçti — satılamaz';
  if (batch.offerPriceCents !== null) return `Teklif ${money(batch.offerPriceCents)} · tavan ${batch.physicalQty} ad.`;
  if (batch.suggestedOfferCents === null) return 'Liste fiyatı girilmemiş — öneri yok';
  return `Öneri: ${money(batch.listPriceCents)} → ${money(batch.suggestedOfferCents)}`;
}
