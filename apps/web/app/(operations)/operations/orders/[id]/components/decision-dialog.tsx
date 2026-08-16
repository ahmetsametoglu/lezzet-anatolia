'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FulfillmentAdjustment, ReturnDisposition } from '@lezzet/types';
import { Dialog } from '@/components/operation/ui/dialog';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { money } from '@/components/operation/ui/format';
import { StepButton } from '@/components/operation/ui/step-button';
import { previewFulfillmentAction } from '../../actions';
import type { OrderDetailView, OrderLineView, RefundRouteView } from '../order-detail-types';

// Karar penceresi — Komponent Envanteri O18. **Tek bileşen, iki kip.**
//
// Kısmi karşılama ile iade aynı hareketi yapar (kalem başına adet DÜŞÜRMEK) ama farklı gerçeklere
// dayanır: biri mal ÇIKMADAN ("eksik gidiyor"), öteki mal ÇIKTIKTAN sonra ("geri geldi"). İkisini
// iki ayrı pencere yazmak, adet seçicinin ve tutar hesabının iki kopyasını doğururdu; farkı ton,
// sütun başlıkları ve ikinci sütunun sorduğu soru taşır:
//   · kısmi (amber) → ikinci sütun STOK ETKİSİ: eksik kalan ayrılmıştan serbest bırakılır
//   · iade (kırmızı) → ikinci sütun MALIN AKIBETİ (DOMAIN §8) + ayrıca PARA YOLU
//
// **Adet yalnız DÜŞER.** `adjust_fulfillment` artırmayı reddeder ve haklıdır: karşılananı artırmak
// "mal nereden çıktı" sorusunu cevapsız bırakır — çıkan mal hazırlıkta yazılır. Sayaç bu yüzden
// bugünkü karşılanan adetten yukarı çıkmaz.
//
// **Jest iadesi (`goodwill`) ayrı bir hâldir:** mal müşteride kalır, miktar DEĞİŞMEZ, bu yüzden
// motor iade borcunu türetemez — tutarı operatör söyler. Pencere bunu kutu açarak ister, sessizce
// sıfır iade yazmaz.
//
// **Tutar burada hesaplanmaz.** Toplamı motorun kendi türetimi verir (`previewFulfillmentAction` →
// `derivePaymentStatusForOrder`, yalnız adetler önerilen hâliyle). Satır başına yazan tutar bu
// toplamın DAĞILIMIDIR, ayrı bir hesap değil.

/** İptal BURADA YOK: onun penceresi ayrı (`cancel-dialog`) — seçilecek adet ya da yol yok. */
type DecisionKind = 'partial_fulfillment' | 'refund';

interface DecisionDialogProps {
  order: OrderDetailView;
  kind: DecisionKind;
  onClose: () => void;
  onConfirm: (lines: FulfillmentAdjustment[], opts: { refundAccountId: string | null; refundAmount: number | null }) => void;
  busy: boolean;
  error: string | null;
}

const DISPOSITIONS: Array<{ value: ReturnDisposition; label: string }> = [
  { value: 'restock', label: 'rafa döndü' },
  { value: 'discard', label: 'imha' },
  { value: 'goodwill', label: 'müşteride' },
];

