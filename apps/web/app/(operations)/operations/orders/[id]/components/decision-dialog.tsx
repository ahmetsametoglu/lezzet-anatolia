'use client';

import { useEffect, useMemo, useState } from 'react';
import { keptQtyAfter, returnAdjustments, type ReturnPart } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, ReturnDisposition } from '@lezzet/types';
import { Dialog } from '@/components/operation/ui/dialog';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import { money } from '@/components/operation/ui/format';
import { StepButton } from '@/components/operation/ui/step-button';
import { previewFulfillmentAction } from '../../actions';
import type { OrderDetailView, OrderLineView, RefundRouteView } from '../order-detail-types';

// Karar penceresi (Komponent Envanteri O18): kısmi karşılama ve iade aynı hareketi (kalem başına adet düşürmek) yapar,
// farkı ton, sütun başlıkları ve ikinci sütunun sorusu taşır — kısmide stok etkisi, iadede malın akıbeti ve para yolu.
// Adet yalnız düşer ve tutar burada hesaplanmaz: toplam, müşteride kalan adet dahil motorun türetimidir
// (`previewFulfillmentAction`).

/** İptal BURADA YOK: onun penceresi ayrı (`cancel-dialog`) — seçilecek adet ya da yol yok. */
type DecisionKind = 'partial_fulfillment' | 'refund';

interface DecisionDialogProps {
  order: OrderDetailView;
  kind: DecisionKind;
  onClose: () => void;
  onConfirm: (lines: FulfillmentAdjustment[], opts: { refundAccountId: string | null }) => void;
  busy: boolean;
  error: string | null;
}

const DISPOSITION_LABELS: Record<ReturnDisposition, string> = {
  restock: 'rafa döndü',
  discard: 'imha',
  goodwill: 'müşteride kaldı',
};

