'use client';

import { createContext, useContext } from 'react';
import type { MessengerContext } from './customer-channel-model';

/**
 * **Yüzen mesaj penceresinin kapısı** (15.32) — sayfalar pencereyi buradan açar.
 *
 * Pencerenin kendisi Sosyal Mesajlar modülünün (`social/messenger`), kabuk (`operations/layout`) onu takar.
 * Sipariş, müşteri ve talep ekranları o klasörü İÇE AKTARAMAZ (STACK §7 · `docs:check` 3e: kardeş sayfadan
 * yalnız `*-url`); sözleşme bu yüzden ortak kitte — modül uygular, sayfalar yalnız bunu bilir.
 */
export interface SocialMessengerApi {
  /**
   * Sohbeti pencerede açar — müşterinin kanal düğmesinden (`CustomerChannels`). `context` (15.39): açan ekran ve
   * pencerenin üstünde duracak özet (sipariş detayı: referans · tutar · teslim günü).
   */
  openConversation: (conversationId: string, context?: MessengerContext) => void;
  /**
   * Müşterinin EN SON yazdığı kanalın sohbetini açar — listelerin tek düğmesinden (`CustomerChatButton`,
   * 15.33); kanallar basınca okunur. Hiç sohbeti yoksa ve telefonu kayıtlıysa WhatsApp sohbeti açılır.
   * `context`: açan satırın özeti.
   */
  openForCustomer: (customerId: string, context?: MessengerContext) => void;
  /**
   * Müşterinin WhatsApp sohbeti yoksa kayıtlı numarasıyla AÇAR. Yalnız WhatsApp: Messenger/Instagram'da
   * işletme sohbet başlatamaz, ilk sözü müşteri söyler. `context`: `openConversation`ınki (15.39).
   */
  startWhatsapp: (customerId: string, context?: MessengerContext) => void;
}

export const SocialMessengerContext = createContext<SocialMessengerApi | null>(null);

/** Pencere yoksa (yönetici değil) `null` — kanal düğmeleri hiç çizilmez. */
export function useSocialMessenger(): SocialMessengerApi | null {
  return useContext(SocialMessengerContext);
}
