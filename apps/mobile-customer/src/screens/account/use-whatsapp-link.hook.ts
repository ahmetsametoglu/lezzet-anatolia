import { whatsappHref } from '@lezzet/brand';
import { whatsappNumbersKey, whatsappRecheckDue, type PendingWhatsappLink } from '@lezzet/helper';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { fetchWhatsapp, requestWhatsappLink } from '@/lib/api/whatsapp';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/**
 * Hesabın WhatsApp bağı: numaraları okur, bağlamayı başlatır ve uygulamaya dönülünce bağı yalnız `whatsappRecheckDue` izin
 * verdikçe yeniden okur; süreli sorgu yok. `numbers === null` bilinmiyor demektir, boş liste değil.
 */
export function useWhatsappLink(enabled: boolean, message: string) {
  const [numbers, setNumbers] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<PendingWhatsappLink | null>(null);
  const currentKey = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await fetchWhatsapp();
    if (result.error !== null) return;
    currentKey.current = whatsappNumbersKey(result.data.numbers);
    setNumbers(result.data.numbers);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  useLiveRefresh(
    () => {
      if (!whatsappRecheckDue(pending.current, currentKey.current, Date.now())) {
        pending.current = null;
        return;
      }
      void load();
    },
    { intervalMs: 0 },
  );

  const start = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await requestWhatsappLink();
    setBusy(false);
    if (result.error !== null) {
      setFailed(true);
      return;
    }
    pending.current = { expiresAt: new Date(result.data.expiresAt).getTime(), startedWith: currentKey.current };
    await Linking.openURL(whatsappHref(`${message} ${result.data.code}`));
  };

  return { numbers, busy, failed, start };
}
