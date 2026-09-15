'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { iconHitClass } from './button';
import { Icon } from './icons';

/**
 * Koyu hap haber şeridi: tek cümle ve isteğe bağlı tek eylem; sitenin tek haber dili. Konum dış kapta, animasyon hapta:
 * `pop` `transform`u ezdiği için konum `translateX(-50%)` ile verilseydi hap belirirken yana kayardı.
 */
interface NewsStripProps {
  /** Tek cümle — şerit bir metin bloğu değil, bir haberdir. */
  message: string;
  /** İsteğe bağlı tek eylem (geri al · tekrar dene). */
  action?: { label: string; onClick: () => void };
  /** Kapatma (✕) — yalnız denetimli şeritte. */
  dismiss?: { label: string; onClick: () => void };
  /** `polite` haber verir, `assertive` sözü keser: arıza, değişikliğin geri alındığını o anda söylemeli. */
  live?: 'polite' | 'assertive';
  /** `top` sepetin: telefonda ekranın altı sabit çubuklara ayrılmış, alttaki eylem onların üstüne düşerdi. */
  placement: 'top' | 'bottom';
  /** Telefon görünümü: hap metni kadar genişlikte ve ortada, altta sekme çubuğunun üstünde. */
  compact?: boolean;
}

export function NewsStrip({ message, action, dismiss, live = 'polite', placement, compact = false }: NewsStripProps) {
  return (
    <div
      role="status"
      aria-live={live}
      className={[
        'pointer-events-none fixed z-90 flex justify-center',
        compact ? 'inset-x-5' : 'inset-x-0 px-4',
        placement === 'top' ? 'top-4' : compact ? 'bottom-26' : 'bottom-8.5',
      ].join(' ')}
    >
      <div
        className={[
          'pointer-events-auto flex animate-pop items-center bg-ink shadow-toast motion-reduce:animate-none',
          compact ? 'gap-[11px] rounded-pill px-5 py-3' : 'max-w-[430px] gap-3 rounded-2xl px-5.5 py-3.25',
        ].join(' ')}
      >
        <span className={['font-sans text-sand-50', compact ? 'text-center text-helper font-semibold' : 'text-body-sm font-bold'].join(' ')}>{message}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={['flex-none cursor-pointer font-sans font-bold text-olive-light transition-colors hover:text-cream', compact ? 'text-helper' : 'text-control'].join(' ')}
          >
            {compact ? action.label : `${action.label} →`}
          </button>
        )}
        {dismiss && (
          <button
            type="button"
            onClick={dismiss.onClick}
            aria-label={dismiss.label}
            title={dismiss.label}
            className={`${iconHitClass} -my-2 -mr-2 text-closed-line hover:text-cream`}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

const ToastContext = createContext<((text: string) => void) | null>(null);

/** Görünme süresi (ms). */
const VISIBLE_MS = 3400;

/** Kendiliğinden kaybolan bildirim; yenisi eskisinin yerine geçer. */
export function useToast(): (text: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast yalnız ToastProvider içinde kullanılır');
  return show;
}

interface ToastProviderProps {
  /** Cihaz ipucu (sunucudan) — telefonda hap sekme çubuğunun üstünde durur. */
  device: Device;
  children: ReactNode;
}

/** Kökte: bildirimi kim çıkarırsa çıkarsın hap tek, aynı yerde. */
export function ToastProvider({ device, children }: ToastProviderProps) {
  const resolved = useDevice(device);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text });
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* `key` her gösterimde yenilenir: arka arkaya gelen bildirimde hap yeniden belirir. */}
      {toast && <NewsStrip key={toast.id} message={toast.text} placement="bottom" compact={resolved === 'mobile'} />}
    </ToastContext.Provider>
  );
}
