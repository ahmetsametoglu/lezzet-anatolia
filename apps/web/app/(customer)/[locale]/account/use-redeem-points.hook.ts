'use client';

import { useEffect, useRef, useState } from 'react';
import { redeemPointsAction } from './actions';

/** "Kupon hesabınıza eklendi" haberinin ekranda kaldığı süre (ms). */
const CONVERTED_MS = 3000;

/**
 * Telefon görünümünde puanı kupona onaysız çevirir; sonuç kısa bir haberle söylenir, kupon kartta belirir. Ret cümlesi kartın içinde
 * kalır, çünkü haber kaybolur ve müşteri çevirmenin neden olmadığını göremez.
 */
export function useRedeemPoints() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [converted, setConverted] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const convert = async () => {
    setBusy(true);
    setFailed(false);
    const { data } = await redeemPointsAction();
    setBusy(false);
    if (!data) return setFailed(true);
    setConverted(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConverted(false), CONVERTED_MS);
  };

  return { busy, failed, converted, convert };
}
