'use client';

import { useState } from 'react';
import { fromCents, toCents } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';
import { money, percent } from '@/components/operation/ui/format';
import { setChannelPriceAction } from '@/lib/prices/price-actions';
import type { PriceRow } from '@/lib/pricing/price-rows';
import { marginForAmount } from './price-math';

// SATIR İÇİ FİYAT — günlük düzeltmenin yeri. Hedef marj, otomatik anahtar ve ileri tarih kararı
// burada VERİLMEZ: onlar tam formun işi (çift tık). Bu hücre tek soruya cevap verir: "bu boyun bu
// kanaldaki tutarı ne olsun".
//
// Kaydetmek YENİ FİYAT SATIRI yazar (`setChannelPriceAction`): geçmiş korunur, verilmiş siparişler
// etkilenmez. Boş ve sıfır tutar eylem tarafından reddedilir; ekran da kaydetmeyi hiç denemez.
//
// OTOMATİK FİYATLI üründe hücre kilitlidir ve bu bir engel değil bir açıklamadır: elle yazılan
// tutar bir sonraki otomatik hesapta silinirdi (tam formun kuralıyla aynı).

interface PriceEditCellProps {
  row: PriceRow;
  channel: Channel;
  /** Kaydedildi: liste özetleri ve kırılım bayatlar, çağıran ikisini de tazeler. */
  onSaved: () => void;
  /** Çift tık — tam form; tutarın yanında hedef marj ve tarih de değişebilsin. */
  onOpenForm: () => void;
}

export function PriceEditCell({ row, channel, onSaved, onOpenForm }: PriceEditCellProps) {
  const cell = channel === 'b2c' ? row.b2c : row.b2b;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (row.autoPrice) {
    return (
      <span
        title="Otomatik fiyat açık — tutar hedef marjdan hesaplanıyor. Değiştirmek için hedef marjı düzenleyin."
        onDoubleClick={onOpenForm}
        className="flex h-[30px] w-full cursor-pointer items-center justify-end gap-1.5 rounded-ops-btn bg-ops-surface-sunken px-2 font-ops-mono text-ops-sm font-semibold text-ops-body"
      >
        <span className="font-ops-display text-ops-micro">oto</span>
        {money(cell.amountCents)}
      </span>
    );
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="Tek tık: tutarı düzelt · Çift tık: tam form (hedef marj · otomatik · ileri tarih)"
        onClick={() => {
          setDraft(cell.amountCents === null ? '' : String(fromCents(cell.amountCents)));
          setEditing(true);
        }}
        onDoubleClick={onOpenForm}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          setDraft(cell.amountCents === null ? '' : String(fromCents(cell.amountCents)));
          setEditing(true);
        }}
        className="flex h-[30px] w-full cursor-pointer items-center justify-end rounded-ops-btn border border-dashed border-ops-line-strong bg-ops-white px-2 font-ops-mono text-ops-sm font-semibold text-ops-ink hover:border-ops-olive"
      >
        {money(cell.amountCents)}
      </span>
    );
  }

  const parsed = Number(draft.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const nextMargin = valid ? marginForAmount(channel, parsed, row) : null;

  const commit = async () => {
    if (!valid || busy) return;
    const cents = toCents(parsed);
    if (cents === cell.amountCents) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await setChannelPriceAction(row.variantId, channel, cents);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onSaved();
  };

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="flex h-[30px] w-full items-center gap-1 rounded-ops-btn border-[1.5px] border-ops-olive bg-ops-white px-2 shadow-[0_0_0_3px_rgba(95,122,44,0.14)]">
        {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-ops-olive-line border-t-ops-olive" /> : null}
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit();
            if (event.key === 'Escape') setEditing(false);
          }}
          className="w-full bg-transparent text-right font-ops-mono text-ops-sm font-semibold text-ops-ink outline-none"
        />
      </span>
      {error !== null ? (
        <span className="font-ops-body text-ops-micro text-ops-red">{error}</span>
      ) : (
        <span className="font-ops-body text-ops-micro text-ops-muted">
          {nextMargin === null
            ? 'maliyet bilinmiyor'
            : `marj ${percent(row.marginPercent)} → `}
          {nextMargin === null ? null : <span className="font-semibold text-ops-olive-dark">{percent(nextMargin)}</span>}
        </span>
      )}
    </span>
  );
}
