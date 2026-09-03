import { UserProfileService } from '@lezzet/database';
import type { Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Müşteri künyesi — ad ve telefon, sipariş kümesinin müşterileri için tek turda.
 *
 * Gün listesinin (`day.ts`) özel yardımcısıydı; kurye dönüşü (`return.ts`) da aynı soruyu sorunca
 * (kutunun üstünde hangi müşterinin adı yazacak) ortak dosyaya çıktı (03.09). Vade/limit/borç ve
 * sipariş geçmişi OKUNMAZ (tasarım §6): kurye de depocu da bunları görmez.
 */
export async function customerCardsOf(
  db: SupabaseClient,
  orders: readonly Order[],
): Promise<Map<string, { name: string; phone: string | null }>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, { name: string; phone: string | null }>();
  for (const customerId of new Set(orders.map((order) => order.customerId))) {
    const profile = await profiles.getById(customerId);
    if (profile) map.set(customerId, { name: profile.name, phone: profile.phone });
  }
  return map;
}
