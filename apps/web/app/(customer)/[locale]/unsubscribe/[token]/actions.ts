'use server';

import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { unsubscribeEmail } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';

/**
 * Jetonun sahibinin kampanya e-postasını kapatır ve sayfayı yeniden açar; sayfa hâlini kayıttan okuduğu için ekrandaki "sonlandı"
 * gerçekleşmiş bir kapatmadır. Yönlendirme `try` dışında, çünkü Next onu fırlatarak yapar ve hata kapısı onu yutardı.
 */
export async function unsubscribeAction(locale: string, token: string): Promise<CustomerResult<true>> {
  if (!hasLocale(routing.locales, locale)) redirect('/');
  try {
    if ((await unsubscribeEmail(serviceDb(), token)) === 'invalid') throw new CustomerError('session_expired');
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
  redirect(getPathname({ href: { pathname: '/unsubscribe/[token]', params: { token } }, locale }));
}
