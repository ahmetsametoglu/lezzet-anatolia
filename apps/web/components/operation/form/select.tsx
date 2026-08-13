'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from '../ui/anchored-menu';
import { CheckIcon } from '../ui/icons';
import { CHIP_MENU_WIDTH, triggerClass, type TriggerVariant } from './trigger';

/**
 * Operasyon select'i — Komponent Envanteri O8 (girdi kontrolleri). Basit tek-seçim açılır liste;
 * native <select> DEĞİL (tasarım stiline uymuyor): kapalı kutu + ▾, açıkken olive çerçeve + gölgeli
 * panel, seçili öğe olive zemin + check. Dışarı tık / Escape kapatır; klavye ile gezilebilir.
 *
 * ARANABİLİR kardeşi `Combobox` (ayrı dosya): seçenek sayısı göz taramasını aştığında o kullanılır.
 * Tetikleyici görünümü ikisinde ORTAK (`triggerClass`) — yan yana duran iki çip aynı kutudur.
 */
export interface SelectOption {
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
  /**
   * `chip` — süzgeç şeritlerinde kullanılan ÇİP biçimi: kesikli çerçeve, yuvarlak uç, "+ …" davetiyle.
   * Alan görünümü (`field`, varsayılan) form içindir; süzgeç şeridinde bir form alanı gibi durmak,
   * çiplerin yanında yabancı bir kutu bırakıyordu.
   */
  variant?: TriggerVariant;
  /**
   * Kutu KİLİTLİ — tıklanmaz ve soluk çizilir (22.19, 12.08).
   *
   * Karar verilmiş bir öneride (asistan kuyruğunun arşivi) form okunur kalıyor ama yazılmıyordu:
   * seçici açılıyor, operatör bir seçenek işaretliyor ve seçtiği hiçbir yere gitmiyordu — ekranın
   * söylediği ile sistemin yaptığı ayrışıyordu.
   */
  disabled?: boolean;
}

export function Select({ value, onChange, options, placeholder = 'Seç', className, variant = 'field', disabled = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div ref={anchorRef} className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={[triggerClass({ variant, open, filled: selected !== null }), disabled ? 'cursor-not-allowed opacity-60' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        {variant === 'chip' ? null : <span className="flex-none text-ops-faint">{open ? '▴' : '▾'}</span>}
      </button>

      {/* Çip biçiminde menü ÇİPİN genişliğini miras ALMAZ: çip içeriği kadar dardır ("+ kategori"),
          menü ise kategori adlarını taşır — miras alınca adlar kırpılıyordu. */}
      <AnchoredMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        width={variant === 'chip' ? CHIP_MENU_WIDTH : 'anchor'}
        className="max-h-64 overflow-y-auto"
      >
        <div role="listbox">
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
                  'flex w-full cursor-pointer items-center justify-between gap-2 px-[13px] py-2.5 text-left font-ops-body text-ops-base transition-colors',
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
      </AnchoredMenu>
    </div>
  );
}
