'use server';

import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { rememberInvite } from '@/lib/identity/invite-cookie';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import type { InviteTarget } from './invite-types';

/**
 * Daveti KABUL eder: kodu çereze yazar, ziyaretçiyi seçtiği yere gönderir (17.9).
 *
 * ── NEDEN AYRI BİR EYLEM, NEDEN SAYFA AÇILIRKEN DEĞİL ────────────────────────
 * Sayfa bir sunucu bileşenidir ve çerez yazamaz (Next kuralı), ama asıl gerekçe teknik değil:
 * bağlantıyı açmak bir NİYET değildir — mesajı yanlışlıkla açan, merak eden, önizleme botu olan
 * herkes onu açar. Çerez ziyaretçi "keşfet"e ya da "hesap oluştur"a dokununca yazılır; o dokunuş
 * daveti kabul etmenin kendisidir.
 *
 * **Hedef açık uçlu DEĞİL** (`InviteTarget` künyesi): iki sabit rota. İstemciden gelen serbest bir
 * yolu `redirect`e vermek, sayfayı açık yönlendirme kapısına çevirirdi — davet bağlantısı zaten
 * tanımadığımız kanallarda dolaşıyor.
 *
 * Kodun GEÇERLİ olup olmadığına burada BAKILMIYOR ve bu bilinçli: geçersiz kod zaten sayfada
 * "artık geçerli değil" hâline düşüyor ve orada kabul düğmesi çizilmiyor. İkinci bir doğrulama,
 * aynı kuralın iki yerde yaşaması olurdu; kodun asıl süzgeci kayıt anında (`linkReferrer`).
 */
export async function acceptInviteAction(locale: string, code: string, target: InviteTarget): Promise<never> {
  if (!hasLocale(routing.locales, locale)) redirect('/');
  await rememberInvite(code);
  redirect(getPathname({ href: target === 'login' ? '/login' : '/catalog', locale }));
}
