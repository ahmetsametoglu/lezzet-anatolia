'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Kurulum penceresinin yazımı: düğmeler beklerken kilitlenir, ret pencerede kalır, başarıda sayfa tazelenir ve pencere kapanır. */
export function useDialogAction(onDone: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onDone();
  };

  return { busy, error, run, clearError: () => setError(null) };
}
