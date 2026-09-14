'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { iconHitClass } from './button';
import { Icon } from './icons';

/**
 * **Haber şeridi** — koyu hap, tek cümle + isteğe bağlı tek eylem; sitenin TEK haber dili (13.09).
 *
 * Görünüm v1'in bildirimi (`bildir`): antrasit zemin, 16px köşe, kalın açık metin, açık yeşil eylem
 * ("Geri al →"), belirirken `pop`. İki kaynak tek kabukta: kendiliğinden kaybolan bildirim
 * (`useToast` — yer paneli) ve sepetin denetimli şeritleri (`CartUndo` geri al · `CartWriteFailed`
 * tekrar dene). 13.09'a kadar sepetin kendi kabuğu vardı (`cart-strip`) ve yer paneli ikincisini
 * yazmıştı — aynı ekranda iki ayrı haber dili; kabuk tek yere indi.
 *
 * **Yer iki türlü:** `bottom` v1'in yeri (altta, ortada). `top` sepetin kararı: mobil webde ekranın
 * altı iki sabit çubuğa ayrılmış (sepette toplam, ürün detayda satın alma); alta konan eylem
 * düğmesi tam onların üstüne düşerdi.
 *
 * **Sepetin hata dili şerittir, satır içi kırmızı metin değil** (tasarım kararı, `design/BACKLOG`):
 * ekranda blok düzeyinde zaten bir arıza anlatımı var (`CartUnreachable`).
 *
 * Konum dış kapta, animasyon hapta: `pop` animasyonu `transform`u ezer — konum v1'deki gibi
 * `translateX(-50%)` ile verilseydi hap belirirken yarım genişliği kadar yana kayardı.
 */
interface NewsStripProps {
  /** Tek cümle — şerit bir metin bloğu değil, bir haberdir. */
  message: string;
  /** İsteğe bağlı tek eylem (geri al · tekrar dene). */
  action?: { label: string; onClick: () => void };
  /** Kapatma (✕) — yalnız denetimli şeritte; kendiliğinden kaybolan bildirimde yok (v1). */
  dismiss?: { label: string; onClick: () => void };
  /**
   * `polite` haber verir, `assertive` sözü keser. Arıza `assertive` olmalı: ekran okuyucu kullanan
   * müşteri, yaptığı değişikliğin GERİ ALINDIĞINI sırası gelince değil, o anda öğrenmeli.
   */
  live?: 'polite' | 'assertive';
  placement: 'top' | 'bottom';
  /**
   * Mobil web (Mobil v1, 13.09): hap tam genişlikte (16px pay), altta sekme çubuğunun ÜSTÜNDE
   * (`bottom:88px`), 15px köşe, 12,5px metin; eylem oksuz ("Sepete git").
   */
  compact?: boolean;
}

export function NewsStrip({ message, action, dismiss, live = 'polite', placement, compact = false }: NewsStripProps) {
  return (
    <div
      role="status"
      aria-live={live}
      className={[
        'pointer-events-none fixed z-90 flex',
        compact ? 'inset-x-4' : 'inset-x-0 justify-center px-4',
        placement === 'top' ? 'top-4' : compact ? 'bottom-[88px]' : 'bottom-8.5',
      ].join(' ')}
    >
      <div
        className={[
          'pointer-events-auto flex animate-pop items-center bg-ink shadow-toast motion-reduce:animate-none',
          compact ? 'w-full gap-[11px] rounded-[15px] px-4 py-3' : 'max-w-[430px] gap-3 rounded-2xl px-5.5 py-3.25',
        ].join(' ')}
      >
        <span className={['font-sans font-bold text-sand-50', compact ? 'flex-1 text-field-label leading-[1.45]' : 'text-body-sm'].join(' ')}>{message}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={['flex-none cursor-pointer font-sans font-bold text-olive-light transition-colors hover:text-cream', compact ? 'text-field-label' : 'text-control'].join(' ')}
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

/** Görünme süresi — v1 `bildir`: `setTimeout(…, 3400)`. */
const VISIBLE_MS = 3400;

/** Kendiliğinden kaybolan bildirim; yenisi eskisinin yerine geçer (v1 de tek bir `toast` tutuyor). */
export function useToast(): (text: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast yalnız ToastProvider içinde kullanılır');
  return show;
}

interface ToastProviderProps {
  /** Cihaz ipucu (sunucudan, `detectDevice`) — mobil webde hap sekme çubuğunun üstünde durur. */
  device: Device;
  children: ReactNode;
}

/** Kökte (müşteri layout'u): bildirimi kim çıkarırsa çıkarsın hap tek, aynı yerde. */
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
      {/* Kimlik (`key`) her gösterimde yenilenir: arka arkaya gelen bildirimde hap yeniden belirir. */}
      {toast && <NewsStrip key={toast.id} message={toast.text} placement="bottom" compact={resolved === 'mobile'} />}
    </ToastContext.Provider>
  );
}
