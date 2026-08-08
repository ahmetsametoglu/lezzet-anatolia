'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Input } from '@/components/operation/form/input';
import { num } from '@/components/operation/ui/format';
import { RECEIVING_NOTES, pendingBadge, pendingSummary, rowStatus } from './receiving-labels';
import type { IntakeRow, PendingPurchase, ReceivingData } from './receiving-types';

/**
 * **Mal kabul masası** (10.4) — `design/project/Operasyon - Depo Stok Giris.dc.html` (*"· web"*).
 *
 * ── BÜTÜN KALEMLER TEK TABLODA ──────────────────────────────────────────────
 * Tasarımın kendi cümlesi: *"Rampada palet açılmış, irsaliye masada: bütün kalemler tek tabloda
 * görünür, giriş satır satır klavyeyle akar."* Telefonun tek-kalem akışı buraya taşınmadı — masada
 * irsaliyeyle tabloyu yan yana okumak, sayfa sayfa gezmekten hızlıdır.
 *
 * ── FİYAT ALANI YOK ─────────────────────────────────────────────────────────
 * Ve olamaz: depocunun kapısı (`receiveGoods`) maliyet taşıyan satırı kabul etmiyor — tip sınırı.
 * Alımın para tarafı yöneticinin Tedarik ekranında yaşıyor.
 */
interface ReceivingViewProps {
  data: ReceivingData;
  selectedId: string | null;
  onSelect: (purchaseOrderId: string | null) => void;
  rows: IntakeRow[];
  onRow: (variantId: string, patch: Partial<IntakeRow>) => void;
  busy: boolean;
  error: string | null;
  loading: boolean;
  onFinish: () => void;
  /** Siparişsiz kabul modu — sipariş seçimiyle birbirini dışlar. */
  freeMode: boolean;
  onFreeMode: () => void;
  /** Siparişsiz kabul formu; mod açıkken sağ sütunu o doldurur. */
  free: React.ReactNode;
}

export function ReceivingDesktop({
  data,
  selectedId,
  onSelect,
  rows,
  onRow,
  busy,
  error,
  loading,
  onFinish,
  freeMode,
  onFreeMode,
  free,
}: ReceivingViewProps) {
  const selected = data.pending.find((purchase) => purchase.purchaseOrderId === selectedId) ?? null;
  const girilen = rows.filter((row) => row.receivedQty !== null || row.isMissing).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Mal kabul"
        // Depo adı SAYIDAN SONRA ve "giriş deposu" diye etiketli (10.7): başa konsaydı listenin o
        // depoya süzüldüğünü söylerdi ve bu YANLIŞ olurdu — bekleyen siparişler depo-üstü, depo
        // yalnız malın gireceği kapı. Seçilmemişse hiç yazılmaz; kabul diyaloğu zaten soracak.
        subtitle={`Kabul bekliyor ${num(data.pending.length)}${data.warehouseName ? ` · Giriş deposu: ${data.warehouseName}` : ''}`}
      />

      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,1fr)_2.4fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-ops-line">
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {data.pending.map((purchase) => (
              <li key={purchase.purchaseOrderId}>
                <PendingRow
                  purchase={purchase}
                  selected={purchase.purchaseOrderId === selectedId}
                  onSelect={() => onSelect(purchase.purchaseOrderId)}
                />
              </li>
            ))}
            {data.pending.length === 0 ? (
              <li className="px-5 py-4 font-ops-body text-ops-xs leading-[1.55] text-ops-muted">{RECEIVING_NOTES.empty}</li>
            ) : null}
            {/* "Boş formla kabul" listenin ALTINDA: siparişsiz alım istisnadır, önce bekleyen
                siparişlere bakılır. Üstte olsaydı varsayılan yol gibi okunurdu. */}
            <li className="border-b border-ops-line-soft px-5 py-3">
              <Button variant={freeMode ? 'primary' : 'secondary'} size="sm" fullWidth onClick={onFreeMode} disabled={busy}>
                + Boş formla kabul
              </Button>
            </li>
          </ul>
          <p className="border-t border-ops-line-soft bg-ops-subtle px-5 py-2.5 font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            {RECEIVING_NOTES.noWarehouseFilter}
          </p>
        </div>

        <div className="flex min-h-0 flex-col overflow-y-auto bg-ops-panel">
          {freeMode ? (
            free
          ) : loading ? (
            <p className="px-5 py-6 font-ops-body text-ops-sm text-ops-muted">Sipariş kalemleri okunuyor…</p>
          ) : selected ? (
            <IntakeTable
              purchase={selected}
              rows={rows}
              onRow={onRow}
              busy={busy}
              girilen={girilen}
              onFinish={onFinish}
            />
          ) : (
            <EmptyState title="Kabul edilecek siparişi seçin" description={RECEIVING_NOTES.pick} />
          )}
        </div>
      </div>
    </div>
  );
}

function PendingRow({ purchase, selected, onSelect }: { purchase: PendingPurchase; selected: boolean; onSelect: () => void }) {
  const badge = pendingBadge(purchase);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer flex-col gap-1 border-b border-ops-line-soft px-5 py-3 text-left transition-colors hover:bg-ops-subtle ${
        selected ? 'bg-ops-olive-bg' : ''
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{purchase.supplierName}</span>
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </span>
      <span className="font-ops-body text-ops-xs text-ops-muted">{pendingSummary(purchase)}</span>
    </button>
  );
}

