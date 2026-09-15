'use client';

import type { MouseEvent } from 'react';
import { Button } from './button';
import { ChatIcon } from './icons';
import { useSocialMessenger } from './use-social-messenger.hook';

/**
 * **Müşteriye yaz — tek düğme** (15.33) — liste ve tablo satırı için.
 *
 * Kanal düğmeleri (`CustomerChannels`) müşterinin bütün kanallarını açılışta okur; o tek müşterili bir
 * KART içindir (sipariş, müşteri, talep panosu). Otuz satırlık bir tabloda aynı okuma otuz sunucu turu
 * olurdu ve Next eylemleri sırayla koşar. Bu düğme hiçbir şey okumadan çizilir; basınca müşterinin
 * kanalları BİR kez okunur ve en son yazdığı kanalın sohbeti yüzen pencerede açılır (`openForCustomer`).
 * Hiç sohbeti yoksa ve telefonu kayıtlıysa WhatsApp sohbeti numarayla açılır; o da yoksa pencere sebebini
 * söyler. Yazışma uygulamanın içinden — `wa.me` ve personelin kendi telefonu yok (kullanıcı kuralı 14.09).
 *
 * Pencere yoksa (yönetici değil) çizilmez.
 */
interface CustomerChatButtonProps {
  customerId: string;
  /** `icon`: tablo hücresinde ikon düğme · `button`: kart ve pencere satırında "Mesaj yaz" yazılı düğme. */
  variant?: 'icon' | 'button';
}

const TITLE = 'Müşteriye yaz — en son yazdığı kanaldan, uygulamanın içinde';

export function CustomerChatButton({ customerId, variant = 'icon' }: CustomerChatButtonProps) {
  const messenger = useSocialMessenger();
  if (!messenger) return null;

  // Satır tıklanabilir olabilir (tablo satırı detay açar) — düğmenin tıklaması satıra geçmesin.
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    messenger.openForCustomer(customerId);
  };

  if (variant === 'button') {
    return (
      <Button variant="secondary" size="sm" onClick={open} title={TITLE}>
        <ChatIcon size={13} />
        Mesaj yaz
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      title={TITLE}
      aria-label="Müşteriye yaz"
      className="flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-ops-btn text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-olive"
    >
      <ChatIcon size={13} />
    </button>
  );
}
