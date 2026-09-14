'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Açılır parçanın (menü, liste) kapanma sözleşmesi — kabın DIŞINA basınca ve Escape'le kapanır.
 *
 * Üç yerde ayrı yazılmıştı (sıralama seçici, hesap menüsü, seçim alanı) ve ikisi farklı olayı
 * dinliyordu (`mousedown` · `pointerdown`) — aynı sözün iki ayrı sürümü (13.09 kopya bulgusu).
 * Tek yerde ve `pointerdown`: dokunmatikte de çalışır, tıklama tamamlanmadan kapanır; kabın
 * İÇİNDEKİ seçenek yine çalışır, çünkü içeri basmak kapatmaz.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open, onDismiss]);
}
