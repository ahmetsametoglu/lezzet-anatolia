'use client';

import { useRef, useState } from 'react';
import { DateRangeMenu } from '../form/date-field';
import { formatDay } from '../form/calendar-math';
import { Chip } from './chip';

/**
 * **Tarih ARALIĞI süzgeç çipi** — `DateFilterChip`'in aralık kardeşi (13.09, Para ekranı: kullanıcı
 * "tarih aralığıyla süzebilmeliyim" dedi; hazır dört aralık bunu karşılamıyordu).
 *
 * Sözleşme `DateFilterChip` ile AYNI: boşken kesikli davet, tıklayınca seçici açılır; doluyken dolu
 * çip + ✕, tıklayınca süzgeç tek tıkla kalkar. Açılır gövde form alanıyla ortak (`DateRangeMenu`:
 * önayarlar + iki ay) — ikinci bir takvim çizilmez.
 *
 * **Yarım aralık adrese yazılmaz:** ilk tıklama yalnız başlangıcı koyar ve süzgeç adreste taşınıyor —
 * her tıklama gezinme olsaydı liste başlangıç gününe göre bir kez boşuna süzülürdü. Seçim çipin
 * içinde taslak olarak durur, bitiş gelince tek seferde gider; menü yarımken kapanırsa taslak düşer.
 */
interface DateRangeFilterChipProps {
  /** `YYYY-MM-DD`; ikisi de boş = süzgeç KAPALI. */
  from: string;
  to: string;
  /** Kapalıyken yazan davet: "+ tarih". */
  placeholder: string;
  /** Dolu çipin öneki ("Tarih"). */
  label: string;
  /** İkisi boş = temizle. */
  onChange: (from: string, to: string) => void;
  className?: string;
}

export function DateRangeFilterChip({ from, to, placeholder, label, onChange, className }: DateRangeFilterChipProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to });

  if (from && to) {
    return (
      <Chip active onClick={() => onChange('', '')} className={className}>
        {label}: {formatDay(from)} – {formatDay(to)} ✕
      </Chip>
    );
  }

  return (
    <>
      <div ref={anchorRef} className={`inline-flex ${className ?? ''}`}>
        <Chip
          dashed
          onClick={() => {
            setDraft({ from, to });
            setOpen((current) => !current);
          }}
        >
          {placeholder}
        </Chip>
      </div>
      <DateRangeMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        from={draft.from}
        to={draft.to}
        onChange={(nextFrom, nextTo) => {
          setDraft({ from: nextFrom, to: nextTo });
          if (nextFrom && nextTo) onChange(nextFrom, nextTo);
        }}
      />
    </>
  );
}
