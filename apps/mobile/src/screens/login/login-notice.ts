import { AuthErrorKeyEnum } from '@lezzet/types';
import { z } from 'zod';

/*
  GİRİŞ EKRANININ AÇILIŞ UYARISI — ekrana URL'den (`/login?notice=`) gelen sebep anahtarı.

  İki kaynak, tek süzgeç: OAuth dönüş rotasının adlı retleri (sözleşmenin `AuthErrorKeyEnum`ü, web
  ile ortak) ve reddedilen oturum (21.304). İkincisi ortak sözleşmeye EKLENMEDİ: oraya giren her
  anahtar webin sözlüğüne de cümle ister (`apps/web/lib/auth/errors.ts` — `Record<AuthErrorKey, …>`)
  ve webde bu anahtarı üreten bir yol yok.

  Üç tüketeni var — rota süzer, ekran cümleyi kurar, kökteki kanca adresi yazar — o yüzden anahtar
  kendi dosyasında: üç yerde elle yazılan bir dize, biri değiştiği gün sessizce eşleşmezdi.
*/

/** Oturumu sunucu reddetti — kökteki kanca giriş ekranını bu anahtarla açar. */
export const SESSION_ENDED_NOTICE = 'session_ended';

export const LoginNoticeSchema = AuthErrorKeyEnum.or(z.literal(SESSION_ENDED_NOTICE));
export type LoginNotice = z.infer<typeof LoginNoticeSchema>;
