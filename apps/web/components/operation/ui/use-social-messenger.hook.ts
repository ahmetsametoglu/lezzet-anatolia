'use client';

import { createContext, useContext } from 'react';

/**
 * **Yüzen mesaj penceresinin kapısı** (15.32) — sayfalar pencereyi buradan açar.
 *
 * Pencerenin kendisi Sosyal Mesajlar modülünün (`social/messenger`), kabuk (`operations/layout`) onu takar.
 * Sipariş, müşteri ve talep ekranları o klasörü İÇE AKTARAMAZ (STACK §7 · `docs:check` 3e: kardeş sayfadan
 * yalnız `*-url`); sözleşme bu yüzden ortak kitte — modül uygular, sayfalar yalnız bunu bilir.
 */
export interface SocialMessengerApi {
  /** Sohbeti pencerede açar — müşterinin kanal düğmesinden (`CustomerChannels`). */
  openConversation: (conversationId: string) => void;
  /**
   * Müşterinin WhatsApp sohbeti yoksa kayıtlı numarasıyla AÇAR. Yalnız WhatsApp: Messenger/Instagram'da
   * işletme sohbet başlatamaz, ilk sözü müşteri söyler.
   */
  startWhatsapp: (customerId: string) => void;
}

export const SocialMessengerContext = createContext<SocialMessengerApi | null>(null);

/** Pencere yoksa (yönetici değil) `null` — kanal düğmeleri hiç çizilmez. */
export function useSocialMessenger(): SocialMessengerApi | null {
  return useContext(SocialMessengerContext);
}
