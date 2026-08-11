import type { SupabaseClient } from '@supabase/supabase-js';
import { brand } from '@lezzet/brand';
import { EmailVerificationService, UserProfileService } from '@lezzet/database';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { isValidEmail, normalizeEmail } from '@lezzet/helper';
import { captureError, logger, maskEmail } from '@lezzet/observability';
import type { PreferredLanguage } from '@lezzet/types';
import { linkReferrer } from '../customer/referral';

/**
 * **E-posta OTP orkestrasyonu — İKİ yüzeyin ortak akışı** (21.4a; kaynağı web'in `otp-actions.ts`'i,
 * artık sahibi bu paket — web kopyası geçiş köprüsüdür, benimsemesi talep dosyasıyla gidecek).
 *
 * Buradaki her adım TAŞIMA-BAĞIMSIZ: Next'in `getLocale`'ine, çereze, Hono bağlamına bağlanmaz.
 * Dil PARAMETREDİR (webde `getLocale()` verir, mobilde istek gövdesi), istemci ENJEKTEDİR
 * (service-role — çağıran verir), sonuç bir DURUM NESNESİDİR (HTTP kodu/çerez/zarf çağıranın işi).
 *
 * Durum adları `AuthErrorKeyEnum`la (packages/types) hizalı: çağıran taşıma katmanı durumu
 * anahtara çevirirken eşleme tablosuna muhtaç kalmaz.
 */

/**
 * Hata kaynağı — serbest metin değil sabit (sistem ekranı bu değere göre süzer). `SOURCES`ta
 * karşılığı henüz yok ve `packages/observability` bu şeridin yazı alanı dışında; terfi talepte
 * (21.1 raporundan beri). Terfi olunca bu sabit `SOURCES.applicationAuth`a döner.
 */
const AUTH_OTP_SOURCE = 'application-auth';

/**
 * **Deterministik dev kodu** (00.9 Parti 3b · `docs/talep/musteri-otp-test-kapisi.md`) — kapının
 * KAYNAĞI artık bu paket; web'deki `devOtpCode` geçiş köprüsüdür.
 *
 * E2E, kimlik adımında kodu bilmek zorunda ama kod hiçbir yere YAZILAMAZ (`OBSERVABILITY §5`:
 * OTP maskeli bile loglanmaz). Geriye tek yol kalıyor: testin bildiği bir kodu kullanmak.
 * Sınadığı şey akışın TAMAMI (hash, süre, deneme sayacı, kilit, tek-kullanım, trigger zinciri);
 * sabit olan yalnız kodun kendisi.
 *
 * ── İKİ KİLİT (web'dekiyle birebir) ──────────────────────────────────────────
 *   1. `NODE_ENV === 'production'` → env ne olursa olsun `null`.
 *   2. `OTP_TEST_CODE` VAR ve tam altı rakam olmalı; bozuk değer sessizce yok sayılır —
 *      yarım yazılmış bir env "kod sabitlendi" sanılıp gerçek akışı zayıflatamaz.
 * Kod LOGLANMAZ; uyarı yalnız modun açık olduğunu söyler ve süreç başına bir kez basılır.
 */
let otpTestWarned = false;

function devOtpCode(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const raw = process.env.OTP_TEST_CODE;
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  if (!otpTestWarned) {
    otpTestWarned = true;
    logger.warn({ context: 'application/auth-otp' }, 'OTP_TEST_CODE AKTİF — sabit doğrulama kodu, mail gönderilmiyor (yalnız dev/test)');
  }
  return raw;
}

/**
 * Normalize + BİÇİM süzgeci tek kapıda. `normalizeEmail` bilerek biçime bakmaz (kimlik anahtarı
 * indirger, 20 çağrı yeri var); biçim denetimi `isValidEmail` (helper — "ekranın boşuna kod
 * göndermesini engellemek" onun yazılı işi). Web action'ı bugün bu süzgeci EKRANA bırakıyor;
 * paket kapıyı kendisi tutar, çünkü artık ekranı olmayan bir çağıranı da (mobil gövde) var —
 * süzgeçsiz geçen çöp adres `email_verifications`a satır ve Resend'e boş çağrı olurdu. Ayrıca
 * `token_hash` GLOBAL TEKİL: OTP_TEST_CODE modunda çöp adresin satırı, gerçek adresin kodunu
 * kısıt ihlaline sürükler (e2e `otp-fixture` künyesi aynı tuzağı anlatır).
 */
function toValidEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  return email && isValidEmail(email) ? email : null;
}

export type RequestOtpCodeResult =
  | { status: 'ok' }
  | { status: 'invalid_email' }
  | { status: 'rate_limit' | 'cooldown'; retryAfterSec: number }
  | { status: 'send_failed' };

