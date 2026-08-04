'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { amount, money, num, percent, shortDate } from '@/components/operation/ui/format';
import { Input } from '@/components/operation/form/input';
import { generateExportAction, matchInvoiceAction } from './actions';
import { COST_LABEL, NOTES } from './reports-labels';
import type { ChannelCard, ExportView, InvoiceQueueRow, MetricView, PnlRow, VariantProfitRow } from './reports-types';
import { monthLabel } from './reports-url';

// Raporlar ekranının blokları — masaüstü ve mobil ikisi de buradan besleniyor. Cihaz farkı
// `stacked` PROP'uyla taşınıyor, `md:` ile DEĞİL (CLAUDE.md §2 · ADR Sapma 3).

const CHANNEL_NAME = { b2c: 'B2C — bireysel', b2b: 'B2B — kurumsal' } as const;

/** Kâr rengi: negatif SAKLANMAZ (tasarım §4 — "rakam saklanmaz, görünür"). */
function toneClass(cents: number | null): string {
  if (cents == null) return 'text-ops-faint';
  return cents >= 0 ? 'text-ops-olive-dark' : 'text-ops-red';
}

// ── Ürün kârlılığı ────────────────────────────────────────────────────────────────────────────

const VARIANT_GRID = 'grid grid-cols-[minmax(0,1fr)_58px_96px_96px_86px_78px] items-center gap-x-3';

