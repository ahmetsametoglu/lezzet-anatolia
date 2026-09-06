import { test, expect } from '@playwright/test';
import { createStampedProduct, type StampedProduct } from '../fixtures/product-fixture';
import { createGuestOtp, OTP_TEST_CODE, type GuestOtpFixture } from '../fixtures/otp-fixture';
import { ANA_SEPETE_EKLE } from '../fixtures/selectors';

/**
 * KADEME 2 · ADRESİN KAPISI — "bunu mu demek istediniz" ekranda mı (11.11).
 *
 * ── NEDEN E2E, VE NEDEN BAŞKA YOL YOK ───────────────────────────────────────
 * Zincirin her halkası ayrı ayrı testli: karar `domain-core`da (14), kapı entegrasyonda (10),
 * adaptörün sözleşmesi birimde (7), uç mobil-api'de (4). Ama **teklifin ekranda gerçekten
 * çıktığını hiçbiri ölçmüyor** — web'de render eden test altyapısı yok (jsdom da testing-library
 * da bilinçli olarak kurulu değil, `vitest.config` künyesi). Sunucu eylemi doğru cevabı verip
 * ekran onu hiç çizmese her şey yeşil kalırdı.
 *
 * ── SENARYO DETERMİNİSTİK VE BU FİKSTÜRÜN HEDİYESİ ──────────────────────────
 * Adres satırı GERÇEK: `192c Rue du Maréchal Foch` yalnız **67380 Lingolsheim**'de var (kullanıcı
 * bulgusu 01.09; BAN'a kısıtsız sorulduğunda `housenumber`, skor 0,973). Posta kodu ise fikstürün
 * DAMGALI kodu — yani BAN'a "bu kodun içinde bul" dediğimizde hiçbir şey bulunamıyor, kısıtsız
 * sorgu ise gerçek kapıyı buluyor. `wrong_postal_code` hâli böylece kurulmuş oluyor ve seed
 * verisinin hangi kodları taşıdığına HİÇ bağlı değil.
 *
 * ⚠ **BU DUMAN GERÇEK BAN'A ÇIKAR** (adresse.data.gouv.fr — anahtarsız, ücretsiz, devlet servisi).
 * Bilinçli: doğrulamanın değeri tam olarak gerçek servisin cevabında. Servis düşerse teklif
 * çıkmaz ve bu test kırmızıya döner — o hâlde arıza BİZDE değil, ve mesajı okuyan bunu bilmeli.
 * Kapı zaten FAIL-OPEN: müşteri siparişini yine verebilir, yalnız uyarıyı görmez.
 *
 * Gezinme sözleşmesi: `storefront.smoke.ts` başındaki gerekçe.
 */
const NAV = { waitUntil: 'domcontentloaded' as const };

/** Kapıya teslimin küresel asgari sepeti 40,00 € — kardeş dumanın ölçtüğü eşik, aynı gerekçe. */
const PRICE_CENTS = 4500;

/** Kapısı BAŞKA kodda olan gerçek adres — ölçüldü 01.09, BAN skoru 0,973. */
const LINE1 = '192c Rue du Maréchal Foch';

let product: StampedProduct;
let guest: GuestOtpFixture;

test.beforeAll(async () => {
  product = await createStampedProduct({ stockQty: 5, withZone: true, priceCents: PRICE_CENTS });
  guest = createGuestOtp();
});

