'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Kurulum ve ayar pencerelerinin yazımı: basılan düğme iş bitene kadar yükleniyor hâlinde kalır, ret pencerede kalır. Başarıda sayfa
 * tazelenir ve pencere ancak yeni veri çizilince kapanır; önce kapansaydı ekran eski veriyi gösterir, değişiklik sonradan bir anda
 * belirirdi.
 */
export function useDialogAction(onDone: () => void) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!closing || refreshing) return;
    setClosing(false);
    setRunning(null);
    onDone();
  }, [closing, refreshing, onDone]);

  /** `key` hangi düğmenin yükleniyor hâlinde döneceğini söyler; öteki düğmeler iş bitene kadar kapalıdır. */
  const run = async (action: () => Promise<{ error: string | null }>, key = 'save') => {
    setRunning(key);
    setError(null);
    const result = await action();
    if (result.error) {
      setRunning(null);
      setError(result.error);
      return;
    }
    setClosing(true);
    startRefresh(() => router.refresh());
  };

  return { busy: running !== null, running, error, run, clearError: () => setError(null) };
}
