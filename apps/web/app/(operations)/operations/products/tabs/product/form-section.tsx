import type { ReactNode } from 'react';

// Form bölüm sarmalayıcısı — üst-etiket + dikey slot. Ürün formunda tekrarlayan
// `<section><span uppercase>…` kalıbını tek yere alır (no-duplication). `className` ile
// section'ın flex boşluğu ayarlanır (varsayılan gap-[11px]).

// Başlık, altında ince ayraç çizgisiyle (block → tam genişlik) → bölümün nerede başladığı net.
const LABEL = 'block border-b border-ops-line-soft pb-[7px] font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted';

interface FormSectionProps {
  title: string;
  children: ReactNode;
  /** Section flex boşluğu (varsayılan gap-[11px]). */
  className?: string;
}

export function FormSection({ title, children, className = 'gap-[11px]' }: FormSectionProps) {
  return (
    <section className={`flex flex-col ${className}`}>
      <span className={LABEL}>{title}</span>
      {children}
    </section>
  );
}
