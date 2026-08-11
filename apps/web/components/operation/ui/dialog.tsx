'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './button';

// Açık dialogların yığını (üst üste açılabilir: ör. ürün formu → görsel düzenleme). Esc yalnız EN
// ÜSTTEKİ dialogu kapatır; yoksa iç dialog Esc'i dış dialogu da kapatırdı (AnchoredMenu ile aynı dert).
const dialogStack: object[] = [];

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
  /**
   * Başlık satırının SAĞINDA duran sekmeler/kontroller. Uzun formlar tek kolonda duvara döndüğünde
   * alanlar sekmelere bölünür (ör. ürün: Ürün ↔ Beyan) — sekme başlıkta durur ki gövde kaydırılırken
   * kaybolmasın. Kapatma düğmesi her koşulda en sağda kalır.
   */
  headerAside?: ReactNode;
  /** Panel genişliği (CSS max-width). Varsayılan 640px. */
  maxWidth?: number;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, subtitle, footer, headerAside, maxWidth = 640, children }: DialogProps) {
  const tokenRef = useRef<object>({});
  useEffect(() => {
    if (!open) return;
    const token = tokenRef.current;
    dialogStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      // Yalnız yığının tepesindeki dialog Esc'e yanıt verir.
      if (e.key === 'Escape' && dialogStack[dialogStack.length - 1] === token) onClose();
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

        {/* ── GÖVDE KAYDIRILIR: `min-h-0 flex-1` ŞART (11.08) ─────────────────
            İkisi de yoktu ve kaydırma HİÇ ÇALIŞMIYORDU. Sebep flexbox'ın varsayılanı: `flex-col`
            içindeki bir çocuğun asgari yüksekliği içeriği kadardır (`min-height: auto`), yani
            `overflow-y-auto` verilse bile kutu taşan içeriğe göre büyüyor ve kaydıracak bir şey
            kalmıyor. Dışarıdaki `overflow-hidden` de fazlalığı görünmez kılıyor: içerik kesiliyor
            ama okunamıyor.

            Arıza küçük diyaloglarda görünmüyordu (içerik `86vh`i aşmıyordu); ürün formu kuyruğun
            içine girince ortaya çıktı. Düzeltme burada, çünkü hata Dialog'un kendisindeydi —
            çağıran her ekran kazanıyor. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>

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
  /**
   * Kaydetmenin ENGELİ — dolu string engelin SEBEBİDİR ve düğmenin yanında yazılır.
   *
   * Şema geçersizken tarayıcı submit'i zaten yutuyor: düğme etkin görünür, basılır ve HİÇBİR ŞEY
   * olmaz — geri bildirimin en kötü hâli. Engel varsa düğme kilitlenir ve sebebi söylenir; sebep
   * gizlenip yalnız kilit gösterilirse operatör neyi düzelteceğini aramak zorunda kalır.
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
      <Button variant="secondary" onClick={onCancel} disabled={submitting}>
        İptal
      </Button>
      <Button
        variant="primary"
        type="submit"
        form={formId}
        disabled={submitting || Boolean(blockedReason)}
        title={blockedReason ?? undefined}
      >
        {submitting ? 'Kaydediliyor…' : submitLabel}
      </Button>
    </>
  );
}
