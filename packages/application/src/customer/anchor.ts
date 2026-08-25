import { createHash, randomBytes } from 'node:crypto';
import { CustomerPhoneService, EmailVerificationService, UserProfileService } from '@lezzet/database';
import { anchorStateOf, sixDigitCodeIn, type AnchorState } from '@lezzet/domain-core';
import { brand } from '@lezzet/brand';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { captureError, logger, maskEmail, SOURCES } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';
import { devOtpCode } from '../auth/otp';

/*
  ── KİMLİK ÇAPASI — KURULUŞ (04.10) ──────────────────────────────────────────────────────────────
  DOMAIN §10. Numaranın kanıtlanması "bu hat BUGÜN bu kişide" der; çapa "bu numaranın GEÇMİŞİ
  kimin" sorusunu cevaplar. Devredilmiş hattın yeni sahibi hattı da OTP'yi de meşru olarak alır —
  çözen tek şey, şüphe doğmadan ÖNCE kurulmuş bir sırdır.

  ── SORGUNUN YÖNÜ GÜVENLİĞİN TAMAMIDIR ───────────────────────────────────────────────────────────
  DOMAIN §10, harfi harfine: *"koddan kimliğe gidilmez, kimlikten koda gidilir."*
    DOĞRU:  gelen mesajın numarası → o numaraya bağlı kimlik → o kimliğin bekleyen adresi / kodu
    YANLIŞ: girilen kod → bu kod kime ait → o hesabı aç
  İkincisi çalışır, testleri de geçer, ama kodu **numaradan bağımsız bir anahtara** çevirir ve
  tasarımın güvenlik argümanını yok eder. Bu dosyadaki her giriş noktası numarayla başlar; kod ya da
  adres hiçbir yerde arama anahtarı DEĞİLDİR.

  Sonucu iki yasak (DOMAIN §10): web formundan/admin panelinden kod doğrulanmaz, ve admin panelinde
  "kod doğrula" kutusu bulunmaz. Bu dosya o kutuyu besleyecek hiçbir kapı ihraç etmiyor.

  ── ÇAPA GÖNDERİMİ PARA HARCAMIYOR ───────────────────────────────────────────────────────────────
  Kod E-POSTAYA gidiyor (Resend, ücretsiz) ve cevap WhatsApp'ın 24 saatlik ücretsiz penceresinden
  dönüyor — müşteri zaten bize yazmış durumda. Şablon ücreti yok (DOMAIN §11).
*/

/** Bekleyen adresin ömrü — kodun kendi TTL'i 15 dk (0003); bu, "hangi adres" bağının bayatlığı. */
const ANCHOR_EMAIL_TTL_MS = 60 * 60 * 1000;

/** Yanlış deneme tavanı (DOMAIN §10). Sistem üretimi + 6 hane + 5 deneme → tahmin şansı ~200.000'de 1. */
export const SECURITY_CODE_MAX_ATTEMPTS = 5;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Sistem ÜRETİR, müşteri seçmez: seçilen kodlar `1234`/`0000`/doğum yılında yığılır (DOMAIN §10). */
function sixDigits(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Numaradan kimliğe — bu dosyanın TEK giriş yolu. Emekli satır çözmez (bağ zaten kopmuş). */
async function customerOfPhone(db: SupabaseClient, phone: string): Promise<string | null> {
  return (await new CustomerPhoneService(db).findActive(phone))?.customerId ?? null;
}

export type AnchorSnapshot = { state: AnchorState; hasPendingEmail: boolean };

/** Müşterinin çapa hâli — kararın kendisi motorda, burada yalnız satır okunuyor. */
export async function anchorOf(db: SupabaseClient, customerId: string): Promise<AnchorSnapshot | null> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;
  return {
    state: anchorStateOf(profile),
    hasPendingEmail: profile.anchorEmail !== null,
  };
}

