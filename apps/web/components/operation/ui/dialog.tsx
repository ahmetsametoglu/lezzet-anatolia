'use client';

import { useEffect, type ReactNode } from 'react';
import { Button } from './button';

/**
 * Operasyon dialogu — Komponent Envanteri O9. Ortalanmış panel: koyu örtü + başlık (başlık/alt +
 * kapat) + kaydırılır gövde + sabit alt bar (footer). Örtüye tıklama / Esc kapatır; panele tıklama
 * yayılmaz. Yıkıcı olmayan formlar (ürün oluştur/düzenle) burada açılır.
 *
 * Ayrışma ÜÇ katmanla kurulur — koyu temada gölge tek başına görünmez: örtü (`ops-scrim`, temayla
 * koyulaşır) + panel zemini (`ops-white` = envanterin "dialog ve girdi zemini"; koyuda kart-altı,
 * yani sayfa ve kart zemininden AÇIK) + 1px kenarlık. Gölge yalnız açık temada iş görür.
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ops-scrim p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-ops-dialog border border-ops-line bg-ops-white text-ops-ink shadow-[0_24px_70px_rgba(20,22,18,0.4)]"
      >
        <div className="flex items-start gap-3 border-b border-ops-line px-6 py-[18px]">
          <div className="mr-auto flex flex-col gap-px">
            <span className="font-ops-display text-[18px] font-semibold">{title}</span>
            {subtitle ? <span className="font-ops-body text-xs text-ops-muted">{subtitle}</span> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-ops-btn bg-ops-line-soft font-ops-display text-base text-ops-body hover:bg-ops-line"
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

/**
 * Form dialoglarının ortak alt barı: SOLDA aksiyon bölgesi (kayda eşlik eden kontroller — ör. aktif/pasif
 * anahtarı) + varsa hata; SAĞDA İptal/Kaydet. Her dialogda elle kurulmaz (no-duplication) → ürün,
 * katalog ve ileride paket dialogları aynı yerleşimi paylaşır. Kaydet, `formId` ile gövdedeki formu submit eder.
 */
interface DialogFooterProps {
  /** Kayda eşlik eden aksiyonlar (solda). Zorunlu-alan metni yerine buraya kontrol konur. */
  actions?: ReactNode;
  error?: string | null;
  submitting?: boolean;
  /** Kaydet butonunun submit edeceği `<form id>`. */
  formId: string;
  onCancel: () => void;
  submitLabel?: string;
}

export function DialogFooter({ actions, error, submitting = false, formId, onCancel, submitLabel = 'Kaydet' }: DialogFooterProps) {
  return (
    <>
      <div className="mr-auto flex min-w-0 items-center gap-3">
        {actions}
        {error ? <span className="truncate font-ops-body text-[11.5px] font-semibold text-ops-red">{error}</span> : null}
      </div>
      <Button variant="secondary" onClick={onCancel} disabled={submitting}>
        İptal
      </Button>
      <Button variant="primary" type="submit" form={formId} disabled={submitting}>
        {submitting ? 'Kaydediliyor…' : submitLabel}
      </Button>
    </>
  );
}
