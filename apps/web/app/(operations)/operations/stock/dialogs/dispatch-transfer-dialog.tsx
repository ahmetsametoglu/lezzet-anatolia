'use client';

import { useState, useTransition } from 'react';
import type { DispatchCandidate } from '@lezzet/application';
import { daysBetween } from '@lezzet/helper';
import { searchIntakeVariantsAction } from '@/lib/warehouse/intake-actions';
import { Badge } from '@/components/operation/ui/badge';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { num } from '@/components/operation/ui/format';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { dispatchTransferAction, suggestDispatchAction } from '../transfer-actions';
import { DISPATCH_NOTES } from '../transfer-labels';

/**
 * SEVK PENCERESİ (19.6) — "sevk ettiğiniz an mal kaynaktan düşer, ara hâl yoktur".
 *
 * Kaynak SORULMAZ (tasarım kuralı): partiler bir depoda duruyor, kaynak çalışılan depodur.
 * Depo-üstü bakışta ("Tüm depolar") yönetici kaynağı burada seçer — o seçim de yalnız öneri
 * okumasına gider; son sözü sunucu söyler (kalemler kaynağa karşı doğrulanır).
 *
 * FEFO ZORLANMAZ: motor sıralar ve uyarır, kilitlemez — parti adetleri elle değiştirilebilir.
 * Öneri KULLANILABİLİR üzerinden yapılır; söz verilmiş mal başka şehre gitmez.
 *
 * Sayı kutularının HEPSİ `fullWidth={false}` taşır (19.08 görsel kırığı): Input'un kabuğu
 * varsayılan `w-full`dür ve flex satırında komşularını — ürün adı dahil — sıfıra ezmişti.
 */

const FORM_ID = 'dispatch-transfer-form';

interface DispatchItem {
  candidate: DispatchCandidate;
  wanted: string;
  /** stockId → girilen adet (string: boş bırakılabilir; gönderimde 0 sayılır). */
  qtyOf: Record<string, string>;
}

interface DispatchDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  warehouses: Array<{ id: string; code: string; name: string }>;
  scopeKind: 'all' | 'limited';
  activeWarehouseId: string | null;
  transitDays: number;
}

