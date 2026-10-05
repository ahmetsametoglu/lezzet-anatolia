'use client';

import { useSyncExternalStore } from 'react';

/** Tarayıcının o an gösterdiği alan (CSS px): yüksekliği ve sayfanın üstünden kayması. */
export interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener('resize', onChange);
  viewport.addEventListener('scroll', onChange);
  return () => {
    viewport.removeEventListener('resize', onChange);
    viewport.removeEventListener('scroll', onChange);
  };
}

const subscribeNothing = (): (() => void) => () => {};
const none = (): null => null;
const heightOf = (): number | null => window.visualViewport?.height ?? null;
const offsetTopOf = (): number | null => window.visualViewport?.offsetTop ?? null;

/**
 * Telefon tarayıcısı klavye açılınca sayfayı küçültmez, yalnız görünür alanı daraltıp kaydırır; sabit konumlu çekmece ve tam ekran
 * çerçeve bu alana bağlanmazsa düğmeleri klavyenin ya da Chrome'un otomatik doldurma şeridinin altında kalır. Destek yoksa ya da
 * `enabled` kapalıysa `null`; kapalıyken dinlenmez, çünkü görünür alan her kaydırmada değişir ve çizimi boşuna tetiklerdi.
 */
export function useVisualViewport(enabled = true): VisualViewportBox | null {
  const height = useSyncExternalStore(enabled ? subscribe : subscribeNothing, enabled ? heightOf : none, none);
  const offsetTop = useSyncExternalStore(enabled ? subscribe : subscribeNothing, enabled ? offsetTopOf : none, none);
  return height === null || offsetTop === null ? null : { height, offsetTop };
}
