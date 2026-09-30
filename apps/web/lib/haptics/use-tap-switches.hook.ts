'use client';

import { useEffect } from 'react';
import { attachTapSwitches } from './tap-switch';

/** Telefon çerçevesi açıkken iPhone'da dokunma yüzeylerine anahtar kutusunu takar; kök `body`dir ki portalda açılan paneller de kapsansın. */
export function useTapSwitches(): void {
  useEffect(() => attachTapSwitches(document.body), []);
}