export function DispatchTransferDialog({
  open,
  onClose,
  onDone,
  warehouses,
  scopeKind,
  activeWarehouseId,
  transitDays,
}: DispatchDialogProps) {
  // Kaynak: depo-üstü bakışta seçilir; kapsamlıda çalışılan depodur (üst barın seçimi).
  const [sourceId, setSourceId] = useState<string>(activeWarehouseId ?? '');
  const [targetId, setTargetId] = useState<string>('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [variantChoice, setVariantChoice] = useState('');
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const effectiveSource = scopeKind === 'all' ? sourceId : (activeWarehouseId ?? '');
  const source = warehouses.find((w) => w.id === effectiveSource) ?? null;
  const sourceLocked = scopeKind === 'limited';

  const search = (term: string) => {
    startTransition(async () => {
      const { data } = await searchIntakeVariantsAction(term);
      setOptions((data ?? []).map((o) => ({ value: o.variantId, label: o.label })));
    });
  };

  /** Varyant kartını sunucudan iste — öneri + partiler tek turda gelir. */
  const loadCandidate = (variantId: string, wantedQty: number, replaceIndex?: number) => {
    // Seçim tetiklendiği an tetikleyicisinden düşer: hata dönerse Combobox'ta asılı kalıp
    // "seçili ama kart yok" yalanı söylemesin (19.08 çekiminde yakalandı).
    setVariantChoice('');
    if (!effectiveSource) {
      setError('Önce kaynak depo seçin.');
      return;
    }
    startTransition(async () => {
      const { data, error: msg } = await suggestDispatchAction({
        variantId,
        wantedQty,
        sourceWarehouseId: scopeKind === 'all' ? effectiveSource : undefined,
      });
      if (!data) {
        setError(msg ?? 'Öneri alınamadı.');
        return;
      }
      if ('status' in data) {
        setError('Bu boyun kaynak depoda hiç partisi yok — sevk edilecek mal yok.');
        return;
      }
      setError(null);
      const qtyOf: Record<string, string> = {};
      for (const line of data.suggestion.lines) qtyOf[line.stockId] = String(line.qty);
      const item: DispatchItem = { candidate: data, wanted: String(wantedQty), qtyOf };
      setItems((list) =>
        replaceIndex === undefined ? [...list, item] : list.map((it, i) => (i === replaceIndex ? item : it)),
      );
    });
  };

  const lines = items.flatMap((item) =>
    Object.entries(item.qtyOf)
      .map(([sourceStockId, raw]) => ({ sourceStockId, qty: Number(raw) || 0 }))
      .filter((l) => l.qty > 0),
  );

  // Engel varsa düğme kilitlenir ve SEBEBİ yanında yazılır (DialogFooter sözleşmesi) — akış
  // sırasıyla tek mesaj: kaynak → hedef → kalem → miktar.
  const blockedReason = !effectiveSource
    ? 'Kaynak depo seçin'
    : !targetId
      ? 'Hedef depo seçin'
      : items.length === 0
        ? 'Arama kutusundan kalem ekleyin'
        : lines.length === 0
          ? DISPATCH_NOTES.emptyLines
          : null;

  const submit = () => {
    if (blockedReason) return; // Düğme kilitli; Enter'la gelen submit de aynı kurala tabi.
    startTransition(async () => {
      const { data, error: msg } = await dispatchTransferAction({
        toWarehouseId: targetId,
        lines,
        note: note || undefined,
        sourceWarehouseId: scopeKind === 'all' ? effectiveSource : undefined,
      });
      if (!data) {
        setError(msg ?? 'Sevk yazılamadı.');
        return;
      }
      setItems([]);
      setNote('');
      setTargetId('');
      onDone();
    });
  };

  const year = String(new Date().getFullYear()).slice(-2);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sevk oluştur"
      subtitle={DISPATCH_NOTES.subtitle}
      maxWidth={620}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel="Sevk et"
          submitting={busy}
          blockedReason={blockedReason}
        />
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error ? (
          <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
            {error}
          </p>
        ) : null}

        <div className="flex items-end gap-2.5">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-ops-body text-ops-xs text-ops-muted">
              Kaynak{sourceLocked ? ' · çalıştığınız depo' : ''}
            </span>
            {sourceLocked ? (
              <span className="rounded-ops-btn border border-ops-line bg-ops-bg px-3 py-2 font-ops-body text-ops-sm text-ops-ink">
                {source ? `${source.name} (${source.code})` : 'Üst bardan depo seçin'}
              </span>
            ) : (
              <Select
                value={sourceId}
                onChange={(v) => {
                  setSourceId(v);
                  // Kaynak değişti: eski deponun partileri artık geçersiz — kartlar temizlenir,
                  // sessizce yanlış depodan öneri taşımaktansa yeniden istenir.
                  setItems([]);
                }}
                options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                placeholder="Kaynak depo"
              />
            )}
          </label>
          <span className="pb-2 font-ops-body text-ops-sm text-ops-faint">→</span>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-ops-body text-ops-xs text-ops-muted">Hedef</span>
            <Select
              value={targetId}
              onChange={setTargetId}
              options={warehouses
                .filter((w) => w.id !== effectiveSource)
                .map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              placeholder="Hedef depo"
            />
          </label>
        </div>

        {source ? (
          <p className="-mt-1 font-ops-body text-ops-micro text-ops-muted">
            {DISPATCH_NOTES.reference(`TRF-${source.code}-${year}-…`, transitDays)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5 border-t border-ops-line pt-3">
          <div className="flex items-center gap-2.5">
            <span className="mr-auto font-ops-display text-ops-sm font-semibold text-ops-ink">
              Kalemler <span className="font-ops-body text-ops-xs font-normal text-ops-muted">· {DISPATCH_NOTES.fefoHint}</span>
            </span>
            <div className="w-56">
              <Combobox
                value={variantChoice}
                onChange={(variantId) => {
                  setVariantChoice(variantId);
                  if (variantId) loadCandidate(variantId, 1);
                }}
                options={options}
                onSearch={search}
                placeholder="+ Varyant"
                searchPlaceholder="Ürün adı"
              />
            </div>
          </div>
          <p className="-mt-1 font-ops-body text-ops-micro text-ops-muted">{DISPATCH_NOTES.footNote}</p>

          {items.map((item, index) => {
            const c = item.candidate;
            const wantedNum = Number(item.wanted) || 0;
            const short = c.suggestion.shortReason;
            const hasNearExpiry = c.batches.some((b) => b.arrivesNearExpiry && (Number(item.qtyOf[b.stockId]) || 0) > 0);
            return (
              <div key={c.variantId} className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-bg px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{c.title}</span>
                    <span className="font-ops-body text-ops-micro text-ops-muted">
                      kullanılabilir {num(c.availableQty)} · ayrılmış {num(c.reservedQty)} sayılmaz
                    </span>
                  </div>
                  <span className="flex-none font-ops-body text-ops-xs text-ops-muted">istenen</span>
                  <Input
                    inputSize="sm"
                    mono
                    fullWidth={false}
                    className="w-16 text-center"
                    inputMode="numeric"
                    value={item.wanted}
                    onChange={(e) => {
                      const wanted = e.target.value.replace(/\D/g, '');
                      setItems((list) => list.map((it, i) => (i === index ? { ...it, wanted } : it)));
                    }}
                    onBlur={() => {
                      // İstenen değişti: öneri yeniden istenir — dağılımı elle kurmak operatörün
                      // hakkı ama varsayılanı motor versin (FEFO + yolda ömür uyarısı).
                      if (wantedNum > 0) loadCandidate(c.variantId, wantedNum, index);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                    className="cursor-pointer rounded-ops-btn border border-ops-line px-2 py-1 font-ops-body text-ops-xs text-ops-muted hover:bg-ops-card"
                  >
                    ✕
                  </button>
                </div>

                {c.batches.map((b) => {
                  const days = daysBetween(new Date(), b.expiryDate);
                  const expired = days < 0;
                  return (
                    <div
                      key={b.stockId}
                      className="grid grid-cols-[96px_minmax(0,1fr)_auto_56px] items-center gap-2.5 rounded-ops-btn border border-ops-line bg-ops-card px-2.5 py-1.5"
                    >
                      <span className="truncate font-ops-mono text-ops-micro text-ops-muted">{b.lotNumber ?? 'lotsuz'}</span>
                      {/* Süresi geçmiş parti KIRMIZI okunur: motor önermez ama listede durur — telefonda
                          "ordan ver" denirse yanlışlıkla seçilmesin (19.08 incelemesi). */}
                      <span
                        className={`truncate font-ops-mono text-ops-micro ${
                          expired ? 'text-ops-red' : b.arrivesNearExpiry ? 'text-ops-amber-dark' : 'text-ops-body'
                        }`}
                      >
                        {new Date(`${b.expiryDate}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ·{' '}
                        {num(days)} gün
                        {expired ? ' · süresi geçmiş' : b.arrivesNearExpiry ? ' · ömrü yolda yanabilir' : ''}
                      </span>
                      <span className="whitespace-nowrap font-ops-body text-ops-micro text-ops-faint">fiili {num(b.physicalQty)}</span>
                      <Input
                        inputSize="sm"
                        mono
                        fullWidth={false}
                        className="w-14 text-center"
                        inputMode="numeric"
                        value={item.qtyOf[b.stockId] ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setItems((list) =>
                            list.map((it, i) => (i === index ? { ...it, qtyOf: { ...it.qtyOf, [b.stockId]: raw } } : it)),
                          );
                        }}
                      />
                    </div>
                  );
                })}

                <span
                  className={`font-ops-body text-ops-micro ${
                    short === 'insufficient_available'
                      ? 'text-ops-red'
                      : hasNearExpiry
                        ? 'text-ops-amber-dark'
                        : 'text-ops-olive-dark'
                  }`}
                >
                  {short === 'insufficient_available'
                    ? DISPATCH_NOTES.insufficient(c.suggestion.suggestedQty, c.reservedQty)
                    : hasNearExpiry
                      ? DISPATCH_NOTES.suggestionNearExpiry
                      : DISPATCH_NOTES.suggestionOk}
                </span>
              </div>
            );
          })}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs text-ops-muted">Not (isteğe bağlı)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ör. soğuk zincir aracıyla, öğleden önce" />
        </label>

        {hasAnyNearExpiry(items) ? <Badge tone="amber">FEFO uyarısı: kısa ömürlü parti seçili</Badge> : null}
      </form>
    </Dialog>
  );
}

function hasAnyNearExpiry(items: DispatchItem[]): boolean {
  return items.some((item) =>
    item.candidate.batches.some((b) => b.arrivesNearExpiry && (Number(item.qtyOf[b.stockId]) || 0) > 0),
  );
}
