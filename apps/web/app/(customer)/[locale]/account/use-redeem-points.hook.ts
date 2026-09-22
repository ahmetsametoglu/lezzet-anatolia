'use client';

import { useState, useTransition } from 'react';
import { useFlash } from '@/lib/use-flash.hook';
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
  const [converted, showConverted] = useFlash(CONVERTED_MS);

  const convert = () =>
    startTransition(async () => {
      setFailed(false);
      const { data } = await redeemPointsAction();
      if (!data) return setFailed(true);
      showConverted();
    });

  return { busy, failed, converted, convert };
}