export function ProductProfit({
  metrics,
  rows,
  unpricedCount,
  unpricedRevenueCents,
  stacked = false,
}: {
  metrics: MetricView[];
  rows: VariantProfitRow[];
  unpricedCount: number;
  unpricedRevenueCents: number;
  stacked?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`grid border-b border-ops-line-soft bg-ops-surface-sunken ${stacked ? 'grid-cols-3 px-4 py-3' : 'grid-cols-3 px-6 py-3.5'}`}>
        {metrics.map((metric) => (
          <div key={metric.label} className={stacked ? 'flex flex-col gap-1' : 'flex flex-col gap-1 px-4'}>
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
              {metric.label}
            </span>
            <span className={`font-ops-mono ${stacked ? 'text-ops-lead' : 'text-ops-title'} tracking-tight ${metric.tone === 'neutral' ? 'text-ops-ink' : toneClass(metric.cents)}`}>
              {money(metric.cents)}
            </span>
          </div>
        ))}
      </div>

      {/* Kesinleşmemiş maliyet AYRI yazılıyor, kârın içine karıştırılmıyor: sıfır sayılsaydı kâr
          olduğundan büyük görünürdü ve rapor kendi kendine yalan söylerdi (tasarım §4). */}
      {unpricedCount > 0 ? (
        <p className="border-b border-ops-amber-line bg-ops-amber-bg px-6 py-2.5 font-ops-body text-ops-xs text-ops-amber-dark">
          {NOTES.unpriced} <span className="font-ops-mono">{num(unpricedCount)} sipariş · {money(unpricedRevenueCents)}</span>
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Bu dönemde ürün kârı yok" description={NOTES.emptyPeriod} />
      ) : stacked ? (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.variantId} className="flex flex-col gap-1 border-b border-ops-line-soft px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
                <span className={`shrink-0 font-ops-mono text-ops-sm ${toneClass(row.netProfitCents)}`}>{money(row.netProfitCents)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-ops-body text-ops-micro text-ops-faint">
                <span className="font-ops-mono">{num(row.qty)} adet</span>
                <span aria-hidden>·</span>
                <span>gelir {money(row.revenueCents)}</span>
                <span aria-hidden>·</span>
                <span>{COST_LABEL.cogs.toLocaleLowerCase('tr-TR')} {money(row.cogsCents)}</span>
                {row.lossQty > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-ops-red">fire {num(row.lossQty)} · {money(row.lossCostCents)}</span>
                  </>
                ) : null}
                <span className="ml-auto font-ops-mono">{percent(row.marginPct, 1)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`${VARIANT_GRID} border-b border-ops-line px-6 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-faint`}>
            <span>Ürün · boy</span>
            <span className="text-right">Adet</span>
            <span className="text-right">Gelir</span>
            <span className="text-right">{COST_LABEL.cogs}</span>
            <span className="text-right">Fire</span>
            <span className="text-right">Net kâr</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.variantId} className={`${VARIANT_GRID} border-b border-ops-line-soft px-6 py-2.5`}>
                <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>
                <span className="text-right font-ops-mono text-ops-xs text-ops-muted">{num(row.qty)}</span>
                <span className="text-right font-ops-mono text-ops-sm text-ops-ink">{amount(row.revenueCents)}</span>
                <span className="text-right font-ops-mono text-ops-sm text-ops-muted">{amount(row.cogsCents)}</span>
                {/* Fire kârın içinde KAYBOLMUYOR, kendi sütununda (tasarım §2): "bu üründen yılda
                    ne kadar çöpe attım" sorusu ancak ayrı durursa cevaplanır. */}
                <span className={`text-right font-ops-mono text-ops-xs ${row.lossCostCents > 0 ? 'text-ops-red' : 'text-ops-faint'}`}>
                  {row.lossCostCents > 0 ? amount(row.lossCostCents) : '—'}
                </span>
                <div className="flex flex-col items-end">
                  <span className={`font-ops-mono text-ops-sm ${toneClass(row.netProfitCents)}`}>{amount(row.netProfitCents)}</span>
                  <span className="font-ops-mono text-ops-micro text-ops-faint">{percent(row.marginPct, 1)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Şirket kârlılığı ──────────────────────────────────────────────────────────────────────────

export function CompanyPnl({ rows, comparing, stacked = false }: { rows: PnlRow[]; comparing: boolean; stacked?: boolean }) {
  if (rows.length === 0) return <EmptyState title="Şirket kârı hesaplanamadı" description={NOTES.emptyPeriod} />;

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto ${stacked ? 'p-4' : 'p-6'}`}>
      <p className="font-ops-body text-ops-sm text-ops-muted">{NOTES.overheadNotAllocated}</p>

      <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-surface">
        {rows.map((row) => {
          const strong = row.kind === 'total';
          const subtotal = row.kind === 'subtotal';
          return (
            <div
              key={row.key}
              className={`flex items-center justify-between gap-4 border-b border-ops-line-soft px-4 py-3 last:border-b-0 ${
                strong ? 'bg-ops-surface-sunken' : subtotal ? 'bg-ops-surface-sunken/50' : ''
              }`}
            >
              <span className={`font-ops-display text-ops-sm ${strong || subtotal ? 'font-semibold text-ops-ink' : 'text-ops-muted'}`}>
                {/* İşaret GÖRÜNÜR: "− Genel giderler" satırı, tabloyu bir hesap olarak okutuyor.
                    Renge bırakılsaydı çıkarma yapıldığı yalnız sonuca bakılarak anlaşılırdı. */}
                {row.kind === 'minus' ? '− ' : ''}
                {row.label}
              </span>
              <div className="flex items-baseline gap-3">
                {comparing && row.prevCents !== null ? (
                  <span className="font-ops-mono text-ops-micro text-ops-faint">geçen ay {money(row.prevCents)}</span>
                ) : null}
                <span className={`font-ops-mono ${strong ? 'text-ops-lead' : 'text-ops-sm'} ${strong ? toneClass(row.cents) : 'text-ops-ink'}`}>
                  {money(row.cents)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="font-ops-body text-ops-xs text-ops-faint">{NOTES.realCogs}</p>
      <p className="font-ops-body text-ops-xs text-ops-faint">{NOTES.notOfficial}</p>
    </div>
  );
}

// ── Kanal ─────────────────────────────────────────────────────────────────────────────────────

export function ChannelCards({ cards, stacked = false }: { cards: ChannelCard[]; stacked?: boolean }) {
  if (cards.length === 0) return <EmptyState title="Kanal kırılımı yok" description={NOTES.emptyPeriod} />;

  return (
    <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto ${stacked ? 'grid-cols-1 p-4' : 'grid-cols-2 p-6'} content-start`}>
      {cards.map((card) => (
        <div key={card.channel} className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-surface p-4">
          <div className="flex items-center justify-between">
            <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{CHANNEL_NAME[card.channel]}</span>
            <Badge tone={card.channel === 'b2b' ? 'blue' : 'olive'}>{num(card.orderCount)} sipariş</Badge>
          </div>
          <dl className="flex flex-col gap-2">
            {[
              ['Satış geliri', money(card.revenueCents), 'text-ops-ink'],
              ['Doğrudan giderler', money(card.directCostsCents), 'text-ops-muted'],
              ['Doğrudan giderler sonrası kâr', money(card.contributionCents), toneClass(card.contributionCents)],
              ['Marj', percent(card.marginPct, 1), toneClass(card.contributionCents)],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="font-ops-body text-ops-xs text-ops-muted">{label}</dt>
                <dd className={`font-ops-mono text-ops-sm ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

// ── Muhasebe export ───────────────────────────────────────────────────────────────────────────

export function ExportPanel({
  view,
  queue,
  ym,
  onChanged,
  stacked = false,
}: {
  view: ExportView;
  queue: InvoiceQueueRow[];
  ym: string;
  onChanged: () => void;
  stacked?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Dosya İSTEMCİDE iniyor: sunucudan metin gelir, indirmeyi tarayıcı yapar (ayrı rota gerekmez). */
  const download = async () => {
    setError(null);
    setBusy(true);
    const { data, error: actionError } = await generateExportAction(ym);
    setBusy(false);
    if (actionError || !data) {
      setError(actionError ?? 'Export üretilemedi.');
      return;
    }
    const url = URL.createObjectURL(new Blob([data.csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = data.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto ${stacked ? 'p-4' : 'p-6'}`}>
      <div className={`flex gap-4 rounded-ops-card border border-ops-line bg-ops-surface p-4 ${stacked ? 'flex-col' : 'items-center'}`}>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">Muhasebe export — {monthLabel(ym)}</span>
          <span className="font-ops-body text-ops-xs text-ops-faint">
            {num(view.orderCount)} satış · {money(view.grossCents)} brüt · {money(view.vatCents)} KDV
          </span>
        </div>
        <Button onClick={() => void download()} disabled={busy || view.orderCount === 0}>
          {busy ? 'Üretiliyor…' : 'Export üret'}
        </Button>
      </div>

      {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}

      {/* Hediye siparişin dışlanması SESSİZ DEĞİL (12.7'nin kuralı): sayı ve tutarla yazılıyor,
          yoksa dönem cirosu ile export toplamı arasındaki fark açıklanamaz kalırdı. */}
      {view.excludedGiftCount > 0 ? (
        <p className="rounded-ops-card bg-ops-surface-sunken px-4 py-3 font-ops-body text-ops-xs text-ops-muted">
          {NOTES.giftExcluded}{' '}
          <span className="font-ops-mono text-ops-ink">
            Hariç: {num(view.excludedGiftCount)} satış · {money(view.excludedGiftGrossCents)}
          </span>
        </p>
      ) : null}

      {view.byVatRate.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-faint">
            KDV oranına göre
          </span>
          <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-surface">
            {view.byVatRate.map((line) => (
              <div key={line.rate} className="flex items-center justify-between border-b border-ops-line-soft px-4 py-2.5 last:border-b-0">
                <span className="font-ops-body text-ops-sm text-ops-muted">%{line.rate}</span>
                <span className="font-ops-mono text-ops-sm text-ops-ink">
                  {money(line.netCents)} + {money(line.vatCents)} KDV
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <InvoiceQueue rows={queue} onChanged={onChanged} />
    </div>
  );
}

function InvoiceQueue({ rows, onChanged }: { rows: InvoiceQueueRow[]; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (orderId: string) => {
    setError(null);
    setBusyId(orderId);
    const { error: actionError } = await matchInvoiceAction(orderId, drafts[orderId] ?? '');
    setBusyId(null);
    if (actionError) {
      setError(actionError);
      return;
    }
    setDrafts((current) => ({ ...current, [orderId]: '' }));
    onChanged();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-faint">
        Fatura no eşleşmemiş ({num(rows.length)})
      </span>

      {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}

      {rows.length === 0 ? (
        <p className="rounded-ops-card border border-ops-line bg-ops-surface px-4 py-3 font-ops-body text-ops-sm text-ops-muted">
          {NOTES.allInvoicesMatched}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-surface">
          {rows.map((row) => (
            <li key={row.orderId} className="flex flex-wrap items-center gap-3 border-b border-ops-line-soft px-4 py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.referenceNo ?? '—'}</span>
                <span className="font-ops-body text-ops-micro text-ops-faint">
                  {shortDate(row.saleDate)} · {money(row.totalCents)} · {row.channel.toUpperCase()}
                </span>
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(row.orderId);
                }}
              >
                <Input
                  mono
                  aria-label={`${row.referenceNo ?? 'Sipariş'} için fatura numarası`}
                  placeholder="Fatura no gir…"
                  value={drafts[row.orderId] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.orderId]: event.target.value }))}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={busyId === row.orderId || (drafts[row.orderId] ?? '').trim().length === 0}
                >
                  Bağla
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