/**
 * Tek kullanımlık kod üretir ve postalar. Kod bizimdir (Supabase auth OTP'si DEĞİL): hash'i
 * `email_verifications`a atomik RPC ile yazılır (rate limit 5/saat + cooldown 60 sn + kilit
 * DB'de, taşımadan bağımsız), plain kod Resend ile gider. Test kapısı açıkken mail HİÇ atılmaz.
 *
 * @param admin service-role istemci — çağıran enjekte eder (`serviceDb()`).
 * @param input.locale mailin dili; hata cümlesinin değil (cümleyi ekran kurar).
 */
export async function requestOtpCode(
  admin: SupabaseClient,
  input: { email: string; locale: PreferredLanguage },
): Promise<RequestOtpCodeResult> {
  const email = toValidEmail(input.email);
  if (!email) return { status: 'invalid_email' };

  const service = new EmailVerificationService(admin);
  const testCode = devOtpCode();
  const requested = await service.requestCode(email, testCode ?? undefined);
  if (requested.status !== 'ok') return { status: requested.status, retryAfterSec: requested.retryAfterSec };

  // Test kodundayken Resend'e HİÇ GİDİLMEZ: her e2e koşusu gerçek bir mail üretirdi (kota,
  // gürültü, kontrolsüz alıcı). Kod zaten biliniyor; mailin taşıyacağı yeni bilgi yok.
  if (testCode) return { status: 'ok' };

  const mail = await sendEmail({
    to: email,
    subject: otpSubject(input.locale, brand.name),
    react: OtpCodeEmail({ code: requested.code, locale: input.locale, brandName: brand.name }),
  });
  if (mail.error) {
    // Kod ASLA loglanmaz — kaydı okuyan biri o kodla giriş yapabilirdi. Giriş yolu KİMLİKSİZ
    // (müşteri henüz oturum açmadı), o yüzden adres MASKELİ yazılır: hangi kayıt olduğunu
    // söyler, kim olduğunu söylemez (OBSERVABILITY §5, kullanıcı kararı 03.08).
    await captureError(new Error(`OTP maili gönderilemedi: ${mail.error}`), {
      source: AUTH_OTP_SOURCE,
      context: { flow: 'auth/requestOtpCode', email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }
  return { status: 'ok' };
}

export type VerifyOtpCodeResult =
  | { status: 'ok'; hashedToken: string; userId: string; knownBefore: boolean }
  | { status: 'invalid_email' | 'invalid_code' | 'code_expired' | 'code_locked' | 'no_active_code' | 'send_failed' };

/**
 * Kodu doğrular, Supabase auth köprüsünü kurar, yeni müşterinin dilini tohumlar.
 *
 * Başarıda `hashedToken` döner ve **token'ın TÜKETİMİ bilerek pakette DEĞİL**: `verifyOtp(token_hash)`
 * oturumu bir İSTEMCİYE yazar ve o oturumun nereye gideceği taşıma kararıdır — web SSR çerez
 * istemcisiyle tüketir (oturum çereze düşer), mobil kısa ömürlü anon istemciyle tüketip session'ı
 * gövdeyle cihaza verir. Paket tüketseydi ya bir taşımanın istemcisine bağlanır ya da paylaşılan
 * bir istemcinin auth durumunu kirletirdi (service-role tekiline oturum yazılırsa sonraki tüm
 * PostgREST istekleri o kullanıcının token'ıyla gider — sessiz ve ağır bir arıza).
 *
 * `generateLink({ type: 'magiclink' })` kullanıcı yoksa YARATIR ve mail ATMAZ; `auth.users`
 * insert'i trigger'ı (0002) çalıştırır: e-postası eşleşen sahipsiz profil bağlanır (misafir→üye),
 * yoksa profil açılır. `knownBefore` bu yüzden linkten ÖNCE ölçülür — sonra bakan herkes
 * "zaten vardı" okurdu.
 *
 * ── DAVET BAĞI DA BURADA KURULUR (17.9) ─────────────────────────────────────
 * `referralCode` verilmişse ve müşteri GERÇEKTEN yeniyse (`!knownBefore`) getiren bağı yazılır.
 * Neden bu akışın içinde: müşteri kartının doğduğu tek yer burası ve "yeni mi" sorusunun cevabı
 * yalnız burada elde. Çağıran yüzeye bırakılsaydı her yüzey aynı sorguyu kendi yapardı — ve
 * bugünkü sorunun aynısı doğardı: iki yüzeyden biri bağlamayı unutur, davetli sessizce bağsız
 * kalır, ödül hiç yazılmaz, kimse fark etmez.
 *
 * **Yalnız YENİ müşteride** ve bu bir emniyet: zaten müşterimiz olan birinin davet bağlantısına
 * tıklaması onu yeniden kazandırmaz. O kapı açık olsaydı iki müşteri birbirinin bağlantısını
 * açıp puanı birbirine yazdırırdı.
 */
export async function verifyOtpCode(
  admin: SupabaseClient,
  input: {
    email: string;
    code: string;
    locale: PreferredLanguage;
    /**
     * Davet bağlantısından taşınan kod (17.9). Yüzey nereden getirdiğini kendi bilir: web'de
     * çerez, mobilde derin bağlantı. Geçersiz/kendine ait/geç kalmış kod kaydı DURDURMAZ —
     * `linkReferrer` sessizce reddeder ve giriş normal tamamlanır.
     */
    referralCode?: string | null;
  },
): Promise<VerifyOtpCodeResult> {
  const email = toValidEmail(input.email);
  if (!email) return { status: 'invalid_email' };

  const verified = await new EmailVerificationService(admin).verifyCode(email, input.code.trim());
  if (verified.status !== 'ok') {
    // Servisin durum adı ile müşteri anahtarı AYRI (web eşlemesiyle birebir): `not_found`
    // sistemin sözü ("kayıt yok"), `no_active_code` müşterinin anlayacağı hâl.
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
  const knownBefore = Boolean(await profiles.findByEmail(email));

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link.properties?.hashed_token || !link.user) {
    // `linkErr` null olabilir: bağlantı geldi ama jeton/kullanıcı eksik olan hâl de buraya düşer.
    await captureError(new Error(`generateLink başarısız: ${linkErr?.message ?? 'jeton ya da kullanıcı boş'}`), {
      source: AUTH_OTP_SOURCE,
      context: { flow: 'auth/verifyOtpCode', email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }

  // Yeni müşteri: geldiği dil kartına yazılır (04.9 — yalnız İLK kez; tercih müşterinindir).
  if (!knownBefore) {
    await seedPreferredLanguage(profiles, link.user.id, input.locale);
    if (input.referralCode) await attachReferrer(admin, profiles, link.user.id, input.referralCode);
  }

  return { status: 'ok', hashedToken: link.properties.hashed_token, userId: link.user.id, knownBefore };
}

/**
 * Yeni açılan kartı getirene bağlar (17.9).
 *
 * **Auth kimliği ile PROFİL kimliği ayrı** ve karıştırılırsa bağ sessizce kurulmaz: `link.user.id`
 * `auth.users`ın kimliği, `referred_by` ise `user_profiles`a bakan bir yabancı anahtar. Trigger'ın
 * yazdığı satır burada okunuyor (`findByAuthUserId`) — aynı ayrımın atlanması 04.11'de bir FK
 * ihlaliyle ölçülmüştü.
 *
 * **Girişi ASLA düşürmez** (dil tohumunun aynı kararı, aynı gerekçe): davet bir kolaylıktır,
 * kimlik değil. Ama SESSİZ de değil — reddin gerekçesi log'a düşer, çünkü "davet yazılmadı"
 * şikâyeti geldiğinde tek cevap kaynağı bu satırdır. Kod LOG'A YAZILMAZ: paylaşılabilir olsa da
 * başkasının kimliğine ait bir künyedir, kimlikler yeter (OBSERVABILITY §5).
 */
async function attachReferrer(admin: SupabaseClient, profiles: UserProfileService, authUserId: string, code: string): Promise<void> {
  try {
    const profile = await profiles.findByAuthUserId(authUserId);
    if (!profile) return;
    const outcome = await linkReferrer(admin, profile.id, code);
    if (outcome !== 'linked') {
      logger.info({ context: 'application/auth-otp', customerId: profile.id, outcome }, 'davet bağı kurulmadı');
    }
  } catch (err) {
    logger.warn(
      { context: 'application/auth-otp', authUserId, err: err instanceof Error ? err.message : String(err) },
      'davet bağı kurulurken hata — giriş etkilenmedi',
    );
  }
}

/**
 * Yeni açılan karta dili yazar — `apps/web/lib/identity/preferred-language.ts`in paket içi
 * karşılığı (web'inki geçiş köprüsü). Servis PARAMETRE: `verifyOtpCode` zaten kurmuş durumda,
 * ikinci bir kurulum ikinci bir istemci varsayımı olurdu.
 */
async function seedPreferredLanguage(profiles: UserProfileService, authUserId: string, locale: PreferredLanguage): Promise<void> {
  try {
    const profile = await profiles.findByAuthUserId(authUserId);
    // Profil yoksa trigger henüz yazmamıştır ya da yazamamıştır; dil yüzünden girişi bozmayız.
    if (!profile) return;
    await profiles.update({ id: profile.id, preferredLanguage: locale });
  } catch {
    // BİLİNÇLİ sessiz (web'in `.catch(() => undefined)` davranışıyla birebir): dil bir
    // KOLAYLIKTIR, kimlik değil — tohum düştü diye girişi düşürmek, müşteriyi bir tercih
    // yüzünden kapıda bırakmaktır. Müşteri Fransızca mail alır, hesabından değiştirir.
  }
}
