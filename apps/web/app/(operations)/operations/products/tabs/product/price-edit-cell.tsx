'use client';

import { useState } from 'react';
import { fromCents, toCents } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';
import { money, percent } from '@/components/operation/ui/format';
import { setChannelPriceAction } from '@/lib/prices/price-actions';
import type { PriceRow } from '@/lib/pricing/price-rows';
import { cellMargin, marginForAmount } from './price-math';

// Satır içi fiyat günlük düzeltmenin yeridir; hedef marj, otomatik anahtar ve ileri tarih tam formun işidir (çift tık). Kutu ve
// altındaki marj satırı her hâlde aynı yeri kaplar, kutu açılınca ya da hata çıkınca hücre büyüyüp küçülmesin diye.

interface PriceEditCellProps {
  row: PriceRow;
  channel: Channel;
  /** Yazıldı — çağıran kendi görünümünü yerinde günceller, liste YENİDEN OKUNMAZ. */
  onSaved: (amountCents: number) => void;
  /** Çift tık — tam form; tutarın yanında hedef marj ve tarih de değişebilsin. */
  onOpenForm: () => void;
}

export function PriceEditCell({ row, channel, onSaved, onOpenForm }: PriceEditCellProps) {
  const cell = channel === 'b2c' ? row.b2c : row.b2b;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(draft.replace(',', '.'));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const ownMargin = cellMargin(row, channel);
  const nextMargin = editing && valid ? marginForAmount(channel, parsed, row) : null;

  const open = () => {
    if (row.autoPrice) return;
    setError(null);
    // Ondalık ayırıcı virgül, çünkü ekranın her yerinde tutar "11,43 €" diye yazıyor.
    setDraft(cell.amountCents === null ? '' : String(fromCents(cell.amountCents)).replace('.', ','));
    setEditing(true);
  };

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
    onSaved(cents);
  };

  // Alt satırın içeriği değişir, varlığı değişmez.
  const note = error
    ? { text: error, cls: 'text-ops-red' }
    : nextMargin !== null
      ? { text: `${percent(ownMargin)} → ${percent(nextMargin)}`, cls: 'text-ops-olive-dark font-semibold' }
      : row.autoPrice
        ? { text: 'otomatik fiyat', cls: 'text-ops-olive' }
        : cell.amountCents === null
          ? { text: 'fiyat yok', cls: 'text-ops-amber' }
          : { text: ownMargin === null ? 'marj bilinmiyor' : `marj ${percent(ownMargin)}`, cls: 'text-ops-muted' };

  return (
    <span className="flex flex-col gap-0.5">
      {editing ? (
        <span className="flex h-[30px] items-center gap-1 rounded-ops-btn border-[1.5px] border-ops-olive bg-ops-white px-2 shadow-[0_0_0_3px_rgba(95,122,44,0.14)]">
          {busy ? <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-ops-olive-line border-t-ops-olive" /> : null}
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            disabled={busy}
            // Tutar seçili açılır; seçilmeden açılınca yazılan rakam eskisinin sonuna eklenirdi.
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commit();
              if (event.key === 'Escape') setEditing(false);
            }}
            className="w-full min-w-0 bg-transparent text-right font-ops-mono text-ops-sm font-semibold text-ops-ink outline-none"
          />
        </span>
      ) : (
        <span
          role={row.autoPrice ? undefined : 'button'}
          tabIndex={row.autoPrice ? undefined : 0}
          title={
            row.autoPrice
              ? 'Otomatik fiyat açık — tutar hedef marjdan hesaplanıyor. Çift tık: hedef marjı düzenle.'
              : 'Tek tık: tutarı düzelt · Çift tık: tam form (hedef marj · otomatik · ileri tarih)'
          }
          onClick={open}
          onDoubleClick={onOpenForm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open();
          }}
          className={[
            'flex h-[30px] items-center justify-end rounded-ops-btn px-2 font-ops-mono text-ops-sm font-semibold',
            row.autoPrice
              ? 'cursor-pointer bg-ops-surface-sunken text-ops-body'
              : 'cursor-pointer border border-dashed border-ops-line-strong bg-ops-white text-ops-ink hover:border-ops-olive',
          ].join(' ')}
        >
          {money(cell.amountCents)}
        </span>
      )}
      <span className={['truncate text-right font-ops-body text-ops-micro', note.cls].join(' ')}>{note.text}</span>
    </span>
  );
}
