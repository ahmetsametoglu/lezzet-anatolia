'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/operation/ui/badge';
import { money, percent } from '@/components/operation/ui/format';
import { batchAction, expiryBadge, expiryLine, suggestionText } from '@/lib/stock/batch-labels';
import { setOfferPriceAction } from '@/lib/stock/offer-actions';
import {
  EXPIRY_GROUPS,
  costLine,
  groupOf,
  movedOutOf,
  totalRiskCents,
  type ExpiryGroupKey,
} from '../stock-labels';
import type { BatchView, StockViewProps } from '../stock-types';

// Yaklaşan tarihli — KARAR kuyruğu. Ekranın en çok bakılan yeri: "hangi partiye bugün ne yapacağım".
//
// ÜÇ GRUP, tek liste değil (tasarım kararı): satılamaz · DLC yaklaşıyor · DDM yaklaşıyor. Ayrım tarih
// TİPİNDEN doğar ve sonucu tamamen farklıdır. Hepsi alt alta dursaydı en pahalı hata yapılırdı —
// satılamaz partiyi indirime sokmak ya da hâlâ satılabilir malı imhaya göndermek.
//
// Liste SAYFALANMAZ (bkz. page.tsx): karar bekleyen bir partiyi kuyruğun dibinde bırakmak, imha
// edilecek malı satmak ya da satılabilecek malı çöpe atmak demektir.

export function AttentionTab({ data, search, onOpenOffer }: StockViewProps) {
  const term = search.trim().toLocaleLowerCase('tr');
  const rows = data.attention.filter(
    (b) => !term || b.title.toLocaleLowerCase('tr').includes(term) || (b.lotNumber ?? '').toLocaleLowerCase('tr').includes(term),
  );

  if (rows.length === 0) {
    return <CleanState filtered={Boolean(term)} inStock={data.counts.inStock} nearExpiryPercent={data.nearExpiryPercent} />;
  }

  const totalRisk = totalRiskCents(rows);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Başlık şeridi: kaç parti, ne kadar para riskte, hangi eşikle. Eşik ekranda YAZILI durur —
          operatör "neden bu parti listede" sorusunu ayarlara gitmeden yanıtlayabilmeli. */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-ops-line bg-ops-subtle px-6 py-3">
        <div className="mr-auto flex flex-col gap-0.5">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">
            {rows.length} parti eşik altında
            {totalRisk !== null ? (
              <>
                {' · '}
                <span className="font-ops-mono text-ops-red">{money(totalRisk)} riskte</span>
              </>
            ) : null}
          </span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            En az kalan üstte · hazırlıkta önce süresi dolan çıkar (FEFO), sıralamayı elle yönetmezsiniz
          </span>
        </div>
        <span className="rounded-ops-chip border border-ops-line bg-ops-line-soft px-3 py-1.5 font-ops-body text-ops-xs text-ops-body">
          Eşik: kalan raf ömrü <strong>%{data.nearExpiryPercent}</strong> · <span className="text-ops-muted">Ayarlar</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-[22px] pt-[18px]">
        {EXPIRY_GROUPS.map((group) => {
          const items = rows.filter((b) => groupOf(b) === group.key).sort(compareUrgency);
          if (items.length === 0) return null;
          return <ExpiryGroup key={group.key} group={group} items={items} onOpenOffer={onOpenOffer} />;
        })}
      </div>
    </div>
  );
}

/** Kalan ömrü az olan üstte. Ömrü bilinmeyen en sona düşer — ölçüsü yoksa sırası da yoktur. */
function compareUrgency(a: BatchView, b: BatchView): number {
  return (a.remainingPercent ?? Number.POSITIVE_INFINITY) - (b.remainingPercent ?? Number.POSITIVE_INFINITY);
}

interface ExpiryGroupProps {
  group: (typeof EXPIRY_GROUPS)[number];
  items: BatchView[];
  onOpenOffer: (stockId: string) => void;
}

const DOT: Record<ExpiryGroupKey, string> = { blocked: 'bg-ops-red-dot', dlc: 'bg-ops-amber-dot', ddm: 'bg-ops-amber-dot' };

