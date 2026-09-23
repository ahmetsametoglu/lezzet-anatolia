'use client';

import { useCallback, useEffect, useState } from 'react';

/** Bir görselde kalma süresi; müşteri fotoğrafı okuyacak kadar görsün, sayfa da durgun görünmesin. */
export const GALLERY_AUTOPLAY_MS = 5_000;

/** Geçiş yalnız birden çok görsel varken, kimse bakmıyorken, sekme görünürken ve hareket azaltılmamışken işler. */
export function autoplayRuns(state: { count: number; held: boolean; hidden: boolean; reducedMotion: boolean }): boolean {
  return state.count > 1 && !state.held && !state.hidden && !state.reducedMotion;
}

/** Sıradaki görsel iki uçta da döner: sondan sonra ilki, ilkinden önce sonuncusu. */
export function wrapIndex(next: number, count: number): number {
  return count === 0 ? 0 : ((next % count) + count) % count;
}

interface GalleryAutoplay {
  index: number;
  /** Görsele geçer; sayaç sıfırlanır, çünkü elle seçilen görsel hemen başkasına kaymamalı. */
  go: (index: number) => void;
  /** Fare ya da klavye odağı galerideyken geçiş durur: müşteri o an bakıyor ya da seçiyor. */
  setHeld: (held: boolean) => void;
}

/** Galerinin otomatik geçişi; ne zaman işlediği `autoplayRuns`ta, sıranın dönüşü `wrapIndex`te. */
export function useGalleryAutoplay(count: number, intervalMs = GALLERY_AUTOPLAY_MS): GalleryAutoplay {
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Sayaç her görsel değişiminde baştan kurulur (`index` bağımlılıkta): elle seçim de otomatik geçiş de tam süre bekletir.
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!autoplayRuns({ count, held, hidden, reducedMotion })) return;
    const timer = window.setTimeout(() => setIndex((i) => wrapIndex(i + 1, count)), intervalMs);
    return () => window.clearTimeout(timer);
  }, [count, held, hidden, index, intervalMs]);

  const go = useCallback((next: number) => setIndex(wrapIndex(next, count)), [count]);

  return { index: wrapIndex(index, count), go, setHeld };
}