export function DecisionDialog({ order, kind, onClose, onConfirm, busy, error }: DecisionDialogProps) {
  const refund = kind === 'refund';

  /** Kalem başına DÜŞEN adet — iki kipte de aynı anlam, farklı ad ("eksik giden" / "iade edilen"). */
  const [move, setMove] = useState<Record<string, number>>({});
  const [fate, setFate] = useState<Record<string, ReturnDisposition>>({});

  /**
   * **Kalemin varsayılan akıbeti** — kural `DOMAIN §8`, eşiği motorda (`defaultsToDiscardOnReturn`).
   *
   * Pencere her kalemde `restock`tan başlıyordu ve bu kuralın TERSİYDİ: *"teslim edilmiş ve sonra
   * iade edilen donuk ürün, soğuk zinciri belgelenemediği için varsayılan olarak imha edilir —
   * restok yalnız admin istisnasıdır."* Kural yazılamıyordu çünkü hangi ürünün donuk olduğunu
   * söyleyen bir alan yoktu; `product.storage_type` (16.08) onu getirdi.
   *
   * Varsayılan bir YASAK değil: üç seçenek de açık kalır, yalnız başlangıç noktası doğru olur.
   */
  const fateOf = (line: OrderLineView): ReturnDisposition =>
    fate[line.id] ?? (line.defaultsToDiscard ? 'discard' : 'restock');
  const [note, setNote] = useState('');
  const [goodwillAmount, setGoodwillAmount] = useState<number | null>(null);
  // Seçim paranın GİRDİĞİ hesaptan başlar; hiç tahsilat olmamışsa ilk yol seçili gelir — o durumda
  // iade borcu da doğmayacağı için seçim zaten hareketsiz kalır.
  const [routeId, setRouteId] = useState<string | null>(
    order.refundRoutes.find((r) => r.isDefault)?.accountId ?? order.refundRoutes[0]?.accountId ?? null,
  );
  const [preview, setPreview] = useState<{ refundDueCents: number; amountToCollectCents: number; fulfilledAmountCents: number } | null>(null);
  /** Önizleme düşerse SESSİZ kalınmaz: para konuşan pencerede boş bir "…" onaya izin veremez. */
  const [previewError, setPreviewError] = useState<string | null>(null);

  const touched = order.lines.filter((line) => (move[line.id] ?? 0) > 0);
  const goodwillLines = touched.filter((line) => refund && fateOf(line) === 'goodwill');
  const needsAmount = goodwillLines.length > 0;

  /**
   * Motora gidecek hâl. Jest satırı miktarı DEĞİŞTİRMEZ — hem önizleme hem yazım için aynı kural,
   * yoksa pencerede görünen tutar ile kaydedilen tutar ayrışırdı.
   */
  const proposed = useMemo(
    () =>
      order.lines.map((line) => ({
        orderItemId: line.id,
        fulfilledQty:
          refund && fateOf(line) === 'goodwill' ? line.fulfilledQty : line.fulfilledQty - (move[line.id] ?? 0),
      })),
    [order.lines, move, fate, refund],
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
  const blocked =
    busy || touched.length === 0 || preview === null || previewError !== null || (needsAmount && (goodwillAmount ?? 0) <= 0);

  const submit = () => {
    const lines: FulfillmentAdjustment[] = touched.map((line) => {
      const disposition = refund ? fateOf(line) : null;
      return {
        orderItemId: line.id,
        fulfilledQty: disposition === 'goodwill' ? line.fulfilledQty : line.fulfilledQty - (move[line.id] ?? 0),
        returnDisposition: disposition,
        note: note.trim() || null,
      };
    });
    onConfirm(lines, {
      refundAccountId: refund ? routeId : null,
      refundAmount: needsAmount ? goodwillAmount : null,
    });
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
            {refund ? `İadeyi onayla${refundLabel(preview, needsAmount, goodwillAmount)}` : 'Kısmi karşılamayı kaydet'}
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

        {order.lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            refund={refund}
            moved={move[line.id] ?? 0}
            fate={fateOf(line)}
            onMove={(next) => setMove((prev) => ({ ...prev, [line.id]: next }))}
            onFate={(next) => setFate((prev) => ({ ...prev, [line.id]: next }))}
          />
        ))}
      </div>

      {/* Sebep notu — tasarımda yok, bilinçli ekleme: stoğa dönüş ve imha kayıtları SEBEPSİZ
          yazılmaz (06). Boş bırakılırsa motor kendi varsayılan metnini yazar. */}
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
                key={option.accountId}
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

        {needsAmount ? (
          <div className="flex flex-col gap-1.5 border-t border-ops-line-soft pt-2">
            <div className="flex items-center gap-2.5">
              <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">
                Jest iadesi — tutarı siz söylersiniz
              </span>
              <MoneyInput
                value={goodwillAmount}
                onChange={setGoodwillAmount}
                // Satır içi: kabuğun `w-full`'ü kapalı, yoksa yanındaki cümleyi ezer.
                fullWidth={false}
                className="w-28 flex-none text-right"
                placeholder="0,00"
                ariaLabel="Jest iadesi tutarı"
              />
            </div>
            <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
              Mal müşteride kalıyor: miktar ve stok değişmez, bu yüzden sistem borcu türetemez (DOMAIN §8).
            </span>
          </div>
        ) : null}

        {preview && refund && !needsAmount && preview.refundDueCents === 0 && touched.length > 0 ? (
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-muted">
            Tahsil edilmiş para yok — iade borcu doğmuyor. Kayıt yine de düşer: mal geri geldi.
          </span>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Onay düğmesinin tutarı: jestte operatörün yazdığı, aksi halde motorun türettiği. */
function refundLabel(
  preview: { refundDueCents: number } | null,
  needsAmount: boolean,
  goodwillAmount: number | null,
): string {
  if (needsAmount) return goodwillAmount ? ` · ${money(Math.round(goodwillAmount * 100))}` : '';
  return preview && preview.refundDueCents > 0 ? ` · ${money(preview.refundDueCents)}` : '';
}

interface LineRowProps {
  line: OrderLineView;
  refund: boolean;
  moved: number;
  fate: ReturnDisposition;
  onMove: (next: number) => void;
  onFate: (next: ReturnDisposition) => void;
}

function LineRow({ line, refund, moved, fate, onMove, onFate }: LineRowProps) {
  // Tavan BUGÜNKÜ karşılanan adet: iki kipte de düşülebilecek en fazla miktar odur.
  const max = line.fulfilledQty;
  const goodwill = refund && fate === 'goodwill';
  // Satır tutarı toplamın DAĞILIMI: kalemin indirimli birim tutarı × düşen adet.
  const unitCents = line.qty > 0 ? Math.round(line.lineTotalCents / line.qty) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px_158px_88px] items-center gap-x-2 border-b border-ops-line-soft px-3.5 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{line.title}</span>
        <span className="font-ops-mono text-ops-micro text-ops-muted">
          {refund ? `teslim ${line.fulfilledQty}` : `sipariş ${line.qty} · karşılanan ${line.fulfilledQty}`} · birim{' '}
          {money(unitCents)}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <StepButton label="−" ariaLabel="Adet azalt" onClick={() => onMove(Math.max(0, moved - 1))} disabled={moved <= 0} />
        <span className="min-w-4 text-center font-ops-mono text-ops-sm font-medium text-ops-ink">{moved}</span>
        <StepButton label="+" ariaLabel="Adet artır" onClick={() => onMove(Math.min(max, moved + 1))} disabled={moved >= max} />
      </div>

      <div className="flex flex-wrap gap-1">
        {refund ? (
          DISPOSITIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onFate(option.value)}
              disabled={moved === 0}
              className={`cursor-pointer rounded-[6px] border px-1.5 py-1 font-ops-display text-ops-micro font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                moved > 0 && fate === option.value
                  ? 'border-ops-red bg-ops-red text-ops-card'
                  : 'border-ops-line-strong bg-ops-white text-ops-body'
              }`}
            >
              {option.label}
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
        {goodwill ? <span className="ml-1 text-ops-muted">jest</span> : null}
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
