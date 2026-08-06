'use client';

import { useRef, useState } from 'react';
import { AnchoredMenu } from './anchored-menu';
import { Chip } from './chip';

/**
 * **Süzgeç çipi** — operasyon süzgeç şeritlerinin ortak kontrolü (O2 ailesi).
 *
 * ── NEDEN `Select` DEĞİL ────────────────────────────────────────────────────
 * `form/select.tsx` bir FORM kontrolüdür ve farkı tek cümlede durur: **form alanının her zaman bir
 * değeri vardır, süzgecin "kapalı" hâli vardır.** `Select`'te temizleme diye bir kavram yok, çünkü
 * bir form alanı boşaltılmaz. Para ekranında `Select`in `chip` varyantı süzgeç olarak kullanıldı ve
 * sonuç tutarsızdı (kullanıcı bildirimi 05.08): seçim yapılınca çipi geri kapatmanın yolu menüyü
 * açıp "+ tarih"i yeniden seçmekti — oysa süzgeç TEK tıkla kalkmalı.
 *
 * ── NEDEN SAYFA-YEREL DEĞİL ─────────────────────────────────────────────────
 * Bu davranış zaten vardı ama Ürünler ekranının İÇİNDE, elle yazılmış bir `StatusFilterChip`
 * olarak. Üçüncü kopya yazılmasına bir ekran kalmıştı (Para · Müşteriler · Fiyatlar hepsi aynı
 * şeridi kuruyor). Doğru olan davranışı kite almak, yanlış olanı çoğaltmak değil.
 *
 * ── SÖZLEŞME ───────────────────────────────────────────────────────────────
 * · `value === emptyValue` → **kesikli davet çipi** (`+ durum`), tıklayınca menü açılır
 * · başka bir değer → **dolu çip + ✕**, tıklayınca süzgeç TEK tıkla kalkar
 *
 * Menü seçenekleri `emptyValue`u İÇERMEZ: "hepsi"ni menüye koymak, temizlemenin iki ayrı yolunu
 * (çipteki ✕ ve menüdeki satır) doğururdu ve ikisi bir gün ayrışırdı.
 */
interface FilterChipProps<T extends string> {
  value: T;
  /** Süzgecin KAPALI hâli — bu değerdeyken çip davet biçiminde çizilir. */
  emptyValue: T;
  /** Kapalıyken yazan davet: "+ durum", "+ tür", "+ tarih". */
  placeholder: string;
  /** Seçilebilir değerler — `emptyValue` buraya KONMAZ. */
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Menü genişliği (px) — seçenek adları uzunsa çipten geniş olmalı. */
  menuWidth?: number;
  className?: string;
}

export function FilterChip<T extends string>({
  value,
  emptyValue,
  placeholder,
  options,
  onChange,
  menuWidth = 180,
  className,
}: FilterChipProps<T>) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  if (value !== emptyValue) {
    const active = options.find((option) => option.value === value);
    return (
      <Chip active onClick={() => onChange(emptyValue)} className={className}>
        {/* Etiket bulunamazsa ham değer BASILMAZ, davet geri gelir: bilinmeyen bir süzgeç değeri
            (eskimiş bağlantı) operatöre anlamsız bir dize göstermemeli. */}
        {active ? `${active.label} ✕` : placeholder}
      </Chip>
    );
  }

  return (
    <>
      <div ref={anchorRef} className={`inline-flex ${className ?? ''}`}>
        <Chip dashed onClick={() => setOpen((current) => !current)}>
          {placeholder}
        </Chip>
      </div>
      <AnchoredMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        width={menuWidth}
        className="flex max-h-64 flex-col overflow-y-auto"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className="cursor-pointer px-[13px] py-2.5 text-left font-ops-body text-ops-base text-ops-strong transition-colors hover:bg-ops-subtle"
          >
            {option.label}
          </button>
        ))}
      </AnchoredMenu>
    </>
  );
}