function ExpiryGroup({ group, items, onOpenOffer }: ExpiryGroupProps) {
  const risk = totalRiskCents(items);
  return (
    <div className="flex flex-col gap-[11px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`h-2 w-2 flex-none rounded-full ${DOT[group.key]}`} />
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{group.title}</span>
        <Badge tone={group.tone}>
          {items.length} parti{risk !== null ? ` · ${money(risk)}` : ''}
        </Badge>
        <span className="font-ops-body text-ops-xs text-ops-muted">{group.rule}</span>
      </div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {items.map((b) => (
          <DecisionCard key={b.id} batch={b} onOpenOffer={onOpenOffer} />
        ))}
      </div>
    </div>
  );
}

interface DecisionCardProps {
  batch: BatchView;
  onOpenOffer: (stockId: string) => void;
}

/**
 * Karar kartı — dört şeyi yan yana koyar: parti kim, ne kadar ömrü kaldı, ne kadar para riskte,
 * ne yapılabilir.
 *
 * Sol kenar rengi kararı taşır. Öneri metni SİSTEMİN sesidir ve öyle yazılır: "öneri" der, "indirim
 * uygulandı" demez — karar operatörün (design/pages/admin-stok §6).
 */
export function DecisionCard({ batch, onOpenOffer }: DecisionCardProps) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  /** Teklifi kapat — kararı sunucu da denetler (`setOfferPriceAction`), ekranın iyi niyetine kalmaz. */
  const closeOffer = async () => {
    setClosing(true);
    setCloseError(null);
    const { error } = await setOfferPriceAction(batch.id, null);
    setClosing(false);
    if (error) {
      setCloseError(error);
      return;
    }
    router.refresh();
  };

  const badge = expiryBadge(batch);
  const action = batchAction(batch);
  const blocked = action.kind === 'discard';
  const edge = badge.tone === 'red' ? 'border-l-ops-red-dot' : badge.tone === 'amber' ? 'border-l-ops-amber-dot' : 'border-l-ops-olive';

  return (
    <div className={`flex flex-col gap-[9px] rounded-ops-card border border-ops-line border-l-[3px] bg-ops-white px-4 py-3.5 ${edge}`}>
      <div className="flex items-start gap-2">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{batch.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {batch.lotNumber ? `Lot ${batch.lotNumber} · ` : ''}
            {batch.physicalQty} ad. kaldı
          </span>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <Badge tone={badge.tone}>{badge.text}</Badge>
          {/* MLOR kart üstünde: "bu parti zaten kısa ömürlü" bilgisi teklif kararının bağlamı. */}
          {batch.belowMlor ? (
            <span
              className="rounded-ops-btn border border-ops-amber-line px-1.5 py-px font-ops-display text-ops-micro font-semibold text-ops-amber"
              title={`Kalan ömrü MLOR eşiğinin (%${batch.mlorPercent}) altında`}
            >
              MLOR · kısa
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-ops-mono text-ops-sm ${blocked ? 'text-ops-red' : 'text-ops-body'}`}>{expiryLine(batch)}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">{costLine(batch)}</span>
      </div>

      {/* Satılamaz partide çubuk çizilmez: "kalan %0" bir ölçü değil, bitmiş bir sürecin artığıdır. */}
      {!blocked && batch.remainingPercent !== null ? (
        <div className="flex items-center gap-2">
          <span className="h-[7px] flex-1 overflow-hidden rounded-[4px] bg-ops-line-soft">
            <span
              className={`block h-full ${badge.tone === 'red' ? 'bg-ops-red-dot' : badge.tone === 'amber' ? 'bg-ops-amber-dot' : 'bg-ops-olive'}`}
              style={{ width: `${Math.max(2, Math.round(batch.remainingPercent))}%` }}
            />
          </span>
          <span className="font-ops-mono text-ops-xs text-ops-muted">kalan {percent(batch.remainingPercent)}</span>
        </div>
      ) : null}

      {blocked ? (
        <span className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-2.5 py-1.5 font-ops-body text-ops-xs text-ops-red">
          Satılamaz — stoktan düşmesi imha kaydıyla olur
        </span>
      ) : null}

      {batch.offerPriceCents !== null ? (
        <div className="flex flex-col gap-0.5 rounded-ops-btn border border-ops-olive-line bg-ops-olive-bg px-2.5 py-2">
          <span className="font-ops-body text-ops-xs font-semibold text-ops-olive-dark">
            Teklif açık · {money(batch.offerPriceCents)}
            {batch.listPriceCents !== null ? (
              <span className="font-normal text-ops-body"> (liste {money(batch.listPriceCents)})</span>
            ) : null}
          </span>
          <span className="font-ops-body text-ops-micro text-ops-body">
            {movedOutOf(batch)} / {batch.initialQty} çıktı · parti tükenince teklif kendiliğinden kalkar
          </span>
        </div>
      ) : null}

      {closeError ? (
        <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{closeError}</span>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-ops-line-soft pt-2.5">
        <span className="mr-auto min-w-0 truncate font-ops-body text-ops-xs text-ops-muted">{suggestionText(batch)}</span>
        {blocked ? (
          <span className="flex-none font-ops-body text-ops-xs font-semibold text-ops-red">Depo ekranından</span>
        ) : (
          <>
            {/* Teklifi kapatmak AYRI bir düğme ve İŞİ KENDİ YAPAR: açık teklifte en sık istenen iki
                iş fiyatı değiştirmek ve teklifi geri almaktır; ikincisini diyaloğun içine gömmek bir
                tık daha uzağa iterdi.

                Düğme eskiden diyaloğu açıyordu — yani etiketi yaptığı işi YANLIŞ söylüyordu: basan
                kişi teklifin kapandığını sanıyor, aslında pencere açılıyor ve orada bir kez daha
                aynı düğmeye basmak gerekiyordu. Kapatma hiçbir koşulda engellenmez (yanlışlıkla
                açılmış bir teklif her zaman geri alınabilmeli). */}
            {batch.offerPriceCents !== null ? (
              <button
                type="button"
                onClick={() => void closeOffer()}
                disabled={closing}
                className="flex-none cursor-pointer rounded-ops-btn border border-ops-line bg-ops-white px-2.5 py-1.5 font-ops-display text-ops-sm font-semibold text-ops-body outline-none transition-colors hover:border-ops-line-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {closing ? 'Kapatılıyor…' : 'Teklifi kapat'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenOffer(batch.id)}
              className={`flex-none cursor-pointer rounded-ops-btn px-3 py-1.5 font-ops-display text-ops-sm font-semibold ${
                action.kind === 'offer'
                  ? 'bg-ops-olive text-ops-white hover:bg-ops-olive-dark'
                  : 'border border-ops-line bg-ops-white text-ops-body hover:border-ops-olive hover:text-ops-olive-dark'
              }`}
            >
              {action.label}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface CleanStateProps {
  filtered: boolean;
  inStock: number;
  nearExpiryPercent: number;
}

/**
 * "Temiz hâl" — tasarımın açıkça istediği durum. Boş listeyi sessiz bırakmak yerine ne olduğunu
 * söyler: bu bir eksiklik değil, iyi haberdir. Eşik de burada yazılıdır ki operatör "acaba uyarı mı
 * çalışmıyor" diye düşünmesin.
 */
function CleanState({ filtered, inStock, nearExpiryPercent }: CleanStateProps) {
  if (filtered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
        <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Eşleşen parti yok</span>
        <span className="font-ops-body text-ops-sm text-ops-muted">Arama terimini değiştirin.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-start justify-center p-8">
      <div className="flex w-[420px] max-w-full flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-6 py-5">
        <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Yaklaşan tarihli — eşik altında parti yok
        </span>
        <div className="flex items-center gap-2.5">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-ops-olive-bg font-ops-display text-ops-base font-semibold text-ops-olive-dark">
            ✓
          </span>
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Tarih riski yok</span>
        </div>
        <span className="font-ops-body text-ops-sm leading-[1.7] text-ops-body">
          {inStock} boyun hiçbir partisi kalan raf ömrü %{nearExpiryPercent} altında değil. Eşik altına inen parti
          çıktığında burada ve panoda uyarı olarak görünür.
        </span>
      </div>
    </div>
  );
}
