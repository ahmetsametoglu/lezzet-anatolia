import { MESSAGE_STAMP_VISIBLE_MS } from '@lezzet/helper';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Dokunulan mesajın saati kısa süre görünür ve kendiliğinden kaybolur; aynı anda tek saat açık kalır. */
export function useStampReveal(): { shownId: string | null; show: (id: string) => void } {
  const [shownId, setShownId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((id: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setShownId(id);
    timer.current = setTimeout(() => setShownId(null), MESSAGE_STAMP_VISIBLE_MS);
  }, []);

  return { shownId, show };
}
