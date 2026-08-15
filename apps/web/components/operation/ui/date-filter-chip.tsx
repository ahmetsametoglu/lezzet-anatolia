'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from './anchored-menu';
import { Chip } from './chip';
import { Calendar, initialMonth, shiftMonth } from '../form/calendar';
import { formatDay, toDay } from '../form/calendar-math';

/**
 * **Takvimli süzgeç çipi** — `FilterChip`'in tarih kardeşi (O2 ailesi).
 *
 * ── NEDEN SABİT LİSTE DEĞİL ─────────────────────────────────────────────────
 * Siparişlerin teslim günü süzgeci "bugün + 7 gün"lük kapalı bir listeydi (kullanıcı bildirimi
 * 15.08): geçmiş bir günü ya da iki hafta sonrasını süzmenin YOLU YOKTU — oysa "geçen salı ne
 * teslim ettik" operasyonun gerçek sorusudur. Takvim her günü açar; geçmiş de serbesttir, çünkü
 * bu bir doğrulama alanı değil BAKIŞ daraltmasıdır.
 *
 * ── SÖZLEŞME `FilterChip` İLE AYNI ─────────────────────────────────────────
 * · boş değer → kesikli davet çipi, tıklayınca takvim açılır
 * · dolu değer → **dolu çip + ✕**, tıklayınca süzgeç TEK tıkla kalkar
 * Takvim `DateInput` ile aynı taşları kullanır (`Calendar` + `AnchoredMenu`): ikinci bir takvim
 * çizimi yok, süzgeçteki ay gezinmesi form alanındakiyle aynı davranır.
 *
 * "Bugün/Yarın" kısayolları eski listenin yaşayan iki satırı: en sık iki sorgu tek tık kalır.
 */
interface DateFilterChipProps {
  /** Seçili gün (`YYYY-MM-DD`); boş dize = süzgeç KAPALI. */
  value: string;
  /** Kapalıyken yazan davet: "+ teslim günü". */
  placeholder: string;
  /** Dolu çipin öneki ("Teslim") — hangi süzgecin dolu olduğu etiketten okunur. */
  label: string;
  /** Boş dize = temizle. */
  onChange: (day: string) => void;
  className?: string;
}

export function DateFilterChip({ value, placeholder, label, onChange, className }: DateFilterChipProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // "Bugün" istemcinin günüdür (`DateInput` ile aynı karar): süzgeç operatörün takvimine göre konuşur.
  const today = new Date();
  const [view, setView] = useState(() => initialMonth(value || null, today));

  if (value) {
    return (
      <Chip active onClick={() => onChange('')} className={className}>
        {label}: {formatDay(value)} ✕
      </Chip>
    );
  }

  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
  };

  return (
    <>
      <div ref={anchorRef} className={`inline-flex ${className ?? ''}`}>
        <Chip
          dashed
          onClick={() => {
            // Açılışta bugünün ayına dön: takvim en son gezilen ayda kalırsa davet her açılışta
            // başka bir aya düşer.
            setView(initialMonth(null, today));
            setOpen((current) => !current);
          }}
        >
          {placeholder}
        </Chip>
      </div>
      {/* 236 = `DateInput` ile aynı ölçü (3 kenarlık + 24 dolgu + 208 ızgara). */}
      <AnchoredMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={236}>
        <div className="flex gap-1.5 px-3 pt-3">
          {/* "Dün" de kısayol (15.08, kullanıcı isteği): "dün ne teslim ettik" en sık geçmiş sorgu. */}
          {[
            { label: 'Dün', offset: -1 },
            { label: 'Bugün', offset: 0 },
            { label: 'Yarın', offset: 1 },
          ].map((quick) => (
            <button
              key={quick.label}
              type="button"
              onClick={() => pick(toDay(new Date(today.getTime() + quick.offset * 86_400_000)))}
              className="cursor-pointer rounded-ops-btn border border-ops-line px-2.5 py-1 font-ops-body text-ops-xs text-ops-strong transition-colors hover:bg-ops-subtle"
            >
              {quick.label}
            </button>
          ))}
        </div>
        <div className="p-3 pt-2">
          <Calendar
            year={view.year}
            month={view.month}
            selected={null}
            today={toDay(today)}
            onPrev={() => setView((v) => shiftMonth(v.year, v.month, -1))}
            onNext={() => setView((v) => shiftMonth(v.year, v.month, 1))}
            onPick={pick}
          />
        </div>
      </AnchoredMenu>
    </>
  );
}
