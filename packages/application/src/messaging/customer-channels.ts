import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationService, UserProfileService } from '@lezzet/database';
import { customerChannelsOf, type CustomerChannelSet } from '@lezzet/domain-core';
import type { Conversation } from '@lezzet/types';

/*
  MÜŞTERİNİN SOHBET KANALLARI — okuma kapısı (15.32). Karar motorda (`customerChannelsOf`: sıralama,
  "en son" işareti, WhatsApp'ı biz açabilir miyiz); satırlar `conversation` + `user_profiles`ten. Operasyon
  web'i (sipariş · müşteri kartı · talep) bugün okuyor; native uygulamanın kurye ekranı da buradan okumalı —
  iki yüzey aynı müşteri için aynı "son kanalı" göstersin.

  Sınır veride: Messenger/Instagram sohbeti müşteriye BAĞLANANA kadar onun kanalı sayılmaz (PSID/IGSID
  telefon taşımaz; bağ Sosyal Mesajlar'da kurulur). WhatsApp'ta bağ numaradan kendiliğinden kurulur.
*/

/** Müşterinin kanalları — `null` = müşteri yok. */
export async function readCustomerChannels(db: SupabaseClient, customerId: string): Promise<CustomerChannelSet<Conversation> | null> {
  const [conversations, profile] = await Promise.all([
    new ConversationService(db).listByCustomer(customerId),
    new UserProfileService(db).getById(customerId),
  ]);
  if (!profile) return null;
  return customerChannelsOf({ conversations, phone: profile.phone });
}
