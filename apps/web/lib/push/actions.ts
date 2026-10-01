'use server';

import { registerWebPushSubscription, unregisterPushDevice } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { WebPushSubscriptionSchema } from '@lezzet/types';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { currentCustomerId, guarded, requireStaff } from '@/lib/guard';
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

/**
 * Operasyon panelinin kaydı `operations` uygulamasına yazılır; personel haberi bu satırı okur. Personel oturumu yoksa `false` döner,
 * çünkü panel eşitlemesi her açılışta çalışır.
 */
export async function registerStaffWebPushAction(subscription: unknown): Promise<ActionResult<boolean>> {
  try {
    const staff = await guarded(requireStaff);
    if (!staff.ok) return { data: false, error: null };

    const parsed = WebPushSubscriptionSchema.safeParse(subscription);
    if (!parsed.success) return { data: null, error: 'Tarayıcı aboneliği okunamadı.' };

    await registerWebPushSubscription(serviceDb(), { profileId: staff.user.profileId, subscription: parsed.data, app: 'operations' });
    await rememberWebPushEndpoint(parsed.data.endpoint);
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function removeStaffWebPushAction(endpoint: string): Promise<ActionResult<true>> {
  try {
    const staff = await requireStaff();
    await unregisterPushDevice(serviceDb(), { profileId: staff.profileId, token: endpoint });
    await forgetWebPushEndpoint();
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
