import { createHash, randomBytes } from 'node:crypto';
import { CustomerPhoneService, EmailVerificationService, OrderService, UserProfileService } from '@lezzet/database';
import { anchorStateOf, canOpenHistory, needsChallenge, sixDigitCodeIn, type AnchorState } from '@lezzet/domain-core';
import type { ChallengeReason, CustomerPhone, UserProfile } from '@lezzet/types';
import { brand } from '@lezzet/brand';
import { OtpCodeEmail, otpSubject, sendEmail } from '@lezzet/email';
import { captureError, logger, maskEmail, SOURCES } from '@lezzet/observability';
import type { SupabaseClient } from '@supabase/supabase-js';
import { devOtpCode } from '../auth/otp';
import { sendOutboundMessage, type MessageSender } from '../messaging/send';

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

export type AnchorSnapshot = {
  state: AnchorState;
  hasPendingEmail: boolean;
  /**
   * Cevaplanmamış kimlik sorusu — operatörün ekranda GÖRMESİ gereken tek hâl (04.10).
   *
   * Sistem soruyu kendiliğinden soruyor ve kapıyı kapatıyor; ama cevap hiç gelmezse ortada
   * **sessizce bekleyen bir insan** kalır. `ordersSince` o beklemenin ağırlığı: sıfırsa muhtemelen
   * kimse yok, artıyorsa birinin siparişleri başkasının kaydına yazılıyor demektir (DOMAIN §10 —
   * kalanı bir kapıya değil İNSANA düşür).
   */
  challenge: { reason: ChallengeReason; raisedAt: string; ordersSince: number } | null;
};

/** Müşterinin çapa hâli — kararın kendisi motorda, burada yalnız satır okunuyor. */
export async function anchorOf(db: SupabaseClient, customerId: string): Promise<AnchorSnapshot | null> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;

  // Sipariş sayımı YALNIZ bekleyen soru varken yapılıyor: her sohbet açılışında bir sayım turu,
  // ekranın hiçbir zaman göstermeyeceği bir sayı için ödenmiş olurdu.
  const challenge =
    profile.challengeReason && profile.challengeRaisedAt
      ? {
          reason: profile.challengeReason,
          raisedAt: profile.challengeRaisedAt,
          ordersSince: await new OrderService(db).countPlacedForCustomerSince(customerId, profile.challengeRaisedAt),
        }
      : null;

  return {
    state: anchorStateOf(profile),
    hasPendingEmail: profile.anchorEmail !== null,
    challenge,
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

  const sonuc = await sendAnchorCode(db, profile, email);
  return sonuc.status === 'ok' ? { status: 'ok', email } : sonuc;
}

type SendAnchorCodeOutcome = { status: 'ok' } | { status: 'send_failed' } | { status: 'throttled'; retryAfterSec: number };

/**
 * **Çapa kodunu üret, bekleyen adres olarak yaz ve GÖNDER.**
 *
 * İki çağıranı var ve ikisi de aynı işi ister: çapayı KURAN akış (`startEmailAnchor`) ve dönüşte
 * çapayı SORAN akış (`raiseChallengeIfDue`). DOMAIN §10 ikincisini açıkça birincinin aynısı
 * yapıyor — *"kod yine e-postasına gider, WhatsApp'tan geri yazılır"* — yani ortak gövde bir
 * kolaylık değil, kararın kendisi. İki kopya olsaydı biri gün gelip ötekinden ayrılır ve dönüşteki
 * kod, kuruluştakinden farklı bir kanaldan gitmeye başlardı (CLAUDE §1).
 */