export function DecisionDialog({ order, kind, onClose, onConfirm, busy, error }: DecisionDialogProps) {
  const refund = kind === 'refund';

  /**
   * Kalem başına düşen adet, akıbet paylarıyla: iadede aynı kalemin adetleri farklı akıbet alabilir, kısmi karşılamada tek
   * pay vardır. Varsayılan akıbet motordan (DOMAIN §8, `defaultsToDiscardOnReturn`): donuk ürün imhadan başlar; yasak değil.
   */
  const [parts, setParts] = useState<Record<string, Part[]>>({});
  const partsOf = (line: OrderLineView): Part[] =>
    parts[line.id] ?? [{ fate: line.defaultsToDiscard ? 'discard' : 'restock', qty: 0 }];
  const updateParts = (line: OrderLineView, next: (list: Part[]) => Part[]) =>
    setParts((prev) => ({ ...prev, [line.id]: next(prev[line.id] ?? partsOf(line)) }));
  const movedOf = (line: OrderLineView) => partsOf(line).reduce((sum, part) => sum + part.qty, 0);
  /** Akıbet alabilecek adet: müşteride kalan adet geri iade edilemez. */
  const openQtyOf = (line: OrderLineView) => line.fulfilledQty - line.goodwillQty;
  const [note, setNote] = useState('');
  // Seçim varsayılan yoldan başlar; hiç tahsilat olmamışsa ilk yol seçili gelir — o durumda iade borcu da doğmayacağı için seçim
  // zaten hareketsiz kalır.
  const [routeId, setRouteId] = useState<string | null>(
    (order.refundRoutes.find((r) => r.isDefault) ?? order.refundRoutes[0])?.accountId ?? null,
  );
  const [preview, setPreview] = useState<{ refundDueCents: number; amountToCollectCents: number; fulfilledAmountCents: number } | null>(null);
  /** Önizleme düşerse SESSİZ kalınmaz: para konuşan pencerede boş bir "…" onaya izin veremez. */
  const [previewError, setPreviewError] = useState<string | null>(null);

  const touched = order.lines.filter((line) => movedOf(line) > 0);
  const returnPartsOf = (line: OrderLineView): ReturnPart[] =>
    partsOf(line).map((part) => ({ disposition: part.fate, qty: part.qty, note }));

  /**
   * Motora gidecek hâl. Müşteride kalan pay miktarı DEĞİŞTİRMEZ — hem önizleme hem yazım için aynı kural,
   * yoksa pencerede görünen tutar ile kaydedilen tutar ayrışırdı.
   */
  const proposed = useMemo(
    () =>
      order.lines.map((line) => ({
        orderItemId: line.id,
        fulfilledQty: refund ? keptQtyAfter(line.fulfilledQty, returnPartsOf(line)) : line.fulfilledQty - movedOf(line),
        goodwillQty:
          line.goodwillQty + (refund ? partsOf(line).reduce((sum, part) => (part.fate === 'goodwill' ? sum + part.qty : sum), 0) : 0),
      })),
    [order.lines, parts, refund],
  );

  // Önizleme sunucudan: tuşa her basışta değil, duraklayınca sorulur.
  useEffect(() => {
    const timer = setTimeout(() => {
      void previewFulfillmentAction(order.id, proposed).then(({ data, error: previewFailed }) => {
        setPreview(data);
        setPreviewError(previewFailed);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [order.id, proposed]);

  const route = order.refundRoutes.find((r) => r.accountId === routeId) ?? null;
  // Önizleme gelmeden onay AÇILMAZ: tutarını görmediğin bir iadeyi onaylamak, kararı kör vermektir.
  const blocked = busy || touched.length === 0 || preview === null || previewError !== null;

  // İadede paylar sıralı düzeltmelere motorda çevrilir; rampa ekranı da aynı fonksiyonu kullanır.
  const submit = () => {
    const lines: FulfillmentAdjustment[] = touched.flatMap((line) =>
      refund
        ? (returnAdjustments(line.id, line.fulfilledQty, returnPartsOf(line)) ?? [])
        : [{ orderItemId: line.id, fulfilledQty: line.fulfilledQty - movedOf(line), returnDisposition: null, note: note.trim() || null }],
    );
    onConfirm(lines, { refundAccountId: refund ? routeId : null });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={760}
      title={`${refund ? 'İade' : 'Kısmi karşılama'} — ${order.referenceNo ?? '—'}`}
      subtitle={`${order.customerName} · ${refund ? 'teslim edilmiş sipariş' : 'henüz teslim edilmedi'}`}
      footer={
        <>
          <span className="mr-auto max-w-[300px] font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            {refund
              ? 'Onaylandığında müşteriye bildirim düşer; metin şablondan gider.'
              : 'Zaman çizelgesine "kısmi karşılandı" olarak yazılır.'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant={refund ? 'destructive' : 'warning'} onClick={submit} disabled={blocked}>
            {refund ? `İadeyi onayla${refundLabel(preview)}` : 'Kısmi karşılamayı kaydet'}
          </Button>
        </>
      }
    >
      <div
        className={`rounded-ops-card border px-3.5 py-2.5 font-ops-body text-ops-xs font-medium leading-[1.55] ${
          refund
            ? 'border-ops-red-line bg-ops-red-bg text-ops-red'
            : 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark'
        }`}
      >
        {refund
          ? 'İade tutarını sistem hesaplar (tahsil edilen − karşılanan); siz onaylarsınız. Malın akıbeti stok hareketini, para yolu Para ekranını besler.'
          : 'Karşılanan adedi düşürürsen tutardan düşülür ve ayrılan stok serbest kalır. Tahsilat yapılmışsa fark otomatik iade akışına devrolur — bu pencere kendi başına para hareketi yaratmaz.'}
      </div>

      {error || previewError ? (
        <div className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error ?? `Tutar hesaplanamadı — ${previewError}`}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-ops-card border border-ops-line">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_158px_88px] gap-x-2 border-b border-ops-line bg-ops-subtle px-3.5 py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted">
          <span>Kalem</span>
          <span className="text-center">{refund ? 'İade adedi' : 'Eksik giden'}</span>
          <span>{refund ? 'Malın akıbeti' : 'Stok etkisi'}</span>
          <span className="text-right">Tutar</span>
        </div>

        {order.lines.flatMap((line) => {
          const list = partsOf(line);
          const moved = movedOf(line);
          // Ayırma yalnız iadede ve iki adetten itibaren: tek adetin bölünecek payı yok, pay sayısı da sunulan akıbetlerle sınırlı.
          const canSplit = refund && openQtyOf(line) >= 2 && list.length < order.returnDispositions.length && moved < openQtyOf(line);
          return list.map((part, index) => (
            <LineRow
              key={`${line.id}-${index}`}
              line={line}
              refund={refund}
              dispositions={order.returnDispositions}
              part={part}
              max={openQtyOf(line) - (moved - part.qty)}
              lead={index === 0}
              onQty={(qty) => updateParts(line, (items) => items.map((item, at) => (at === index ? { ...item, qty } : item)))}
              onFate={(fate) => updateParts(line, (items) => items.map((item, at) => (at === index ? { ...item, fate } : item)))}
              onSplit={
                index === 0 && canSplit
                  ? () =>
                      updateParts(line, (items) => [
                        ...items,
                        { fate: order.returnDispositions.find((option) => !items.some((item) => item.fate === option))!, qty: 0 },
                      ])
                  : null
              }
              onRemove={index > 0 ? () => updateParts(line, (items) => items.filter((_, at) => at !== index)) : null}
            />
          ));
        })}
      </div>

      {/* Sebep notu — tasarımda yok, bilinçli ekleme: stoğa dönüş ve imha kayıtları SEBEPSİZ
          yazılmaz. Boş bırakılırsa motor kendi varsayılan metnini yazar. */}
      <Input
        inputSize="sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={refund ? 'Sebep (stok kaydına düşer) — "kutu ezik geldi"' : 'Sebep — "depoda 1 adet eksik çıktı"'}
        aria-label="Sebep notu"
      />

      {refund && order.refundRoutes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
            İade yolu
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
            {order.refundRoutes.map((option) => (
              <RouteCard
                key={option.accountId ?? 'geldigi-yollara'}
                option={option}
                active={option.accountId === routeId}
                onSelect={() => setRouteId(option.accountId)}
              />
            ))}
          </div>
          {route?.caveat ? (
            <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-amber-dark">{route.caveat}</span>
          ) : null}
        </div>
      ) : null}

      {/* Hesap kutusu — sayıların hepsi motordan. Boşken bile çizilir: pencerenin sonunda para
          konuşulacağı baştan bilinsin. */}
      <div className="flex flex-col gap-1.5 rounded-ops-card border border-ops-line-strong bg-ops-subtle px-3.5 py-3">
        <CalcRow label="Karşılanan tutar" value={preview ? money(preview.fulfilledAmountCents) : '…'} />
        {refund ? (
          <CalcRow label="Sistemin türettiği iade" value={preview ? money(preview.refundDueCents) : '…'} tone="red" />
        ) : (
          <CalcRow
            label="Tahsil edilecek kalan"
            value={preview ? money(preview.amountToCollectCents) : '…'}
            strong
            tone="amber"
          />
        )}

        {preview && refund && preview.refundDueCents === 0 && touched.length > 0 ? (
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            Tahsil edilmiş para yok — iade borcu doğmuyor. Kayıt yine de düşer: mal geri geldi.
          </span>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Onay düğmesinin tutarı: motorun türettiği, kapı da aynısını öder. */
function refundLabel(preview: { refundDueCents: number } | null): string {
  return preview && preview.refundDueCents > 0 ? ` · ${money(preview.refundDueCents)}` : '';
}

/** Kalemin bir payı: kaç adet, hangi akıbet; kısmi karşılamada akıbet okunmaz. */
interface Part {
  fate: ReturnDisposition;
  qty: number;
}

interface LineRowProps {
  line: OrderLineView;
  refund: boolean;
  /** Bu siparişte sunulan akıbetler; mal müşteriye ulaşmadıysa "müşteride kaldı" yok. */
  dispositions: readonly ReturnDisposition[];
  part: Part;
  /** Bu payın tavanı: karşılanan adetten öteki payların aldığı düşülür. */
  max: number;
  /** Kalemin ilk satırı mı — ad ve künye yalnız orada, sonraki paylar aynı kalemin altında girintili durur. */
  lead: boolean;
  onQty: (next: number) => void;
  onFate: (next: ReturnDisposition) => void;
  onSplit: (() => void) | null;
  onRemove: (() => void) | null;
}

function LineRow({ line, refund, dispositions, part, max, lead, onQty, onFate, onSplit, onRemove }: LineRowProps) {
  const moved = part.qty;
  const goodwill = refund && part.fate === 'goodwill';
  // Satır tutarı toplamın DAĞILIMI: kalemin indirimli birim tutarı × düşen adet.
  const unitCents = line.qty > 0 ? Math.round(line.lineTotalCents / line.qty) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px_158px_88px] items-center gap-x-2 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0">
      {lead ? (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{line.title}</span>
          <span className="font-ops-mono text-ops-micro text-ops-muted">
            {refund
              ? `teslim ${line.fulfilledQty}${line.goodwillQty > 0 ? ` · ${line.goodwillQty} müşteride` : ''}`
              : `sipariş ${line.qty} · karşılanan ${line.fulfilledQty}`}{' '}
            · birim{' '}
            {money(unitCents)}
          </span>
          {onSplit ? (
            <button
              type="button"
              onClick={onSplit}
              className="mt-0.5 w-fit cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive-dark hover:underline"
            >
              + adetleri farklı akıbete ayır
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2 pl-3.5">
          <span className="font-ops-body text-ops-micro text-ops-muted">↳ aynı kalem</span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="cursor-pointer font-ops-body text-ops-micro text-ops-muted hover:text-ops-ink hover:underline"
            >
              kaldır
            </button>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5">
        <StepButton label="−" ariaLabel="Adet azalt" onClick={() => onQty(Math.max(0, moved - 1))} disabled={moved <= 0} />
        <span className="min-w-4 text-center font-ops-mono text-ops-sm font-medium text-ops-ink">{moved}</span>
        <StepButton label="+" ariaLabel="Adet artır" onClick={() => onQty(Math.min(max, moved + 1))} disabled={moved >= max} />
      </div>

      <div className="flex flex-wrap gap-1">
        {refund ? (
          dispositions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFate(option)}
              disabled={moved === 0}
              className={`cursor-pointer rounded-[6px] border px-1.5 py-1 font-ops-display text-ops-micro font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                moved > 0 && part.fate === option
                  ? 'border-ops-red bg-ops-red text-ops-card'
                  : 'border-ops-line-strong bg-ops-white text-ops-body'
              }`}
            >
              {DISPOSITION_LABELS[option]}
            </button>
          ))
        ) : (
          <span
            className={`rounded-[6px] border px-1.5 py-1 font-ops-display text-ops-micro font-semibold ${
              moved > 0
                ? 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark'
                : 'border-ops-line bg-ops-white text-ops-muted'
            }`}
          >
            {moved > 0 ? 'stok serbest' : 'tam gidiyor'}
          </span>
        )}
      </div>

      <span
        className={`text-right font-ops-mono text-ops-xs ${
          moved > 0 ? (refund ? 'font-medium text-ops-red' : 'font-medium text-ops-amber-dark') : 'text-ops-faint'
        }`}
      >
        {moved > 0 ? `${refund ? '' : '−'}${money(unitCents * moved)}` : '—'}
        {goodwill ? <span className="ml-1 text-ops-muted">müşteride</span> : null}
      </span>
    </div>
  );
}

function RouteCard({ option, active, onSelect }: { option: RefundRouteView; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-0.5 rounded-ops-card border px-3 py-2.5 text-left outline-none transition-colors ${
        active ? 'border-ops-olive bg-ops-olive' : 'border-ops-line-strong bg-ops-white hover:border-ops-olive'
      }`}
    >
      <span className={`font-ops-display text-ops-xs font-semibold ${active ? 'text-ops-card' : 'text-ops-strong'}`}>
        {option.label}
        {option.isDefault ? ' · geldiği yer' : ''}
      </span>
      <span className={`font-ops-body text-ops-micro ${active ? 'text-ops-card' : 'text-ops-muted'}`}>{option.sub}</span>
    </button>
  );
}

function CalcRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'red' | 'amber';
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span
        className={`mr-auto ${strong ? 'font-ops-display text-ops-sm font-semibold text-ops-ink' : 'font-ops-body text-ops-xs text-ops-body'}`}
      >
        {label}
      </span>
      <span
        className={`font-ops-mono ${strong ? 'text-ops-lead font-medium' : 'text-ops-sm'} ${
          tone === 'red' ? 'text-ops-red' : tone === 'amber' ? 'text-ops-amber-dark' : 'text-ops-body'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
