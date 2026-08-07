import { afterAll, describe, expect, it } from 'vitest';
import { EmailVerificationService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';

/**
 * **Deterministik dev OTP kodu** (00.9 Parti 3b). Bilinen sınırı 07.08'de kalktı — aşağıda.
 *
 * ── Bu dosya neden küçüldü ──────────────────────────────────────────────────
 * Kapının kendisi (`OTP_TEST_CODE` okuması, iki kilit) ve akışın tamamı artık
 * `@lezzet/application/auth`ta ve orada test ediliyor (`packages/application/src/auth/otp.test.ts`
 * — hash, cooldown, sayaç, tek-kullanım, trigger zinciri, dil tohumu). Web'in `sendEmailOtp`'u o
 * akışın ikinci kopyasıyken buradaki testler o kopyayı sınıyordu; kopya kalkınca testleri de
 * kalktı. Kalan tek madde aşağıda ve web'e ait olma sebebi var: sınırladığı şey **e2e senaryo
 * sayısı**, e2e de bu yüzeyin.
 *
 * ✅ **SINIR KALKTI (07.08) — beklenti tersine çevrildi.**
 * `token_hash`in GLOBAL tekilliği kaldırıldı (`0003`). Kısıtın okuyucusu yoktu: doğrulama satırı
 * hash'ten değil E-POSTADAN buluyor, hash yalnız bulunan satırla karşılaştırılıyor. Tekillik
 * hiçbir sorguya hizmet etmiyor, yalnız iki arıza üretiyordu — sabit test kodunun ikinci kez
 * yazılamaması (bu dosya) ve ÜRETİMDE kod çarpışması (mobil şeridin ölçümü: 10⁶ değerden çekilen
 * kod, N satırlık tabloda ≈ N/10⁶ olasılıkla var olan bir hash'e çarpıyor ve müşteri kod yerine
 * sert bir hata alıyordu).
 *
 * Yerine gerçek değişmez kondu: **e-posta başına en fazla bir AKTİF kod**
 * (`email_verifications_one_active_per_email`). Zaten kod tarafından kuruluyordu ama
 * zorlanmıyordu; doğrulama `limit 1` ile okuduğu için iki aktif satır olsaydı biri sessizce yok
 * sayılır ve müşterinin elindeki kod "yanlış" görünürdü.
 *
 * **e2e artık tek senaryoyla sınırlı değil** — sabit kod koşu boyunca birden çok e-postada
 * kullanılabilir.
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

describe('sabit test kodu birden çok e-postada kullanılabilir', () => {
  it('aynı kod İKİ FARKLI e-postaya yazılabilir — e2e artık tek senaryoyla sınırlı değil', async () => {
    // İki farklı müşterinin aynı 6 haneli kodu alması bir çakışma değil, beklenen bir hâldir:
    // kod e-postaya aittir, küresel bir jeton değildir. Doğrulama (e-posta + kod) çiftini ister,
    // yani tekilliğin bir güvenlik karşılığı da yoktu.
    expect((await verifications.requestCode(emailFor(1), FIXED_CODE)).status).toBe('ok');
    expect((await verifications.requestCode(emailFor(2), FIXED_CODE)).status).toBe('ok');
  });

  it('yazılan kod kendi e-postasıyla doğrulanır — çapraz sızma yok', async () => {
    // Aynı hash iki satırda aktifken doğrulamanın hâlâ doğru satırı bulduğunu çiviliyor: arama
    // e-postayla yapılıyor, hash yalnız karşılaştırma için.
    expect((await verifications.verifyCode(emailFor(1), FIXED_CODE)).status).toBe('ok');
    expect((await verifications.verifyCode(emailFor(2), FIXED_CODE)).status).toBe('ok');
  });
});
