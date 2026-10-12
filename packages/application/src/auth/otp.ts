import type { SupabaseClient } from '@supabase/supabase-js';
import { brand } from '@lezzet/brand';
import { EmailVerificationService, UserProfileService } from '@lezzet/database';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { isLocalUrl, isValidEmail, normalizeEmail } from '@lezzet/helper';
import { captureError, logger, maskEmail } from '@lezzet/observability';
import type { PreferredLanguage } from '@lezzet/types';
import { attachReferralOnLogin } from '../customer/referral';

/**
 * E-posta kodlu girişin web ve mobilde ortak akışı; taşımadan bağımsızdır: dil parametre, istemci enjekte, sonuç durum nesnesi.
 * Durum adları `AuthErrorKeyEnum`la hizalıdır ki çağıran taşıma katmanı eşleme tablosuna muhtaç kalmasın.
 */

/** Giriş akışlarının hata kaynağı — kod (bu dosya) ve OAuth hesap kapısı (`oauth-account.ts`) ortak. */
export const AUTH_SOURCE = 'application-auth';

let otpTestWarned = false;

/**
 * Testin bildiği sabit kod: kod hiçbir yere yazılamadığı için uçtan uca testin kod adımı bunsuz geçilemez. Üretim kipinde ya da
 * yerel olmayan veritabanına bağlı süreçte ortam ne derse desin kapalıdır; iki kilit ayrı okumalara dayanır ki biri yanlış kurulsa
 * öteki tutsun.
 */
export function devOtpCode(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (!isLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  const raw = process.env.OTP_TEST_CODE;
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  if (!otpTestWarned) {
    otpTestWarned = true;
    logger.warn({ context: 'application/auth-otp' }, 'OTP_TEST_CODE AKTİF — sabit doğrulama kodu, mail gönderilmiyor (yalnız dev/test)');
  }
  return raw;
}

/**
 * Biçim süzgeci pakette durur çünkü ekranı olmayan çağıran (mobil gövde) da var; süzgeçsiz geçen çöp adres doğrulama tablosuna
 * satır ve e-posta servisine boş çağrı olurdu.
 */
function toValidEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  return email && isValidEmail(email) ? email : null;
}

/** Hesap = profil ve ona bağlı giriş kaydı; siparişten doğan misafir profilinin hesabı yoktur ve operasyon girişi onu kayıtlı saymaz. */
async function hasAccount(admin: SupabaseClient, email: string): Promise<boolean> {
  const profile = await new UserProfileService(admin).findByEmail(email);
  return Boolean(profile?.authUserId);
}

export type RequestOtpCodeResult =
  | { status: 'ok' }
  | { status: 'invalid_email' }
  | { status: 'rate_limit' | 'cooldown'; retryAfterSec: number }
  | { status: 'send_failed' };

/** Yalnız operasyon girişinin sonucu; tipi bayrağa bağlıdır ki bayrak vermeyen yüzeyin hata sözlüğüne bu anahtar sızmasın. */
type NotRegistered = { status: 'not_registered' };

interface RequestOtpInput {
  email: string;
  locale: PreferredLanguage;
  registeredOnly?: boolean;
}

/**
 * Kodu üretip postalar; kod bizimdir (Supabase'inki değil) ve sınırlarını veritabanındaki atomik RPC tutar. Test kodu açıkken
 * e-posta hiç gönderilmez.
 */
