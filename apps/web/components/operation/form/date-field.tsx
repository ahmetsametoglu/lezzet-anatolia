'use client';

import { useRef, useState, type ReactNode } from 'react';
import { AnchoredMenu } from '@/components/operation/ui/anchored-menu';
import { CalendarIcon } from '@/components/operation/ui/icons';
import { FieldShell } from './field-shell';
import { Calendar, initialMonth, shiftMonth } from './calendar';
import { RANGE_PRESETS, formatDay, matchingPreset, toDay } from './calendar-math';

// TARİH ve TARİH ARALIĞI seçicileri (envanter O8) — operasyon yüzeyinin ortak alanları.
//
// Ham `<input type="date">` KULLANILMAZ: tarayıcının yerel takvimi her platformda başka görünür,
// dili tarayıcı diline bağlıdır (operasyon yüzeyi Türkçedir) ve önayarlı aralık ("son 30 gün")
// diye bir kavramı yoktur. Tasarım kendi takvimini çiziyor; bu iki alan onun karşılığı.
//
// DEĞER `YYYY-MM-DD` metni — bir TAKVİM GÜNÜ, an değil (bkz. `calendar-math`). Saat/dilim taşımak,
// "31 Temmuz'a kadar" diyen kuralı bazı dilimlerde 30 Temmuz'da bitirirdi.
//
// Açılır kutu `AnchoredMenu` üstünde: konumlandırma, dışarı tıklama ve Esc tek yerde yaşıyor
// (`Select` ve `MultiSelect` de aynı taşı kullanır).

interface TriggerProps {
  text: string;
  placeholder: string;
  disabled?: boolean;
  onClick: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Değeri temizleme — yalnız dolu ve `clearable` alanlarda. */
  onClear?: () => void;
}

