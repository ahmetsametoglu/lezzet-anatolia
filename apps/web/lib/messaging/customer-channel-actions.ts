'use server';

import { readCustomerChannels } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { toCustomerChannels, type CustomerChannelsView } from '@/components/operation/ui/customer-channel-model';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';

// Kapı bir sayfanın klasöründe değil, çünkü düğme ortak kitte ve birden çok ekran çağırır. Düğmeyi çizmemek güvence değildir,
// kapı `requireAdmin`.

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
