'use client';

import { useActionState, useEffect, useRef } from 'react';
import { unsubscribeAction } from './actions';

/**
 * Sayfa açılınca formu bir kez kendisi gönderir: kapatma, bağlantıyı yalnız getiren önizleme botundan değil sayfayı çalıştıran
 * tarayıcıdan gelir. JavaScript'siz ziyaretçi aynı formu düğmeyle gönderir.
 */
export function useUnsubscribe(locale: string, token: string) {
  const [result, formAction, pending] = useActionState(unsubscribeAction.bind(null, locale, token), null);
  const formRef = useRef<HTMLFormElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    formRef.current?.requestSubmit();
  }, []);

  return { formRef, formAction, pending, errorKey: result?.errorKey ?? null };
}
