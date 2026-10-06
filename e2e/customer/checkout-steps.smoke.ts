import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';
import { createGuestOtp, OTP_TEST_CODE, type GuestOtpFixture } from '../fixtures/otp-fixture';
import { ANA_SEPETE_EKLE } from '../fixtures/selectors';
import { addAddressManually } from '../fixtures/address-dialog';

/**
 * Checkout'un mutlu yolu tek yolculukta: sepette kimlik ve adres, sonra gün, kapıda ödeme (sağlayıcısız tek yol) ve
 * gerçek sipariş. Sipariş `orderIds` ile ayrıca toplanır, çünkü rezervasyonun `order_id` bağı FK'sız ve cascade onu
 * silmez; dev server'da `OTP_TEST_CODE=123456` gerekir.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

let product: StampedProduct;
let guest: GuestOtpFixture;

/**
 * Fiyat küresel asgari sepetin (40 €) üstünde olmalı, yoksa onay düğmesi haklı olarak kilitlenir; eşik bölgede
 * düşürülemez, çünkü `min_basket_cents` en sıkı değeri alır. 45 € eşiği tek kalemle aşar, duman tutar sınamaz.
 */
const PRICE_CENTS = 4500;

test.beforeAll(async () => {
  // Stok bolluğu bilinçli: bu duman tükenme hâlini SINAMAZ (o edge-stock'un işi), akışı sınar.
  product = await createStampedProduct({ stockQty: 5, withZone: true, priceCents: PRICE_CENTS });
  guest = createGuestOtp();
});

test.afterAll(async () => {
  // Sipariş profilden önce silinir, çünkü `order.customer_id` restrict'tir. Siparişler auth kimliğiyle değil profil
  // kimliğiyle aranır (ikisi farklıdır); profil e-postadan `auth_user_id` ile bulunur.
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

test.describe('kademe 2 · checkout adımları: adres → gün → kapıda ödeme → sipariş', () => {
  test('misafir üç adımı yürür ve sipariş onay sayfasını görür', async ({ page }) => {
    test.slow();

    // ── Yer: damgalı bölge kodu ("Afficher" yolu — kod referans tabloda yok, öneri çıkmaz).
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(product.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });

    // ── Ürün sepete (tekrarlı tıklama — hidrasyon yarışı, edge-stock deseni).
    await page.goto(product.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: ANA_SEPETE_EKLE }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // ── Kimlik: misafir OTP, sepette (3b dumanının deseni; gerekçesi orada).
    await page.goto('/fr/panier', NAV);
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

    // ── Adres, SEPETTE: yeni misafirde kayıt yok; sepetten eklenen adres teslimat adresi olur.
    // Posta kodu fikstürün kodu, çünkü teslimat rota çözülmeli ve kapıda ödeme açık kalmalı (kargo adresinde kapalı);
    // telefon damgadan, çünkü sabit numara paralel koşuda çakışır.
    await addAddressManually(page, product.stamp, {
      label: `E2E adresi ${product.stamp}`,
      line1: '1 rue du Test',
      postalCode: product.postalCode!,
      city: 'Testville',
      phone: `06${String(product.stamp).slice(-8)}`,
    });

    // Panel seçili adresi gösterir; "ödemeye geç" artık açıktır (kimlik + adres kapısı geçildi).
    await expect(page.getByText(new RegExp(`E2E adresi ${product.stamp}`)).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: /passer à la commande/i }).first().click();
    await page.waitForURL(/\/fr\/commande/, NAV);

    // ── ADIM 1 · Adres SALT OKUNUR: sepette seçilen adres kartta, değiştirme bağı sepete götürür.
    await expect(page.getByText(new RegExp(`E2E adresi ${product.stamp}`)).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /dans le panier/i }).first()).toBeVisible();

    // ── ADIM 2 · Gün: adres bölge İÇİNDE — rozet rota teslimatını söyler.
    const daySection = page.locator('section').filter({ hasText: 'Jour de livraison' });
    await expect(daySection.getByText(/livraison à domicile/i).first()).toBeVisible({ timeout: 20_000 });
    // Gün ya SEÇTİRİLİR (birden çok tarih — kart) ya GÖSTERİLİR (tek tarih — cümle, sahte seçim
    // sunulmaz). Fikstür bölgesi iki gün taşır (weekdays [2,5]) ama takvim penceresi tek güne
    // düşürebilir; iki hâl de meşru, ikisi de doğrulanır.
    const dayCards = daySection.locator('button[aria-pressed]');
    if (await dayCards.count()) {
      await dayCards.first().click();
      await expect(dayCards.first()).toHaveAttribute('aria-pressed', 'true');
    } else {
      await expect(daySection.getByText(/chez vous le/i)).toBeVisible();
    }

    // ── ADIM 3 · Ödeme: kapıda ödeme (sağlayıcısız tek yol — kart alanı bu seçimde hiç yüklenmez).
    const cod = page.getByRole('button', { name: /payer à la livraison/i });
    await cod.click();
    await expect(cod).toHaveAttribute('aria-pressed', 'true');

    // ── Onay: düğme açık olmalı (engel cümlesi yok) — sipariş yazılır, onay sayfası açılır.
    const submit = page.getByRole('button', { name: /confirmer la commande/i });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    /* Adres kontrolü araya girebilir: söyleyecek bir şey varsa ilk tıklama durur, siparişi ikinci tıklama geçirir.
       Test "Mon adresse est correcte" ile adresini korur, çünkü önerilen adres posta kodunu bölgenin dışına
       taşırdı; kontrol sessiz geçerse ilk tıklama yeter. */
    const keepMine = page.getByRole('button', { name: /mon adresse est correcte/i });
    const noticed = await keepMine.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    if (noticed) {
      await keepMine.click();
      await expect(submit).toBeEnabled({ timeout: 15_000 });
      await submit.click();
    }
    // Sonrası tek tıklamayla yürür: yazım sürerken düğme kilitlenir, fazladan tıklama çift sipariş riski taşır.
    // Bekleme `domcontentloaded` ile, çünkü dev'de varsayılan `load` asılı kalır; adres eylemi soğuk açılışta 20 sn'yi
    // aşabildiği için süre 45 sn.
    await page.waitForURL(/\/commande\/[^/]+/, { timeout: 45_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/votre commande est confirmée/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/n° de commande/i).first()).toBeVisible();
  });
});