async function sendAnchorCode(db: SupabaseClient, profile: UserProfile, email: string): Promise<SendAnchorCodeOutcome> {
  // Test kapısı `requestOtpCode` ile ORTAK (`devOtpCode`, BEKLEYEN(18.13)): kod hiçbir yere
  // yazılamadığı için testin/e2e'nin bilmesinin tek yolu sabit koddur. Aynı kapı Resend'i de
  // atlatıyor — yoksa her koşu gerçek bir mail üretirdi.
  const testKodu = devOtpCode();
  const istek = await new EmailVerificationService(db).requestCode(email, testKodu ?? undefined);
  if (istek.status !== 'ok') return { status: 'throttled', retryAfterSec: istek.retryAfterSec };

  // Bekleyen adres MAİLDEN ÖNCE yazılıyor: mail gitse de gitmese de, o adrese bir kod ÜRETİLDİ ve
  // müşteri onu alabilir. Sırayı ters kursaydık, gönderim yarıda kalan bir kod satırda karşılıksız
  // kalır ve gelen doğru cevap "bekleyen soru yok" diye reddedilirdi.
  await new UserProfileService(db).update({ id: profile.id, anchorEmail: email, anchorEmailAt: new Date().toISOString() });

  if (testKodu) return { status: 'ok' };

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
      context: { flow: 'customer/sendAnchorCode', customerId: profile.id, email: maskEmail(email) },
    });
    return { status: 'send_failed' };
  }
  return { status: 'ok' };
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
    // Bekleyen kimlik sorusu varsa CEVAPLANMIŞTIR: çapraz kanal kanıtı, dönüşte istediğimizin ta
    // kendisi. Ayrı bir "cevapla" adımı yok — soruyu kapatan şey doğru cevabın kendisidir.
    challengeReason: null,
    challengeRaisedAt: null,
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

  // Doğru cevap sayacı sıfırlar: tavan bir CEZA değil, tahmin denemesine konan sınırdır. Bekleyen
  // kimlik sorusu da burada kapanır — kapıyı açan şey doğru cevabın kendisidir.
  if (profile.securityCodeAttempts > 0 || profile.challengeReason) {
    await profiles.update({ id: customerId, securityCodeAttempts: 0, challengeReason: null, challengeRaisedAt: null });
  }
  return { status: 'ok', customerId };
}

/*
  ── KİMLİK ŞÜPHESİ: TETİK VE KAPI (04.10) ────────────────────────────────────────────────────────
  Yukarısı çapayı KURAR; burası onu SORAR ve cevaplanmadıkça kapıları kapalı tutar. DOMAIN §10.

  ── ÜÇ KAPI, TEK SORU ────────────────────────────────────────────────────────────────────────────
  Kimliği bilmeden ne açtığımız asıl sorudur. Sipariş almak geçmiş gerektirmez — kapılı olan üç
  yetki: **geçmişi göstermek · puanı harcatmak · kişiye özel fiyat/kupon uygulamak.** Üçü de "seni
  tanıyorum" demektir ve yanlış kişiye söylenirse sızıntının kendisidir.

  ── SORU BİR KAPI DEĞİL, SORUDUR ────────────────────────────────────────────────────────────────
  Cevaplanamayan dönüş engellenmiyor: müşteri sipariş verebilir, konuşabilir, cevap alabilir. Yalnız
  o üç yetki kapalı kalır. Boşluğun kendisi teşhis değildir — yılda bir bayramda sipariş veren sadık
  müşteri ile devredilmiş hat aynı şekli üretir; kapı olarak kullanılsaydı cezalandırdığı kitlenin
  ezici çoğunluğu kendi müşterilerimiz olurdu.
*/

/**
 * Sessizlik eşiği (gün) — DOMAIN §10 "~3 ay" diyor, sayıyı parametrik tutuyoruz.
 *
 * Neden ayarlanabilir: doğru değeri bugün kimse bilmiyor ve **yerel veriden ÇIKARILAMAZ** (CLAUDE
 * girişi). Canlıda müşteri dönüş aralıkları görülünce oynatılacak tek yer burası olsun.
 */
const SILENCE_DAYS = Number(process.env.IDENTITY_SILENCE_DAYS ?? 90);

