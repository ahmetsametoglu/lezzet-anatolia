'use client';

import { useEffect, useRef, useState } from 'react';
import { whatsappNumbersKey, whatsappRecheckDue, type PendingWhatsappLink } from '@lezzet/helper';
import { useRouter } from '@/i18n/navigation';
import { startWhatsappLinkAction } from './actions';

/**
 * Bağlama düğmesinin davranışı: hazır mesajlı WhatsApp'ı açar, müşteri sekmeye dönünce sayfayı tazeler ki kurulan bağ görünsün.
 * Tazeleme yalnız dönüş anında ve `whatsappRecheckDue` izin verdikçe yapılır; arka planda sorgu yok.
 */
export function useWhatsappLink(message: string, numbers: readonly string[]) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const pending = useRef<PendingWhatsappLink | null>(null);
  const current = whatsappNumbersKey(numbers);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (!whatsappRecheckDue(pending.current, currentRef.current, Date.now())) {
        pending.current = null;
        return;
      }
      router.refresh();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, [router]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    const { data, errorKey: failed } = await startWhatsappLinkAction(message);
    setBusy(false);
    if (!data) {
      setErrorKey(failed ?? 'unexpected');
      return;
    }
    pending.current = { expiresAt: new Date(data.expiresAt).getTime(), startedWith: currentRef.current };
    window.open(data.href, '_blank', 'noopener,noreferrer');
  };

  return { busy, errorKey, start };
}