test.afterAll(async () => {
  // Teardown kardeş dumanın birebir aynısı: sipariş PROFİLDEN ÖNCE (`order.customer_id` restrict)
  // ve kimlik zinciri e-postadan çözülür (auth id ≠ profil id — 04.11 dersi).
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

    // ── Yer bağlamı ÖNCE (kardeş dumanın yolu): damgalı bölge kodu seçilmezse checkout teslimat
    //    türünü çözemez ve kapıda ödeme açılmaz.
    await page.goto('/fr', NAV);
    await page.getByRole('button', { name: /code postal/i }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill(product.postalCode!);
    await dialog.getByRole('button', { name: /afficher/i }).click();
    await expect(dialog.getByText(/la livraison est offerte/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');

    // ── Sepet: tekrarlı tıklama (hidrasyon yarışı — kardeş dumanın ölçülmüş deseni). Kanıt
    //    sayacın belirmesi: tıklayıp hemen gezinmek `ERR_ABORTED` üretiyor (ölçüldü).
    await page.goto(product.urlFr, NAV);
    const addToCart = page.getByRole('button', { name: ANA_SEPETE_EKLE }).first();
    await expect(addToCart).toBeEnabled({ timeout: 15_000 });
    const stepper = page.getByRole('button', { name: '+' }).first();
    await expect(async () => {
      if (await stepper.isVisible()) return;
      await addToCart.click({ timeout: 2_000 });
      await expect(stepper).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // ── Kimlik: misafir OTP
    await page.goto('/fr/commande', NAV);

    /* OTP bloğu kardeş dumandan BİREBİR — kendi basitleştirmem düştü (ölçüldü): alan dolduruluyor
       ama hidrasyon bitmeden düğme `disabled` kalıyor, ve kod kutusu tek `textbox` değil rakam
       kutuları (`inputmode=numeric`). Kanıtlanmış yol tekrarlı doldurma + klavyeyle yazma. */
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
    await expect(page.getByText(/S'ouvre après la vérification/)).not.toHaveCount(3, { timeout: 25_000 });

    // ── Adres: GERÇEK sokak + DAMGALI kod. Kapı o kodda yok, başka kodda var — teklifin kurulumu.
    await page.getByRole('button', { name: /nouvelle adresse/i }).click();
    await page.getByLabel(/titre de l/i).fill(`E2E kapı ${product.stamp}`);
    await page.getByLabel(/nom du destinataire/i).fill('E2E Musteri');
    await page.getByLabel(/rue et numéro/i).fill(LINE1);
    await page.getByLabel(/code postal/i).fill(product.postalCode!);
    await page.getByLabel(/ville/i).fill('Testville');
    await page.getByLabel(/téléphone/i).fill(`06${String(product.stamp).slice(-8)}`);
    const saveAddress = page.getByRole('button', { name: /enregistrer l.adresse/i });
    await expect(saveAddress).toBeEnabled();
    await saveAddress.click();
    await expect(page.getByRole('button', { name: new RegExp(`E2E kapı ${product.stamp}`) })).toBeVisible({
      timeout: 20_000,
    });

    // ── Gün + ödeme: onay düğmesinin AÇILMASI için gerekli asgari yol (kardeş dumanın aynısı).
    const daySection = page.locator('section').filter({ hasText: 'Jour de livraison' });
    const dayCards = daySection.locator('button[aria-pressed]');
    if (await dayCards.count()) await dayCards.first().click();
    const cod = page.getByRole('button', { name: /payer à la livraison/i });
    await cod.click();

    // ── ASIL İDDİA: onaya basılınca sipariş AÇILMAZ, önce teklif çıkar.
    const submit = page.getByRole('button', { name: /confirmer la commande/i });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    /* Teklif GÖRÜNÜR ve servisin ETİKETİNİ taşır — biz cümle kurmuyoruz. "Lingolsheim" bu testin
       kalbi: o kelime ekranda yoksa ya ikinci (kısıtsız) sorgu atılmamıştır, ya karar yanlış
       çıkmıştır, ya da ekran cevabı çizmiyordur. Üçü de sessiz arızalar. */
    await expect(page.getByText(/nous avons trouvé cette adresse ici/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/lingolsheim/i).first()).toBeVisible();

    // Ve sipariş AÇILMADI: akış durdu, onay sayfasına gidilmedi.
    expect(page.url()).not.toMatch(/\/commande\/[^/]+/);

    // ── Kabul: adres düzelir. Ret düğmesi "İptal" değil "Mon adresse est correcte" — burada
    //    kabul yolunu sınıyoruz, çünkü ölçülebilir bir SONUCU olan yol o.
    await page.getByRole('button', { name: /^corriger$/i }).click();

    /* Adres kartı artık DÜZELTİLMİŞ kodu gösteriyor: kapı hem siparişin adresini hem KAYDI
       düzeltiyor (kullanıcı kararı 02.09) ve `refresh` bölgeyi/ücreti yeniden hesaplıyor. */
    await expect(page.getByText(/67380/).first()).toBeVisible({ timeout: 30_000 });
    // Teklif kapandı: aynı adres için ikinci kez sorulmaz.
    await expect(page.getByText(/nous avons trouvé cette adresse ici/i)).toBeHidden();
  });
});
