'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Input, Textarea } from '@/components/operation/form/input';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Combobox } from '@/components/operation/form/combobox';
import { num } from '@/components/operation/ui/format';
import { ADJ_NOTES, REASON_LABEL, expiryLabel } from './adjustments-labels';
import { TemperatureCard, fmt } from './temperature-card';
import type { AdjustmentsData, BatchOption } from './adjustments-types';
import type { WarehouseReason } from '@lezzet/application';

/**
 * **Stoktan düş masası** (10.5) — `design/project/Operasyon - Depo Imha Sayim.dc.html` (*"· web"*).
 *
 * ── PARA YOK ────────────────────────────────────────────────────────────────
 * Tasarımın başlığı: *"Maliyet/tutar bu yüzeyde yoktur."* Okuma `unitCost`u hiç taşımıyor, yani
 * bu bir arayüz disiplini değil verinin şekli.
 *
 * ── SIRALAMA TASARIMDAN: FORM SOLDA, DEFTER SAĞDA ───────────────────────────
 * Depocu güne kayıt girerek başlamaz; önce ne girdiğine bakar. Ama gün içinde asıl iş formdur —
 * o yüzden form ana sütunda, "bugünün kayıtları" yanda kalıcı olarak durur ve her kayıttan sonra
 * anında büyür. Yanlış giriş böylece girildiği an fark edilir.
 */
interface AdjustmentsViewProps {
  data: AdjustmentsData;
  stockId: string;
  onStock: (stockId: string) => void;
  qty: string;
  onQty: (qty: string) => void;
  reason: WarehouseReason | '';
  onReason: (reason: WarehouseReason) => void;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  error: string | null;
  success: string | null;
  onSubmit: () => void;
}

const REASONS: WarehouseReason[] = ['expired', 'damaged', 'count_diff', 'lost'];

