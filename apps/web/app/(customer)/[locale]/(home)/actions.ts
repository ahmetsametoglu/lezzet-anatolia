'use server';

import { hasLocale } from 'next-intl';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import type { Device } from '@/lib/device';
import { loadHomeView, type HomeView } from '@/lib/storefront/home-view';
import { routing } from '@/i18n/routing';

/**
 * Anasayfanın ÖTEKİ yüzü — cihaz çatalının istemci düzeltmesi için (14.09).
 *
 * Sayfa sunucunun cihaz ipucuyla (UA) tek yüzün verisini okur; telefon ile masaüstü artık farklı
 * bileşimler (`home-view.ts` künyesi). İpucu yanlışsa — UA'sı telefon diyen tablet, daraltılmış masaüstü
 * penceresi — istemci öteki yüzü buradan ister. Guard YOK: anasayfa herkese açık; girdiler yine de
 * doğrulanır, dışarıdan gelen her değer şüphelidir.
 */
export async function loadHomeViewAction(locale: string, device: Device): Promise<CustomerResult<HomeView>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    if (device !== 'mobile' && device !== 'desktop') throw new Error('Geçersiz cihaz');
    return { data: await loadHomeView(locale, device), errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
