'use client';

import { useEffect, useRef, useState } from 'react';
import { messengerHref, whatsappHref } from '@lezzet/brand';
import { channelLinkRecheckDue, linkedChannelsKey, type PendingChannelLink } from '@lezzet/helper';
import type { MeLinkedChannel } from '@lezzet/types';
import { useRouter } from '@/i18n/navigation';
import { startChannelLinkAction } from './actions';

type Source = MeLinkedChannel['source'];

/** Kodlu mesajın metinleri: WhatsApp ve Messenger hazır mesajı bağlantıda taşır, Instagram'da metin panoya kopyalanır. */
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
  /** Kodu hazırlanan kanal; tek bayrak olsaydı bir satıra basınca üçü birden "hazırlanıyor" derdi. */
  const [busy, setBusy] = useState<Source | null>(null);
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
    setBusy(source);
    setErrorKey(null);
    // Kod hesaba aittir ve her üretim öncekini geçersizler: açık kutudaki metin ölür, kutu da kapanır.
    setCopied(null);
    const { data, errorKey: failed } = await startChannelLinkAction();
    setBusy(null);
    if (!data) {
      setErrorKey(failed ?? 'unexpected');
      return;
    }
    pending.current = { expiresAt: new Date(data.expiresAt).getTime(), startedWith: currentRef.current };
    if (source === 'whatsapp') {
      window.open(whatsappHref(`${messages.whatsapp} ${data.code}`), '_blank', 'noopener,noreferrer');
      return;
    }
    const message = `${messages.chat} ${data.code}`;
    const href = source === 'messenger' ? messengerHref(message) : null;
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    // Instagram bağlantısı hazır mesaj taşımaz; kodlu mesaj panoya gider, müşteri sohbete yapıştırıp gönderir.
    await navigator.clipboard.writeText(message);
    setCopied({ source, message });
  };

  const copyAgain = async () => {
    if (copied) await navigator.clipboard.writeText(copied.message);
  };

  return { busy, errorKey, copied, start, copyAgain };
}
