import { ConversationService, UserProfileService, type Db } from '@lezzet/database';
import { staffCustomerOptionOf } from '@lezzet/application/order/staff-order';
import type { StaffCustomerOption } from '@lezzet/types';

/**
 * Sohbetten gelindiğinde müşteriyi önseçili getirir; ekranın "seçim yapılmadan okuma yok" kuralının tek istisnası. Konuşma yoksa,
 * kimliğe bağlı değilse ya da profil silinmişse `null` döner ve ekran boş seçiciyle açılır.
 */
export async function readConversationCustomer(db: Db, conversationId: string): Promise<StaffCustomerOption | null> {
  const conversation = await new ConversationService(db).getById(conversationId);
  if (!conversation?.customerId) return null;
  const profile = await new UserProfileService(db).getById(conversation.customerId);
  return profile ? staffCustomerOptionOf(db, profile) : null;
}