/**
 * **Dönüşte kimlik sorusu gerekiyor mu — gerekiyorsa SOR.**
 *
 * Kanıt satırı tazelenirken, yani boşluğun HÂLÂ görülebildiği tek anda çağrılır (`recordProof`un
 * `previous`ı). Bir mesaj sonra bakan hiç kimse o boşluğu göremez: damga bu mesajla tazelendi.
 *
 * ── ZATEN SORULMUŞSA YENİDEN SORULMAZ ───────────────────────────────────────────────────────────
 * Bekleyen soru duruyorsa dokunulmaz. Her mesajda yeniden sormak hem müşteriyi yorar hem de
 * e-posta yolunda her seferinde yeni bir kod üretip öncekini geçersiz kılardı — müşteri kutusundaki
 * kodu yazarken elindeki kod çoktan ölmüş olurdu.
 *
 * ── E-POSTA ÇAPASINDA SORUYU SORMAK, KODU GÖNDERMEKTİR ──────────────────────────────────────────
 * DOMAIN §10 (02.08): *"kod yine e-postasına gider, WhatsApp'tan geri yazılır."* Ajanın "kutunuza
 * gönderdiğimiz kodu yazın" demesi ancak kod GERÇEKTEN gönderilmişse doğrudur; göndermeyip sormak,
 * müşteriyi olmayan bir maili aramaya yollardı. Gönderim başarısızsa soru YİNE de kayıtlı kalır:
 * kapı kapalı olmalı, ve operatör panelden yeniden gönderebilir.
 *
 * 6 haneli kod yolunda gönderilecek bir şey yok — sır zaten müşterinin elinde (DOMAIN §10: "sır,
 * şüphe doğmadan önce kurulur").
 */
export async function raiseChallengeIfDue(
  db: SupabaseClient,
  input: { profile: UserProfile; previous: CustomerPhone | null },
): Promise<ChallengeReason | null> {
  const { profile, previous } = input;
  if (profile.challengeReason) return profile.challengeReason; // bekleyen soru duruyor

  const state = anchorStateOf(profile);
  const reason = needsChallenge({
    state,
    lastSeenAt: previous?.lastSeenAt ?? null,
    deliveryFailed: previous?.deliveryFailedAt != null,
    silenceDays: SILENCE_DAYS,
    now: new Date(),
  });
  if (!reason) return null;

  await new UserProfileService(db).update({ id: profile.id, challengeReason: reason, challengeRaisedAt: new Date().toISOString() });
  // Taşıyıcı beyanı SORUYA dönüştü; damga silinir ki aynı sinyal ikinci kez sayılmasın — yoksa
  // müşteri cevapladıktan hemen sonra bir sonraki mesajında soru yeniden doğardı.
  if (previous?.deliveryFailedAt) await new CustomerPhoneService(db).markDelivery(previous.phone, false);

  if (state === 'email' && profile.email) {
    const gonderim = await sendAnchorCode(db, profile, profile.email);
    if (gonderim.status !== 'ok') {
      logger.warn({ context: 'customer/anchor', customerId: profile.id, outcome: gonderim.status }, 'çapa: dönüş kodu gönderilemedi — soru yine de açık');
    }
  }

  logger.info({ context: 'customer/anchor', customerId: profile.id, reason, anchor: state }, 'çapa: kimlik sorusu açıldı');
  return reason;
}

/** Kapının durumu — `ask` yalnız bekleyen soru varken dolu; sorulacak şey çapanın TÜRÜDÜR. */
export interface AnchorGate {
  state: AnchorState;
  /** Geçmiş · puan · kişiye özel fiyat açılabilir mi. */
  open: boolean;
  /** Müşteriye sorulacak çapa; `null` = sorulacak bir şey yok. */
  ask: 'email' | 'code' | null;
}

/**
 * **Kapının tek okuması** — üç yetkinin de sorduğu soru burada cevaplanıyor.
 *
 * İki koşul birden: çapa VAR olacak (`canOpenHistory`) **ve** bekleyen bir soru olmayacak. İkisi
 * ayrı şeyler — çapası olan ama dönüşü şüpheli müşterinin kapısı, cevap gelene kadar kapalıdır.
 *
 * **Bilinmeyen müşteri kapalıdır:** profil okunamazsa kapı açılmaz. Ölçülemeyen değer sıfır
 * değildir, ama kimlik sorusunda "bilmiyorum" ile "hayır" aynı kapıya çıkar (CLAUDE §1).
 */
