'use server';

import { registerWebPushSubscription, unregisterPushDevice } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { WebPushSubscriptionSchema } from '@lezzet/types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { currentCustomerId } from '@/lib/guard';
import { forgetWebPushEndpoint, rememberWebPushEndpoint } from './web-push-cookie';

/**
 * Oturumsuzda `false` döner ve iz bırakmaz: kök bileşen abone tarayıcıda her açılışta çağırır ve çıkış yapmış ziyaretçi hata
 * değildir. Kayıt sahibi devreder, tarayıcı oturumdaki müşterinin kulağı olur.
 */
export async function registerWebPushAction(subscription: unknown): Promise<CustomerResult<boolean>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) return { data: false, errorKey: null };

    const parsed = WebPushSubscriptionSchema.safeParse(subscription);
    if (!parsed.success) throw new CustomerError('unexpected');

    await registerWebPushSubscription(serviceDb(), { profileId: customerId, subscription: parsed.data, app: 'customer' });
    await rememberWebPushEndpoint(parsed.data.endpoint);
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

export async function removeWebPushAction(endpoint: string): Promise<CustomerResult<true>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');

    await unregisterPushDevice(serviceDb(), { profileId: customerId, token: endpoint });
    await forgetWebPushEndpoint();
    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
