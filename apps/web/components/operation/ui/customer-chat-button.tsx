'use client';

import type { MouseEvent } from 'react';
import { Button } from './button';
import type { MessengerContext } from './customer-channel-model';
import { ChatIcon } from './icons';
import { useSocialMessenger } from './use-social-messenger.hook';

/** Tabloda satır başına okuma yapılmaz, otuz satır otuz sunucu turu olurdu: kanallar basınca bir kez okunur (`openForCustomer`). */
interface CustomerChatButtonProps {
  customerId: string;
  variant?: 'icon' | 'button';
  context?: MessengerContext;
}

const TITLE = 'Müşteriye yaz — en son yazdığı kanaldan, uygulamanın içinde';

export function CustomerChatButton({ customerId, variant = 'icon', context }: CustomerChatButtonProps) {
  const messenger = useSocialMessenger();
  if (!messenger) return null;

  // Satır tıklanabilir olabilir: düğmenin tıklaması satıra geçmesin.
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    messenger.openForCustomer(customerId, context);
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