export async function anchorGateOf(db: SupabaseClient, customerId: string): Promise<AnchorGate> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return { state: 'none', open: false, ask: null };

  const state = anchorStateOf(profile);
  const bekleyen = profile.challengeReason !== null;
  return {
    state,
    open: canOpenHistory(state) && !bekleyen,
    // Çapası olmayana sorulacak bir şey yoktur: sormak, cevabı olmayan bir soruyu sormaktır.
    ask: bekleyen && state !== 'none' ? (state === 'email' ? 'email' : 'code') : null,
  };
}

/*
  ── ÇAPAYI KENDİLİĞİNDEN VERMEK (04.10) ──────────────────────────────────────────────────────────
  Yukarısı çapayı kurar, sorar ve kapıyı tutar — ama hepsi birinin düğmeye basmasına bağlıydı.
  Operatörün aklına gelmezse müşteri çapasız kalır ve altı ay sonra döndüğünde **sorulacak bir şey
  olmaz**: kapı sonsuza kadar kapalı, kimse de açamaz.
*/

/** Kodun müşteriye söylendiği CÜMLE — tek yerde. İki çağıran var (operatör düğmesi · otomatik kapı). */
const SECURITY_CODE_MESSAGE = (code: string): string =>
  `Güvenlik kodunuz: ${code}\nBunu saklayın — zaman zaman siz olduğunuzu teyit etmek için isteyebiliriz.`;

export type IssueAndSendOutcome =
  /** Kod üretildi ve sohbete yazıldı. `code` yalnız GÖNDERİM DÜŞTÜYSE dolu — çağıran elle iletsin diye. */
  | { status: 'sent'; code: null }
  | { status: 'send_failed'; code: string; reason: string }
  | { status: 'profile_not_found' | 'already_anchored' };

/**
 * **Güvenlik kodunu ver VE sohbete yaz** — kodun müşteriye ulaşmasının tek gövdesi.
 *
 * Üretim ile gönderim ayrılamaz: kod üretilip iletilmezse satırda müşterinin bilmediği bir sır
 * kalır ve dönüşünde ona cevaplayamayacağı bir soru sorulur — koruma değil, kapalı bir kapı.
 *
 * **Gönderim tuttuysa düz kod DÖNMÜYOR:** kod müşteride, özeti bizde; üçüncü bir kopya operatörün
 * ekranında durmasın. Düşerse dönüyor, çünkü o hâlde kodu iletecek olan insandır.
 */
export async function issueAndSendSecurityCode(
  db: SupabaseClient,
  sender: MessageSender,
  input: { conversationId: string; customerId: string },
): Promise<IssueAndSendOutcome> {
  const verilen = await issueSecurityCode(db, input.customerId);
  if (verilen.status !== 'ok') return { status: verilen.status };

  const gonderim = await sendOutboundMessage(db, sender, { conversationId: input.conversationId, text: SECURITY_CODE_MESSAGE(verilen.code) });
  if (gonderim.status === 'sent') return { status: 'sent', code: null };
  return { status: 'send_failed', code: verilen.code, reason: gonderim.reason };
}

