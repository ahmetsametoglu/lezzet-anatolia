import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';
import { createGuestOtp, OTP_TEST_CODE, type GuestOtpFixture } from '../fixtures/otp-fixture';
import { ANA_SEPETE_EKLE } from '../fixtures/selectors';
import { addAddressManually } from '../fixtures/address-dialog';

/**
 * Adres kontrolünün teklifi ("bunu mu demek istediniz") ekranda çıkıyor mu: zincirin halkaları ayrı ayrı testli, ama
 * teklifin çizildiğini yalnız bu duman ölçer. Gerçek BAN'a çıkar, çünkü değer gerçek cevapta; servis düşerse test
 * kırmızıya döner ve arıza bizde değildir.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Fiyat küresel asgari sepetin (40 €) üstünde, yoksa onay düğmesi kilitlenir. */
const PRICE_CENTS = 4500;

/**
 * Bu sokak yalnız 67380 Lingolsheim'da var: damgalı kodla sorgu boş döner, kısıtsız sorgu kapıyı bulur ve
 * `wrong_postal_code` kurulur.
 */
const LINE1 = '192c Rue du Maréchal Foch';

let product: StampedProduct;
let guest: GuestOtpFixture;

test.beforeAll(async () => {
  product = await createStampedProduct({ stockQty: 5, withZone: true, priceCents: PRICE_CENTS });
  guest = createGuestOtp();
});

test.afterAll(async () => {
  // Sipariş profilden önce silinir, çünkü `order.customer_id` restrict'tir; siparişler auth kimliğiyle değil profil
  // kimliğiyle aranır.
  const { serviceDb } = await import('@lezzet/database');
  const { purgeTestData } = await import('@lezzet/database/testing');
  const db = serviceDb();
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  const authUser = data?.users.find((u) => u.email === guest.email);
  if (authUser) {
    const { data: profile } = await db.from('user_profiles').select('id').eq('auth_user_id', authUser.id).maybeSingle();
    if (profile) {
      const { data: orders } = await db.from('order').select('id').eq('customer_id', profile.id);
      const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
      if (orderIds.length > 0) await purgeTestData(db, { orderIds });
    }
  }
  await guest?.cleanup();
  await product?.cleanup();
});

test.describe('kademe 2 · adresin kapısı doğrulanıyor', () => {
  test('kapı BAŞKA kodda bulunduğunda düzeltme TEKLİF EDİLİR ve kabul edilince adres düzelir', async ({ page }) => {
    test.slow();

    // ── Yer bağlamı önce: damgalı bölge kodu seçilmezse checkout teslimat türünü çözemez ve kapıda ödeme açılmaz.
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(product.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // ── Sepet: tekrarlı tıklama (hidrasyon yarışı); kanıt sayacın belirmesi, çünkü tıklayıp hemen gezinmek
    //    `ERR_ABORTED` üretir.
    await page.goto(product.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: ANA_SEPETE_EKLE }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // ── Kimlik: misafir OTP, sepette.
    await page.goto('/fr/panier', NAV);

    /* Hidrasyon bitmeden doldurulan alanda düğme `disabled` kalır ve kod kutusu tek alan değil rakam kutularıdır; bu yüzden
       doldurma tekrarlanır, kod klavyeyle yazılır. */
    const emailBox = page.getByRole('textbox', { name: /e-mail|adresse e-mail/i }).first();
    await expect(emailBox).toBeVisible({ timeout: 15_000 });
    const sendCode = page.getByRole('button', { name: /envoyer le code/i }).first();
    await expect(async () => {
      await emailBox.fill(guest.email);
      await expect(sendCode).toBeEnabled({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });
    await sendCode.click();
    const firstDigit = page.locator('main input[inputmode="numeric"]').first();
    await expect(firstDigit).toBeVisible({ timeout: 20_000 });
    await firstDigit.click();
    await page.keyboard.type(OTP_TEST_CODE, { delay: 40 });
    const confirm = page.getByRole('button', { name: /vérif|valid|confirm/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();

    // ── Adres, SEPETTE: GERÇEK sokak + DAMGALI kod. Kapı o kodda yok, başka kodda var — teklifin kurulumu.
    await addAddressManually(page, product.stamp, {
      label: `E2E kapı ${product.stamp}`,
      line1: LINE1,
      postalCode: product.postalCode!,
      city: 'Testville',
      phone: `06${String(product.stamp).slice(-8)}`,
    });
    await expect(page.getByText(new RegExp(`E2E kapı ${product.stamp}`)).first()).toBeVisible({ timeout: 20_000 });

    // ── Ödeme sayfasına: adres sepette seçildi, kapı açık.
    await page.getByRole('link', { name: /passer à la commande/i }).first().click();
    await page.waitForURL(/\/fr\/commande/, NAV);
    await expect(page.getByText(new RegExp(`E2E kapı ${product.stamp}`)).first()).toBeVisible({ timeout: 20_000 });

    // ── Gün + ödeme: onay düğmesinin açılması için gereken asgari yol.
    const daySection = page.locator('section').filter({ hasText: 'Jour de livraison' });
    const dayCards = daySection.locator('button[aria-pressed]');
    if (await dayCards.count()) await dayCards.first().click();
    const cod = page.getByRole('button', { name: /payer à la livraison/i });
    await cod.click();

    // ── ASIL İDDİA: onaya basılınca sipariş AÇILMAZ, önce teklif çıkar.
    const submit = page.getByRole('button', { name: /confirmer la commande/i });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    /* Teklif servisin etiketini taşır, cümleyi biz kurmayız. "Lingolsheim" ekranda yoksa ya kısıtsız sorgu atılmamış, ya karar
       yanlış çıkmış, ya da ekran cevabı çizmiyordur. */
    await expect(page.getByText(/nous avons trouvé cette adresse ici/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/lingolsheim/i).first()).toBeVisible();

    // Ve sipariş AÇILMADI: akış durdu, onay sayfasına gidilmedi.
    expect(page.url()).not.toMatch(/\/commande\/[^/]+/);

    // ── Kabul: adres düzelir. Ret düğmesi "İptal" değil "Mon adresse est correcte"; kabul yolu sınanır, çünkü ölçülebilir
    //    sonucu olan yol o.
    await page.getByRole('button', { name: /^utiliser cette adresse$/i }).click();

    /* Adres kartı düzeltilmiş kodu gösterir: kapı hem siparişin adresini hem kaydı düzeltir, `refresh` bölgeyi ve ücreti
       yeniden hesaplar. */
    await expect(page.getByText(/67380/).first()).toBeVisible({ timeout: 30_000 });
    // Teklif kapandı: aynı adres için ikinci kez sorulmaz.
    await expect(page.getByText(/nous avons trouvé cette adresse ici/i)).toBeHidden();
  });
});
