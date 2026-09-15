'use client';

import { createContext, useContext } from 'react';
import type { MessengerContext } from './customer-channel-model';

/** Sözleşme ortak kitte: sipariş, müşteri ve talep ekranları `social/messenger` klasörünü içe aktaramaz, kardeş sayfadan yalnız `*-url` alınır. */
export interface SocialMessengerApi {
  openConversation: (conversationId: string, context?: MessengerContext) => void;
  openForCustomer: (customerId: string, context?: MessengerContext) => void;
  startWhatsapp: (customerId: string, context?: MessengerContext) => void;
}

export const SocialMessengerContext = createContext<SocialMessengerApi | null>(null);

/** Pencere yoksa (yönetici değil) `null`: kanal düğmeleri hiç çizilmez. */
export function useSocialMessenger(): SocialMessengerApi | null {
  return useContext(SocialMessengerContext);
}
