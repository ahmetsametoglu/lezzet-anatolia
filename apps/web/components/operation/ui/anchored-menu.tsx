'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tetikleyiciye hizalı yüzen menü — açılır listelerin (select, çoklu seçim, süzgeç) ORTAK zemini.
 *
 * Neden portal: menü tetikleyicinin yanında `absolute` dururken, dialogun kaydırılan gövdesi gibi bir
 * kapsayıcının scrollable-overflow alanına katkı yapar → gövdede scrollbar doğar / menü kırpılır.
 * (z-index bunu ÇÖZMEZ; o yalnız boyama sırasıdır, yerleşimi değiştirmez.) Bu yüzden menü `body`'ye
 * portal edilip `fixed` konumlanır: kapsayıcının taşmasından tamamen çıkar. Aşağı sığmazsa yukarı
 * açılır (flip), yatayda ekrana kenetlenir, kaydırma/boyut değişiminde yeniden konumlanır.
 *
 * Dışarı tık + Escape burada yönetilir (tüketicilerde tekrarlanmaz). Escape CAPTURE fazında yakalanıp
 * yayılımı kesilir — aksi hâlde Dialog'un kendi Escape dinleyicisi de tetiklenir ve menüyle birlikte
 * dialog da kapanır.
 */
const GAP = 4;
const EDGE = 8;

interface AnchoredMenuProps {
  /** Hizalanacak tetikleyici (menü onun altına/üstüne konumlanır). */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Genişlik: 'anchor' → tetikleyici kadar; sayı → sabit px. */
  width?: 'anchor' | number;
  className?: string;
  children: ReactNode;
}

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

export function AnchoredMenu({ anchorRef, open, onClose, width = 'anchor', className, children }: AnchoredMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  // Konumlandırma: layout fazında ölçülür (boyama öncesi → zıplama yok).
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = menuRef.current?.offsetHeight ?? 0;
      const w = width === 'anchor' ? a.width : width;
      const spaceBelow = window.innerHeight - a.bottom - GAP;
      // Aşağı sığmıyor ve yukarıda daha fazla yer varsa yukarı aç.
      const flip = h > spaceBelow && a.top - GAP > spaceBelow;
      setPos({
        top: flip ? Math.max(EDGE, a.top - GAP - h) : a.bottom + GAP,
        left: Math.max(EDGE, Math.min(a.left, window.innerWidth - w - EDGE)),
        width: w,
      });
    };

    place();
    // Menü içeriği değişince (liste süzülünce) yükseklik değişir → yeniden konumlan.
    const observer = new ResizeObserver(place);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener('resize', place);
    // capture: yalnız pencere değil, İÇ kaydırma kutuları (dialog gövdesi) da yakalanır.
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Tetikleyiciye tık → kapatmayı tüketici (toggle) yapar; menü içi tık seçimdir.
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      // Ölçülene kadar ekran dışında: konum layout fazında yerleşir, kullanıcı ara kareyi görmez.
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: -9999, left: -9999 }}
      className={[
        // z-[60]: Dialog z-50'nin üstünde — portal body'de olduğu için burada z-index GEREKLİ.
        'fixed z-[60] overflow-hidden rounded-[9px] border-[1.5px] border-ops-olive bg-ops-white shadow-[0_8px_24px_rgba(20,22,18,0.12)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>,
    document.body,
  );
}
