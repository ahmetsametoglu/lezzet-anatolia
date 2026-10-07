'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { sheetDragCloses } from './sheet-drag';

/** Kapanış kaymasının süresi; çekmecenin geçiş süresiyle aynı. */
const CLOSE_MS = 200;
/** Parmak bu kadar duraklayıp bırakırsa son hız fiske sayılmaz. */
const STILL_MS = 100;

interface DragState {
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  height: number;
}

/**
 * Çekmecenin baştan sürüklenmesi: parmağı izler, bırakınca kapatır ya da yerine döndürür. Yalnız baş sürüklenir, çünkü içerikten
 * sürüklemek içerideki kaydırmayla yarışır (native çekmecenin aynı kararı).
 */
export function useSheetDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const panel = event.currentTarget.parentElement;
    drag.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      height: panel?.offsetHeight ?? window.innerHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state === null) return;
    state.velocity = (event.clientY - state.lastY) / Math.max(1, event.timeStamp - state.lastT);
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    // Yukarı çekiş sayılmaz: çekmece tavanındadır, yukarı uzamaz.
    setOffset(Math.max(0, event.clientY - state.startY));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (state === null) return;
    drag.current = null;
    setDragging(false);
    const velocity = event.timeStamp - state.lastT > STILL_MS ? 0 : state.velocity;
    if (!sheetDragCloses(offset, state.height, velocity)) {
      setOffset(0);
      return;
    }
    setOffset(state.height);
    // Hareketin azaltılmasını isteyen için kayma beklenmez.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) onClose();
    else window.setTimeout(onClose, CLOSE_MS);
  };

  // Tarayıcı jesti kendine aldıysa kapatmak niyet sayılmaz; çekmece yerine döner.
  const onPointerCancel = () => {
    drag.current = null;
    setDragging(false);
    setOffset(0);
  };

  return { offset, dragging, handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
