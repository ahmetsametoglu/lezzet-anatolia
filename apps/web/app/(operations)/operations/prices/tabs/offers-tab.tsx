'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { batchAction, expiryBadge, expiryLine, suggestionText } from '@/lib/stock/batch-labels';
import { money } from '@/components/operation/ui/format';
import type { BatchView } from '@/lib/stock/batch-types';
import type { PricesViewProps } from '../prices-types';

// Near-expiry teklif kararı — FİYAT gözünden. Stok ekranındaki kuyruğun aynısı, ama buradaki soru
// farklı sorulur: orada "bu partiye ne yapacağım", burada "listeye göre kaça vereyim".
//
// KARAR TEK KAYNAKTAN: parti görünümü ve eylem etiketi `lib/stock`'tan gelir, teklif diyaloğu da
// paylaşılan komponenttir. İki ekran aynı düğmeye bastığında aynı şey olur.
//
// Kart TASARIMIN düzeni: sol kenar rengi aciliyeti taşır (kırmızı = satılamaz, amber = karar
// bekliyor), sağda liste fiyatı üstü çizili + önerilen fiyat + eylem.

export function OffersTab({ data, onOpenOffer }: PricesViewProps) {
  if (data.offers.length === 0) {
    return (
      <div className="flex flex-1 items-start justify-center p-8">
        <div className="flex w-[460px] max-w-full flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-6 py-5">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
            Yaklaşan tarihli parti yok
          </span>
          <div className="flex items-center gap-2.5">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ops-olive-bg font-ops-display text-ops-base font-semibold text-ops-olive-dark">
              ✓
            </span>
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Karar bekleyen parti yok</span>
          </div>
          <span className="font-ops-body text-ops-sm leading-[1.7] text-ops-body">
            Eldeki partilerin hiçbiri eşiğin altına inmemiş. Eşik değişirse liste kendiliğinden dolar; ayarı
            değiştirmeden bir şey yapmanız gerekmiyor.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-6 py-4">
      {data.offers.map((batch) => (
        <OfferCard key={batch.id} batch={batch} onOpen={() => onOpenOffer(batch.id)} />
      ))}
      <span className="px-1 py-2 font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Teklif PARTİYE bağlıdır: miktar tavanı partinin kalanıdır ve parti tükenince teklif kendiliğinden kalkar.
        Ürünün normal liste fiyatı değişmez. Aynı kuyruk stok ekranında da var — karar ikisinde de aynı.
      </span>
    </div>
  );
}

interface OfferCardProps {
  batch: BatchView;
  onOpen: () => void;
}

function OfferCard({ batch, onOpen }: OfferCardProps) {
  const action = batchAction(batch);
  const badge = expiryBadge(batch);
  const blocked = action.kind === 'discard';

  return (
    <div
      className={`flex flex-wrap items-center gap-3.5 rounded-ops-card border border-l-[3px] bg-ops-white px-4 py-3 ${
        blocked ? 'border-ops-red-line border-l-ops-red' : 'border-ops-amber-line border-l-ops-amber'
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <div className="flex items-center gap-2">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{batch.title}</span>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </div>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {batch.lotNumber ? `Lot ${batch.lotNumber} · ` : ''}
          {batch.physicalQty} ad. · {expiryLine(batch)} · maliyet {money(batch.purchasePriceCents)}
        </span>
        <span className="truncate font-ops-body text-ops-xs text-ops-body">{suggestionText(batch)}</span>
      </div>

      {/* Liste fiyatı ÜSTÜ ÇİZİLİ, teklif fiyatı yanında: indirimin ne kadar olduğu okunsun.
          Fiyatı girilmemiş boyda ikisi de tire — sayı uydurulmaz. */}
      <div className="flex items-center gap-3">
        <span className="font-ops-mono text-ops-sm text-ops-faint line-through">{money(batch.listPriceCents)}</span>
        <span className="font-ops-mono text-ops-base font-semibold text-ops-olive-dark">
          {money(batch.offerPriceCents ?? batch.suggestedOfferCents)}
        </span>
      </div>

      {/* Satılamaz partide düğme YOK, bilgi var: imha kaydı depo akışının işidir (DOMAIN §4). */}
      {blocked ? (
        <span className="flex-none rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-red">
          {action.label}
        </span>
      ) : (
        <Button variant="primary" size="sm" onClick={onOpen}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
