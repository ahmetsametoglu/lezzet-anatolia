import { test, expect } from '@playwright/test';
import { createGuestOtp, OTP_TEST_CODE, type GuestOtpFixture } from '../fixtures/otp-fixture';

/**
 * KADEME 2 · PARTİ 3b — misafir OTP doğrulaması, kimlik SINIRININ ötesi (denetim, 07.08).
 *
 * Parti 3 "Envoyer le code" görününce durmuştu; Katman 1 kapısı indi (`OTP_TEST_CODE` —
 * `musteri-otp-test-kapisi.md`): kod Resend'e gitmeden sabitlenir, akışın geri kalanı (hash,
 * süre, tek kullanım, auth.users→Customer trigger'ı) GERÇEK yoldan işler. Ön koşul: dev server
 * `.env`'inde `OTP_TEST_CODE=123456` (kapı NODE_ENV=production'da env'e rağmen kapalı).
 *
 * TEK doğrulama senaryosu (BEKLEYEN(08.22) kalkana dek büyümez): sabit kodun hash'i global tekil
 * kısıtla yarışır; her koşu kendi doğrulama satırını purge'ler, iki proje (desktop→mobile) bu
 * sayede sırayla temiz koşar. Katman 2 (gerçek Resend teslimat provası) Kademe 3'ün işi.
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };
const IN_ZONE_CODE = '67000';

let fixture: GuestOtpFixture;

test.beforeAll(() => {
  fixture = createGuestOtp();
});

test.afterAll(async () => {
  await fixture?.cleanup();
});

test.describe('kademe 2 · misafir OTP doğrulaması (checkout kimlik adımı)', () => {
  test('misafir e-postasını doğrular ve sipariş akışı kimlik sınırını GEÇER', async ({ page }) => {
    test.slow();

    // Yer + ürün + sepet (Parti 3 yolculuğunun kısa hâli — checkout sepetsiz açılmaz).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox').first().fill(IN_ZONE_CODE);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(IN_ZONE_CODE) }).first().click();
    await page.goto('/fr/catalogue', NAV);
    await page.locator('a[href*="/produit/"]').first().click();
    await page.waitForURL('**/produit/**', NAV);
    const addToCart = page.getByRole('button', { name: /panier|ajouter/i }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    // Tıklama TEKRARLI (edge-stock deseni): hidrasyon bitmeden inen tıklama sessizce kaybolur —
    // kanıt, düğmenin yerini alan adet seçicisi. (Bu koşuda bir kez yaşandı: sepet boş kaldı.)
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // Kimlik adımı: damgalı e-posta → kod gönder (Resend'e gitmez, kod sabit).
    await page.goto('/fr/commande', NAV);
    const emailBox = page.getByRole('textbox', { name: /e-mail|adresse e-mail/i }).first();
    await expect(emailBox).toBeVisible({ timeout: 15_000 });
    // Giriş TEKRARLI (hidrasyon yarışı — mobilde ölçüldü): erken fill state'e işlenmeyebiliyor,
    // düğme pasif kalıyor. Kanıt düğmenin AÇILMASI; açılana dek doldurma yinelenir.
    const sendCode = page.getByRole('button', { name: /envoyer le code/i }).first();
    await expect(async () => {
      await emailBox.fill(fixture.email);
      await expect(sendCode).toBeEnabled({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });
    await sendCode.click();

    // Kod girişi ALTI AYRI KUTU (ölçüldü — ekran fotoğrafı): tek alana fill yalnız ilk kutuyu
    // doldurup "code incorrect" üretiyor. İlk kutuya odaklanıp klavyeden yazılır — kutular
    // kendiliğinden ilerler; varsa onay düğmesi tıklanır (sözcüğe bağlanılmaz), yoksa otomatik.
    const firstDigit = page.locator('main input[inputmode="numeric"]').first();
    await expect(firstDigit).toBeVisible({ timeout: 20_000 });
    await firstDigit.click();
    await page.keyboard.type(OTP_TEST_CODE, { delay: 40 });
    const confirm = page.getByRole('button', { name: /vérif|valid|confirm/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();

    // SINIRIN GEÇİLDİĞİNİN KANITI: kilitli adımlar açılmaya başlar — "S'ouvre après la
    // vérification" üç adımda birden yazıyordu (adres · gün · ödeme), doğrulamayla azalır;
    // ve adres bölümü artık salt-başlık değil (içinde en az bir girdi/aksiyon belirir).
    await expect(page.getByText(/S'ouvre après la vérification/)).not.toHaveCount(3, { timeout: 25_000 });
    await expect(page.getByText(/Adresse de livraison/).first()).toBeVisible();

    // Burada DURULUR: adres/teslim/ödeme ve taslak sipariş sonraki partinin işi — bu senaryonun
    // iddiası kimlik kapısının GERÇEK akışla (sabit kod, gerçek hash/trigger) aşılabildiğidir.
  });
});
