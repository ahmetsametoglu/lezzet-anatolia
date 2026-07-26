'use client';

import { useEffect, useRef, useState } from 'react';
import { Chip } from '../ui/chip';
import { Input } from './input';
import { SearchIcon } from '../ui/icons';

/**
 * Çoklu seçim (chip'li) + aranabilir açılır liste — Komponent Envanteri O8 (Select & combobox'ın çoklu
 * varyantı). Seçilenler kaldırılabilir çip, "+ ekle" dashed çipi autocomplete'li menü açar. Alerjen,
 * koleksiyon üyeliği gibi çoklu bağlar için paylaşılır (sayfaya özel değil). Dışarı tık / Escape kapar.
 */
interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectProps<T extends string> {
  options: MultiSelectOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  addLabel?: string;
  searchPlaceholder?: string;
}

export function MultiSelect<T extends string>({ options, selected, onChange, addLabel = '+ ekle', searchPlaceholder = 'Ara…' }: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const labelOf = (v: T) => options.find((o) => o.value === v)?.label ?? v;
  const q = query.trim().toLowerCase();
  const remaining = options.filter((o) => !selected.includes(o.value) && (!q || o.label.toLowerCase().includes(q)));

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
    <div className="flex flex-wrap items-center gap-[7px]">
      {selected.map((v) => (
        <Chip key={v} active onClick={() => onChange(selected.filter((x) => x !== v))}>
          {labelOf(v)} ✕
        </Chip>
      ))}

      {options.length > selected.length ? (
        <div ref={ref} className="relative">
          <Chip
            dashed
            onClick={() => {
              setQuery('');
              setOpen((v) => !v);
            }}
          >
            {addLabel}
          </Chip>
          {open ? (
            <div className="absolute left-0 top-[calc(100%+4px)] z-20 flex w-60 flex-col overflow-hidden rounded-[9px] border-[1.5px] border-ops-olive bg-white shadow-[0_8px_24px_rgba(20,22,18,0.12)]">
              <div className="flex items-center gap-2 border-b border-ops-line-soft px-2.5 py-2 text-ops-faint">
                <SearchIcon size={14} />
                <Input inputSize="sm" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="border-0 !px-0 !py-0 focus:border-0" />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {remaining.length === 0 ? (
                  <div className="px-[13px] py-2.5 font-ops-body text-[12.5px] text-ops-faint">Sonuç yok</div>
                ) : (
                  remaining.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange([...selected, o.value]);
                        setQuery('');
                      }}
                      className="w-full cursor-pointer px-[13px] py-2.5 text-left font-ops-body text-[13px] text-ops-strong hover:bg-ops-subtle"
                    >
                      {o.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