/** Siparişten dolu kabul tablosu — tasarımın orta karesi. */
function IntakeTable({
  purchase,
  rows,
  onRow,
  busy,
  girilen,
  onFinish,
}: {
  purchase: PendingPurchase;
  rows: IntakeRow[];
  onRow: (variantId: string, patch: Partial<IntakeRow>) => void;
  busy: boolean;
  girilen: number;
  onFinish: () => void;
}) {
  const farkliSayisi = rows.filter((row) => {
    const status = rowStatus(row);
    return status !== null && status.tone !== 'olive';
  }).length;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-ops-line px-5 py-3.5">
        <span className="font-ops-display text-ops-lg font-semibold text-ops-ink">
          {purchase.supplierName} · {purchase.referenceNo ?? 'referanssız'}
        </span>
        <span className="font-ops-body text-ops-xs text-ops-muted">{pendingSummary(purchase)}</span>
        <span className="mt-1 font-ops-body text-ops-xs font-semibold text-ops-body">
          {num(girilen)} / {num(rows.length)} kalem girildi
        </span>
        {/* Klavye yolu YAZILI: tasarımın birinci giriş yolu klavye ve bunu ekranın söylemesi
            gerekiyor — keşfedilmeyi bekleyen bir kısayol, olmayan bir kısayoldur. */}
        <span className="mt-0.5 font-ops-mono text-ops-micro text-ops-faint">{RECEIVING_NOTES.keyboard}</span>
      </div>

      <div className="grid grid-cols-[1.6fr_78px_88px_128px_104px_96px_96px] gap-x-2 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        <span>Kalem</span>
        <span className="text-center">Beklenen</span>
        <span className="text-center">Gelen</span>
        <span>Son tarih</span>
        <span>Lot no</span>
        <span>Konum</span>
        <span className="text-right">Durum</span>
      </div>

      <ul>
        {rows.map((row) => (
          <li key={row.variantId}>
            <IntakeRowFields row={row} onRow={onRow} busy={busy} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2.5 border-t border-ops-line px-5 py-3.5">
        {farkliSayisi > 0 ? (
          <p className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            {num(farkliSayisi)} kalemde fark var — <strong>hata değil, kayda geçer.</strong> Kabul yine tamamlanır.
          </p>
        ) : null}
        <p className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">{RECEIVING_NOTES.missingRule}</p>
        <p className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
          {RECEIVING_NOTES.noPrice} {RECEIVING_NOTES.afterAccept}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="primary" disabled={busy || girilen === 0} onClick={onFinish}>
            {busy ? 'Kaydediliyor…' : 'Kabulü bitir'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IntakeRowFields({
  row,
  onRow,
  busy,
}: {
  row: IntakeRow;
  onRow: (variantId: string, patch: Partial<IntakeRow>) => void;
  busy: boolean;
}) {
  const status = rowStatus(row);
  const disabled = busy || row.isMissing;

  return (
    <div className="grid grid-cols-[1.6fr_78px_88px_128px_104px_96px_96px] items-center gap-x-2 border-b border-ops-line-soft px-5 py-2">
      <span className="truncate font-ops-body text-ops-sm text-ops-ink">{row.title}</span>

      <span className="text-center font-ops-mono text-ops-xs text-ops-muted">
        {row.expectedQty === null ? '—' : num(row.expectedQty)}
      </span>

      <Input
        type="number"
        min={0}
        fullWidth={false}
        className="w-full text-center"
        value={row.receivedQty === null ? '' : String(row.receivedQty)}
        // Boş bırakmak "henüz saymadım" demek ve `null` kalıyor — sıfır YAZILMIYOR. İkisini
        // birleştirmek, sayılmamış satırı "hiç gelmedi" diye kaydetmek olurdu.
        onChange={(event) => onRow(row.variantId, { receivedQty: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}
        disabled={disabled}
      />

      <Input
        type="date"
        fullWidth={false}
        className="w-full"
        value={row.expiryDate}
        onChange={(event) => onRow(row.variantId, { expiryDate: event.target.value })}
        disabled={disabled}
      />

      <Input
        fullWidth={false}
        className="w-full"
        placeholder="—"
        value={row.lotNumber}
        onChange={(event) => onRow(row.variantId, { lotNumber: event.target.value })}
        disabled={disabled}
      />

      <Input
        fullWidth={false}
        className="w-full"
        placeholder="raf"
        value={row.location}
        onChange={(event) => onRow(row.variantId, { location: event.target.value })}
        disabled={disabled}
      />

      <span className="flex items-center justify-end gap-1.5">
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        <button
          type="button"
          onClick={() => onRow(row.variantId, { isMissing: !row.isMissing, receivedQty: null })}
          disabled={busy}
          title={row.isMissing ? 'Gelmedi işaretini kaldır' : 'Bu kalem gelmedi'}
          className="cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-0.5 font-ops-body text-ops-micro text-ops-muted transition-colors hover:border-ops-red-line hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          {row.isMissing ? '↺' : '✕'}
        </button>
      </span>
    </div>
  );
}
