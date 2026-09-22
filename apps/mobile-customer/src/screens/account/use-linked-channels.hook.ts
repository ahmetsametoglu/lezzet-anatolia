import { whatsappHref } from '@lezzet/brand';
import { whatsappNumbersKey, whatsappRecheckDue, type PendingWhatsappLink } from '@lezzet/helper';
import type { MeLinkedChannel } from '@lezzet/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { fetchChannels, requestWhatsappLink } from '@/lib/api/channels';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/**
 * Hesabın kanal satırlarını okur ve WhatsApp bağlamayı başlatır; uygulamaya dönülünce yalnız `whatsappRecheckDue` izin verdikçe
 * yeniden okur, süreli sorgu yok. `channels === null` bilinmiyor demektir, boş liste değil.
 */
export function useLinkedChannels(enabled: boolean, message: string) {
  const [channels, setChannels] = useState<MeLinkedChannel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<PendingWhatsappLink | null>(null);
  const currentKey = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await fetchChannels();
    if (result.error !== null) return;
    const numbers = result.data.channels.find((channel) => channel.source === 'whatsapp')?.numbers ?? [];
    currentKey.current = whatsappNumbersKey(numbers);
    setChannels(result.data.channels);
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

  const startWhatsapp = async (): Promise<void> => {
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

  return { channels, busy, failed, startWhatsapp };
}
