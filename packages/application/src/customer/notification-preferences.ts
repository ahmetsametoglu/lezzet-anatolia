import { UserProfileService, ZoneNoticeService } from '@lezzet/database';
import { notificationToken } from '@lezzet/domain-core';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { MarketingChannel, NotificationKind, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Bildirim tercihleri sayfasının okuması, yazması ve e-postalardaki bağı; bağı üreten her gönderim yolu jetonu buradan alır. Özne ya
  profildir ya da yalnız bir e-postadır (bölge haberi); jeton oturumun yetkisini taşımaz, yalnız tercihleri açar.
*/

/** Sipariş/talep bildirimleri kapatılamaz — sözleşme gereği. Ekran bunu YAZAR, gizlemez. */
export interface NotificationPreferencesView {
  /** Kampanya izinleri (opt-in) — anahtar yoksa kapalı. */
  marketing: Record<MarketingChannel, boolean>;
  /** Tür bazlı retler (opt-out) — anahtar yoksa AÇIK. */
  kinds: Record<NotificationKind, boolean>;
  /**
   * Bekleyen bölge müjdesi kayıtları — "kapatmak" burada bir izin değil, KAYDIN KENDİSİNİ silmek.
   * Müşteri izin vermedi, bir şey istedi; istemekten vazgeçmek o isteği geri almaktır.
   */
  zoneNotices: { id: string; postalCode: string; placeName: string | null }[];
  /** Jetonla gelen ziyaretçi mi (profili yok) — ekran yalnız bölge satırını çizer. */
  visitorOnly: boolean;
}

export type PreferencesSubject =
  | { kind: 'profile'; profile: UserProfile }
  | { kind: 'visitor'; email: string };

/**
 * Jetonun sahibini çözer: önce profil, sonra bölge kaydı. `null` geçersiz jetondur ve sebebi söylenmez, çünkü ayırt etmek "bu adres
 * bizde kayıtlı" bilgisini sızdırırdı.
 */
export async function resolvePreferencesToken(db: SupabaseClient, token: string): Promise<PreferencesSubject | null> {
  const temiz = token.trim();
  if (!temiz) return null;

  const profile = await new UserProfileService(db).findByNotificationToken(temiz);
  if (profile) return { kind: 'profile', profile };

  const notice = await new ZoneNoticeService(db).findByToken(temiz);
  return notice ? { kind: 'visitor', email: notice.email } : null;
}

/** Girişli müşterinin öznesi — jeton yerine oturum. Sayfa iki yoldan da aynı görünümü kurar. */
export async function preferencesSubjectOf(db: SupabaseClient, customerId: string): Promise<PreferencesSubject | null> {
  const profile = await new UserProfileService(db).getById(customerId);
  return profile ? { kind: 'profile', profile } : null;
}

/** Sayfanın okuduğu hâl. */
export async function readNotificationPreferences(
  db: SupabaseClient,
  subject: PreferencesSubject,
): Promise<NotificationPreferencesView> {
  const notices = new ZoneNoticeService(db);
  const email = subject.kind === 'profile' ? subject.profile.email : subject.email;
  /* Bekleyen kayıtlar E-POSTAYLA aranıyor, kimlikle değil: aynı adresle hem girişliyken hem
     ziyaretçiyken kayıt bırakılmış olabilir ve müşteri ikisini de kendi kaydı sayar. */
  const zoneNotices = email ? await notices.listPendingForEmail(email) : [];

  if (subject.kind === 'visitor') {
    return {
      marketing: { email: false, whatsapp: false },
      kinds: { feedbackInvite: true },
      zoneNotices: zoneNotices.map((n) => ({ id: n.id, postalCode: n.postalCode, placeName: n.placeName })),
      visitorOnly: true,
    };
  }

  const { marketingConsent: mc, notificationConsent: nc } = subject.profile;
  return {
    marketing: { email: mc.email?.granted === true, whatsapp: mc.whatsapp?.granted === true },
    kinds: { feedbackInvite: nc.feedbackInvite?.granted !== false },
    zoneNotices: zoneNotices.map((n) => ({ id: n.id, postalCode: n.postalCode, placeName: n.placeName })),
    visitorOnly: false,
  };
}

/** Tür bazlı reddi yazar (opt-out) — şekli izinle aynı, varsayılanı ters (`notificationAllowed`). */
export async function setNotificationConsent(
  db: SupabaseClient,
  input: { customerId: string; kind: NotificationKind; granted: boolean; source: string },
): Promise<boolean> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(input.customerId);
  if (!profile) return false;

  await profiles.update({
    id: input.customerId,
    notificationConsent: {
      ...profile.notificationConsent,
      [input.kind]: { granted: input.granted, at: new Date().toISOString(), source: input.source },
    },
  });
  return true;
}

/** Bekleyen bölge kayıtlarını kaldırır; haberi gitmiş satır bekleyiş değil olmuş bir olayın kaydıdır, ona dokunulmaz. */
export async function cancelZoneNotices(db: SupabaseClient, email: string): Promise<void> {
  await new ZoneNoticeService(db).removeAllPendingForEmail(email);
}

/**
 * Profilin jetonu; yoksa üretilir, tekilliğini veritabanı kısıtı söyler. `null` profil yok ya da çakışma tekrarı tükendi demektir;
 * ikincisi log'a kimlikle yazılır, jeton hiçbir hâlde yazılmaz.
 */
const MAX_ATTEMPTS = 5;

export async function ensureNotificationToken(db: SupabaseClient, customerId: string): Promise<string | null> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return null;
  if (profile.notificationToken) return profile.notificationToken;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const updated = await profiles.update({ id: customerId, notificationToken: notificationToken() });
      return updated.notificationToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('23505') && !message.includes('user_profiles_notification_token_key')) throw err;
    }
  }

  logger.warn({ context: 'customer/notification-preferences', customerId }, 'bildirim jetonu üretilemedi');
  return null;
}

/**
 * Her e-postanın altbilgisindeki tercih adresi; alıcı çoğu zaman girişli olmadığı için jetonlu kurulur. Jeton çözülemezse çıplak
 * adres döner, çünkü bağı ya da e-postayı düşürmek bildirimin kendisini kaybettirirdi.
 */
export async function notificationPreferencesUrl(
  db: SupabaseClient,
  locale: Locale,
  subject: { customerId?: string | null; zoneNoticeToken?: string | null },
): Promise<string> {
  const base = localizedUrl('/account/preferences', locale);
  const token = subject.customerId
    ? await ensureNotificationToken(db, subject.customerId)
    : (subject.zoneNoticeToken ?? null);
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}