/** Alanın kendisi gibi görünen tetikleyici: dolu hâlde tarih, boşta yer tutucu, sağda takvim ikonu. */
function Trigger({ text, placeholder, disabled, onClick, triggerRef, onClear }: TriggerProps) {
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5 text-left transition-colors',
          'hover:border-ops-line-strong focus-visible:border-ops-olive focus-visible:outline-none',
          disabled ? 'cursor-not-allowed opacity-60' : '',
          onClear ? 'pr-9' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={`truncate font-ops-body text-ops-sm ${text ? 'text-ops-ink' : 'text-ops-faint'}`}>
          {text || placeholder}
        </span>
        <span className="flex-none text-ops-faint">
          <CalendarIcon />
        </span>
      </button>
      {onClear ? (
        // Temizleme tetikleyicinin İÇİNDE ama ayrı düğme: "boş bırak" da bir seçimdir (süresiz
        // kampanya) ve takvimi açıp kapatarak yapılamaz.
        <button
          type="button"
          onClick={onClear}
          aria-label="Tarihi temizle"
          className="absolute right-8 top-1/2 -translate-y-1/2 cursor-pointer rounded px-1 font-ops-display text-ops-sm text-ops-faint transition-colors hover:text-ops-red"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

interface DateFieldProps {
  label: ReactNode;
  /** `YYYY-MM-DD` ya da boş. */
  value: string;
  onChange: (day: string) => void;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Boşaltmaya izin ver — "tarih yok" anlamlı bir hâlse (süresiz kampanya). */
  clearable?: boolean;
  className?: string;
}

/** Tekil tarih seçici — etiketli alan + takvim açılır kutusu. */
export function DateField({
  label,
  value,
  onChange,
  required,
  labelAside,
  error,
  placeholder = 'Tarih seç',
  disabled,
  clearable = true,
  className,
}: DateFieldProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [view, setView] = useState(() => initialMonth(value, today));

  return (
    <FieldShell label={label} required={required} labelAside={labelAside} error={error} className={className}>
      <Trigger
        text={formatDay(value)}
        placeholder={placeholder}
        disabled={disabled}
        triggerRef={triggerRef}
        onClick={() => {
          // Açılışta seçili günün ayına dön: takvim en son bakılan ayda kalırsa, dolu bir alanı
          // düzeltmek için o aya elle gezinmek gerekirdi.
          setView(initialMonth(value, today));
          setOpen((o) => !o);
        }}
        onClear={clearable && value ? () => onChange('') : undefined}
      />
      <AnchoredMenu anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={252}>
        <div className="p-3">
          <Calendar
            year={view.year}
            month={view.month}
            selected={value || null}
            today={toDay(today)}
            onPrev={() => setView((v) => shiftMonth(v.year, v.month, -1))}
            onNext={() => setView((v) => shiftMonth(v.year, v.month, 1))}
            onPick={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </div>
      </AnchoredMenu>
    </FieldShell>
  );
}

interface DateRangeFieldProps {
  label: ReactNode;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  labelAside?: ReactNode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Önayar sütununu gizle — kısa aralıklarda ("kampanya tarihleri") gereksiz olabilir. */
  presets?: boolean;
  className?: string;
}

/**
 * Tarih aralığı seçici — iki ay yan yana + önayar sütunu (tasarım).
 *
 * SEÇİM İKİ TIKLAMA: ilki başlangıcı koyar, ikincisi bitişi. Aradaki gezinme aralığı ön izler.
 * İkinci tıklama başlangıçtan ÖNCEYE düşerse aralık ters kurulmaz — o gün yeni başlangıç olur;
 * "31'den 24'e" diye bir aralık, hiç geçerli olmayan bir kuraldır ve DB de reddeder.
 */
export function DateRangeField({
  label,
  from,
  to,
  onChange,
  labelAside,
  error,
  placeholder = 'Tarih aralığı',
  disabled,
  presets = true,
  className,
}: DateRangeFieldProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const today = new Date();
  const [view, setView] = useState(() => initialMonth(from, today));
  const second = shiftMonth(view.year, view.month, 1);
  const activePreset = matchingPreset(from, to, today);

  const pick = (day: string) => {
    // Aralık kapalıysa ya da yeni bir başlangıç isteniyorsa: birinci tıklama.
    if (!from || to || day < from) {
      onChange(day, '');
      return;
    }
    onChange(from, day);
    setOpen(false);
  };

  const text = from && to ? `${formatDay(from)} – ${formatDay(to)}` : from ? `${formatDay(from)} – …` : '';

  return (
    <FieldShell label={label} labelAside={labelAside} error={error} className={className}>
      <Trigger
        text={text}
        placeholder={placeholder}
        disabled={disabled}
        triggerRef={triggerRef}
        onClick={() => {
          setView(initialMonth(from, today));
          setOpen((o) => !o);
        }}
        onClear={from || to ? () => onChange('', '') : undefined}
      />
      <AnchoredMenu anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} width={presets ? 560 : 420}>
        <div className="flex flex-wrap" onMouseLeave={() => setHovered(null)}>
          {presets ? (
            <div className="flex flex-none flex-col gap-0.5 border-r border-ops-line bg-ops-subtle p-2.5">
              {RANGE_PRESETS.map((preset) => {
                const active = activePreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => {
                      const r = preset.range(today);
                      onChange(r.from, r.to);
                      setView(initialMonth(r.from, today));
                      setOpen(false);
                    }}
                    className={`cursor-pointer rounded-ops-btn px-3 py-[7px] text-left font-ops-display text-ops-xs font-medium transition-colors ${
                      active ? 'bg-ops-olive text-white' : 'text-ops-body hover:bg-ops-line-soft'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {/* "Özel…" bir önayar DEĞİL, hiçbirine uymayan seçimin adı — tıklanmaz, durum söyler. */}
              <span
                className={`rounded-ops-btn px-3 py-[7px] font-ops-display text-ops-xs font-medium ${
                  activePreset === null && (from || to) ? 'bg-ops-olive-bg text-ops-olive-dark' : 'text-ops-faint'
                }`}
                title="Takvimden seçilen aralık"
              >
                Özel…
              </span>
            </div>
          ) : null}

          <div className="flex flex-1 flex-wrap gap-5 p-3">
            <Calendar
              year={view.year}
              month={view.month}
              from={from || null}
              to={to || null}
              hovered={hovered}
              onHover={setHovered}
              today={toDay(today)}
              onPrev={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              onPick={pick}
            />
            <Calendar
              year={second.year}
              month={second.month}
              from={from || null}
              to={to || null}
              hovered={hovered}
              onHover={setHovered}
              today={toDay(today)}
              onNext={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              onPick={pick}
            />
          </div>
        </div>
        {/* Seçim satırı: iki tıklamalık akışta "şimdi neredeyim" sorusunu yanıtlar. */}
        <div className="border-t border-ops-line bg-ops-subtle px-3.5 py-2 font-ops-body text-ops-xs text-ops-muted">
          {from && to ? (
            <>
              Seçili: <span className="font-ops-mono text-ops-body">{`${formatDay(from)} – ${formatDay(to)}`}</span>
            </>
          ) : from ? (
            <>Bitiş gününü seçin — başlangıçtan önceki bir gün yeni başlangıç olur.</>
          ) : (
            <>Başlangıç gününü seçin ya da soldan bir önayar kullanın.</>
          )}
        </div>
      </AnchoredMenu>
    </FieldShell>
  );
}
