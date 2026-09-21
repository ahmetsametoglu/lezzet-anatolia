'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './button';

// Açık dialogların yığını: dialoglar üst üste açılabilir ve Esc yalnız en üsttekini kapatmalı.
const dialogStack: object[] = [];

/**
 * Operasyon dialogu — ortalanmış panel: başlık, kaydırılır gövde, sabit alt bar.
 * Ayrışma örtü + panel zemini + kenarlıkla kurulur, çünkü koyu temada gölge tek başına görünmez.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Başlığın altındaki tek satır; vurgu isteyen çağıran kendi renkli span'ını geçirir. */
  subtitle?: ReactNode;
  /** Alt bar içeriği (aksiyonlar). Verilmezse alt bar çizilmez. */
  footer?: ReactNode;
  /** Başlık satırının sağındaki sekmeler; başlıkta durur ki gövde kaydırılırken kaybolmasın. */
  headerAside?: ReactNode;
  /** Panel genişliği (CSS max-width). Varsayılan 640px. */
  maxWidth?: number;
  /** Sabit yükseklik (px, tavanı aşmaz) — sekmeli pencerede gövde sekmeye göre zıplamasın. */
  height?: number;
  /** Yükseklik tavanı, ekran yüksekliğinin yüzdesi. Varsayılan 86. */
  maxHeightVh?: number;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, subtitle, footer, headerAside, maxWidth = 640, height, maxHeightVh = 86, children }: DialogProps) {
  const tokenRef = useRef<object>({});
  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    dialogStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      // İçerideki kontrol Esc'i sahiplendiyse (`preventDefault`) pencere kapanmaz: React olayları da
      // `document`ta işlediği için kabarmayı kesmek bu dinleyiciyi durdurmaz.
      if (e.key === 'Escape' && !e.defaultPrevented && dialogStack[dialogStack.length - 1] === token) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = dialogStack.indexOf(token);
      if (i >= 0) dialogStack.splice(i, 1);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-ops-scrim p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth,
          maxHeight: `${maxHeightVh}vh`,
          height: height === undefined ? undefined : `min(${height}px, ${maxHeightVh}vh)`,
        }}
        className="flex w-full flex-col overflow-hidden rounded-ops-dialog border border-ops-line bg-ops-white text-ops-ink shadow-[0_24px_70px_rgba(20,22,18,0.4)]"
      >
        <div className="flex items-start gap-3 border-b border-ops-line px-6 py-[18px]">
          <div className="mr-auto flex flex-col gap-px">
            <span className="font-ops-display text-ops-section font-semibold">{title}</span>
            {subtitle ? <span className="font-ops-body text-ops-sm text-ops-muted">{subtitle}</span> : null}
          </div>
          {headerAside}
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center rounded-ops-btn bg-ops-line-soft font-ops-display text-ops-lead text-ops-body hover:bg-ops-line"
          >
            ✕
          </button>
        </div>

        {/* `min-h-0` şart: flex çocuğunun asgari yüksekliği içeriği kadardır, o olmadan gövde
            kaydırmak yerine uzar ve taşan kısım görünmeden kesilir. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? <div className="flex items-center gap-2.5 border-t border-ops-line bg-ops-subtle px-6 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Form dialoglarının ortak alt barı: solda kayda eşlik eden kontroller ve hata, sağda İptal/Kaydet. */
interface DialogFooterProps {
  /** Kayda eşlik eden aksiyonlar (solda). Zorunlu-alan metni yerine buraya kontrol konur. */
  actions?: ReactNode;
  error?: string | null;
  submitting?: boolean;
  /** Kaydet butonunun submit edeceği `<form id>`. */
  formId: string;
  onCancel: () => void;
  submitLabel?: string;
  /** Vazgeçme düğmesinin sözü — "İptal" kimi formda ayrı bir fiille karışır (transfer kabulü). */
  cancelLabel?: string;
  /**
   * Kaydetmenin engeli; dolu string sebebidir ve düğmenin yanında yazılır. Şema geçersizken submit
   * sessizce yutulur, bu yüzden düğme kilitlenir ve operatöre neyi düzelteceği söylenir.
   */
  blockedReason?: string | null;
}

export function DialogFooter({
  actions,
  error,
  submitting = false,
  formId,
  onCancel,
  submitLabel = 'Kaydet',
  cancelLabel = 'İptal',
  blockedReason = null,
}: DialogFooterProps) {
  return (
    <>
      <div className="mr-auto flex min-w-0 items-center gap-3">
        {actions}
        {error ? <span className="truncate font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
      </div>
      {blockedReason && !error ? (
        <span className="max-w-[320px] truncate font-ops-body text-ops-xs text-ops-muted" title={blockedReason}>
          {blockedReason}
        </span>
      ) : null}
      {/* Düğmeler küçülmez ve bölünmez; yer darsa kısalan engel cümlesidir. */}
      <Button variant="secondary" onClick={onCancel} disabled={submitting} className="shrink-0 whitespace-nowrap">
        {cancelLabel}
      </Button>
      <Button
        variant="primary"
        type="submit"
        form={formId}
        disabled={submitting || Boolean(blockedReason)}
        title={blockedReason ?? undefined}
        className="shrink-0 whitespace-nowrap"
      >
        {submitting ? 'Kaydediliyor…' : submitLabel}
      </Button>
    </>
  );
}
