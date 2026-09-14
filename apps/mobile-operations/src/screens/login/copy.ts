import type { NOT_REGISTERED } from '@lezzet/mobile-kit/src/lib/auth/otp';
import type { LoginNotice } from '@lezzet/mobile-kit/src/screens/login/login-notice';

import messages from './messages.json';

/*
  OPERASYON GİRİŞİNİN SÖZLÜĞÜ (21.312) — tek dilli, dil ekseni YOK (gerekçe `screens/operations/copy.ts`
  künyesinde). Tip JSON'dan türer.

  HATA CÜMLELERİ KİTİN AUTH SÖZLÜĞÜNDEN DEĞİL: o sözlük müşterinin (üç dil, "siz" diliyle); bu ekranın
  tasarımı "sen" diyor ("Çalışma hesabınla gir") ve aynı ekranda iki hitap olmasın diye cümleler burada.
  Tasarım kodun iki reddini (yanlış · süresi geçmiş) TEK cümlede birleştiriyor.

  KODUN ÖMRÜ CÜMLEDE YAZILI (15 dakika) — tasarım 10 diyordu, ekrana olgu yazılır: değer sunucuda
  `TTL_MINUTES` (`packages/database/src/services/email-verification.service.ts`); biri değişirse öteki de.
*/

export const loginCopy = messages;

/** Ekranın söyleyebildiği her ret: auth anahtarları + açılış sebebi (`session_ended`) + kayıt kapısı. */
export type LoginErrorKey = LoginNotice | typeof NOT_REGISTERED;

const errors = messages.errors;

/** `Record` bilinçli: kit bir auth anahtarı eklediği gün bu dosya derlenmez, cümlesiz ret kalmaz. */
const ERROR_TEXT: Record<LoginErrorKey, string> = {
  invalid_email: errors.invalidEmail,
  not_registered: errors.notRegistered,
  send_failed: errors.sendFailed,
  rate_limit: errors.rateLimit,
  cooldown: errors.cooldown,
  invalid_code: errors.codeRejected,
  code_expired: errors.codeRejected,
  code_locked: errors.codeLocked,
  no_active_code: errors.noActiveCode,
  google_unavailable: errors.googleUnavailable,
  oauth_failed: errors.oauthFailed,
  session_ended: errors.sessionEnded,
};

export function loginErrorText(key: LoginErrorKey): string {
  return ERROR_TEXT[key];
}
