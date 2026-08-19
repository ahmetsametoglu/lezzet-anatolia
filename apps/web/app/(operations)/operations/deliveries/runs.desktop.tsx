'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { num } from '@/components/operation/ui/format';
import { Table, withCells } from '@/components/operation/ui/table';
import type { ColumnTrack } from '@/components/operation/ui/table-columns';
import { DeliveryTabs } from './delivery-tabs';
import { RUN_NOTES } from './deliveries-labels';
import type { RunListRow } from './runs-read';

// GEÇMİŞ SEFERLER — MASAÜSTÜ (18.08 · `docs/feature/sefer.md` Faz 5). Üçüncü sekme: rota
// TANIMLAMAK (routes) ile günü PLANLAMAK (plan) aynı işin iki anıydı; bu, üçüncü anı — GERÇEKLEŞEN.
//
// Tablo iskeleti gün planıyla aynı taş (`Table` + `withCells`): iki ekran aynı evrenin kayıtlarını
// listeliyor, operatörün gözü aynı düzeni bulmalı. Satır detay sayfasına GİTMİYOR (v1): seferin
// bütün künyesi satırda — kod, kim, hangi araç, saatler, mutabakat özeti. Durak dökümü gerekirse
// sipariş listesi zaten sefer koduyla aranabilir (sipariş detayında SF köprüsü var).

const RUN_TRACKS: ColumnTrack[] = [
  { key: 'ref', header: 'Sefer', width: '110px' },
  { key: 'date', header: 'Gün', width: '96px' },
  { key: 'zone', header: 'Rota', width: 'minmax(120px,1fr)' },
  { key: 'courier', header: 'Kurye', width: 'minmax(96px,140px)' },
  { key: 'vehicle', header: 'Araç', width: 'minmax(80px,120px)' },
  { key: 'times', header: 'Çıkış → Dönüş', width: '132px' },
  { key: 'stops', header: 'Durak', width: '56px', align: 'right' },
  { key: 'outcome', header: 'Sonuç', width: 'minmax(140px,170px)' },
];

/** "08:30 → 16:45" — saatler günün içinde okunur; tarih kolonu zaten günü söylüyor. */
function timeOf(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function RunsDesktop({
  rows,
  hasMore,
  onLoadMore,
  busy,
  error,
}: {
  rows: RunListRow[];
  hasMore: boolean;
  onLoadMore: () => void;
  busy: boolean;
  error: string | null;
}) {
  const columns = withCells<RunListRow>(RUN_TRACKS, {
    ref: (run) => <span className="font-ops-mono text-ops-xs text-ops-ink">{run.referenceNo}</span>,
    date: (run) => (
      <span className="font-ops-mono text-ops-xs text-ops-muted">
        {new Date(`${run.date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
      </span>
    ),
    zone: (run) => <span className="truncate font-ops-body text-ops-sm text-ops-ink">{run.zoneName ?? '—'}</span>,
    courier: (run) => <span className="truncate font-ops-body text-ops-sm text-ops-body">{run.courierName ?? '—'}</span>,
    vehicle: (run) =>
      run.vehicleLabel ? (
        <span className="truncate font-ops-body text-ops-sm text-ops-body">{run.vehicleLabel}</span>
      ) : (
        // Araçsız sefer meşru (kayıt girilmemiş kurulum) — boş hücre "bilinmiyor" diye okunur, adı konur.
        <span className="font-ops-body text-ops-xs text-ops-faint">araçsız</span>
      ),
    times: (run) => (
      <span className="font-ops-mono text-ops-xs text-ops-body">
        {timeOf(run.departedAt)} → {timeOf(run.returnedAt)}
      </span>
    ),
    stops: (run) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(run.stopCount)}</span>,
    /**
     * Sonuç kolonu İKİ soruyu birden cevaplar: sefer nerede (yolda/döndü) ve sayım ne dedi.
     * Kapanışsız dönmüş sefer AMBER: para araçta göründü, mutabakat yapılmadı — görünür eksik.
     */
    outcome: (run) =>
      run.close ? (
        <span className="flex items-center gap-1.5">
          <Badge tone={run.close.reconciled ? 'olive' : 'amber'}>{run.close.reconciled ? 'Mutabık' : 'Fark var'}</Badge>
          <span className="font-ops-mono text-ops-xs text-ops-muted">
            {num(run.close.deliveredCount)}✓{run.close.returnedCount > 0 ? ` ${num(run.close.returnedCount)}↩` : ''}
            {run.close.pendingCount > 0 ? ` ${num(run.close.pendingCount)}…` : ''}
          </span>
        </span>
      ) : run.returnedAt ? (
        <Badge tone="amber">{RUN_NOTES.unclosed}</Badge>
      ) : (
        <Badge tone="blue">{RUN_NOTES.onRoad(run.departedAt)}</Badge>
      ),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Teslimat & Rota" subtitle="geçmiş seferler · gerçekleşen kayıtlar">
        <DeliveryTabs value="runs" />
      </PageHeader>

      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Henüz sefer yok" description={RUN_NOTES.emptyList} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Table columns={columns} rows={rows} rowKey={(run) => run.runId} />
          {hasMore ? (
            <div className="flex justify-center border-t border-ops-line-soft px-6 py-3">
              <Button variant="secondary" onClick={onLoadMore} disabled={busy}>
                {busy ? 'Yükleniyor…' : 'Daha eski seferler'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
