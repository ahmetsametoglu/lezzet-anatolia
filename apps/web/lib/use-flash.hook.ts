'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Kısa süre görünen haber: `show` bayrağı `ms` boyunca doğru tutar; art arda çağrı süreyi baştan başlatır. */
export function useFlash(ms: number): [visible: boolean, show: () => void] {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback(() => {
    setVisible(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), ms);
  }, [ms]);

  return [visible, show];
}
