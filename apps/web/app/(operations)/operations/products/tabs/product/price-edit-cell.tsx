'use client';

import { useState } from 'react';
import { fromCents } from '@lezzet/helper';
import { money } from '@/components/operation/ui/format';
import { cellNote, commitOf, type CellNoteTone } from './price-cell-model';

// Satır içi fiyat günlük düzeltmenin yeridir; hedef marj, otomatik anahtar ve ileri tarih tam formun işidir (çift tık). Kutu ve
// altındaki satır her hâlde aynı yeri kaplar, kutu açılınca ya da hata çıkınca hücre büyüyüp küçülmesin diye.

const NOTE_TONE: Record<CellNoteTone, string> = {
  error: 'text-ops-red',
  preview: 'text-ops-olive-dark font-semibold',
  auto: 'text-ops-olive',
  warn: 'text-ops-amber',
  faint: 'text-ops-faint',
  muted: 'text-ops-muted',
};

interface PriceEditCellProps {
  /** Hücrede görünen tutar; ülke hücresinde ülke fiyatı yoksa genel tutardır (`inherited`). */
  amountCents: number | null;
  inherited?: boolean;
  /** Görünen tutarın marjı, hücrenin kendi kanalı ve uygulanan oranla. */
  margin: number | null;
  /** Kutuya yazılan tutarın marjı. */
  marginFor: (euros: number) => number | null;
  /** Otomatik fiyatlı üründe tutar hedef marjdan hesaplanır, hücre salt okunur. */
  locked: boolean;
  /** O ülkede satılamıyorsa alt satırın sözü. */
  blocked?: string | null;
  hint: string;
  /** Yeni satır yazar; hata metni ya da `null` döner. */
  write: (cents: number) => Promise<string | null>;
  /** Ülke fiyatını kaldırır; yalnız yazılmış ülke hücresinde verilir. */
  remove?: () => Promise<string | null>;
  /** Yazıldı ya da kaldırıldı (`null`); çağıran görünümünü yerinde günceller, liste yeniden okunmaz. */
  onChange: (cents: number | null) => void;
  onOpenForm?: () => void;
}

export function PriceEditCell(props: PriceEditCellProps) {
  const { amountCents, inherited = false, margin, marginFor, locked, blocked = null, hint, write, remove, onChange, onOpenForm } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = commitOf(draft, amountCents);
  const note = cellNote({
    error,
    editing,
    draftChanged: commit?.kind === 'write',
    nextMargin: editing && commit !== null ? marginFor(Number(draft.replace(',', '.'))) : null,
    margin,
    amountCents,
    inherited,
    locked,
    blocked,
    removable: remove !== undefined,
  });

  const open = () => {
    if (locked) return;
    setError(null);
    // Ondalık ayırıcı virgül, çünkü ekranın her yerinde tutar "11,43 €" diye yazıyor.
    setDraft(amountCents === null ? '' : String(fromCents(amountCents)).replace('.', ','));
    setEditing(true);
  };

  const run = async (task: () => Promise<string | null>, next: number | null) => {
    setBusy(true);
    setError(null);
    const failure = await task();
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
    onChange(next);
  };

  const save = () => {
    if (busy || commit === null) return;
    if (commit.kind === 'none') {
      setEditing(false);
      return;
    }
    void run(() => write(commit.cents), commit.cents);
  };

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
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') setEditing(false);
            }}
            className="w-full min-w-0 bg-transparent text-right font-ops-mono text-ops-sm font-semibold text-ops-ink outline-none"
          />
        </span>
      ) : (
        <span
          role={locked ? undefined : 'button'}
          tabIndex={locked ? undefined : 0}
          title={hint}
          onClick={open}
          onDoubleClick={onOpenForm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open();
          }}
          className={[
            'flex h-[30px] items-center justify-end rounded-ops-btn px-2 font-ops-mono text-ops-sm font-semibold',
            locked
              ? 'cursor-pointer bg-ops-surface-sunken text-ops-body'
              : 'cursor-pointer border border-dashed border-ops-line-strong bg-ops-white hover:border-ops-olive',
            inherited ? 'text-ops-faint' : locked ? '' : 'text-ops-ink',
          ].join(' ')}
        >
          {money(amountCents)}
        </span>
      )}
      {note.remove && remove ? (
        // Kutudan odak kaçmasın diye fare basışı engellenir; yoksa kutu kapanır ve bağlantı tıklanmadan kaybolur.
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void run(remove, null)}
          className="cursor-pointer truncate text-right font-ops-body text-ops-micro font-semibold text-ops-olive underline hover:text-ops-olive-dark"
        >
          {note.text}
        </button>
      ) : (
        <span className={['truncate text-right font-ops-body text-ops-micro', NOTE_TONE[note.tone]].join(' ')}>{note.text}</span>
      )}
    </span>
  );
}
