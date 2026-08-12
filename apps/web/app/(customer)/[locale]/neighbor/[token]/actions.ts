'use server';

import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { acceptNeighborInvite } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { rememberNeighborInvite } from '@/lib/identity/invite-cookie';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import type { NeighborTarget } from './invite-types';

/**
 * Komşu davetini KABUL eder: belirteci çereze yazar, ziyaretçiyi seçtiği yere gönderir (17.10).
 *
 * Getiren davetinin `acceptInviteAction`'ı ile aynı desen ve aynı iki gerekçe: sayfa bir sunucu
 * bileşenidir ve çerez yazamaz; ama asıl sebep teknik değil — bağlantıyı AÇMAK bir niyet değildir.
 * Mesajı yanlışlıkla açan, merak eden, önizleme botu olan herkes onu açar. Çerez ziyaretçi
 * düğmeye dokununca yazılır; o dokunuş daveti kabul etmenin kendisidir.
 *
 * **Belirteç burada DOĞRULANMAZ** ve bu bilinçli — iki kat gerekçeyle: geçersiz/kapanmış/dolmuş
 * davette sayfa zaten kabul düğmesini çizmiyor, ve asıl süzgeç sipariş anında
 * (`claimNeighborInvite`, seferi bilen tek yer). Buraya üçüncü bir kontrol koymak aynı kuralı üç
 * yerde tutmak olurdu.
 */
export async function acceptNeighborInviteAction(locale: string, token: string, target: NeighborTarget): Promise<never> {
  if (!hasLocale(routing.locales, locale)) redirect('/');

  /**
   * **Girişli ziyaretçide çerez ARADAN ÇIKAR** (12.08 kararı): kabul doğrudan kişiye yazılır.
   * Çerez yalnız kimliği olmayan ziyaretçinin köprüsü — kimlik zaten varken onu bir tur tarayıcıda
   * bekletmek, kullanıcının şikâyet ettiği kaybın küçük hâlini yeniden üretmek olurdu (aynı kişi
   * başka cihazdan girerse davet kaybolur).
   */
  const customerId = await currentCustomerId();
  if (customerId) {
    await acceptNeighborInvite(serviceDb(), { token, customerId });
  } else {
    await rememberNeighborInvite(token);
  }

  redirect(getPathname({ href: target === 'cart' ? '/cart' : '/catalog', locale }));
}