export type StartEmailAnchorOutcome =
  /** Kod ÜRETİLDİ ve adrese GÖNDERİLDİ. Düz kod dönmüyor — çağıranın onu görmesi gerekmiyor. */
  | { status: 'ok'; email: string }
  /** Kod üretildi ama mail gitmedi. Bekleyen adres satırda DURUYOR: tekrar denenebilir. */
  | { status: 'send_failed' }
  /**
   * `email_locked` — kartta BAŞKA bir adres yazılı. DOMAIN §10: *"E-posta bir kez yazılır, sonra
   * değişmez"*; posta kutusunu gerçekten kaybedenin yolu admin birleştirmesidir (04.7). Bu kapıdan
   * adres değiştirmek, çapayı bir kimlik taşıma aracına çevirirdi.
   */
  | { status: 'invalid_email' | 'profile_not_found' | 'already_anchored' | 'email_locked' }
  /** Hız sınırı ya da bekleme (0003'ün kapısı) — mesaj gönderme aracına dönüşmesin diye. */
  | { status: 'throttled'; retryAfterSec: number };

/**
 * **E-posta çapasını başlat** — adresi kaydeder, kod üretir ve o adrese GÖNDERİR.
 *
 * Gönderim burada, `requestOtpCode` emsaliyle (`auth/otp.ts`): mail şablonu ve dil seçimi zaten bu
 * katmanın bildiği şeyler, ve düz kodun çağırana dönmesi onu bir kez daha dolaştırmak olurdu. Kod
 * hiçbir dönüşte, hiçbir log'da görünmüyor — yalnız müşterinin posta kutusunda ve DB'de özet
 * olarak (0003'ün disiplini).
 *
 * **Adres SATIRA yazılıyor, mesajdan okunmuyor** ve bu güvenliğin kendisi: doğrulama numaradan
 * kimliğe, kimlikten BEKLEYEN ADRESE gidiyor. Adres cevabın içinden okunsaydı, kodu ele geçiren
 * biri onu istediği adresle eşleştirebilirdi.
 *
 * **Zaten çapası olana yeniden sorulmaz** (`already_anchored`): ikinci bir çapa, silinecek bir
 * anahtar üretmekten başka bir şey yapmaz (DOMAIN §10 — iki çapa bir arada bulunmaz).
 */
