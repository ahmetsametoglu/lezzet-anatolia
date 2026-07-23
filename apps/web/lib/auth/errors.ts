import type { Locale } from '@lezzet/i18n';

/**
 * Kullanıcıya dönen auth hata anahtarları. Ham Supabase mesajı yerine anlamsal anahtar
 * taşınır; çeviri tek yerde ({@link AUTH_MESSAGES}) tutulur (DRY + i18n).
 */
type AuthErrorKey =
  | 'invalid_email'
  | 'send_failed'
  | 'rate_limit'
  | 'cooldown'
  | 'invalid_code'
  | 'code_expired'
  | 'code_locked'
  | 'no_active_code'
  | 'google_unavailable'
  | 'oauth_failed';

const AUTH_MESSAGES: Record<AuthErrorKey, Record<Locale, string>> = {
  invalid_email: {
    tr: 'Geçerli bir e-posta girin.',
    fr: 'Saisissez une adresse e-mail valide.',
    de: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  },
  send_failed: {
    tr: 'Kod gönderilemedi, tekrar deneyin.',
    fr: 'Le code n’a pas pu être envoyé, réessayez.',
    de: 'Code konnte nicht gesendet werden, bitte erneut versuchen.',
  },
  rate_limit: {
    tr: 'Çok fazla deneme. Lütfen bir saat sonra tekrar deneyin.',
    fr: 'Trop de tentatives. Veuillez réessayer dans une heure.',
    de: 'Zu viele Versuche. Bitte in einer Stunde erneut versuchen.',
  },
  cooldown: {
    tr: 'Yeni kod istemeden önce biraz bekleyin.',
    fr: 'Patientez avant de redemander un code.',
    de: 'Bitte warten Sie, bevor Sie einen neuen Code anfordern.',
  },
  invalid_code: {
    tr: 'Kod doğru değil — yeniden deneyin.',
    fr: 'Le code est incorrect — réessayez.',
    de: 'Der Code ist ungültig — bitte erneut versuchen.',
  },
  code_expired: {
    tr: 'Kodun süresi doldu. Yeni bir kod isteyin.',
    fr: 'Le code a expiré. Demandez un nouveau code.',
    de: 'Der Code ist abgelaufen. Fordern Sie einen neuen Code an.',
  },
  code_locked: {
    tr: 'Çok fazla hatalı deneme. Yeni bir kod isteyin.',
    fr: 'Trop d’essais. Demandez un nouveau code.',
    de: 'Zu viele Fehlversuche. Fordern Sie einen neuen Code an.',
  },
  no_active_code: {
    tr: 'Aktif kod yok. Yeni bir kod isteyin.',
    fr: 'Aucun code actif. Demandez un nouveau code.',
    de: 'Kein aktiver Code. Fordern Sie einen neuen Code an.',
  },
  google_unavailable: {
    tr: 'Google ile giriş şu an kullanılamıyor.',
    fr: 'La connexion avec Google est momentanément indisponible.',
    de: 'Die Anmeldung mit Google ist derzeit nicht verfügbar.',
  },
  oauth_failed: {
    tr: 'Giriş tamamlanamadı, tekrar deneyin.',
    fr: 'La connexion n’a pas pu aboutir, réessayez.',
    de: 'Die Anmeldung konnte nicht abgeschlossen werden, bitte erneut versuchen.',
  },
};

/** Anlamsal hata anahtarını seçili dildeki kullanıcı metnine çevirir. */
export function authErrorMessage(key: AuthErrorKey, locale: Locale): string {
  return AUTH_MESSAGES[key][locale];
}
