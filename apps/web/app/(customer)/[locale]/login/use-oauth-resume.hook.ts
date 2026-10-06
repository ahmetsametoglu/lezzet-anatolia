'use client';

import { useEffect } from 'react';
import { resumeOAuthLoginAction } from './actions';

// Pencere ilk çevirmenin cevabını beklemeye yeter, gerçek bir hatayı da birkaç saniyeden fazla geciktirmez.
const RESUME_ATTEMPTS = 6;
const RESUME_INTERVAL_MS = 500;

/** Oturum belirene kadar sınırlı sayıda yoklar: belirirse gidilecek yeri, pencere dolarsa `null` döner; saf ki DOM'suz sınansın. */
export async function waitForSession(
  check: () => Promise<string | null>,
  sleep: (ms: number) => Promise<void>,
  attempts = RESUME_ATTEMPTS,
  intervalMs = RESUME_INTERVAL_MS,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const redirect = await check();
    if (redirect !== null) return redirect;
    if (attempt < attempts - 1) await sleep(intervalMs);
  }
  return null;
}

/** Google dönüşü "bekle" dediyse oturumu yoklar: gelirse oraya gider, gelmezse hatayı gösterir. */
export function useOAuthResume(pendingError: string | null, next: string | null, onFailed: (message: string) => void): void {
  useEffect(() => {
    if (pendingError === null) return;
    let cancelled = false;
    void waitForSession(
      async () => (await resumeOAuthLoginAction(next)).data?.redirect ?? null,
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ).then((redirect) => {
      if (cancelled) return;
      if (redirect !== null) window.location.replace(redirect);
      else onFailed(pendingError);
    });
    return () => {
      cancelled = true;
    };
  }, [pendingError, next, onFailed]);
}
