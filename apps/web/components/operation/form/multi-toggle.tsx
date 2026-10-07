'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { CONTROL_H } from '@/components/operation/ui/control';
import type { OpsTone } from '@/components/operation/ui/tone';

/**
 * Çok durumlu anahtar: tek bilginin ikiden çok değeri için tek gri ray ve seçili olanın altında kayan dolu renkli hap. Hap dolu
 * renk, çünkü beyaz hap koyu temada rayın altına düşüp seçileni sönük gösteriyordu; `tone` seçeneğe rozetle aynı anlam rengini verir.
 */
type MultiToggleSize = 'sm' | 'md';

// Yükseklik ortak sözlükten, çünkü ray yan yana durduğu girdiyle aynı satırda aynı boyda olmalı.
const SIZE: Record<MultiToggleSize, string> = {
  sm: CONTROL_H.sm,
  md: CONTROL_H.md,
};

// Seçili hapın dolgusu + üstündeki metin. Her çift İKİ temada da aynı yönde çalışır: dolgu koyu
// temada açılır, `ops-card` metin aynı anda koyulaşır (nötrde tersi: dolgu koyulaşır, `ops-ink` açılır).
const TONE: Record<OpsTone, { fill: string; text: string }> = {
  olive: { fill: 'bg-ops-olive', text: 'text-ops-card' },
  neutral: { fill: 'bg-ops-gray-600', text: 'text-ops-ink' },
  amber: { fill: 'bg-ops-amber', text: 'text-ops-card' },
  red: { fill: 'bg-ops-red', text: 'text-ops-card' },
  slate: { fill: 'bg-ops-slate', text: 'text-ops-card' },
  blue: { fill: 'bg-ops-blue', text: 'text-ops-card' },
  violet: { fill: 'bg-ops-violet', text: 'text-ops-card' },
};

export interface MultiToggleOption<T extends string> {
  key: T;
  label: string;
  /** Seçiliyken hapın anlam rengi (durum seçicilerinde rozetle aynı sözlük). Yoksa olive. */
  tone?: OpsTone;
  /** Uzun açıklama — kısa etiketin altını dolduran ipucu. */
  title?: string;
  /**
   * Seçenek şu an seçilemez ama görünür kalır: gizlemek kontrolün genişliğini oynatırdı, kapalı ama görünür seçenek kuralı da
   * öğretir.
   */
  disabled?: boolean;
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

  /**
   * Hapın yeri ve genişliği seçili düğmeden ölçülür, çünkü düğmeler içeriklerine göre büyür ve eşit bölme uzun etiketi komşusuna
   * bindirirdi. Ölçüm boyamadan önce koşar; gelene kadar hap saydamdır.
   */
  const railRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      const button = rail.querySelectorAll('button')[index];
      if (!button) return;
      setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [index, options]);
  // Hap SEÇİLİ seçeneğin tonunu alır — kayarken rengi de değişir, "hangi durumdayım" tek bakışta.
  const tone = TONE[options[index]?.tone ?? 'olive'];

  // Ok tuşları seçimi ve odağı birlikte taşır (roving tabindex); kapalı seçenekler atlanır, hepsi kapalıysa döngü yerinde kalır.
  const moveBy = (container: HTMLElement, delta: number) => {
    for (let step = 1; step <= options.length; step += 1) {
      const next = (index + delta * step + options.length * step) % options.length;
      const target = options[next];
      if (!target || target.disabled) continue;
      onChange(target.key);
      container.querySelectorAll('button')[next]?.focus();
      return;
    }
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
      ref={railRef}
      /**
       * Ray içeriği kadar yer tutar; genişliği çağıran verirse onunki geçerli. `w-fit` yalnız `className` yokken eklenir, çünkü iki
       * genişlik sınıfından hangisinin kazanacağı CSS sırasına bağlı kalırdı.
       */
      className={['relative flex rounded-ops-btn border border-ops-gray-300 bg-ops-gray-100 p-[2px]', SIZE[size], className ?? 'w-fit'].join(' ')}
    >
      {/* Kayan hap — yeri ve genişliği SEÇİLİ DÜĞMEDEN ölçülür (aşağıdaki künye). Ölçüm gelmeden
          çizilmez: yanlış yerde bir kare bir kare bile görünmemeli. */}
      <span
        aria-hidden
        className={['absolute bottom-[2px] top-[2px] rounded-md transition-all duration-150', tone.fill, pill ? '' : 'opacity-0'].join(' ')}
        style={pill ?? undefined}
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
            disabled={o.disabled}
            onClick={() => onChange(o.key)}
            className={[
              // Genişlik içerikten başlar, ray dışarıdan genişletildiyse fazlasını paylaşır; `nowrap` düğmeyi kendi metninin altına
              // indirmez, yani uzun etiket komşusuna binmez.
              'relative z-[1] flex-1 basis-auto whitespace-nowrap rounded-md px-3 text-center font-ops-display font-semibold transition-colors',
              'flex items-center justify-center text-ops-sm',
              // Kapalı seçenek SOLUK ama okunur: gizlemiyoruz, "şu an olmaz" diyoruz.
              o.disabled ? 'cursor-not-allowed text-ops-faint' : 'cursor-pointer',
              on ? tone.text : o.disabled ? '' : 'text-ops-body hover:text-ops-ink',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
