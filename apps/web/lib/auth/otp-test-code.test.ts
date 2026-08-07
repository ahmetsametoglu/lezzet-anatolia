import { afterAll, describe, expect, it } from 'vitest';
import { EmailVerificationService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';

/**
 * **Deterministik dev OTP kodunun BİLİNEN SINIRI** (00.9 Parti 3b · `BEKLEYEN(08.22)`).
 *
 * ── Bu dosya neden küçüldü ──────────────────────────────────────────────────
 * Kapının kendisi (`OTP_TEST_CODE` okuması, iki kilit) ve akışın tamamı artık
 * `@lezzet/application/auth`ta ve orada test ediliyor (`packages/application/src/auth/otp.test.ts`
 * — hash, cooldown, sayaç, tek-kullanım, trigger zinciri, dil tohumu). Web'in `sendEmailOtp`'u o
 * akışın ikinci kopyasıyken buradaki testler o kopyayı sınıyordu; kopya kalkınca testleri de
 * kalktı. Kalan tek madde aşağıda ve web'e ait olma sebebi var: sınırladığı şey **e2e senaryo
 * sayısı**, e2e de bu yüzeyin.
 *
 * ⚠ **Davranış ONAYLANMIYOR, ÇİVİLENİYOR.**
 * `token_hash` GLOBAL tekil (`0003_email_verification_otp.sql:20`) ve yeni istek eski satırı
 * silmiyor, yalnız `used_at` yazıyor (denetim izi, bilinçli). Kod SABİTSE hash de sabit olur;
 * ikinci istek — hangi e-postayla olursa olsun — kısıta çarpar. **Testin bulduğu bir sınır,
 * tahmin değil:** ilk yazılan "tek kullanım" testi tam bu yüzden düşmüştü.
 *
 * Sonucu iki yerde görünüyor: e2e tek doğrulama senaryosuyla sınırlı
 * (`e2e/customer/checkout-otp.smoke.ts`), paketin testi de kodu koşu başına türetiyor.
 * Kısıt kısmi hâle gelince (`unique (token_hash) where used_at is null`) bu beklenti tersine
 * çevrilir ve e2e büyüyebilir. Talep: `docs/talep/arka-uc-otp-hash-tekilligi.md`.
 */
const db = serviceDb();
const verifications = new EmailVerificationService(db);

const stamp = Date.now();
const emailFor = (n: number) => `otp-kapi${stamp}-${n}@ornek.fr`;
// Damgadan türer: sabit bir kod, başka bir şeridin ya da düşmüş bir koşunun artığıyla çarpışırdı.
const FIXED_CODE = String(100000 + (stamp % 900000));

afterAll(async () => {
  await purgeTestData(db, { verificationEmails: [1, 2].map(emailFor) });
});

describe('OTP test kapısının sınırı', () => {
  it('BEKLEYEN(08.22): sabit kodun ikinci isteği hash tekilliğine çarpar — e2e tek senaryoyla sınırlı', async () => {
    // İlk istek normal yoldan geçer: kod sabitlenebiliyor, kısıt burada sorun değil.
    expect((await verifications.requestCode(emailFor(1), FIXED_CODE)).status).toBe('ok');

    // İkincisi BAŞKA bir e-postayla; düşme sebebi e-posta değil, kodun hash'inin aynı olması.
    await expect(verifications.requestCode(emailFor(2), FIXED_CODE)).rejects.toThrow(/token_hash/);
  });
});
