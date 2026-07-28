import type { ReactNode } from 'react';

/**
 * Operasyon hata gövdesi — pane ortasında merkezlenmiş durum bloğu: ikon kutusu + başlık +
 * açıklama + aksiyon/ek slot. 404 ve 500 ekranları bu TEK bloğu paylaşır (yeni komponent icat
 * edilmez). Çerçeve (AdminSidebar + üst bar) layout/sayfada korunur; burası yalnız gövdedir.
 *
 * `tone` ikon kutusunun rengini belirler — anlam taşır: `neutral` (bulunamadı), `danger` (hata),
 * `warn` (yetki/uyarı). Emoji yok; ikon çizgi SVG olarak `icon` slot'undan gelir.
 */
type ErrorTone = 'neutral' | 'danger' | 'warn';

const TONE: Record<ErrorTone, string> = {
  neutral: 'bg-ops-gray-100 text-ops-body',
  danger: 'bg-ops-red-bg text-ops-red',
  warn: 'bg-ops-amber-bg text-ops-amber',
};

interface ErrorStateProps {
  tone?: ErrorTone;
  icon: ReactNode;
  title: string;
  description: string;
  /** Referans kartı, güvence kutusu, butonlar, çipler — ekrana özgü ek içerik. */
  children?: ReactNode;
}

export function ErrorState({ tone = 'neutral', icon, title, description, children }: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-auto p-8 text-center">
      <span className={['grid h-11 w-11 place-items-center rounded-ops-card', TONE[tone]].join(' ')}>{icon}</span>
      <div className="flex flex-col items-center gap-[7px]">
        <h1 className="font-ops-display text-ops-title font-semibold text-ops-ink">{title}</h1>
        <p className="max-w-[440px] text-pretty font-ops-body text-ops-base leading-relaxed text-ops-body">{description}</p>
      </div>
      {children}
    </div>
  );
}
