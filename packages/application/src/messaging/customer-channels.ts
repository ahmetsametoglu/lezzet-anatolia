import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationService, UserProfileService } from '@lezzet/database';
import { customerChannelsOf, type CustomerChannelSet } from '@lezzet/domain-core';
import type { Conversation } from '@lezzet/types';

// Web ve native aynı müşteri için aynı "son kanalı" göstersin diye tek okuma kapısı; karar motorda (`customerChannelsOf`).
// Messenger/Instagram sohbeti müşteriye bağlanana kadar onun kanalı sayılmaz: PSID/IGSID telefon taşımaz.

/** `null` = müşteri yok. */
export async function readCustomerChannels(db: SupabaseClient, customerId: string): Promise<CustomerChannelSet<Conversation> | null> {
  const [conversations, profile] = await Promise.all([
    new ConversationService(db).listByCustomer(customerId),
    new UserProfileService(db).getById(customerId),
  ]);
  if (!profile) return null;
  return customerChannelsOf({ conversations, phone: profile.phone });
}
