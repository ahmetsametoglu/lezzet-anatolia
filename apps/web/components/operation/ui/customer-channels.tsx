'use client';

import { useEffect, useState } from 'react';
import { customerChannelsAction } from '@/lib/messaging/customer-channel-actions';
import { SOURCE_DOT, SOURCE_LABELS } from './conversation-source';
import type { CustomerChannelView, CustomerChannelsView } from './customer-channel-model';
import { Skeleton } from './skeleton';
import { useSocialMessenger, type SocialMessengerApi } from './use-social-messenger.hook';

/**
 * **Müşterinin sohbet kanalları** (15.32 · kullanıcı isteği 14.09) — "bizimle hangi kanallardan yazıştı,
 * en son hangisinden". Müşteriyle konuşmanın gerektiği her ekranda (sipariş, müşteri kartı, talep) aynı
 * düğme sırası: her kanal bir düğme, en son yazdığı işaretli; basınca o sohbet YÜZEN PENCEREDE açılır —
 * operatör bulunduğu ekrandan çıkmaz, `wa.me` ve kendi telefonu yok (kullanıcı kuralı 14.09).
 *
 * Pencere yoksa (yönetici değil) hiçbir şey çizilmez ve okuma da yapılmaz — kapı sohbet sayfasınınki.
 */
interface CustomerChannelsProps {
  customerId: string;
  /** Düğme boyu — başlık barında yanındaki düğmelerle aynı yükseklik (`md`), panelde dar (`sm`). */
  size?: 'sm' | 'md';
  className?: string;
}

export function CustomerChannels({ customerId, size = 'sm', className }: CustomerChannelsProps) {
  const messenger = useSocialMessenger();
  if (!messenger) return null;
  // `key`: müşteri değişince bir öncekinin kanalları bir an bile görünmesin.
  return <ChannelButtons key={customerId} customerId={customerId} size={size} className={className} messenger={messenger} />;
}

const CHANNEL_BUTTON =
  'flex flex-none cursor-pointer items-center gap-1.5 rounded-ops-btn border border-ops-line-strong px-3 font-ops-mono text-ops-xs text-ops-strong transition-colors hover:border-ops-olive';

interface ChannelButtonsProps {
  customerId: string;
  size: 'sm' | 'md';
  className?: string;
  messenger: SocialMessengerApi;
}

function ChannelButtons({ customerId, size, className, messenger }: ChannelButtonsProps) {
  const [view, setView] = useState<CustomerChannelsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void customerChannelsAction(customerId).then(({ data, error: actionError }) => {
      if (!alive) return;
      if (data) setView(data);
      else setError(actionError ?? 'Sohbet kanalları okunamadı.');
    });
    return () => {
      alive = false;
    };
  }, [customerId]);

  const wrap = ['flex flex-wrap items-center gap-2', className].filter(Boolean).join(' ');
  const button = `${CHANNEL_BUTTON} ${size === 'md' ? 'py-2' : 'py-1.5'}`;

  // Okuma düştüyse SÖYLENİR: boş sıra "bu müşterinin kanalı yok" diye okunurdu (CLAUDE §1).
  if (error) return <span className="font-ops-body text-ops-xs text-ops-red">{error}</span>;
  if (!view) {
    return (
      <div className={wrap}>
        <Skeleton className="h-7 w-28" />
      </div>
    );
  }
  if (view.channels.length === 0 && !view.canStartWhatsapp) {
    return (
      <span
        className="font-ops-body text-ops-xs text-ops-muted"
        title="Müşteri bize hiçbir kanaldan yazmadı ve telefonu kayıtlı değil — WhatsApp sohbeti de açılamıyor."
      >
        Sohbet kanalı yok
      </span>
    );
  }

  return (
    <div className={wrap}>
      {view.channels.map((channel) => (
        <button
          key={channel.conversationId}
          type="button"
          onClick={() => messenger.openConversation(channel.conversationId)}
          title={channelTitle(channel)}
          className={button}
        >
          <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${SOURCE_DOT[channel.source]}`} />
          {SOURCE_LABELS[channel.source]}
          <span className={channel.latest ? 'text-ops-olive' : 'text-ops-faint'}>{channelMeta(channel)}</span>
        </button>
      ))}
      {view.canStartWhatsapp ? (
        <button
          type="button"
          onClick={() => messenger.startWhatsapp(customerId)}
          title="Müşteri WhatsApp'tan henüz yazmadı — sohbet kayıtlı numarasıyla açılır."
          className={button}
        >
          <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${SOURCE_DOT.whatsapp}`} />
          WhatsApp&apos;tan yaz
        </button>
      ) : null}
    </div>
  );
}

/** Düğmenin ikinci yarısı: "son · 2 saat" (en son yazdığı) · "5 gün" · "yazmadı" (sohbeti biz açtık). */
function channelMeta(channel: CustomerChannelView): string {
  if (channel.lastInboundAgo === null) return 'yazmadı';
  return channel.latest ? `son · ${channel.lastInboundAgo}` : channel.lastInboundAgo;
}

function channelTitle(channel: CustomerChannelView): string {
  if (channel.lastInboundAgo === null) return 'Sohbeti biz açtık — müşteri bu kanaldan henüz yazmadı.';
  return channel.latest
    ? 'Müşterinin en son yazdığı kanal — sohbeti pencerede aç.'
    : 'Müşteri bu kanaldan da yazdı — sohbeti pencerede aç.';
}
