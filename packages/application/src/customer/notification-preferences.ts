import { UserProfileService, ZoneNoticeService } from '@lezzet/database';
import { notificationToken } from '@lezzet/domain-core';
import { localizedUrl, type Locale } from '@lezzet/i18n';
import { logger } from '@lezzet/observability';
import type { MarketingChannel, NotificationKind, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  BİLDİRİM TERCİHLERİ KAPISI (22.08) — sayfanın okuması, yazması ve maillerin bağı tek yerde.

  ── NEDEN BU KAPI VAR ───────────────────────────────────────────────────────
  Bağ TEK BİR SAYFAYA çıkıyor ama ONU ÜRETEN altı ayrı yol var (sipariş bildirimleri, talep
  bildirimi, B2B başvuru cevabı, bölge müjdesi, değerlendirme daveti) ve hepsi bugüne kadar aynı
  dizeyi elle kuruyordu: `localizedUrl('/account/notifications', locale)`. Jeton devreye girince o
  altı yerin altısının da "jetonu bul ya da üret, sonra sorgu dizesine ekle" bilmesi gerekirdi —
  biri unutulsa o mailin bağı sessizce giriş duvarına çıkardı ve kimse fark etmezdi.

  ── İKİ ÖZNE, TEK SAYFA ─────────────────────────────────────────────────────
  Alıcı ya bir PROFİLDİR (dokuz şablon) ya da yalnız bir E-POSTADIR (bölge müjdesi; `customer_id`
  çoğu ziyaretçi kaydında yok). İkisinin jetonu ayrı tablodan gelir ama sayfa tektir: profil dört
  satır görür, ziyaretçi yalnız bekleyen bölge kayıtlarını.

  ── NE GÖSTERİLMEZ ──────────────────────────────────────────────────────────
  Jeton oturum DEĞİLDİR ve oturumun yetkisini taşımaz: bu kapıdan ad, adres, sipariş, puan
  okunmaz. Taşıdığı tek yetki tercihleri okumak ve yazmaktır — jeton bir mailin altbilgisinde
  yıllarca durabilir, blast yarıçapı dar olmalı.
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
 * Jetonun sahibini çözer — önce profil, sonra bölge kaydı.
 *
 * Sıra önemli değil (iki jeton kümesi ayrı tablolarda ve çakışmaları imkânsız); ama profil önce
 * sorulur çünkü on şablonun dokuzu oradan gelir.
 *
 * `null` = geçersiz jeton. Sebebi SÖYLENMEZ (eski mi, silinmiş mi, hiç var olmadı mı): ayırt etmek
 * "bu adres bizde kayıtlı" bilgisini sızdırırdı.
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

/**
 * Kampanya iznini yazar. Öbür kanalın kaydı KORUNUR — nesne baştan yazılsaydı bir kanalı açmak
 * ötekinin "ne zaman verildi" izini silerdi (hesap sayfasının aynı dersi).
 */
export async function setMarketingConsent(
  db: SupabaseClient,
  input: { customerId: string; channel: MarketingChannel; granted: boolean; source: string },
): Promise<boolean> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(input.customerId);
  if (!profile) return false;

  await profiles.update({
    id: input.customerId,
    marketingConsent: {
      ...profile.marketingConsent,
      [input.channel]: { granted: input.granted, at: new Date().toISOString(), source: input.source },
    },
  });
  return true;
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

/**
 * Bekleyen bölge kayıtlarını kaldırır — ziyaretçinin de girişlinin de "artık haber vermeyin"i.
 *
 * Haberi GİTMİŞ satırlara dokunulmaz: onlar bekleyiş değil, olmuş bir olayın kaydıdır.
 */
export async function cancelZoneNotices(db: SupabaseClient, email: string): Promise<void> {
  await new ZoneNoticeService(db).removeAllPendingForEmail(email);
}

/**
 * Profilin jetonu — yoksa üretilir, varsa aynısı döner (`ensureCustomerReferralCode` deseni).
 *
 * **Tekilliği veritabanı söyler** (`user_profiles_notification_token_key`), uygulama değil: "bu
 * jeton var mı" diye sorup sonra yazmak, iki eşzamanlı mail arasında yine çakışırdı.
 *
 * `null` iki hâlde: profil yok ya da çakışma tekrarı tükendi. İkincisi bir arızadır ve sessiz
 * geçmez — log'a KİMLİK yazılır, jetonun kendisi hiçbir hâlde yazılmaz (CLAUDE §1: jeton bir
 * anahtardır, log'a içerik girmez).
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
 * Her mailin altbilgisindeki "Bildirim tercihleri" adresi.
 *
 * **Jetonlu üretilir**, çünkü bağın gittiği yer oturum ister ve mailin alıcısı çoğu zaman o an
 * girişli değildir. Jeton çözülemezse ÇIPLAK adres döner — bu bir geri düşüştür, hata değil:
 * girişli müşteri sayfayı yine açar, giriş yapmayan giriş sayfasına düşer. Bağı hiç yazmamak ya da
 * mail göndermeyi kesmek, bir kolaylık uğruna bildirimin kendisini kaybetmek olurdu.
 */
export async function notificationPreferencesUrl(
  db: SupabaseClient,
  locale: Locale,
  subject: { customerId?: string | null; zoneNoticeToken?: string | null },
): Promise<string> {
  const base = localizedUrl('/account/notifications', locale);
  const token = subject.customerId
    ? await ensureNotificationToken(db, subject.customerId)
    : (subject.zoneNoticeToken ?? null);
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}
