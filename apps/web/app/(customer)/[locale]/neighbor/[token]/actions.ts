'use server';

import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { acceptNeighborInvite } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { rememberNeighborInvite } from '@/lib/identity/invite-cookie';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import type { NeighborTarget } from './neighbor-types';

const TARGET_PATH = { catalog: '/catalog', cart: '/cart', login: '/login' } as const satisfies Record<NeighborTarget, string>;

/**
 * Komşu davetini kabul eder ve ziyaretçiyi seçtiği yere gönderir; bağlantıyı açmak bir niyet olmadığı için kabul dokunuşla yazılır.
 * Belirteç burada doğrulanmaz: kapanmış ya da dolmuş davette sayfa kabul düğmesini çizmez, asıl süzgeç sipariş anındadır.
 */
export async function acceptNeighborInviteAction(locale: string, token: string, target: NeighborTarget): Promise<never> {
  if (!hasLocale(routing.locales, locale)) redirect('/');

  // Girişli ziyaretçide kabul doğrudan kişiye yazılır: çerezde bekleyen davet başka cihazdan girişte kaybolurdu.
  const customerId = await currentCustomerId();
  if (customerId) {
    await acceptNeighborInvite(serviceDb(), { token, customerId });
  } else {
    await rememberNeighborInvite(token);
  }

  redirect(getPathname({ href: TARGET_PATH[target], locale }));
}
