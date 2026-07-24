'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from './icons';

/**
 * Operasyon select'i — Komponent Envanteri O8 (girdi kontrolleri). Basit tek-seçim açılır liste;
 * native <select> DEĞİL (tasarım stiline uymuyor): kapalı kutu + ▾, açıkken olive çerçeve + gölgeli
 * panel, seçili öğe olive zemin + check. Dışarı tık / Escape kapatır; klavye ile gezilebilir.
 *
 * Gelişmiş varyantlar (aranabilir "combobox" görsel item'lı, "çoklu seçim" chip'li) tasarımda ayrı
 * component olarak duruyor — gerçek tüketicileri (ürün seçici / alerjen listesi) geldiğinde ayrı
 * dosya olarak eklenecek; bu dosya yalnız basit select'i taşır.
 */
interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** value boşken gösterilen yer tutucu. */
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = 'Seç', className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={['relative', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-[9px] border bg-white px-[13px] py-[11px] font-ops-body text-[13.5px] font-medium outline-none transition-colors',
          open ? 'border-[1.5px] border-ops-olive' : 'border border-ops-line-strong hover:border-ops-olive',
          selected ? 'text-ops-ink' : 'text-ops-faint',
        ].join(' ')}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <span className="flex-none text-ops-faint">{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-[9px] border-[1.5px] border-ops-olive bg-white shadow-[0_8px_24px_rgba(20,22,18,0.12)]"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={[
                  'flex w-full items-center justify-between gap-2 px-[13px] py-2.5 text-left font-ops-body text-[13px] transition-colors',
                  on ? 'bg-ops-olive-bg font-medium text-ops-ink' : 'text-ops-strong hover:bg-ops-subtle',
                ].join(' ')}
              >
                <span className="truncate">{o.label}</span>
                {on ? (
                  <span className="flex-none text-ops-olive-dark">
                    <CheckIcon size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
