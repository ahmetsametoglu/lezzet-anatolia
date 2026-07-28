'use client';

import type { OpsTone } from '@/components/operation/ui/tone';

/**
 * Çok durumlu anahtar (segment) — Komponent Envanteri O8 (girdi kontrolleri).
 *
 * TEK bilginin ikiden çok değeri için: "Satışta / Pasif / Aday", "%5,5 / %20", "DLC / DDM". İki
 * değerli hâli `Toggle`'dır (yuvarlak ray + topuz); üç ve üstü burada.
 *
 * Biçim envanterdeki segmentin kendisidir: **tek gri ray**, içinde SEÇİLİ olanın altında kayan hap.
 * Önceki `Segment` her seçeneği ayrı çerçeveli buton çiziyordu — üç ayrı düğme gibi okunuyordu, oysa
 * bunlar bir alanın değerleri; "hangisi açık" değil "hangisindeyiz" sorusunun cevabı.
 *
 * SAPMA: envanterdeki hap beyaz dolgulu; burada DOLU RENK (varsayılan olive). Gerekçe iki yönlü —
 * beyaz hap gri rayın üstünde silik kalıyordu, ayrıca palet koyu temada bütünüyle ters çevrildiği için
 * (globals §0.6) "beyaz" orada rayın altına düşüyor, yani seçili olan sönük görünüyordu. Dolu renk iki
 * temada da aynı yönde okunur: `ops-olive` koyuda açılır, üstündeki `ops-card` metin koyulaşır.
 *
 * Seçenek genişlikleri EŞİT (`flex-1 basis-0`): kayan hap tek bir `translateX(i × 100%)` ile yerine
 * oturur, etiket uzunluğu değişince hizalama bozulmaz. Toplam genişliği çağıran verir (`className`).
 *
 * `tone` seçeneğe anlam rengi verir — durum seçicilerinde rozetle AYNI sözlük (bkz. OpsTone), böylece
 * "Aday" formda mavi, önizlemedeki rozette de mavi. Verilmezse olive (marka rengi).
 */
type MultiToggleSize = 'sm' | 'md';

const SIZE: Record<MultiToggleSize, string> = {
  sm: 'py-[6px] text-ops-sm',
  md: 'py-[8px] text-ops-sm',
};

// Seçili hapın dolgusu + üstündeki metin. Her çift İKİ temada da aynı yönde çalışır: dolgu koyu
// temada açılır, `ops-card` metin aynı anda koyulaşır (nötrde tersi: dolgu koyulaşır, `ops-ink` açılır).
const TONE: Record<OpsTone, { fill: string; text: string }> = {
  olive: { fill: 'bg-ops-olive', text: 'text-ops-card' },
  neutral: { fill: 'bg-ops-gray-600', text: 'text-ops-ink' },
  amber: { fill: 'bg-ops-amber', text: 'text-ops-card' },
  red: { fill: 'bg-ops-red', text: 'text-ops-card' },
  slate: { fill: 'bg-ops-slate', text: 'text-ops-slate' },
  blue: { fill: 'bg-ops-blue', text: 'text-ops-card' },
};

export interface MultiToggleOption<T extends string> {
  key: T;
  label: string;
  /** Seçiliyken hapın anlam rengi (durum seçicilerinde rozetle aynı sözlük). Yoksa olive. */
  tone?: OpsTone;
  /** Uzun açıklama — kısa etiketin altını dolduran ipucu. */
  title?: string;
}

interface MultiToggleProps<T extends string> {
  value: T;
  options: Array<MultiToggleOption<T>>;
  onChange: (value: T) => void;
  size?: MultiToggleSize;
  /** Erişilebilirlik adı — görünür etiket yoksa (ör. alt bardaki durum seçicisi) zorunlu sayılır. */
  label?: string;
  className?: string;
}

export function MultiToggle<T extends string>({ value, options, onChange, size = 'md', label, className }: MultiToggleProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  // Hap SEÇİLİ seçeneğin tonunu alır — kayarken rengi de değişir, "hangi durumdayım" tek bakışta.
  const tone = TONE[options[index]?.tone ?? 'olive'];

  // Ok tuşları radiogroup'ta seçimi taşır (ARIA deseni). Odak da taşınmalı — seçili olmayan düğmeler
  // sekme sırasının dışında (roving tabindex), aksi hâlde odak geride kalırdı.
  const moveBy = (container: HTMLElement, delta: number) => {
    const next = (index + delta + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target.key);
    container.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
        const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        if (!back && !fwd) return;
        e.preventDefault();
        moveBy(e.currentTarget, fwd ? 1 : -1);
      }}
      className={['relative flex rounded-ops-btn border border-ops-gray-300 bg-ops-gray-100 p-[2px]', className].filter(Boolean).join(' ')}
    >
      {/* Kayan hap — rayın iç yüksekliğini kaplar; genişliği bir slot, yeri translateX ile. */}
      <span
        aria-hidden
        className={['absolute bottom-[2px] left-[2px] top-[2px] rounded-md transition-all duration-150', tone.fill].join(' ')}
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.key)}
            className={[
              'relative z-[1] flex-1 basis-0 cursor-pointer rounded-md px-2 text-center font-ops-display font-semibold transition-colors',
              SIZE[size],
              on ? tone.text : 'text-ops-body hover:text-ops-ink',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
