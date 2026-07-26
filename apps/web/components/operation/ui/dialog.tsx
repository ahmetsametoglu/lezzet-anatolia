'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Operasyon dialogu — Komponent Envanteri O9. Ortalanmış panel: koyu örtü + başlık (başlık/alt +
 * kapat) + kaydırılır gövde + sabit alt bar (footer). Örtüye tıklama / Esc kapatır; panele tıklama
 * yayılmaz. Yıkıcı olmayan formlar (ürün oluştur/düzenle) burada açılır. Gölge yalnız yüzen katmanda.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Alt bar içeriği (aksiyonlar). Verilmezse alt bar çizilmez. */
  footer?: ReactNode;
  /** Panel genişliği (CSS max-width). Varsayılan 640px. */
  maxWidth?: number;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, subtitle, footer, maxWidth = 640, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(34,37,31,0.42)] p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-ops-dialog bg-ops-card text-ops-ink shadow-[0_24px_70px_rgba(20,22,18,0.4)]"
      >
        <div className="flex items-center gap-3 border-b border-ops-line px-6 py-[18px]">
          <div className="mr-auto flex flex-col gap-px">
            <span className="font-ops-display text-[18px] font-semibold">{title}</span>
            {subtitle ? <span className="font-ops-body text-xs text-ops-muted">{subtitle}</span> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-ops-btn bg-ops-line-soft font-ops-display text-base text-ops-body hover:bg-ops-line"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex items-center gap-2.5 border-t border-ops-line bg-ops-subtle px-6 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