export async function startEmailAnchor(db: SupabaseClient, customerId: string, rawEmail: string): Promise<StartEmailAnchorOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { status: 'invalid_email' };

  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };
  if (anchorStateOf(profile) === 'email') return { status: 'already_anchored' };
  // Kartta zaten BAŞKA bir adres varsa çapa onu değiştiremez (DOMAIN §10). Aynı adresi kanıtlamak
  // serbest: kart dolu olabilir ama kanıtsız olabilir (operatör elle yazmış olabilir).
  if (profile.email && profile.email.toLowerCase() !== email) return { status: 'email_locked' };

  // Test kapısı `requestOtpCode` ile ORTAK (`devOtpCode`, BEKLEYEN(18.13)): kod hiçbir yere
  // yazılamadığı için testin/e2e'nin bilmesinin tek yolu sabit koddur. Aynı kapı Resend'i de
  // atlatıyor — yoksa her koşu gerçek bir mail üretirdi.
  const testKodu = devOtpCode();
  const istek = await new EmailVerificationService(db).requestCode(email, testKodu ?? undefined);
  if (istek.status !== 'ok') return { status: 'throttled', retryAfterSec: istek.retryAfterSec };

  // Bekleyen adres MAİLDEN ÖNCE yazılıyor: mail gitse de gitmese de, o adrese bir kod ÜRETİLDİ ve
  // müşteri onu alabilir. Sırayı ters kursaydık, gönderim yarıda kalan bir kod satırda karşılıksız
  // kalır ve gelen doğru cevap "bekleyen soru yok" diye reddedilirdi.
  await profiles.update({ id: customerId, anchorEmail: email, anchorEmailAt: new Date().toISOString() });

  if (testKodu) return { status: 'ok', email };

  const locale = profile.preferredLanguage;
  const mail = await sendEmail({
    to: email,
    subject: otpSubject(locale, brand.name, 'anchor'),
    react: OtpCodeEmail({ code: istek.code, locale, brandName: brand.name, purpose: 'anchor' }),
  });
  if (mail.error) {
    // Kod ASLA loglanmaz — kaydı okuyan biri onunla çapa kurabilirdi. Adres MASKELİ yazılır
    // (OBSERVABILITY §5): hangi kayıt olduğunu söyler, kim olduğunu söylemez.
    await captureError(new Error(`Çapa kodu maili gönderilemedi: ${mail.error}`), {
      source: SOURCES.applicationTicket,
      context: { flow: 'customer/startEmailAnchor', customerId, email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }
  return { status: 'ok', email };
}

export type AnswerAnchorOutcome =
  /** Mesajda 6 hane yok — olağan hâl. */
  | { status: 'none' }
  /** Numara bir kimliğe çözülmedi ya da bekleyen bir soru yok. */
  | { status: 'not_pending' }
  | { status: 'anchored'; customerId: string; email: string }
  /** İki kayıt aynı kişi çıktı: bekleyen adres BAŞKA bir hesabın. Sessizce çözülmez. */
  | { status: 'email_elsewhere'; customerId: string; holderId: string }
  | { status: 'wrong'; remainingAttempts: number }
  | { status: 'expired' | 'locked' };

/**
 * **Gelen mesajdaki kodu, BEKLEYEN e-posta çapasına karşı doğrula.**
 *
 * Zincir tek yönlü: numara → kimlik → o kimliğin bekleyen adresi → kod o adrese karşı doğrulanır.
 * Adres de kod da arama anahtarı değil; ikisi de bulunan kaydın ALANLARI.
 *
 * **Bekleyen adres BAYATLARSA düşer** (1 saat): müşteri adresi bir hafta önce söyleyip bugün
 * rastgele altı haneli bir sayı yazarsa, o sayının unutulmuş bir soruya cevap sayılması yanlış
 * olurdu — üstelik kodun kendi ömrü zaten 15 dakika (0003).
 */
export async function answerEmailAnchor(db: SupabaseClient, phone: string, text: string | null): Promise<AnswerAnchorOutcome> {
  const code = sixDigitCodeIn(text);
  if (!code) return { status: 'none' };

  const customerId = await customerOfPhone(db, phone);
  if (!customerId) return { status: 'not_pending' };

  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile?.anchorEmail || !profile.anchorEmailAt) return { status: 'not_pending' };

  if (Date.now() - new Date(profile.anchorEmailAt).getTime() > ANCHOR_EMAIL_TTL_MS) {
    await profiles.update({ id: customerId, anchorEmail: null, anchorEmailAt: null });
    return { status: 'expired' };
  }

  const sonuc = await new EmailVerificationService(db).verifyCode(profile.anchorEmail, code);
  if (sonuc.status === 'wrong') return { status: 'wrong', remainingAttempts: sonuc.remainingAttempts };
  if (sonuc.status !== 'ok') return { status: sonuc.status === 'locked' ? 'locked' : 'expired' };

  // ── Adres BAŞKA bir hesapta olabilir ve bu bir ÇAKIŞMA DEĞİL, BULUŞMADIR (DOMAIN §10):
  // posta kutusunu yönetiyor olmak, web girişinde kullandığımız kanıtın aynısıdır. Ama iki gerçek
  // kaydı otomatik birleştirmek geri alınamaz — bağlama jetonundaki (`whatsapp-link`) kuralın
  // aynısı burada da geçerli: karar insana gider.
  const sahip = await profiles.findByEmail(profile.anchorEmail);
  if (sahip && sahip.id !== customerId) {
    await profiles.update({ id: customerId, anchorEmail: null, anchorEmailAt: null });
    logger.warn(
      { context: 'customer/anchor', customerId, holderId: sahip.id },
      'çapa: doğrulanan adres BAŞKA bir hesapta — birleştirme insana bırakıldı',
    );
    return { status: 'email_elsewhere', customerId, holderId: sahip.id };
  }

  await profiles.update({
    id: customerId,
    // Kart ya boştu ya AYNI adresi taşıyordu (`startEmailAnchor`in `email_locked` kapısı) — yani
    // burada bir üzerine yazma yok, bir tamamlama var.
    email: profile.anchorEmail,
    emailAnchoredAt: new Date().toISOString(),
    anchorEmail: null,
    anchorEmailAt: null,
    // İki çapa bir arada bulunmaz (DOMAIN §10) — DB kısıtı da zorluyor, ama silen taraf biziz.
    securityCodeHash: null,
    securityCodeAttempts: 0,
  });
  logger.info({ context: 'customer/anchor', customerId, email: maskEmail(profile.anchorEmail) }, 'çapa: e-posta çapraz kanalla bağlandı');
  return { status: 'anchored', customerId, email: profile.anchorEmail };
}

export type IssueSecurityCodeOutcome =
  /** Düz kod YALNIZ BURADA görünür — saklanan hâli özet. Çağıran onu müşteriye iletir ve unutur. */
  | { status: 'ok'; code: string }
  | { status: 'profile_not_found' | 'already_anchored' };

/**
 * **6 haneli güvenlik kodunu ver** — e-posta bağlamak istemeyenin TEK çapası.
 *
 * **Sır, şüphe doğmadan ÖNCE kurulur.** Dönüş anında üretilen bir kod hiçbir şey kanıtlamaz:
 * karşımıza kim çıkarsa kodu o belirler ve geçmişi o devralır. Bu yüzden kapı "dönüşte" değil,
 * müşteri hâlâ tanıdığımız hâldeyken çağrılır.
 *
 * Kod SİSTEM üretir, müşteri seçmez; özetlenerek saklanır; ve e-posta çapası kurulunca silinir.
 */
export async function issueSecurityCode(db: SupabaseClient, customerId: string): Promise<IssueSecurityCodeOutcome> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };
  if (anchorStateOf(profile) === 'email') return { status: 'already_anchored' };

  const code = sixDigits();
  await profiles.update({ id: customerId, securityCodeHash: sha256(code), securityCodeAttempts: 0, anchorEmail: null, anchorEmailAt: null });
  return { status: 'ok', code };
}

