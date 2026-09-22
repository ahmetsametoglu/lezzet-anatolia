'use client';

import { useEffect, useRef, useState } from 'react';
import { whatsappHref } from '@lezzet/brand';
import { channelLinkRecheckDue, linkedChannelsKey, type PendingChannelLink } from '@lezzet/helper';
import type { MeLinkedChannel } from '@lezzet/types';
import { useRouter } from '@/i18n/navigation';
import { startChannelLinkAction } from './actions';

type Source = MeLinkedChannel['source'];

/** Kodlu mesajın metinleri: WhatsApp'ta hazır mesaj bağlantıya konur, öteki kanallarda panoya kopyalanır. */
interface LinkMessages {
  whatsapp: string;
  chat: string;
}

/**
 * Bağlama düğmesinin davranışı, native `useLinkedChannels`ın ikizi. Müşteri sekmeye dönünce sayfa tazelenir ki kurulan bağ görünsün;
 * tazeleme yalnız dönüş anında ve `channelLinkRecheckDue` izin verdikçe yapılır, arka planda sorgu yok.
 */
export function useChannelLink(messages: LinkMessages, channels: readonly MeLinkedChannel[]) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  /** Kopyalanan mesaj ve kanalı; kart adımları bununla gösterir. */
  const [copied, setCopied] = useState<{ source: Source; message: string } | null>(null);
  const pending = useRef<PendingChannelLink | null>(null);
  const currentRef = useRef(linkedChannelsKey(channels));
  currentRef.current = linkedChannelsKey(channels);

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (!channelLinkRecheckDue(pending.current, currentRef.current, Date.now())) {
        pending.current = null;
        return;
      }
      router.refresh();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, [router]);

  const start = async (source: Source) => {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    const { data, errorKey: failed } = await startChannelLinkAction();
    setBusy(false);
    if (!data) {
      setErrorKey(failed ?? 'unexpected');
      return;
    }
    pending.current = { expiresAt: new Date(data.expiresAt).getTime(), startedWith: currentRef.current };
    if (source === 'whatsapp') {
      window.open(whatsappHref(`${messages.whatsapp} ${data.code}`), '_blank', 'noopener,noreferrer');
      return;
    }
    // Messenger ve Instagram hazır mesaj almaz; kodlu mesaj panoya gider, müşteri sohbete yapıştırıp gönderir.
    const message = `${messages.chat} ${data.code}`;
    await navigator.clipboard.writeText(message);
    setCopied({ source, message });
  };

  const copyAgain = async () => {
    if (copied) await navigator.clipboard.writeText(copied.message);
  };

  return { busy, errorKey, copied, start, copyAgain };
}