/** ISO damgası → "08:10". Okuma tarafındaki `entry.time` ile aynı biçim; iki şerit yan yana duruyor. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function AdjustmentsDesktop(props: AdjustmentsViewProps) {
  const { data, stockId, qty, reason, note, busy, error, success } = props;
  const selected = data.batches.find((batch) => batch.stockId === stockId) ?? null;
  const adet = Number(qty);

  // Engel SEBEBİYLE söyleniyor: kilitli ama sebepsiz bir düğme, operatörü neyi düzelteceğini
  // aramaya bırakır. Adet tavanı ekranda da kontrol ediliyor ama SON SÖZ veritabanının
  // (`adjust_stock_batch`) — burası yalnız gereksiz bir turu önlüyor.
  const engel = !selected
    ? 'Parti seçin.'
    : !Number.isInteger(adet) || adet <= 0
      ? 'Düşülecek adedi girin.'
      : adet > selected.physicalQty
        ? `Partide ${num(selected.physicalQty)} adet var; daha fazlası düşülemez.`
        : !reason
          ? 'Sebep seçin — zorunlu.'
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Stoktan düş"
        subtitle={`${data.warehouseName} · Sebep zorunlu · kayıt anında stok düşer`}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[1.7fr_minmax(280px,1fr)] overflow-hidden">
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-6 py-5">
          {data.batches.length === 0 ? (
            <p className="rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3.5 py-3 font-ops-body text-ops-sm text-ops-muted">
              {ADJ_NOTES.noBatch}
            </p>
          ) : (
            <>
              <FieldShell label="Parti" labelAside="ürün · son tarih">
                <Combobox
                  value={stockId}
                  onChange={props.onStock}
                  options={data.batches.map((batch) => ({ value: batch.stockId, label: batchLabel(batch) }))}
                  placeholder="Parti seçin…"
                  searchPlaceholder="Ürün adı ya da son tarih"
                  emptyText="Eşleşen parti yok."
                />
                {selected ? (
                  <span className="mt-1 flex items-center gap-2 font-ops-body text-ops-xs text-ops-muted">
                    Elde {num(selected.physicalQty)} adet
                    {selected.isExpired ? <Badge tone="red">geçti</Badge> : null}
                  </span>
                ) : null}
              </FieldShell>

              <FieldShell label="Adet">
                <Input
                  type="number"
                  min={1}
                  max={selected?.physicalQty}
                  fullWidth={false}
                  className="w-32"
                  value={qty}
                  onChange={(event) => props.onQty(event.target.value)}
                  disabled={busy}
                />
              </FieldShell>

              <FieldShell label="Sebep" labelAside="zorunlu">
                <div className="flex flex-wrap gap-2">
                  {REASONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => props.onReason(option)}
                      disabled={busy}
                      className={`cursor-pointer rounded-ops-btn border px-3 py-1.5 font-ops-body text-ops-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        reason === option
                          ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
                          : 'border-ops-line-strong text-ops-strong hover:border-ops-olive'
                      }`}
                    >
                      {REASON_LABEL[option]}
                    </button>
                  ))}
                </div>
                <span className="mt-1 font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                  {ADJ_NOTES.reasonRequired}
                </span>
              </FieldShell>

              <FieldShell label="Not" labelAside="isteğe bağlı">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(event) => props.onNote(event.target.value)}
                  disabled={busy}
                  placeholder="İstisnai durumun kısa açıklaması"
                />
              </FieldShell>

              {error ? (
                <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-ops-btn border border-ops-olive-line bg-ops-olive-bg px-3 py-2 font-ops-body text-ops-sm text-ops-olive-dark">
                  {success}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button variant="destructive" disabled={busy || Boolean(engel)} onClick={props.onSubmit}>
                  {busy ? 'Kaydediliyor…' : 'Stoktan düş'}
                </Button>
                {engel ? <span className="font-ops-body text-ops-xs text-ops-muted">{engel}</span> : null}
              </div>

              <div className="mt-1 flex flex-col gap-1 border-t border-ops-line-soft pt-3">
                <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{ADJ_NOTES.immediate}</span>
                <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{ADJ_NOTES.positiveElsewhere}</span>
                <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{ADJ_NOTES.noMoney}</span>
              </div>
            </>
          )}

          {/* Sıcaklık kaydı imha formuyla AYNI masada (tasarım: "stoktan düşme, dönen mal kararı
              ve sıcaklık kaydı tek masada") ama ayrı bir iş — kendi durumunu kendi taşıyor. */}
          <TemperatureCard points={data.points} />
        </div>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-ops-line bg-ops-panel">
          <div className="border-b border-ops-line px-5 py-3">
            <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Bugünün kayıtları</span>
          </div>
          {data.today.length === 0 ? (
            <p className="px-5 py-4 font-ops-body text-ops-xs text-ops-muted">{ADJ_NOTES.empty}</p>
          ) : (
            <ul>
              {data.today.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 border-b border-ops-line-soft px-5 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-ops-body text-ops-xs font-semibold text-ops-ink">{entry.title}</span>
                    <span className="font-ops-mono text-ops-xs font-semibold text-ops-red">−{num(entry.qty)}</span>
                  </span>
                  <span className="font-ops-body text-ops-micro text-ops-muted">
                    {REASON_LABEL[entry.reason]} · {entry.time}
                    {entry.referenceNo ? ` · ${entry.referenceNo}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Kırpma GÖRÜNÜR: sessiz tavan, operatöre "bugünün tamamı bu" der ve göremediği kaydı
              ikinci kez girdirir. Cümle taramayı anlatıyor, listeyi değil — depo süzgeci bellekte
              olduğu için "bugün daha fazlası var" demek bilmediğimiz bir şeyi iddia etmek olurdu
              (gerekçe `adjustments-read.ts`). */}
          {data.todayTruncated ? (
            <p className="border-t border-ops-line-soft px-5 py-2 font-ops-body text-ops-micro text-ops-amber-dark">
              Günün son kayıtları tarandı — daha eski girişler bu listede olmayabilir.
            </p>
          ) : null}

          {/* ── SICAKLIK · BUGÜN (10.6) ────────────────────────────────────────────────────
              Tasarım bu şeridi imha kayıtlarıyla AYNI raya koyuyor ve sebebi ortak: ikisi de
              "bugün ne yaptım" sorusunun cevabı.

              **Ölçülmemiş nokta amber KALIR, listeden düşmez** — tasarımın kendi cümlesi. Düşseydi
              atlanan dolap görünmez olurdu ve hijyen defterindeki boşluk ancak denetimde çıkardı;
              amber satır gün boyunca bir hatırlatmadır. */}
          <div className="border-t border-ops-line px-5 py-3">
            <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Sıcaklık · bugün</span>
          </div>
          {data.points.length === 0 ? (
            <p className="px-5 py-3 font-ops-body text-ops-xs text-ops-muted">{ADJ_NOTES.temperatureNewPoint}</p>
          ) : (
            <ul>
              {data.points.map((point) => (
                <li
                  key={point.name}
                  className={`flex items-center justify-between gap-2 border-b border-ops-line-soft px-5 py-2 ${
                    point.temperatureC === null ? 'bg-ops-amber-bg' : ''
                  }`}
                >
                  <span className="truncate font-ops-body text-ops-xs text-ops-body">
                    {point.name}
                    {point.recordedAt ? ` · ${timeOf(point.recordedAt)}` : ''}
                  </span>
                  {point.temperatureC === null ? (
                    <span className="flex-none font-ops-body text-ops-micro font-semibold text-ops-amber-dark">
                      henüz ölçülmedi
                    </span>
                  ) : (
                    <span
                      className={`flex-none font-ops-mono text-ops-xs font-semibold ${
                        point.outOfRange ? 'text-ops-amber-dark' : 'text-ops-olive-dark'
                      }`}
                    >
                      {fmt(point.temperatureC)} {point.outOfRange ? '!' : '✓'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-auto border-t border-ops-line-soft px-5 py-2.5 font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
            {ADJ_NOTES.documentRule}
          </p>
        </aside>
      </div>
    </div>
  );
}

function batchLabel(batch: BatchOption): string {
  return `${batch.title} · ${expiryLabel(batch.expiryDate, batch.isExpired)}`;
}
