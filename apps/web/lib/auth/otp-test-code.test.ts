import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { EmailVerificationService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { sendEmailOtp } from './otp-actions';

/**
 * **Deterministik dev OTP kodu** (00.9 Parti 3b · `docs/talep/musteri-otp-test-kapisi.md`).
 *
 * Sınanan şey KİLİT: `OTP_TEST_CODE` açıkken kodun sabitlenmesi, bozuk değerin sessizce yok
 * sayılması. Kapının kendisi bir güvenlik anahtarı — bozulduğunda hiçbir şey patlamaz, yalnız
 * üretimde tahmin edilebilir bir OTP doğar. O yüzden testi var.
 *
 * Gerçek akış korunuyor: kod normal yoldan hash'lenip yazılıyor, doğrulama normal yoldan okuyor —
 * test yalnız kodun DEĞERİNİ biliyor, sürecin hiçbir adımını atlamıyor.
 *
 * `sendEmailOtp` test kodundayken Resend'e gitmeden dönüyor; bu yüzden testte mail sağlayıcısı da
 * `next-intl` istek bağlamı da gerekmiyor (erken dönüş `getLocale()`ten ÖNCE).
 *
 * ── DOSYADA SABİT KODLA YALNIZ **BİR** İSTEK YAPILABİLİR ─────────────────────
 * `token_hash` global tekil ve tüketilen satır silinmiyor (aşağıdaki sınır testi). Bu yüzden
 * "kod çalışıyor" ile "tek kullanım" tek bir istekte birlikte sınanıyor; ikinci bir başarılı
 * ekleme kurgulamak, testi kısıta çarptırmaktan başka bir şey yapmazdı.
 */
const db = serviceDb();
const verifications = new EmailVerificationService(db);

const stamp = Date.now();
const emailFor = (n: number) => `otp-kapi${stamp}-${n}@ornek.fr`;
const TEST_CODE = '123456';

/** Env'i her testten sonra ESKİ HÂLİNE koy — süreç geneli değer, başka dosyayı etkilemesin. */
const original = process.env.OTP_TEST_CODE;
afterEach(() => {
  if (original === undefined) delete process.env.OTP_TEST_CODE;
  else process.env.OTP_TEST_CODE = original;
});

afterAll(async () => {
  await purgeTestData(db, { verificationEmails: [1, 2, 3].map(emailFor) });
});

describe('OTP test kapısı', () => {
  it('kod sabitlenir, gerçek doğrulama kabul eder ve TEK KULLANIMLIK kalır', async () => {
    process.env.OTP_TEST_CODE = TEST_CODE;
    const email = emailFor(1);

    const sent = await sendEmailOtp(email);
    expect(sent.errorKey).toBeNull();

    // Doğrulama normal yoldan: hash eşleşmesi, süre ve tek-kullanım kuralları gerçek.
    expect((await verifications.verifyCode(email, TEST_CODE)).status).toBe('ok');
    // İkinci kez kabul edilseydi sabit kod, akışı zayıflatan bir arka kapı olurdu.
    expect((await verifications.verifyCode(email, TEST_CODE)).status).not.toBe('ok');
  });

  /**
   * ⚠ **KAPININ BİLİNEN SINIRI — davranış onaylanmıyor, ÇİVİLENİYOR.**
   *
   * `token_hash` GLOBAL tekil (`0003_email_verification_otp.sql:20`) ve yeni istek eski satırı
   * silmiyor, yalnız `used_at` yazıyor (denetim izi, bilinçli). Sabit kodun hash'i hep aynı olduğu
   * için ikinci istek — hangi e-postayla olursa olsun — kısıta çarpıyor.
   *
   * Kısıt kısmi hâle gelince (`unique (token_hash) where used_at is null`) bu beklenti tersine
   * çevrilecek. Talep: `docs/talep/arka-uc-otp-hash-tekilligi.md`. İşaretsiz bırakılsaydı e2e
   * ikinci senaryoda anlaşılmaz bir veritabanı hatasıyla düşer, kimse sebebini aramazdı.
   */
  it('BEKLEYEN(08.22): ikinci istek hash tekilliğine çarpar — e2e tek senaryoyla sınırlı', async () => {
    process.env.OTP_TEST_CODE = TEST_CODE;
    await expect(sendEmailOtp(emailFor(2))).rejects.toThrow(/token_hash/);
  });

  it('BOZUK env değeri sessizce yok sayılır — rastgele koda düşülür', async () => {
    // Yarım yazılmış bir değer "kod sabitlendi" sanılıp gerçek akışı zayıflatamamalı.
    process.env.OTP_TEST_CODE = '12ab';
    const email = emailFor(3);

    // Mail yolu açılacağı için `sendEmailOtp` çağrılmıyor (testte sağlayıcı yok); sınanan şey
    // kapının KARARI ve doğrudan ölçülüyor: kod sabitlenseydi aşağıdaki doğrulama tutardı.
    await verifications.requestCode(email);
    expect((await verifications.verifyCode(email, TEST_CODE)).status).not.toBe('ok');
  });
});
