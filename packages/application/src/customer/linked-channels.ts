import { ConversationService, CustomerPhoneService } from '@lezzet/database';
import { linkedChannelsOf } from '@lezzet/domain-core';
import { ConversationSourceEnum, type MeLinkedChannel } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Hesabın kanal satırları; web hesap sayfası ve native aynı okumadan geçer ki iki yüzey aynı bağı göstersin. */
export async function readLinkedChannels(db: SupabaseClient, customerId: string): Promise<MeLinkedChannel[]> {
  const [phones, conversations] = await Promise.all([
    // Emekli numara gelmez: artık bizde olmayan numarayı "sizde" diye göstermek en kafa karıştırıcı hâl olurdu.
    new CustomerPhoneService(db).listActiveByCustomer(customerId),
    new ConversationService(db).listByCustomer(customerId),
  ]);
  return linkedChannelsOf({
    sources: ConversationSourceEnum.options,
    conversations,
    whatsappNumbers: phones.map((phone) => phone.phone),
  });
}