export type VerifySecurityCodeOutcome =
  | { status: 'none' }
  /** Numara çözülmedi ya da bu müşterinin kodu yok — sorulacak bir şey yoktu. */
  | { status: 'no_code' }
  | { status: 'ok'; customerId: string }
  | { status: 'wrong'; remainingAttempts: number }
  | { status: 'locked' };

/**
 * **Güvenlik kodunu doğrula — YALNIZ KENDİ NUMARASINDAN.**
 *
 * Bu, kodun tek başına değerini sıfırlayan özelliktir (DOMAIN §10): onu okuyan biri (ör. admin
 * konuşma ekranında) kullanmak için o hattı da elinde tutmak zorunda. Aynı özellik oltalamayı da
 * defeder — dolandırıcıya yazılan kod işe yaramaz.
 *
 * Bu yüzden imza `phone` alıyor, `code` + `customerId` değil: yön veriyle zorlanıyor. Web formundan
 * ya da admin panelinden çağrılabilecek bir imza yazmak, yasağı bir gün delinebilir kılardı.
 *
 * **Karşılaştırma özet üzerinden ve sabit uzunlukta:** düz kod hiçbir yerde saklanmıyor.
 */
export async function verifySecurityCode(db: SupabaseClient, phone: string, text: string | null): Promise<VerifySecurityCodeOutcome> {
  const code = sixDigitCodeIn(text);
  if (!code) return { status: 'none' };

  const customerId = await customerOfPhone(db, phone);
  if (!customerId) return { status: 'no_code' };

  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile?.securityCodeHash) return { status: 'no_code' };
  if (profile.securityCodeAttempts >= SECURITY_CODE_MAX_ATTEMPTS) return { status: 'locked' };

  if (sha256(code) !== profile.securityCodeHash) {
    const deneme = profile.securityCodeAttempts + 1;
    await profiles.update({ id: customerId, securityCodeAttempts: deneme });
    if (deneme >= SECURITY_CODE_MAX_ATTEMPTS) return { status: 'locked' };
    return { status: 'wrong', remainingAttempts: SECURITY_CODE_MAX_ATTEMPTS - deneme };
  }

  // Doğru cevap sayacı sıfırlar: tavan bir CEZA değil, tahmin denemesine konan sınırdır.
  if (profile.securityCodeAttempts > 0) await profiles.update({ id: customerId, securityCodeAttempts: 0 });
  return { status: 'ok', customerId };
}
