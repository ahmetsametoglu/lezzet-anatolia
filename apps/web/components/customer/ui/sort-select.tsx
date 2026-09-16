'use client';

import { useRef, useState, type ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { useDismiss } from './use-dismiss.hook';

/**
 * Sıralama seçici — tasarımdaki tek açılır düğme ("Sırala: Öne çıkanlar ▾").
 *
 * Client bileşen olmak ZORUNDA: `details/summary` yalnız kendi başlığına tıklanınca kapanır, menü
 * açıkken sayfanın boşluğuna basmak onu kapatmaz; dışarı tıklama ve Escape gerçek dinleyici ister
 * (`useDismiss`).
 *
 * Seçenekler `<Link>`: sıralama sunucuda çözülür, seçim URL'de yaşar. `scroll={false}` çünkü süzgeç
 * değiştirmek sayfayı başa fırlatmamalı.
 */
interface SortOption {
  label: string;
  href: ComponentProps<typeof Link>['href'];
  active: boolean;
}

interface SortSelectProps {
  /** "Sırala:" — düğme metninin sabit ön eki. */
  label: string;
  /** Seçili seçeneğin adı — düğmenin üstünde görünen değer. */
  currentLabel: string;
  options: SortOption[];
  /**
   * Mobil: düğme yalnız SEÇİLİ değeri gösterir ("Önerilen ▾"), "Sırala:" ön eki düşer. Tasarımın
   * kararı — dar ekranda süzgeç satırı tek satır kalmalı, ön ek o satırı taşırır.
   */
  compact?: boolean;
}

export function SortSelect({ label, currentLabel, options, compact = false }: SortSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label} ${currentLabel}`}
        className={[
          'flex flex-none cursor-pointer items-center gap-1 rounded-pill border-[1.5px] border-sand-400 bg-card font-sans text-control whitespace-nowrap text-ink transition-colors hover:border-olive',
          compact ? 'px-3 py-1.5 !text-micro font-bold' : 'px-4 py-2',
        ].join(' ')}
      >
        {compact ? currentLabel : `${label} ${currentLabel}`} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 flex min-w-52 flex-col overflow-hidden rounded-soft border border-sand-200 bg-card">
          {options.map((o) => (
            <Link
              key={o.label}
              href={o.href}
              scroll={false}
              onClick={() => setOpen(false)}
              className={[
                'cursor-pointer px-4 py-2.5 font-sans text-control transition-colors hover:bg-hover-bg',
                o.active ? 'text-olive' : 'text-ink',
              ].join(' ')}
            >
              {o.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
