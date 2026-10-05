'use client';

import { customerSheetMaxHeightRatio } from '@lezzet/design-tokens/customer';
import { useEffect, useRef, type ReactNode } from 'react';
import { useVisualViewport } from '@/lib/use-visual-viewport.hook';
import { iconHitClass } from './button';
import { Icon } from './icons';

/**
 * Açık panellerin yığını: Esc yalnız en üsttekini kapatır, gövde kaydırma kilidi ilk panelle kurulup sonuncusuyla kalkar. İç içe
 * panelde tek tuş iki paneli birden kapatmasın diye.
 */
const dialogStack: object[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Müşteri paneli: örtü, kutu, başlık satırı ve kapatma. Kapanma davranışı (Esc yığını, odak tuzağı, odağın çağırana dönmesi, kaydırma
 * kilidi) bir stil değil arayüzün sözü olduğu için bütün paneller bu tek kabuktan geçer.
 */
interface DialogProps {
  /** Başlık; `aria-label` olarak da kullanılır. */
  title: string;
  /** Başlığın altındaki tek cümle; verilmezse çizilmez. */
  description?: string;
  /** Kapatma düğmesinin erişilebilir adı; metin çerçeveden gelir (i18n). */
  closeLabel: string;
  onClose: () => void;
  /** Ortalanmış kutunun genişliği (px); çekmecede yok sayılır, çünkü çekmece ekranın genişliğidir. */
  maxWidth?: number;
  /**
   * Ortalanmış kutu ya da alttan açılan çekmece; kararı cihaz forku verir, kabuk cihazı sormaz. Çekmecede tutamak yok, çünkü sürükleme
   * yok ve çalışmayan bir jest vaat etmek kırık hissettirir.
   */
  placement?: 'center' | 'sheet';
  /** Çekmecenin kaymayan alt bölmesi (eylem düğmeleri): gövdeyle ayrı kutu olduğu için kayan içerik düğmenin altından görünemez. */
  footer?: ReactNode;
  children: ReactNode;
}

export function Dialog({ title, description, closeLabel, onClose, maxWidth = 420, placement = 'center', footer, children }: DialogProps) {
  const sheet = placement === 'sheet';
  const panelRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<object>({});
  const viewport = useVisualViewport();

  useEffect(() => {
    const token = tokenRef.current;
    const opener = document.activeElement as HTMLElement | null;
    dialogStack.push(token);
    if (dialogStack.length === 1) document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      // Uçtaki öğede Tab çevrilir; ortadakilerde tarayıcının kendi sırası korunur.
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = dialogStack.indexOf(token);
      if (i >= 0) dialogStack.splice(i, 1);
      if (dialogStack.length === 0) document.body.style.overflow = '';
      // Odak çağırana döner: `<body>`de kalırsa klavye kullanıcısı listenin başına fırlar.
      opener?.focus?.();
    };
  }, [onClose]);

  /* Çekmecenin örtüsü tarayıcının görünür alanına oturur: klavye ve Chrome'un otomatik doldurma şeridi açıldığında çekmece onların
     üstüne çıkar, tavanı da o alanın oranıdır ki başlık ekranda kalsın. */
  const sheetOverlayStyle = sheet && viewport ? { top: viewport.offsetTop, bottom: 'auto', height: viewport.height } : undefined;
  const sheetMaxHeight = viewport ? Math.round(viewport.height * customerSheetMaxHeightRatio) : `${customerSheetMaxHeightRatio * 100}dvh`;

  return (
    <div
      className={`fixed inset-0 z-40 flex animate-fade-in bg-ink/40 motion-reduce:animate-none ${sheet ? 'items-end justify-center' : 'items-center justify-center px-4'}`}
      style={sheetOverlayStyle}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={sheet ? { maxHeight: sheetMaxHeight } : { maxWidth }}
        className={[
          'flex w-full flex-col outline-none',
          /* Çekmecede başlık sabit, yalnız gövde kayar: başlık uzun formda "neredeyim" işaretidir ve gövdeyle kaysa üstten kırpılırdı.
             Ortalanmış kutuda panelin kendisi kayar. */
          sheet
            ? 'animate-sheet-in overflow-hidden rounded-t-3xl bg-cream shadow-sheet motion-reduce:animate-none'
            : 'max-h-[86vh] gap-4 overflow-y-auto rounded-[22px] border border-sand-275 bg-cream px-7.5 pt-6.5 pb-7 shadow-dialog',
        ].join(' ')}
      >
        <div className={`flex items-start justify-between gap-3 ${sheet ? 'flex-none px-[18px] pt-[18px] pb-[13px]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-1">
            <span className={['font-serif text-ink', sheet ? 'text-h2-sm' : 'text-card-title'].join(' ')}>{title}</span>
            {description && <span className={['font-sans font-normal leading-[1.6] text-body', sheet ? 'text-field-label' : 'text-control'].join(' ')}>{description}</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className={`${iconHitClass} -my-2.5 -mr-2.5 font-sans text-note text-muted hover:text-ink`}
          >
            <Icon name="close" size={sheet ? 16 : 18} />
          </button>
        </div>
        {sheet ? <div className="flex min-h-0 flex-1 flex-col gap-[13px] overflow-y-auto px-[18px] pb-[22px]">{children}</div> : children}
        {sheet && footer && <div className="flex-none border-t border-sand-100 px-[18px] pt-3.5 pb-5">{footer}</div>}
      </div>
    </div>
  );
}
