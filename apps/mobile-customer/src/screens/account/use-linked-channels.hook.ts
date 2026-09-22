import { messengerHref, whatsappHref } from '@lezzet/brand';
import { channelLinkRecheckDue, linkedChannelsKey, type PendingChannelLink } from '@lezzet/helper';
import type { MeLinkedChannel } from '@lezzet/types';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { fetchChannels, requestChannelLinkCode } from '@/lib/api/channels';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

type Source = MeLinkedChannel['source'];

/** Kodlu mesajın metinleri: WhatsApp ve Messenger hazır mesajı bağlantıda taşır, Instagram'da metin panoya kopyalanır. */
interface LinkMessages {
  whatsapp: string;
  chat: string;
}

/**
 * Hesabın kanal satırlarını okur ve bağlamayı başlatır; uygulamaya dönülünce yalnız `channelLinkRecheckDue` izin verdikçe yeniden
 * okur, süreli sorgu yok. `channels === null` bilinmiyor demektir, boş liste değil.
 */
export function useLinkedChannels(enabled: boolean, messages: LinkMessages) {
  const [channels, setChannels] = useState<MeLinkedChannel[] | null>(null);
  /** Hangi kanalın kodu hazırlanıyor; tek bayrak olsaydı bir satıra basınca üçü birden "hazırlanıyor" derdi. */
  const [busy, setBusy] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  /** Kopyalanan mesaj ve kanalı; kart adımları bununla gösterir. */
  const [copied, setCopied] = useState<{ source: Source; message: string } | null>(null);
  const pending = useRef<PendingChannelLink | null>(null);
  const currentKey = useRef<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const result = await fetchChannels();
    if (result.error !== null) return;
    currentKey.current = linkedChannelsKey(result.data.channels);
    setChannels(result.data.channels);
    // Bağ kurulduysa adımlar kapanır; açık kalsaydı müşteri işin bittiğini göremezdi.
    setCopied((current) => (current && result.data.channels.find((c) => c.source === current.source)?.linked ? null : current));
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  useLiveRefresh(
    () => {
      if (!channelLinkRecheckDue(pending.current, currentKey.current, Date.now())) {
        pending.current = null;
        return;
      }
      void load();
    },
    { intervalMs: 0 },
  );

  const start = async (source: Source): Promise<void> => {
    if (busy) return;
    setBusy(source);
    setFailed(false);
    // Kod hesaba aittir ve her üretim öncekini geçersizler: açık kutudaki metin ölür, kutu da kapanır.
    setCopied(null);
    const result = await requestChannelLinkCode();
    setBusy(null);
    if (result.error !== null) {
      setFailed(true);
      return;
    }
    pending.current = { expiresAt: new Date(result.data.expiresAt).getTime(), startedWith: currentKey.current };
    if (source === 'whatsapp') {
      await Linking.openURL(whatsappHref(`${messages.whatsapp} ${result.data.code}`));
      return;
    }
    const message = `${messages.chat} ${result.data.code}`;
    const href = source === 'messenger' ? messengerHref(message) : null;
    if (href) {
      await Linking.openURL(href);
      return;
    }
    // Instagram bağlantısı hazır mesaj taşımaz; kodlu mesaj panoya gider, müşteri sohbete yapıştırıp gönderir.
    await Clipboard.setStringAsync(message);
    setCopied({ source, message });
  };

  const copyAgain = async (): Promise<void> => {
    if (copied) await Clipboard.setStringAsync(copied.message);
  };

  return { channels, busy, failed, copied, start, copyAgain };
}