/**
 * **Kaybedecek bir şeyi olan müşteriye çapasını VER** — kimse düğmeye basmadan.
 *
 * ── NEDEN GELEN MESAJDA, SİPARİŞ ANINDA DEĞİL ───────────────────────────────────────────────────
 * Kod ancak 24 saatlik servis penceresi açıkken ücretsiz gidebilir (DOMAIN §11). Sipariş anında o
 * pencere kapalı olabilir — konuşma günler önce bitmiş olabilir — ve kapalı pencerede tek yol
 * ücretli kalıp mesajdır. Gelen mesaj ise pencereyi TANIMI GEREĞİ açar: müşteri bize yazdığı anda
 * gönderim hem mümkün hem bedava. Ayrıca zamanlayıcı, kuyruk ve "gönderilemedi, sonra dene" hâli
 * de doğmuyor — koşul her mesajda yeniden ölçülüyor, tutmadığı gün kendiliğinden tekrar deniyor.
 *
 * ── EŞİK "SİPARİŞ VERİLDİ", "TESLİM EDİLDİ" DEĞİL ───────────────────────────────────────────────
 * DOMAIN §10 *"ilk sipariş tamamlanınca"* diyordu; ölçünce eşiğin bir gün geç kaldığı görüldü:
 * `completed` teslimden SONRA damgalanıyor ve müşteri o günden sonra bize bir daha yazmayabilir —
 * o hâlde kod hiç gitmez. Oysa kaybedecek şey (geçmiş, puan) siparişin VERİLDİĞİ an doğuyor ve
 * konuşma tam o sırada canlı. Taslak ve iptal sayılmıyor (`countPlacedForCustomer`): yarıda
 * bırakılmış bir checkout kaybedilecek bir şey üretmez.
 *
 * ── ÇAPASI OLANA DOKUNULMAZ ─────────────────────────────────────────────────────────────────────
 * `state !== 'none'` her üç hâli birden eler: e-posta bağlı · kodu zaten var · oturumu var. İkinci
 * bir kod vermek öncekini geçersiz kılardı — müşteri sakladığı kodu bir gün boşuna yazardı.
 */
export async function offerAnchorIfDue(
  db: SupabaseClient,
  sender: MessageSender,
  input: { conversationId: string; customerId: string },
): Promise<'skipped' | IssueAndSendOutcome['status']> {
  const profile = await new UserProfileService(db).getById(input.customerId);
  if (!profile || anchorStateOf(profile) !== 'none') return 'skipped';

  const siparis = await new OrderService(db).countPlacedForCustomer(input.customerId);
  if (siparis === 0) return 'skipped';

  const sonuc = await issueAndSendSecurityCode(db, sender, input);

  /*
    ── GÖNDERİM DÜŞERSE KOD GERİ ALINIR — VE BU, OTOMATİK YOLUN EN ÖNEMLİ KURALI ────────────────────
    Operatör yolunda düşen gönderim sorun değil: kod insana döner, o iletir. Burada iletecek kimse
    YOK. Satırda kalsaydı ortaya **müşterinin bilmediği bir sır** çıkardı ve dönüşünde ona
    cevaplayamayacağı bir soru sorulurdu — çapasızlıktan BETER, çünkü çapasız müşteriye hiç soru
    sorulmuyor, bu müşteriye sorulup kapı kapanıyor.

    Ölçülmüş bir hâl, varsayım değil: gönderim jetonu (`META_ACCESS_TOKEN`) yapılandırılmadığında
    sürücü `unconfiguredSender`dır ve her gönderimi reddeder (15.11 Meta tarafında hâlâ beklemede).
    Yani bugün canlıya alınsa BÜTÜN otomatik kodlar sessizce bu hâle düşerdi.

    Geri alma aynı zamanda kendini onarır: kod silindiği için bir sonraki gelen mesajda koşul yine
    tutar ve yeniden denenir. Kuyruk, zamanlayıcı, "başarısızları tekrar dene" defteri gerekmiyor.
  */
  if (sonuc.status === 'send_failed') {
    await new UserProfileService(db).update({ id: input.customerId, securityCodeHash: null, securityCodeAttempts: 0 });
    logger.warn({ context: 'customer/anchor', customerId: input.customerId, reason: sonuc.reason }, 'çapa: kod gönderilemedi — satırdan geri alındı, sonraki mesajda yeniden denenecek');
    return 'send_failed';
  }

  logger.info({ context: 'customer/anchor', customerId: input.customerId, outcome: sonuc.status }, 'çapa: güvenlik kodu kendiliğinden verildi');
  return sonuc.status;
}
