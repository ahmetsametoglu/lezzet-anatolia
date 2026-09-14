'use server';

import { readCustomerChannels } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { toCustomerChannels, type CustomerChannelsView } from '@/components/operation/ui/customer-channel-model';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';

// Müşterinin kanal düğmesinin KAPISI (15.32) — düğme ortak kitte (`ui/customer-channels`) ve sipariş,
// müşteri, talep ekranları çağırıyor; kapı bu yüzden bir sayfanın klasöründe değil burada
// (`lib/notifications/actions.ts` emsali).
//
// **`requireAdmin`:** düğme yüzen mesaj penceresine açılır ve pencerenin kapısı sohbet sayfasınınki.
// Başka rolde düğme zaten çizilmez — ama düğmeyi çizmemek güvence değildir, kapı burada durur.

/**
 * **Müşterinin sohbet kanalları** — okuma ve karar ortak katmanda (`readCustomerChannels` →
 * `customerChannelsOf`); burası yaşı ekranın diline çevirir.
 */
export async function customerChannelsAction(customerId: string): Promise<ActionResult<CustomerChannelsView>> {
  try {
    await requireAdmin();
    const set = await readCustomerChannels(serviceDb(), customerId);
    if (!set) return { data: null, error: 'Müşteri bulunamadı.' };
    return { data: { channels: toCustomerChannels(set.channels, new Date()), canStartWhatsapp: set.canStartWhatsapp }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
