'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { redeemPointsAction } from './actions';

/** "Kupon hesabınıza eklendi" haberinin ekranda kaldığı süre (ms). */
const CONVERTED_MS = 3000;

/**
 * Telefon görünümünde puanı kupona onaysız çevirir; sonuç kısa bir haberle söylenir, kupon kartta belirir. Ret cümlesi kartın içinde
 * kalır, çünkü haber kaybolur ve müşteri çevirmenin neden olmadığını göremez.
 */
export function useRedeemPoints() {
  // Geçiş, sayfanın yeni bakiyeyle tazelenmesi bitene kadar sürer; eylem döner dönmez bitseydi düğme eski bakiyeyle bir an etkinleşirdi.
  const [busy, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [converted, setConverted] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const convert = () =>
    startTransition(async () => {
      setFailed(false);
      const { data } = await redeemPointsAction();
      if (!data) return setFailed(true);
      setConverted(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setConverted(false), CONVERTED_MS);
    });

  return { busy, failed, converted, convert };
}