export async function requestOtpCode(
  admin: SupabaseClient,
  input: RequestOtpInput & { registeredOnly?: false },
): Promise<RequestOtpCodeResult>;
export async function requestOtpCode(admin: SupabaseClient, input: RequestOtpInput): Promise<RequestOtpCodeResult | NotRegistered>;
export async function requestOtpCode(admin: SupabaseClient, input: RequestOtpInput): Promise<RequestOtpCodeResult | NotRegistered> {
  const email = toValidEmail(input.email);
  if (!email) return { status: 'invalid_email' };
  // Oran sınırından ÖNCE: kaydı olmayan adres bekleme hakkı da yakmasın, `email_verifications`a satır da düşmesin.
  if (input.registeredOnly && !(await hasAccount(admin, email))) return { status: 'not_registered' };

  const service = new EmailVerificationService(admin);
  const testCode = devOtpCode();
  const requested = await service.requestCode(email, testCode ?? undefined);
  if (requested.status !== 'ok') return { status: requested.status, retryAfterSec: requested.retryAfterSec };

  // Test kodundayken e-posta servisine gidilmez: her uçtan uca koşu gerçek bir mail üretirdi. Kod zaten biliniyor.
  if (testCode) return { status: 'ok' };

  const mail = await sendEmail({
    to: email,
    subject: otpSubject(input.locale, brand.name),
    react: OtpCodeEmail({ code: requested.code, locale: input.locale, brandName: brand.name }),
  });
  if (mail.error) {
    // Kod asla loglanmaz, kaydı okuyan o kodla girebilirdi. Giriş yolu kimliksiz olduğu için adres maskeli yazılır.
    await captureError(new Error(`OTP maili gönderilemedi: ${mail.error}`), {
      source: AUTH_SOURCE,
      context: { flow: 'auth/requestOtpCode', email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }
  return { status: 'ok' };
}

export type VerifyOtpCodeResult =
  | { status: 'ok'; hashedToken: string; userId: string; knownBefore: boolean }
  | { status: 'invalid_email' | 'invalid_code' | 'code_expired' | 'code_locked' | 'no_active_code' | 'send_failed' };

interface VerifyOtpInput {
  email: string;
  code: string;
  locale: PreferredLanguage;
  /** Davet kodu; geçersiz ya da geç kalmış kod girişi durdurmaz. */
  referralCode?: string | null;
  /** Operasyon girişi: hesap yoksa açılmaz, kod doğru olsa da `not_registered`. */
  registeredOnly?: boolean;
}

/**
 * Kodu doğrular ve oturum jetonunu döner; jetonu tüketmek taşımanın işidir, çünkü paylaşılan service-role istemcisine oturum
 * yazılırsa sonraki bütün istekler o kullanıcının jetonuyla gider. `knownBefore` hesap açan `generateLink`ten önce ölçülür, sonra
 * bakan herkes "zaten vardı" okurdu.
 */
export async function verifyOtpCode(
  admin: SupabaseClient,
  input: VerifyOtpInput & { registeredOnly?: false },
): Promise<VerifyOtpCodeResult>;
export async function verifyOtpCode(admin: SupabaseClient, input: VerifyOtpInput): Promise<VerifyOtpCodeResult | NotRegistered>;
export async function verifyOtpCode(admin: SupabaseClient, input: VerifyOtpInput): Promise<VerifyOtpCodeResult | NotRegistered> {
  const email = toValidEmail(input.email);
  if (!email) return { status: 'invalid_email' };

  const verified = await new EmailVerificationService(admin).verifyCode(email, input.code.trim());
  if (verified.status !== 'ok') {
    // Servisin durum adı ile müşteri anahtarı ayrı: `not_found` sistemin sözü, `no_active_code` müşterinin anlayacağı hâl.
    const status =
      verified.status === 'expired'
        ? ('code_expired' as const)
        : verified.status === 'locked'
          ? ('code_locked' as const)
          : verified.status === 'not_found'
            ? ('no_active_code' as const)
            : ('invalid_code' as const);
    return { status };
  }

  const profiles = new UserProfileService(admin);
  const known = await profiles.findByEmail(email);
  const knownBefore = Boolean(known);
  // Hesap açan adım bayrak açıkken hesabı olmayana gelmez: istek zaten reddetmişti, arada hesap silinmişse de burada durur.
  if (input.registeredOnly && !known?.authUserId) return { status: 'not_registered' };

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link.properties?.hashed_token || !link.user) {
    // `linkErr` null olabilir: bağlantı geldi ama jeton/kullanıcı eksik olan hâl de buraya düşer.
    await captureError(new Error(`generateLink başarısız: ${linkErr?.message ?? 'jeton ya da kullanıcı boş'}`), {
      source: AUTH_SOURCE,
      context: { flow: 'auth/verifyOtpCode', email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }

  // Dil yalnız ilk kez yazılır; sonrası müşterinin tercihidir.
  if (!knownBefore) await seedPreferredLanguage(profiles, link.user.id, input.locale);

  // Davet bağı ortak kapıdan ve `knownBefore` koşulu olmadan kurulur: "yeni müşteri" ölçütü siparişsizliktir ve kararı o kapı
  // verir; burada da koşul olsaydı OAuth yolu ötekini görmezdi.
  if (input.referralCode) await tryAttachReferral(admin, link.user.id, input.referralCode);

  return { status: 'ok', hashedToken: link.properties.hashed_token, userId: link.user.id, knownBefore };
}

/**
 * Davet bağını kurar, girişi asla düşürmez ama reddin gerekçesini loga yazar; davet bir kolaylıktır, kimlik değil. Dışa verilir
 * çünkü OAuth dönüşleri de çağırır ve yutma davranışının tek kopyası olmalı.
 */
export async function tryAttachReferral(admin: SupabaseClient, authUserId: string, code: string): Promise<void> {
  try {
    const outcome = await attachReferralOnLogin(admin, { authUserId, referralCode: code });
    if (outcome !== 'linked') {
      logger.info({ context: 'application/auth-otp', authUserId, outcome }, 'davet bağı kurulmadı');
    }
  } catch (err) {
    logger.warn(
      { context: 'application/auth-otp', authUserId, err: err instanceof Error ? err.message : String(err) },
      'davet bağı kurulurken hata — giriş etkilenmedi',
    );
  }
}

/** Yeni açılan karta dili yazar; servis parametre alınır çünkü `verifyOtpCode` onu zaten kurmuş durumda. */
async function seedPreferredLanguage(profiles: UserProfileService, authUserId: string, locale: PreferredLanguage): Promise<void> {
  try {
    const profile = await profiles.findByAuthUserId(authUserId);
    // Profil yoksa trigger henüz yazmamıştır ya da yazamamıştır; dil yüzünden girişi bozmayız.
    if (!profile) return;
    await profiles.update({ id: profile.id, preferredLanguage: locale });
  } catch {
    // Bilinçli sessiz: dil bir kolaylıktır; tohum düştü diye girişi düşürmek müşteriyi bir tercih yüzünden kapıda bırakmaktır.
  }
}
